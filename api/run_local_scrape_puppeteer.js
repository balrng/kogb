const fs = require('fs');
const path = require('path');
const { BlobServiceClient } = require('@azure/storage-blob');

const TARGET_URL = 'https://www.enucuzgb.com/';
const OUTPUT_LOCAL = path.join(__dirname, 'scrape_output_puppeteer.json');
const OUTPUT_BLOB_NAME = 'test_scrape_output_puppeteer.json';
const CONTAINER_NAME = 'data';

function parsePriceText(txt) {
  if (!txt) return null;
  const cleaned = txt.replace(/[^\d.,-]/g, '').replace(',', '.');
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

function scrapeVendorTableFromHtml(html) {
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  const table = $('#veriYenile table');
  if (!table.length) return [];

  const headerCells = table.find('thead tr').first().find('th');
  const servers = [];
  headerCells.each((i, th) => {
    const text = $(th).text().trim();
    if (i >= 2 && text) servers.push(text);
  });

  const result = [];
  table.find('tbody tr').each((_, row) => {
    const $row = $(row);
    const link = $row.find('a[href]').first();
    if (!link.length) return;
    const vendorUrl = link.attr('href');
    let vendorId = '';
    try {
      vendorId = new URL(vendorUrl).hostname.replace(/^www\./, '').split('.')[0];
    } catch {
      vendorId = vendorUrl;
    }

    const vendor = { id: vendorId, name: link.text().trim() || vendorId, servers: [] };
    const cells = $row.find('td').slice(2);
    for (let i = 0; i < servers.length; i++) {
      const sellCell = cells.eq(i * 2);
      const buyCell = cells.eq(i * 2 + 1);
      const sellPrice = sellCell ? parsePriceText(sellCell.text()) : null;
      const buyPrice = buyCell ? parsePriceText(buyCell.text()) : null;
      vendor.servers.push({ serverName: servers[i], sellPrice, buyPrice });
    }
    result.push(vendor);
  });
  return result;
}

async function uploadToBlobIfConfigured(jsonBuffer) {
  let conn = process.env.KOGB_STORAGE_CONNECTION_STRING;
  try {
    const localSettings = fs.readFileSync(path.join(__dirname, 'local.settings.json'), 'utf8');
    const ls = JSON.parse(localSettings);
    if (ls && ls.Values && ls.Values.KOGB_STORAGE_CONNECTION_STRING) {
      conn = ls.Values.KOGB_STORAGE_CONNECTION_STRING;
    }
  } catch (e) {
    // ignore
  }

  if (!conn) {
    console.log('No storage connection string found; skipping blob upload.');
    return;
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(conn);
  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
  await containerClient.createIfNotExists();
  const blockBlobClient = containerClient.getBlockBlobClient(OUTPUT_BLOB_NAME);
  await blockBlobClient.uploadData(jsonBuffer, { blobHTTPHeaders: { blobContentType: 'application/json' } });
  console.log(`Uploaded to blob: ${CONTAINER_NAME}/${OUTPUT_BLOB_NAME}`);
}

(async () => {
  try {
    console.log('Launching Puppeteer...');
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    console.log('Page loaded, extracting HTML...');
    const html = await page.content();
    await browser.close();

    // adapt to tables that use TH for price cells
    const vendors = (() => {
      const cheerio = require('cheerio');
      const $ = cheerio.load(html);
      const table = $('#veriYenile table');
      if (!table.length) return [];
      const headerCells = table.find('thead tr').first().find('th');
      const servers = [];
      headerCells.each((i, th) => {
        const text = $(th).text().trim();
        if (i >= 2 && text) servers.push(text);
      });
      const result = [];
      table.find('tbody tr').each((_, row) => {
        const $row = $(row);
        const link = $row.find('a[href]').first();
        if (!link.length) return;
        const vendorUrl = link.attr('href');
        let vendorId = '';
        try { vendorId = new URL(vendorUrl).hostname.replace(/^www\./, '').split('.')[0]; } catch { vendorId = vendorUrl; }
        const vendor = { id: vendorId, name: link.text().trim() || vendorId, servers: [] };
        const cells = $row.find('th,td').slice(2);
        for (let i = 0; i < servers.length; i++) {
          const sellCell = cells.eq(i * 2);
          const buyCell = cells.eq(i * 2 + 1);
          const getText = cell => {
            const span = cell.find('span');
            return span.length ? span.text() : cell.text();
          };
          const sellPrice = sellCell ? parsePriceText(getText(sellCell)) : null;
          const buyPrice = buyCell ? parsePriceText(getText(buyCell)) : null;
          vendor.servers.push({ serverName: servers[i], sellPrice, buyPrice });
        }
        result.push(vendor);
      });
      return result;
    })();
    const final = { scrapedAt: new Date().toISOString(), source: TARGET_URL, vendors };

    fs.writeFileSync(OUTPUT_LOCAL, JSON.stringify(final, null, 2), 'utf8');
    console.log('Wrote local file:', OUTPUT_LOCAL);

    await uploadToBlobIfConfigured(Buffer.from(JSON.stringify(final)));

    console.log('Done. Vendors parsed:', vendors.length);
  } catch (error) {
    console.error('Error during puppeteer scrape:', error.message);
    process.exitCode = 1;
  }
})();
