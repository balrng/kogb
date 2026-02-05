const fs = require('fs');
const path = require('path');

// When run locally as a script, load local.settings.json into env
function loadLocalSettings() {
  try {
    const localPath = path.join(__dirname, '..', 'local.settings.json');
    if (fs.existsSync(localPath)) {
      const local = JSON.parse(fs.readFileSync(localPath, 'utf8'));
      if (local && local.Values) {
        Object.keys(local.Values).forEach(k => {
          if (!process.env[k]) process.env[k] = local.Values[k];
        });
      }
    }
  } catch (e) {
    // ignore
  }
}

loadLocalSettings();

const scrapeFunction = require('../scrapeData/index.js');

module.exports = async function (context, req) {
  context = context || { log: (...args) => console.log('[TIMER]', ...args), log: Object.assign((...a)=>console.log('[TIMER]',...a), { error: (...a)=>console.error('[TIMER][ERR]',...a) }) };
  context.log('scrapeDataTimer: Triggered by scheduler');
  try {
    // Call the same scrape function; it accepts (context, req)
    await scrapeFunction(context, {});
    context.log('scrapeDataTimer: Scrape completed');
  } catch (e) {
    context.log.error('scrapeDataTimer: Error during scrape:', e && e.message ? e.message : e);
    throw e;
  }
};

// If executed directly, run once for local verification
if (require.main === module) {
  (async () => {
    const ctx = { log: (...args) => console.log('[TIMER-CLI]', ...args), log: Object.assign((...a)=>console.log('[TIMER-CLI]',...a), { error: (...a)=>console.error('[TIMER-CLI][ERR]',...a) }) };
    try {
      await module.exports(ctx, { isPastDue: false, scheduledTime: new Date().toISOString() });
      console.log('scrapeDataTimer: Local run succeeded');
    } catch (e) {
      console.error('scrapeDataTimer: Local run failed:', e.message || e);
      process.exit(1);
    }
  })();
}
