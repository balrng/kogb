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

(async ()=>{
  const conn = readConn();
  if (!conn) { console.error('No storage connection'); process.exit(1); }
  const svc = BlobServiceClient.fromConnectionString(conn);
  const data = svc.getContainerClient('data');
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const todayName = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}.json`;
  const bc = data.getBlobClient(todayName);
  if (!(await bc.exists())) { console.error('today blob not found:', todayName); process.exit(1); }
  const r = await bc.download();
  const txt = await streamToString(r.readableStreamBody);
  const arr = JSON.parse(txt);
  // keep entries with scrapedAt <= today 19:30
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 19, 30, 0);
  const filtered = arr.filter(s => new Date(s.scrapedAt) <= cutoff);
  const block = data.getBlockBlobClient(todayName);
  await block.uploadData(Buffer.from(JSON.stringify(filtered, null, 2)), { blobHTTPHeaders: { blobContentType: 'application/json'} });
  console.log('Trimmed', todayName, 'to', filtered.length, 'snapshots; cutoff=', cutoff.toISOString());
})();
