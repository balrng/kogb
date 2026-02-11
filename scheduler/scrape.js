const { BlobServiceClient } = require("@azure/storage-blob");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");

const SCRAPE_URL = "https://www.enucuzgb.com/";
const SERVER_NAMES = ["ZERO", "FELIS", "AGARTHA", "PANDORA", "DRYADS", "DESTAN", "MINARK", "OREADS"];

function getTurkeyDateParts(date = new Date()) {
  const turkeyTime = new Date(date.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
  const year = turkeyTime.getFullYear();
  const month = String(turkeyTime.getMonth() + 1).padStart(2, "0");
  const day = String(turkeyTime.getDate()).padStart(2, "0");
  return { year, month, day, turkeyTime };
}

async function scrapeData() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    await page.goto(SCRAPE_URL, { waitUntil: "networkidle2", timeout: 60000 });

    const htmlContent = await page.content();
    const $ = cheerio.load(htmlContent);
    const vendors = [];
    const rows = $("#veriYenile table tbody tr");

    rows.each((rowIndex, row) => {
      const $row = $(row);
      const cells = $row.find("th,td");
      const linkCell = cells.eq(0);
      const link = linkCell.find("a").attr("href");
      if (!link) return;

      let vendorId;
      try {
        const url = new URL(link);
        vendorId = url.hostname.replace("www.", "").split(".")[0];
      } catch {
        return;
      }

      const vendor = { id: vendorId, servers: [] };
      let hasValidPrices = false;

      for (let i = 0; i < SERVER_NAMES.length; i++) {
        const sellIdx = 1 + (i * 2);
        const buyIdx = 1 + (i * 2) + 1;
        const sellCell = cells.eq(sellIdx);
        const buyCell = cells.eq(buyIdx);

        let sellPrice = 0;
        let buyPrice = 0;

        if (sellCell.length) {
          const txt = sellCell.find("span").text().replace(/[^\d.-]/g, "").replace(",", ".");
          sellPrice = parseFloat(txt) || 0;
        }

        if (buyCell.length) {
          const txt = buyCell.find("span").text().replace(/[^\d.-]/g, "").replace(",", ".");
          buyPrice = parseFloat(txt) || 0;
        }

        vendor.servers.push({
          serverName: SERVER_NAMES[i],
          sellPrice,
          buyPrice
        });

        if (sellPrice > 0 || buyPrice > 0) {
          hasValidPrices = true;
        }
      }

      if (hasValidPrices) {
        vendors.push(vendor);
      }
    });

    if (!vendors.length) {
      throw new Error("No vendors with valid prices found");
    }

    const { turkeyTime } = getTurkeyDateParts();
    const scrapedAt = turkeyTime.toISOString().split(".")[0];

    return {
      scrapedAt,
      vendors,
      serverStatusHtml: "<div>Veri basariyla guncellendi.</div>"
    };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }
}

async function uploadData(data) {
  const connectionString = process.env.KOGB_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("Missing KOGB_STORAGE_CONNECTION_STRING");
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const cacheContainer = blobServiceClient.getContainerClient("cache");
  const dataContainer = blobServiceClient.getContainerClient("data");

  const latestBlobClient = cacheContainer.getBlockBlobClient("latest_with_trend.json");
  const latestContent = JSON.stringify(data);
  await latestBlobClient.upload(latestContent, Buffer.byteLength(latestContent));

  const logIntervalSeconds = parseInt(process.env.LOG_INTERVAL_SECONDS || "1800", 10);
  const { year, month, day, turkeyTime } = getTurkeyDateParts();
  const dateFileName = `${year}-${month}-${day}.json`;

  let dailyData = [];
  try {
    const downloadResp = await dataContainer.getBlobClient(dateFileName).download();
    const chunks = [];
    for await (const chunk of downloadResp.readableStreamBody) {
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks).toString("utf-8");
    dailyData = JSON.parse(content);
  } catch {
    // new file
  }

  let shouldLog = true;
  if (dailyData.length > 0) {
    const lastLogTime = new Date(dailyData[dailyData.length - 1].scrapedAt);
    const diffSeconds = (turkeyTime.getTime() - lastLogTime.getTime()) / 1000;
    if (diffSeconds < logIntervalSeconds) {
      shouldLog = false;
    }
  }

  if (shouldLog) {
    dailyData.push(data);
    const dailyBlobClient = dataContainer.getBlockBlobClient(dateFileName);
    const dailyContent = JSON.stringify(dailyData, null, 2);
    await dailyBlobClient.upload(dailyContent, Buffer.byteLength(dailyContent));
  }
}

async function scrapeAndUpload() {
  const data = await scrapeData();
  await uploadData(data);
  return data;
}

module.exports = { scrapeAndUpload };
