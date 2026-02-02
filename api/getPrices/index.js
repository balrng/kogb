const { BlobServiceClient } = require("@azure/storage-blob");

const containerName = "cache";
const blobName = "latest_with_trend.json";

async function streamToString(readableStream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        readableStream.on("data", (data) => {
            chunks.push(data.toString());
        });
        readableStream.on("end", () => {
            resolve(chunks.join(""));
        });
        readableStream.on("error", reject);
    });
}

// Simple in-memory cache across warm function instances
let _cache = { ts: 0, body: null };
const TTL_SECONDS = parseInt(process.env.GET_PRICES_TTL_SECONDS || '30', 10);

module.exports = async function (context, req) {
    context.log('getPrices: Function triggered');

    const now = Date.now();
    if (_cache.body && (now - _cache.ts) < TTL_SECONDS * 1000) {
        context.log(`getPrices: Returning cached response (age=${Math.round((now - _cache.ts)/1000)}s)`);
        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, max-age=0, must-revalidate'
            },
            body: _cache.body
        };
        return;
    }

    const connectionString = process.env.KOGB_STORAGE_CONNECTION_STRING;
    context.log('getPrices: Connection string:', connectionString ? 'OK' : 'MISSING');
    if (!connectionString) {
        context.res = {
            status: 500,
            body: "Server configuration error: Storage connection string is not set."
        };
        return;
    }

    try {
        context.log('getPrices: Connecting to BlobServiceClient...');
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const blobClient = containerClient.getBlobClient(blobName);

        context.log('getPrices: Checking if blob exists...');
        const exists = await blobClient.exists();
        context.log('getPrices: Blob exists:', exists);
        if (!exists) {
            context.res = {
                status: 404,
                body: "Data file not found. The scraper may not have run yet. (Blob does not exist)"
            };
            return;
        }

        context.log('getPrices: Downloading blob...');
        let downloadBlockBlobResponse;
        try {
            downloadBlockBlobResponse = await blobClient.download(0);
        } catch (err) {
            context.log('getPrices: Blob download error:', err.message);
            context.res = {
                status: 500,
                body: "Blob download error: " + err.message
            };
            return;
        }

        context.log('getPrices: Checking readableStreamBody...');
        if (!downloadBlockBlobResponse.readableStreamBody) {
            context.res = {
                status: 404,
                body: "Data file not found. The scraper may not have run yet. (No readableStreamBody)"
            };
            return;
        }

        const data = await streamToString(downloadBlockBlobResponse.readableStreamBody);
        context.log('getPrices: Data length:', data.length);

        // Update cache
        _cache = { ts: Date.now(), body: data };

        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, max-age=0, must-revalidate'
            },
            body: data
        };

    } catch (error) {
        context.log('getPrices: General error:', error.message);
        if (error.statusCode === 404) {
            context.res = {
                status: 404,
                body: "Data file not found. The scraper may not have run yet."
            };
        } else {
            context.log.error(`Error getting blob: ${error.message}`);
            context.res = {
                status: 500,
                body: "Error retrieving data from storage."
            };
        }
    }
};
