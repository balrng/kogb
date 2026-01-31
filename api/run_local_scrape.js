const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { BlobServiceClient } = require('@azure/storage-blob');

const TARGET_URL = 'https://www.enucuzgb.com/';
const OUTPUT_LOCAL = path.join(__dirname, 'scrape_output.json');
const OUTPUT_BLOB_NAME = 'test_scrape_output.json';
const CONTAINER_NAME = 'data';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,tr;q=0.8'
};

function parsePriceText(txt) {
  if (!txt) return null;
  const cleaned = txt.replace(/[^\d.,-]/g, '').replace(',', '.');
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

function scrapeVendorTable(html) {
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
  // try to read connection string from local.settings.json first
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
    console.log('Fetching:', TARGET_URL);
    const resp = await axios.get(TARGET_URL, { headers: BROWSER_HEADERS, timeout: 20000 });
    console.log('Fetched, length:', resp.data.length);
    console.log('HTML preview:\n', resp.data.slice(0, 800));
    let vendors = scrapeVendorTable(resp.data);
    if (!vendors || vendors.length === 0) {
      console.log('No vendors found on first fetch — retrying with ?d=1');
      try {
        const resp2 = await axios.get(TARGET_URL + '?d=1', { headers: { ...BROWSER_HEADERS, Referer: TARGET_URL }, timeout: 20000 });
        console.log('Fetched ?d=1, length:', resp2.data.length);
        console.log('HTML preview (second):\n', resp2.data.slice(0, 800));
        vendors = scrapeVendorTable(resp2.data);
      } catch (e) {
        console.warn('Retry fetch failed:', e.message);
      }
    }

    const final = { scrapedAt: new Date().toISOString(), source: TARGET_URL, vendors };

    // write local file
    fs.writeFileSync(OUTPUT_LOCAL, JSON.stringify(final, null, 2), 'utf8');
    console.log('Wrote local file:', OUTPUT_LOCAL);

    // upload to blob if configured
    await uploadToBlobIfConfigured(Buffer.from(JSON.stringify(final)));

    console.log('Done. Vendors parsed:', vendors.length);
  } catch (error) {
    console.error('Error during scrape:', error.message);
    process.exitCode = 1;
  }
})();
