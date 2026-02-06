const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const scrapeUrl = 'https://www.enucuzgb.com/';

console.log('🚀 Starting local scraper (Puppeteer)...');
console.log(`📍 Target: ${scrapeUrl}\n`);

async function scrapeData() {
    let browser;
    try {
        // Launch Puppeteer
        console.log('⌛ Launching browser...');
        browser = await puppeteer.launch({ 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        console.log('⌛ Navigating to page...');
        await page.goto(scrapeUrl, { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });
        
        console.log('✓ Page loaded\n');
        
        const htmlContent = await page.content();
        const $ = cheerio.load(htmlContent);
        
        // Extract vendors
        const vendors = [];
        const rows = $('#veriYenile table tbody tr');
        
        console.log(`📊 Found ${rows.length} vendor rows\n`);
        
        if (rows.length === 0) {
            console.error('❌ ERROR: No rows found! Check HTML structure.');
            await browser.close();
            process.exit(1);
        }
        
        // Server names
        const serverNames = ['ZERO', 'FELIS', 'AGARTHA', 'PANDORA', 'DRYADS', 'DESTAN', 'MINARK', 'OREADS'];
        
        rows.each((rowIndex, row) => {
            const $row = $(row);
            const cells = $row.find('th,td');
            
            // First cell should have vendor link
            const linkCell = cells.eq(0);
            const link = linkCell.find('a').attr('href');
            
            if (!link) {
                console.log(`  ⚠️  Row ${rowIndex}: No link found, skipping`);
                return;
            }
            
            // Extract vendor ID from domain
            let vendorId;
            try {
                const url = new URL(link);
                vendorId = url.hostname.replace('www.', '').split('.')[0];
            } catch (e) {
                console.log(`  ⚠️  Row ${rowIndex}: Invalid URL, skipping`);
                return;
            }
            
            const vendor = { id: vendorId, servers: [] };
            let hasValidPrices = false;
            
            // Extract prices (each server has 2 cells: sell, buy)
            for (let i = 0; i < serverNames.length; i++) {
                const sellIdx = 1 + (i * 2);
                const buyIdx = 1 + (i * 2) + 1;
                
                const sellCell = cells.eq(sellIdx);
                const buyCell = cells.eq(buyIdx);
                
                let sellPrice = 0;
                let buyPrice = 0;
                
                if (sellCell.length) {
                    const txt = sellCell.find('span').text().replace(/[^\d.-]/g, '').replace(',', '.');
                    sellPrice = parseFloat(txt) || 0;
                }
                
                if (buyCell.length) {
                    const txt = buyCell.find('span').text().replace(/[^\d.-]/g, '').replace(',', '.');
                    buyPrice = parseFloat(txt) || 0;
                }
                
                vendor.servers.push({
                    serverName: serverNames[i],
                    sellPrice,
                    buyPrice
                });
                
                if (sellPrice > 0 || buyPrice > 0) {
                    hasValidPrices = true;
                }
            }
            
            if (hasValidPrices) {
                vendors.push(vendor);
                console.log(`  ✓ ${vendorId.padEnd(12)} - ${vendor.servers.filter(s => s.sellPrice > 0).length} servers with prices`);
            }
        });
        
        await browser.close();
        
        if (vendors.length === 0) {
            console.error('\n❌ ERROR: No vendors with valid prices found!');
            process.exit(1);
        }
        
        // Generate data with timestamp
        const now = new Date();
        const scrapedAt = now.toISOString().split('.')[0];
        
        const data = {
            scrapedAt,
            vendors,
            serverStatusHtml: '<div>✓ Veri başarıyla güncellendi.</div>'
        };
        
        // Save to local-scrape.json in the project root
        const filePath = path.join(__dirname, 'local-scrape.json');
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        
        console.log(`\n✅ SUCCESS! Data saved to: local-scrape.json`);
        console.log(`   📦 Vendors: ${vendors.length}`);
        console.log(`   🕐 Timestamp: ${scrapedAt}`);
        console.log(`   📍 File path: ${filePath}`);
        console.log(`\n💡 You can now review the file and upload to Azure blob storage.`);
        
        return data;
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error('Stack:', error.stack);
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                // ignore
            }
        }
        process.exit(1);
    }
}

// Run the scraper
scrapeData().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
