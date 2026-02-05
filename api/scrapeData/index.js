const { BlobServiceClient } = require("@azure/storage-blob");
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { URL } = require('url');

// Add stealth plugin to puppeteer
puppeteer.use(StealthPlugin());

const containerName = "data";
const configContainerName = "cache";


const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,tr;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'max-age=0'
};

/**
 * Scrapes vendor and price data from the HTML table with id="veriYenile".
 * @param {string} html - The HTML content to parse.
 * @param {object} cheerio - The Cheerio library instance.
 * @returns {Array} Array of vendor data objects with prices per server.
 */
function scrapeVendorTable(html, cheerio) {
    const $ = cheerio.load(html);
    const table = $('#veriYenile table');
    if (!table.length) return [];

    // Extract server names from the header row
    const headerCells = table.find('thead tr').first().find('th');
    const servers = [];
    headerCells.each((i, th) => {
        const text = $(th).text().trim();
        // Server names are usually after the first two columns
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

        const vendor = {
            id: vendorId,
            name: link.text().trim() || vendorId,
            servers: []
        };

        // Price cells: skip first two columns (logo, name/link)
            const cells = $row.find('th,td').slice(2);
        for (let i = 0; i < servers.length; i++) {
            const sellCell = cells.eq(i * 2);
            const buyCell = cells.eq(i * 2 + 1);
            const parsePrice = cell => {
                    const span = cell.find('span');
                    const txt = (span.length ? span.text() : cell.text()).replace(/[^\d.,-]/g, '').replace(',', '.');
                const val = parseFloat(txt);
                return isNaN(val) ? null : val;
            };
            vendor.servers.push({
                serverName: servers[i],
                sellPrice: parsePrice(sellCell),
                buyPrice: parsePrice(buyCell)
            });
        }
        result.push(vendor);
    });
    return result;
}

const getLocalDateParts = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return { year, month, day, hours, minutes, seconds };
};

