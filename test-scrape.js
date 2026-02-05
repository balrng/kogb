const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

const scrapeUrl = 'https://www.enucuzgb.com/';

console.log('Attempting to scrape:', scrapeUrl);

axios.get(scrapeUrl, { headers: HEADERS })
    .then(r => {
        console.log('✓ Status:', r.status);
        console.log('✓ Response length:', r.data.length, 'bytes');
        
        const $ = cheerio.load(r.data);
        const rows = $('#veriYenile table tbody tr');
        console.log('✓ Found table rows:', rows.length);
        
        if (rows.length > 0) {
            console.log('\nFirst row HTML (first 300 chars):');
            console.log(rows.eq(0).html().substring(0, 300));
        } else {
            console.log('\n⚠️  No rows found. Checking page content...');
            console.log('Page contains "veriYenile"?', r.data.includes('veriYenile'));
            console.log('Page contains "table"?', r.data.includes('<table'));
            console.log('\nFirst 500 chars of response:');
            console.log(r.data.substring(0, 500));
        }
    })
    .catch(e => {
        console.error('✗ Error:', e.message);
        if (e.response) {
            console.error('Response status:', e.response.status);
            console.error('Response data (first 300 chars):', e.response.data.substring(0, 300));
        }
    });
