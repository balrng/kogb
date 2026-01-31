(async ()=>{
  const fetch = global.fetch || (await import('node-fetch')).default;
  const API = 'http://localhost:7071';
  const date = '2026-01-31';
  try {
    const day = await (await fetch(`${API}/api/getHistory/${date}`)).json();
    const prices = await (await fetch(`${API}/api/getPrices`)).json();
    const last = prices.scrapedAt || prices.updatedAt || null;
    console.log('daySnapshots=', day.length, ' lastSnapshot=', day[day.length-1].scrapedAt);
    console.log('cache lastUpdate=', last);
    if (last && new Date(last) > new Date(day[day.length-1].scrapedAt)) {
      console.log('Cache is newer than day file -> modal will append synthetic snapshot');
      console.log('Cache vendors sample:', (prices.vendors || []).slice(0,1));
    } else {
      console.log('Day file is up-to-date or equal to cache.');
    }
  } catch (e) { console.error(e); process.exit(1); }
})();
