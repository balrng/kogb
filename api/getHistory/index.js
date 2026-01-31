const { BlobServiceClient } = require("@azure/storage-blob");

async function streamToString(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on("data", (data) => chunks.push(data.toString()));
    readableStream.on("end", () => resolve(chunks.join("")));
    readableStream.on("error", reject);
  });
}

// Simple date-keyed in-memory cache to reduce blob reads
const HISTORY_TTL_SECONDS = parseInt(process.env.GET_HISTORY_TTL_SECONDS || '180', 10);
const DISABLE_HISTORY_CACHE = String(process.env.DISABLE_HISTORY_CACHE || '').toLowerCase() === '1' || String(process.env.DISABLE_HISTORY_CACHE || '').toLowerCase() === 'true';
const _historyCache = new Map(); // key: dateString -> { ts, body }

module.exports = async function (context, req) {
  const connectionString = process.env.KOGB_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    context.res = { status: 500, body: "Server configuration error: Storage connection string is not set." };
    return;
  }

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient("data");

    // date param optional: if provided, try exactly that date; otherwise, try today then previous days up to 7
    const dateParam = req.params.date;

    const tryDates = [];
    if (dateParam) {
      tryDates.push(dateParam);
    } else {
      const now = new Date();
      for (let i = 0; i < 7; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        tryDates.push(`${yyyy}-${mm}-${dd}`);
      }
    }

    for (const dateString of tryDates) {
      // check in-memory cache first (skip if disabled)
      const now = Date.now();
      if (!DISABLE_HISTORY_CACHE) {
        const cached = _historyCache.get(dateString);
        if (cached && (now - cached.ts) < HISTORY_TTL_SECONDS * 1000) {
          context.log(`getHistory: returning cached date=${dateString} (age=${Math.round((now-cached.ts)/1000)}s)`);
          context.res = {
            status: 200,
            headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${Math.min(HISTORY_TTL_SECONDS, 300)}` },
            body: cached.body
          };
          return;
        }
      }

      try {
        const blobName = `${dateString}.json`;
        const blobClient = containerClient.getBlobClient(blobName);
        const download = await blobClient.download(0);
        if (!download.readableStreamBody) continue;
        const text = await streamToString(download.readableStreamBody);

        // store in cache (unless disabled)
        if (!DISABLE_HISTORY_CACHE) _historyCache.set(dateString, { ts: Date.now(), body: text });

        context.res = {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${Math.min(HISTORY_TTL_SECONDS, 300)}` },
          body: text
        };
        return;
      } catch (err) {
        if (err.statusCode === 404) {
          // try next date
          continue;
        }
        throw err;
      }
    }

    // none found
    context.res = { status: 404, body: "No recent data file found." };
  } catch (err) {
    if (err.statusCode === 404) {
      context.res = { status: 404, body: `No data file found.` };
    } else {
      context.log.error(`getHistory error: ${err.message}`);
      context.res = { status: 500, body: "Error retrieving history." };
    }
  }
};