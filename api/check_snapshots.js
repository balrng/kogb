const { BlobServiceClient } = require('@azure/storage-blob');
const fs = require('fs');
const path = require('path');

function readConn() {
  let conn = process.env.KOGB_STORAGE_CONNECTION_STRING;
  try {
    const local = JSON.parse(fs.readFileSync(path.join(__dirname, 'local.settings.json'), 'utf8'));
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

async function downloadJson(containerClient, name) {
  const bc = containerClient.getBlobClient(name);
  if (!(await bc.exists())) {
    console.log('Blob not found:', name);
    return null;
  }
  const r = await bc.download();
  const txt = await streamToString(r.readableStreamBody);
  return JSON.parse(txt);
}

(async ()=>{
  const conn = readConn();
  if (!conn) {
    console.error('No storage connection string found in env or local.settings.json');
    process.exit(1);
  }
  const svc = BlobServiceClient.fromConnectionString(conn);
  const data = svc.getContainerClient('data');
  const files = ['2026-01-31.json','2026-01-30.json'];
  for (const f of files) {
    const j = await downloadJson(data, f);
    if (!j) continue;
    console.log(f, 'snapshots=', j.length);
    if (j.length>0) console.log(' first=', j[0].scrapedAt, ' vendors=', (j[0].vendors||[]).length);
  }
})();
