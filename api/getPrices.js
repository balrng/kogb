const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// --- Load Configuration ---
const configPath = path.join(process.cwd(), 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const SCRAPE_URL = config.settings.scrapeUrl;
const CACHE_DURATION_SECONDS = config.settings.cacheDurationSeconds;
const LOG_INTERVAL_SECONDS = config.settings.logIntervalSeconds;
const VISIBLE_SERVERS = config.servers.filter(s => s.visible).map(s => s.name);

// --- Helper Functions ---
const getLocalDateParts = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return { year, month, day, hours, minutes, seconds };
};

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,tr;q=0.8'
};

// --- Trend Calculation Logic ---
function calculateTrends(latestSnapshot, previousSnapshot) {
    if (!previousSnapshot) return latestSnapshot; // No previous data to compare against

    const previousVendorMap = new Map(previousSnapshot.vendors.map(v => [v.id, v]));

    latestSnapshot.vendors.forEach(latestVendor => {
        const previousVendor = previousVendorMap.get(latestVendor.id);
        if (previousVendor) {
            latestVendor.servers.forEach(latestServer => {
                const previousServer = previousVendor.servers.find(ps => ps.serverName === latestServer.serverName);
                if (previousServer) {
                    // Sell Price Trend
                    if (latestServer.sellPrice > previousServer.sellPrice) {
                        latestServer.sellTrend = 'up';
                    } else if (latestServer.sellPrice < previousServer.sellPrice) {
                        latestServer.sellTrend = 'down';
                    } else {
                        latestServer.sellTrend = 'stable';
                    }
                    // Buy Price Trend
                    if (latestServer.buyPrice > previousServer.buyPrice) {
                        latestServer.buyTrend = 'up';
                    } else if (latestServer.buyPrice < previousServer.buyPrice) {
                        latestServer.buyTrend = 'down';
                    } else {
                        latestServer.buyTrend = 'stable';
                    }
                }
            });
        }
    });

    return latestSnapshot;
}

// --- Main Data Scraping and Saving Logic ---
const scrapeAndSaveData = async () => {
    console.log('Executing scrape: Data is stale or cache is empty.');

    const [priceResponse] = await Promise.all([axios.get(SCRAPE_URL, { headers: BROWSER_HEADERS })]);
    const $prices = cheerio.load(priceResponse.data);
    const vendors = [];
    const allServersInFile = config.servers.map(s => s.name);

    $prices('#veriYenile table tbody tr').each((rowIndex, row) => {
        const cells = $prices(row).find('th, td');
        const link = cells.first().find('a').attr('href');
        if (!link) return;

        let vendorId = '';
        try {
            const hostname = new URL(link).hostname;
            vendorId = hostname.replace('www.', '').split('.')[0];
        } catch (e) { return; }

        if (cells.length < (allServersInFile.length * 2 + 1)) return;

        const vendorData = { id: vendorId, servers: [] };
        allServersInFile.forEach((serverName, index) => {
            if (config.servers[index].visible) {
                vendorData.servers.push({
                    serverName: serverName,
                    sellPrice: parseFloat($prices(cells.slice(1)[index * 2]).find('span').text().trim()) || 0,
                    buyPrice: parseFloat($prices(cells.slice(1)[index * 2 + 1]).find('span').text().trim()) || 0
                });
            }
        });
        vendors.push(vendorData);
    });

    const now = new Date();
    const { year, month, day, hours, minutes, seconds } = getLocalDateParts(now);
    const finalData = { 
        scrapedAt: `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`,
        vendors: vendors,
        serverStatusHtml: '<div>Sunucu durumu geçici olarak devre dışı bırakıldı.</div>'
    };

    if (vendors.length > 0) {
        const dateStringForFile = `${year}-${month}-${day}`;
        const dataFilePath = path.join(process.cwd(), 'data', `${dateStringForFile}.json`);
        let dailyData = [];
        let shouldWriteLog = true;

        if (fs.existsSync(dataFilePath)) {
            try {
                const existingData = fs.readFileSync(dataFilePath, 'utf-8');
                dailyData = existingData ? JSON.parse(existingData) : [];
                if (dailyData.length > 0) {
                    const lastLogTime = new Date(dailyData[dailyData.length - 1].scrapedAt);
                    if ((now.getTime() - lastLogTime.getTime()) / 1000 < LOG_INTERVAL_SECONDS) {
                        shouldWriteLog = false;
                        console.log(`Skipping log to JSON, last log was less than ${LOG_INTERVAL_SECONDS} seconds ago.`);
                    }
                }
            } catch (e) { dailyData = []; }
        }

        if (shouldWriteLog) {
            const previousSnapshot = dailyData.length > 0 ? dailyData[dailyData.length - 1] : null;
            dailyData.push(finalData);
            fs.writeFileSync(dataFilePath, JSON.stringify(dailyData, null, 2));
            console.log(`Successfully LOGGED new data to ${dateStringForFile}.json`);

            // Calculate trends and save to a separate cache file
            const finalDataWithTrends = calculateTrends(JSON.parse(JSON.stringify(finalData)), previousSnapshot);
            const trendCachePath = path.join(process.cwd(), 'cache', 'latest_with_trend.json');
            fs.writeFileSync(trendCachePath, JSON.stringify(finalDataWithTrends, null, 2));
            console.log('Successfully updated trend cache.');
        }

        const cacheFilePath = path.join(process.cwd(), 'cache', 'last_scrape_time.txt');
        fs.writeFileSync(cacheFilePath, now.toISOString());
        console.log(`Updated CACHE time.`);
    }
    return finalData;
};

// --- API Handler with Caching Logic ---
module.exports = async (req, res) => {
    try {
        const cacheFilePath = path.join(process.cwd(), 'cache', 'last_scrape_time.txt');
        const trendCachePath = path.join(process.cwd(), 'cache', 'latest_with_trend.json');

        if (fs.existsSync(cacheFilePath)) {
            const lastScrapeTimestamp = fs.readFileSync(cacheFilePath, 'utf-8');
            const lastScrapeTime = new Date(lastScrapeTimestamp);
            const now = new Date();

            if ((now.getTime() - lastScrapeTime.getTime()) / 1000 < CACHE_DURATION_SECONDS) {
                console.log('Serving data from TREND CACHE.');
                if (fs.existsSync(trendCachePath)) {
                    const trendData = fs.readFileSync(trendCachePath, 'utf-8');
                    res.setHeader('Content-Type', 'application/json');
                    res.status(200).send(trendData);
                    return;
                }
            }
        }
        
        const newData = await scrapeAndSaveData();
        const trendData = fs.existsSync(trendCachePath) ? fs.readFileSync(trendCachePath, 'utf-8') : JSON.stringify(newData);

        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(trendData);

    } catch (error) {
        console.error('Error in API function:', error.message);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
};