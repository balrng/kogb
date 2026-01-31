(async () => {
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36');
    await page.goto('https://www.enucuzgb.com/', { waitUntil: 'networkidle2', timeout: 60000 });
    const tableExists = await page.$('#veriYenile table');
    if (!tableExists) {
      console.log('No #veriYenile table found on page');
      await browser.close();
      return;
    }
    const tableHtml = await page.$eval('#veriYenile table', el => el.outerHTML);
    console.log('Table HTML (truncated 4000 chars):\n', tableHtml.slice(0, 4000));
    const firstRowHTML = await page.$eval('#veriYenile table tbody tr', el => el.outerHTML);
    console.log('First row HTML (truncated 2000 chars):\n', firstRowHTML.slice(0, 2000));
    await browser.close();
  } catch (e) {
    console.error('Error:', e.message);
  }
})();
