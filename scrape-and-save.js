const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

const scrapeUrl = 'https://www.enucuzgb.com/';

console.log('Scraping vendor data...');

async function scrapeData() {
    try {
        const response = await axios.get(scrapeUrl, { 
            headers: HEADERS,
            timeout: 15000
        });
        
        console.log(`✓ Fetched ${response.data.length} bytes`);
        
        const $ = cheerio.load(response.data);
        const vendors = [];
        
        const rows = $('#veriYenile table tbody tr');
        console.log(`✓ Found ${rows.length} rows`);
        
        rows.each((idx, row) => {
            const $row = $(row);
            const cells = $row.find('th,td');
            
            // First cell should have vendor link
            const linkCell = cells.eq(0);
            const link = linkCell.find('a').attr('href');
            
            if (!link) return;
            
            // Extract vendor ID from domain
            let vendorId;
            try {
                const url = new URL(link);
                vendorId = url.hostname.replace('www.', '').split('.')[0];
            } catch (e) {
                return;
            }
            
            const vendor = { id: vendorId, servers: [] };
            
            // Extract prices starting from cell 1 (skip vendor name cell)
            // Each server has 2 cells (sell, buy)
            const serverNames = ['ZERO', 'FELIS', 'AGARTHA', 'PANDORA', 'DRYADS', 'DESTAN', 'MINARK', 'OREADS'];
            
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
            }
            
            if (vendor.servers.some(s => s.sellPrice > 0 || s.buyPrice > 0)) {
                vendors.push(vendor);
                console.log(`  ✓ ${vendorId}`);
            }
        });
        
        const now = new Date();
        const scrapedAt = now.toISOString().split('.')[0];
        
        const data = {
            scrapedAt,
            vendors,
            serverStatusHtml: '<div>Veri başarıyla güncellendi.</div>'
        };
        
        // Save to file
        fs.writeFileSync('scraped-data.json', JSON.stringify(data, null, 2));
        console.log(`\n✓ Saved ${vendors.length} vendors to scraped-data.json`);
        console.log(JSON.stringify(data, null, 2));
        
    } catch (error) {
        console.error('✗ Error:', error.message);
        process.exit(1);
    }
}

scrapeData();
