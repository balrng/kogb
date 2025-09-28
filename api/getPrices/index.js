const { BlobServiceClient } = require("@azure/storage-blob");

const containerName = "data";
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

module.exports = async function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request for getPrices.');

    const connectionString = process.env.KOGB_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
        context.res = {
            status: 500,
            body: "Server configuration error: Storage connection string is not set."
        };
        return;
    }

    try {
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const blobClient = containerClient.getBlobClient(blobName);

        const downloadBlockBlobResponse = await blobClient.download(0);
        
        if (!downloadBlockBlobResponse.readableStreamBody) {
             context.res = {
                status: 404,
                body: "Data file not found. The scraper may not have run yet."
            };
            return;
        }

        const data = await streamToString(downloadBlockBlobResponse.readableStreamBody);

        context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: data
        };

    } catch (error) {
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
