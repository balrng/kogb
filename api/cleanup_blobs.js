const { BlobServiceClient } = require('@azure/storage-blob');
const path = require('path');
const fs = require('fs');

async function main() {
  // Load connection string from local.settings.json if present
  let conn = process.env.KOGB_STORAGE_CONNECTION_STRING;
  try {
    const local = JSON.parse(fs.readFileSync(path.join(__dirname, 'local.settings.json'), 'utf8'));
    if (local && local.Values && local.Values.KOGB_STORAGE_CONNECTION_STRING) conn = local.Values.KOGB_STORAGE_CONNECTION_STRING;
  } catch (e) {}

  if (!conn) {
    console.error('No connection string found; aborting cleanup.');
    process.exit(1);
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(conn);
  const dataContainer = blobServiceClient.getContainerClient('data');
  const cacheContainer = blobServiceClient.getContainerClient('cache');

  const today = new Date();
  const todayName = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}.json`;

  console.log('Keeping today file:', todayName);

  // Clean data container: keep only today's daily file (YYYY-MM-DD.json); delete others and miscellaneous test files
  console.log('Listing blobs in container: data');
  for await (const blob of dataContainer.listBlobsFlat()) {
    const name = blob.name;
    if (name === todayName) {
      console.log('Keeping:', name);
      continue;
    }
    // delete things that are not today's file
    if (/^\d{4}-\d{2}-\d{2}\.json$/.test(name) || name.startsWith('test_') || name.startsWith('test') || name.endsWith('.json')) {
      console.log('Deleting:', name);
      try { await dataContainer.deleteBlob(name); } catch (e) { console.error('Delete failed for', name, e.message); }
    } else {
      // keep unknown files
      console.log('Skipping (not targeted):', name);
    }
  }

  // Clean cache container: keep latest files (latest_with_trend.json, last_scrape_time.txt, config.json)
  const keepCache = new Set(['latest_with_trend.json','last_scrape_time.txt','config.json']);
  console.log('Listing blobs in container: cache');
  for await (const blob of cacheContainer.listBlobsFlat()) {
    const name = blob.name;
    if (keepCache.has(name)) {
      console.log('Keeping cache file:', name);
      continue;
    }
    console.log('Deleting cache file:', name);
    try { await cacheContainer.deleteBlob(name); } catch (e) { console.error('Delete failed for', name, e.message); }
  }

  console.log('Cleanup complete.');
}

main().catch(err=>{ console.error(err); process.exit(1); });
