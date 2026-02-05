const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

const scrapeUrl = 'https://www.enucuzgb.com/';

console.log('Attempting to scrape with Puppeteer:', scrapeUrl);

async function scrapeWithPuppeteer() {
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        
        const page = await browser.newPage();
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log('✓ Browser launched, navigating to page...');
        
        await page.goto(scrapeUrl, { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });
        
        console.log('✓ Page loaded');
        
        const htmlContent = await page.content();
        console.log('✓ HTML length:', htmlContent.length, 'bytes');
        
        const $ = cheerio.load(htmlContent);
        const rows = $('#veriYenile table tbody tr');
        console.log('✓ Found table rows:', rows.length);
        
        if (rows.length > 0) {
            console.log('\n✓ SUCCESS! First row HTML (first 300 chars):');
            console.log(rows.eq(0).html().substring(0, 300));
        } else {
            console.log('\n⚠️  No rows found even after rendering');
            console.log('Page contains "veriYenile"?', htmlContent.includes('veriYenile'));
            console.log('Page contains "table"?', htmlContent.includes('<table'));
            console.log('\nFirst 500 chars of rendered HTML:');
            console.log(htmlContent.substring(0, 500));
        }
        
        await browser.close();
        
    } catch (error) {
        console.error('✗ Error:', error.message);
        if (browser) {
            await browser.close();
        }
    }
}

scrapeWithPuppeteer();