async function scrapeVendorData(config, context) {
    context.log('Starting vendor data scraping...');
    
    const SCRAPE_URL = config.settings.scrapeUrl;
    const allServersInFile = config.servers.map(s => s.name);
    

    try {
        let htmlContent;
        context.log('Attempting to fetch with axios...');
        try {
            const priceResponse = await axios.get(SCRAPE_URL, { headers: BROWSER_HEADERS, timeout: 10000 });
            htmlContent = priceResponse.data;
            context.log('Successfully fetched with axios, content length:', htmlContent.length);
        } catch (axiosError) {
            context.log('Axios failed, trying Puppeteer with stealth plugin...');
            // Cloudflare blocks axios, use Puppeteer with stealth plugin
            const browser = await puppeteer.launch({ 
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });
            try {
                const page = await browser.newPage();
                await page.setUserAgent(BROWSER_HEADERS['User-Agent']);
                await page.goto(SCRAPE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
                htmlContent = await page.content();
                context.log('Successfully fetched with Puppeteer, content length:', htmlContent.length);
            } finally {
                await browser.close();
            }
        }
        
        context.log('scrapeVendorData: HTML response length:', htmlContent.length);
        context.log('scrapeVendorData: First 500 chars:', htmlContent.slice(0, 500));

        const $ = cheerio.load(htmlContent);
        const vendors = [];

        const rows = $('#veriYenile table tbody tr');
        context.log('scrapeVendorData: Found rows:', rows.length);

        // Config'deki vendor id'leri ve linklerini eşleştir
        const configVendors = config.vendorConfig.filter(v => v.visible);

        rows.each((rowIndex, row) => {
            // Hem th hem td seç
            const cells = $(row).find('th,td');
            context.log(`Row ${rowIndex}: cell count = ${cells.length}`);
            if (cells.length < 1 + config.servers.filter(s => s.visible).length * 2) return;

            // Vendor link ve id
            const link = $(cells[0]).find('a').attr('href');
            if (!link) return;
            let vendorId = '';
            try {
                const hostname = new URL(link).hostname.replace('www.', '');
                // Config'teki vendorlardan linki içereni bul
                const matchedVendor = configVendors.find(v => v.websiteUrl.includes(hostname));
                if (!matchedVendor) {
                    context.log(`Row ${rowIndex}: Vendor not in config for hostname: ${hostname}`);
                    return;
                }
                vendorId = matchedVendor.id;
            } catch (e) {
                context.log(`Row ${rowIndex}: URL parse error`);
                return;
            }

            const vendorData = { id: vendorId, servers: [] };
            let cellIdx = 1;
            config.servers.forEach((server, sIdx) => {
                if (!server.visible) {
                    cellIdx += 2;
                    return;
                }
                let sellPrice = 0;
                let buyPrice = 0;
                const sellCell = cells[cellIdx];
                const buyCell = cells[cellIdx + 1];
                if (sellCell) {
                    const span = $(sellCell).find('span');
                    sellPrice = parseFloat(span.text().replace(',', '.').trim()) || 0;
                }
                if (buyCell) {
                    const span = $(buyCell).find('span');
                    buyPrice = parseFloat(span.text().replace(',', '.').trim()) || 0;
                }
                vendorData.servers.push({
                    serverName: server.name,
                    sellPrice,
                    buyPrice
                });
                cellIdx += 2;
            });
            vendors.push(vendorData);
            context.log(`Row ${rowIndex}: Added vendorId=${vendorId}`);
        });

        context.log('scrapeVendorData: Parsed vendor count:', vendors.length);
        if (vendors.length > 0) {
            context.log('scrapeVendorData: First vendor:', JSON.stringify(vendors[0], null, 2));
        }

        const now = new Date();
        const { year, month, day, hours, minutes, seconds } = getLocalDateParts(now);

        const finalData = {
            scrapedAt: `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`,
            vendors: vendors,
            serverStatusHtml: '<div>Sunucu durumu geçici olarak devre dışı bırakıldı.</div>'
        };

        context.log(`Successfully scraped data for ${vendors.length} vendors`);
        return finalData;

    } catch (error) {
        context.log.error(`Error scraping data: ${error.message}`);
        context.log.error(`Error stack: ${error.stack}`);
        if (error.response) {
            context.log.error(`Response status: ${error.response.status}`);
            context.log.error(`Response data: ${JSON.stringify(error.response.data)}`);
        }

        // Return empty structure on error
        const now = new Date();
        const { year, month, day, hours, minutes, seconds } = getLocalDateParts(now);

        return {
            scrapedAt: `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`,
            vendors: config.vendorConfig.filter(v => v.visible).map(vendor => ({
                id: vendor.id,
                servers: config.servers.filter(s => s.visible).map(server => ({
                    serverName: server.name,
                    sellPrice: 0,
                    buyPrice: 0
                }))
            })),
            serverStatusHtml: '<div>Veri çekme hatası oluştu.</div>'
        };
    }
}

// Helper: download config (prefer blob, fallback to local config.json)
async function downloadConfigFromBlob(blobServiceClient) {
    try {
        const containerClient = blobServiceClient.getContainerClient(configContainerName);
        const blobClient = containerClient.getBlobClient('config.json');
        const exists = await blobClient.exists();
        if (exists) {
            const resp = await blobClient.download();
            const txt = await streamToString(resp.readableStreamBody);
            return JSON.parse(txt);
        }
    } catch (e) {
        // ignore and fallback
    }
    // fallback to local file
    try {
        const local = require('../../config.json');
        return local;
    } catch (e) {
        return { vendorConfig: [], servers: [], settings: { logIntervalSeconds: 600, scrapeUrl: 'https://www.enucuzgb.com/' } };
    }
}

// Helper: download JSON from blob
async function downloadFromBlob(blobServiceClient, container, blobName) {
    try {
        const containerClient = blobServiceClient.getContainerClient(container);
        const blobClient = containerClient.getBlobClient(blobName);
        if (!(await blobClient.exists())) return null;
        const resp = await blobClient.download();
        const txt = await streamToString(resp.readableStreamBody);
        return JSON.parse(txt);
    } catch (e) {
        return null;
    }
}

// Helper: upload JSON to blob
async function uploadJSONToBlob(blobServiceClient, container, blobName, data) {
    const containerClient = blobServiceClient.getContainerClient(container);
    await containerClient.createIfNotExists();
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const buffer = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data));
    await blockBlobClient.uploadData(buffer, { blobHTTPHeaders: { blobContentType: 'application/json' } });
}

