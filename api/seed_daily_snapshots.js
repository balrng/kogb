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

function isoLocal(date) {
  // return YYYY-MM-DDTHH:mm:ss without Z
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function cloneAndPerturb(vendorsBase, factorRange = 0.03) {
  // clone vendors and perturb numeric prices slightly
  return vendorsBase.map(v => ({
    id: v.id,
    servers: (v.servers || []).map(s => ({
      serverName: s.serverName,
      sellPrice: typeof s.sellPrice === 'number' ? +(s.sellPrice * (1 + (Math.random()*2-1)*factorRange)).toFixed(2) : s.sellPrice,
      buyPrice: typeof s.buyPrice === 'number' ? +(s.buyPrice * (1 + (Math.random()*2-1)*factorRange)).toFixed(2) : s.buyPrice
    }))
  }));
}

async function downloadJsonFromBlob(containerClient, blobName) {
  try {
    const bc = containerClient.getBlobClient(blobName);
    if (!(await bc.exists())) return null;
    const r = await bc.download();
    const txt = await streamToString(r.readableStreamBody);
    return JSON.parse(txt);
  } catch (e) {
    console.error('download error', e.message);
    return null;
  }
}

async function uploadJsonToBlob(containerClient, blobName, obj) {
  const block = containerClient.getBlockBlobClient(blobName);
  const buffer = Buffer.from(JSON.stringify(obj, null, 2));
  await block.uploadData(buffer, { blobHTTPHeaders: { blobContentType: 'application/json' } });
}

async function streamToString(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on('data', (d) => chunks.push(d.toString()));
    readable.on('end', () => resolve(chunks.join('')));
    readable.on('error', reject);
  });
}

(async () => {
  const conn = readConn();
  if (!conn) {
    console.error('No storage connection string found. Aborting.');
    process.exit(1);
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(conn);
  const dataContainer = blobServiceClient.getContainerClient('data');
  await dataContainer.createIfNotExists();
  const cacheContainer = blobServiceClient.getContainerClient('cache');

  // get base vendors from cache latest_with_trend.json or from local scrape output
  let base = await downloadJsonFromBlob(cacheContainer, 'latest_with_trend.json');
  if (base && base.vendors) {
    base = base.vendors;
  } else {
    try {
      const local = JSON.parse(fs.readFileSync(path.join(__dirname, 'scrape_output_puppeteer.json'), 'utf8'));
      base = [local];
      // if local is single snapshot, convert to vendors list
      if (local && local.vendors) base = local.vendors;
    } catch (e) {
      console.error('No base data found to seed from. Aborting.');
      process.exit(1);
    }
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');

  // helper to create snapshots for a date with half-hour intervals
  function createSnapshotsForDate(dateObj) {
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const day = dateObj.getDate();
    const snapshots = [];
    for (let h = 0; h < 24; h++) {
      for (let m of [0,30]) {
        const d = new Date(year, month, day, h, m, 0);
        const scrapedAt = isoLocal(d);
        const vendors = cloneAndPerturb(base, 0.06); // up to +/-6%
        snapshots.push({ scrapedAt, vendors, serverStatusHtml: '<div>Sunucu durumu geçici olarak devre dışı bırakıldı.</div>' });
      }
    }
    return snapshots;
  }

  // create today and yesterday
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24*60*60*1000);

  const todayName = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}.json`;
  const yesterdayName = `${yesterday.getFullYear()}-${pad(yesterday.getMonth()+1)}-${pad(yesterday.getDate())}.json`;

  console.log('Seeding', todayName, 'and', yesterdayName);

  const todaySnapshots = createSnapshotsForDate(today);
  const yesterdaySnapshots = createSnapshotsForDate(yesterday);

  await uploadJsonToBlob(dataContainer, todayName, todaySnapshots);
  console.log('Uploaded', todayName);
  await uploadJsonToBlob(dataContainer, yesterdayName, yesterdaySnapshots);
  console.log('Uploaded', yesterdayName);

  console.log('Done seeding snapshots.');
})();
