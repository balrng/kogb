const { BlobServiceClient } = require('@azure/storage-blob');
const fs = require('fs');
const path = require('path');

function readConn() {
  let conn = process.env.KOGB_STORAGE_CONNECTION_STRING;
  try {
    const local = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'local.settings.json'), 'utf8'));
    if (local && local.Values && local.Values.KOGB_STORAGE_CONNECTION_STRING) conn = local.Values.KOGB_STORAGE_CONNECTION_STRING;
  } catch (e) {}
  return conn;
}

async function streamToString(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on('data', (d) => chunks.push(d.toString()));
    readable.on('end', () => resolve(chunks.join('')));
    readable.on('error', reject);
  });
}

(async ()=>{
  const conn = readConn();
  if (!conn) { console.error('No storage connection'); process.exit(1); }
  const svc = BlobServiceClient.fromConnectionString(conn);
  const data = svc.getContainerClient('data');
  const cache = svc.getContainerClient('cache');

  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const todayName = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}.json`;

  const report = {};

  // determine which vendor/server to inspect: allow env override, then config.json fallback
  let inspectVendor = process.env.INSPECT_VENDOR || null;
  let inspectServer = process.env.INSPECT_SERVER || null;
  if (!inspectVendor || !inspectServer) {
    try {
      const cfgPath = path.join(__dirname, '..', 'config.json');
      if (fs.existsSync(cfgPath)) {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        if (!inspectVendor) {
          const firstVisible = (cfg.vendorConfig||[]).find(v=>v.visible) || cfg.vendorConfig && cfg.vendorConfig[0];
          if (firstVisible) inspectVendor = firstVisible.id;
        }
        if (!inspectServer) {
          const firstServer = (cfg.servers||[]).find(s=>s.visible) || cfg.servers && cfg.servers[0];
          if (firstServer) inspectServer = firstServer.name;
        }
      }
    } catch (e) {
      // ignore and fall back to explicit defaults below
    }
  }
  // Do not hardcode defaults. Expose what will be inspected; mark if missing.
  report.inspectVendor = inspectVendor || null;
  report.inspectServer = inspectServer || null;
  if (!inspectVendor || !inspectServer) report.inspectMissing = true;

  // read today's file
  try {
    const bc = data.getBlobClient(todayName);
    if (await bc.exists()) {
      const r = await bc.download();
      const txt = await streamToString(r.readableStreamBody);
      const arr = JSON.parse(txt);
      report.dayCount = arr.length;
      if (arr.length>0) report.dayLast = arr[arr.length-1].scrapedAt;
      // find inspected vendor/server sell in last snapshot (only if specified)
      const last = arr[arr.length-1];
      if (inspectVendor && inspectServer && last && last.vendors) {
        const v = last.vendors.find(x=>x.id===inspectVendor);
        if (v && v.servers) {
          const s = v.servers.find(ss=>ss.serverName===inspectServer);
          if (s) report.dayLastPrice = { sell: s.sellPrice, buy: s.buyPrice };
        }
      } else if (!inspectVendor || !inspectServer) {
        report.dayInspectSkipped = true;
      }
    } else {
      report.dayExists = false;
    }
  } catch (e) { report.dayError = e.message; }

  // read cache/latest_with_trend.json
  try {
    const bc2 = cache.getBlobClient('latest_with_trend.json');
    if (await bc2.exists()) {
      const r2 = await bc2.download();
      const txt2 = await streamToString(r2.readableStreamBody);
      const j = JSON.parse(txt2);
      report.cacheLastUpdate = j.scrapedAt || j.updatedAt || null;
      if (inspectVendor && inspectServer) {
        const v = (j.vendors||[]).find(x=>x.id===inspectVendor);
        if (v && v.servers) {
          const s = v.servers.find(ss=>ss.serverName===inspectServer);
          if (s) report.cachePrice = { sell: s.sellPrice, buy: s.buyPrice };
        }
      } else {
        report.cacheInspectSkipped = true;
      }
    } else {
      report.cacheExists = false;
    }
  } catch (e) { report.cacheError = e.message; }

  console.log(JSON.stringify(report, null, 2));
})();
