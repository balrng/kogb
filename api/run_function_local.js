const fs = require('fs');
const path = require('path');
try {
  const local = JSON.parse(fs.readFileSync(path.join(__dirname, 'local.settings.json'),'utf8'));
  if (local && local.Values && local.Values.KOGB_STORAGE_CONNECTION_STRING) {
    process.env.KOGB_STORAGE_CONNECTION_STRING = local.Values.KOGB_STORAGE_CONNECTION_STRING;
  }
} catch (e) {}

const scrapeFunction = require('./scrapeData/index.js');

console.log('DEBUG: KOGB_STORAGE_CONNECTION_STRING present?', !!process.env.KOGB_STORAGE_CONNECTION_STRING);

const context = {
  log: (...args) => console.log('[FUNCTION]', ...args),
  log: Object.assign((...args)=>console.log('[FUNCTION]', ...args), { error: (...args)=>console.error('[FUNCTION][ERROR]', ...args) })
};

(async () => {
  try {
    await scrapeFunction(context, { isPastDue: false, scheduledTime: new Date().toISOString() });
    console.log('Function run completed');
  } catch (e) {
    console.error('Function run failed:', e.message);
  }
})();