// Helper: stream to string
async function streamToString(readable) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        readable.on('data', (data) => chunks.push(data.toString()));
        readable.on('end', () => resolve(chunks.join('')));
        readable.on('error', reject);
    });
}

// Simple trend calculation
function calculateTrends(latestSnapshot, previousSnapshot) {
    if (!previousSnapshot) return latestSnapshot;
    const prevMap = new Map();
    previousSnapshot.vendors.forEach(v => prevMap.set(v.id, v));
    latestSnapshot.vendors.forEach(latestVendor => {
        const previousVendor = prevMap.get(latestVendor.id);
        if (!previousVendor) return;
        latestVendor.servers.forEach(latestServer => {
            const previousServer = previousVendor.servers.find(ps => ps.serverName === latestServer.serverName);
            if (!previousServer) return;
            latestServer.sellTrend = latestServer.sellPrice > previousServer.sellPrice ? 'up' : (latestServer.sellPrice < previousServer.sellPrice ? 'down' : 'stable');
            latestServer.buyTrend = latestServer.buyPrice > previousServer.buyPrice ? 'up' : (latestServer.buyPrice < previousServer.buyPrice ? 'down' : 'stable');
        });
    });
    return latestSnapshot;
}

module.exports = async function (context, req) {
    context.log('Scrape HTTP function started');
    
    const connectionString = process.env.KOGB_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
        context.log.error('Storage connection string not set');
        context.res = { status: 500, body: 'Storage connection string not set' };
        return;
    }

    try {
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        
        // Download current config
        const config = await downloadConfigFromBlob(blobServiceClient);
        const LOG_INTERVAL_SECONDS = config.settings.logIntervalSeconds;
        
        // Check if we should log (based on interval)
        const now = new Date();
        const { year, month, day } = getLocalDateParts(now);
        const dateStringForFile = `${year}-${month}-${day}`;
        
        // Try to get existing daily data
        let dailyData = await downloadFromBlob(blobServiceClient, containerName, `${dateStringForFile}.json`) || [];
        let shouldWriteLog = true;
        
        if (dailyData.length > 0) {
            const lastLogTime = new Date(dailyData[dailyData.length - 1].scrapedAt);
            if ((now.getTime() - lastLogTime.getTime()) / 1000 < LOG_INTERVAL_SECONDS) {
                shouldWriteLog = false;
                context.log(`Skipping log to JSON, last log was less than ${LOG_INTERVAL_SECONDS} seconds ago.`);
            }
        }
        
        // Scrape data from all vendors
        const newData = await scrapeVendorData(config, context);
        
        // Determine previous snapshot from current daily data (if any) for trend calculation
        const previousSnapshot = dailyData.length > 0 ? dailyData[dailyData.length - 1] : null;

        if (shouldWriteLog && newData.vendors.length > 0) {
            // Add to daily data and persist
            dailyData.push(newData);
            await uploadJSONToBlob(blobServiceClient, containerName, `${dateStringForFile}.json`, dailyData);
            context.log(`Successfully LOGGED new data to ${dateStringForFile}.json`);
        } else {
            context.log('Skipping daily log file write due to interval, but will still update trend cache.');
        }

        // Calculate trends and always update cache for frontend consumption
        const finalDataWithTrends = calculateTrends(JSON.parse(JSON.stringify(newData)), previousSnapshot);
        await uploadJSONToBlob(blobServiceClient, configContainerName, "latest_with_trend.json", finalDataWithTrends);
        context.log('Successfully updated trend cache.');

        // Always update cache time
        const timeString = now.toISOString();
        await uploadJSONToBlob(blobServiceClient, configContainerName, "last_scrape_time.txt", timeString);
        context.log('Updated CACHE time.');
        
        context.log(`Successfully completed scraping cycle`);
        context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: {
                ok: true,
                scrapedAt: finalDataWithTrends.scrapedAt,
                vendorCount: finalDataWithTrends.vendors.length
            }
        };
    } catch (error) {
        context.log.error(`Scraping error: ${error.message}`);
        context.res = { status: 500, body: { ok: false, error: error.message } };
    }
};