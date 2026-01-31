const puppeteer = require('puppeteer');

(async () => {
  const url = 'http://localhost:8080/index.html';
  const vendorId = 'bynogame';
  const server = 'ZERO';
  try {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(15000);
    await page.goto(url);
    // wait for table cell
    const selector = `td.price-cell[data-vendor-id="${vendorId}"][data-server-name="${server}"][data-type="sell"] span`;
    await page.waitForSelector(selector, { timeout: 5000 });
    const tableText = await page.$eval(selector, el => el.textContent.trim());
    console.log('Table sell text:', tableText);

    // click the cell's parent td to trigger modal
    await page.click(`td.price-cell[data-vendor-id="${vendorId}"][data-server-name="${server}"][data-type="sell"]`);
    // wait for modal to be visible and for window.fullData to be set
    await page.waitForFunction(() => window.fullData && window.fullData.length>0, { timeout: 5000 });
    // read last snapshot and vendor price from page context
    const modalInfo = await page.evaluate((vendorId, server) => {
      const data = window.fullData || [];
      const last = data[data.length-1];
      let price = null;
      if (last && last.vendors) {
        const v = last.vendors.find(x => x.id === vendorId);
        if (v && v.servers) {
          const s = v.servers.find(ss => ss.serverName === server);
          if (s) price = s.sellPrice;
        }
      }
      return { lastScrapedAt: last?.scrapedAt, modalPrice: price };
    }, vendorId, server);

    console.log('Modal lastScrapedAt:', modalInfo.lastScrapedAt, 'modalPrice:', modalInfo.modalPrice);
    await browser.close();
  } catch (e) {
    console.error('Puppeteer test failed:', e.message);
    process.exit(1);
  }
})();
