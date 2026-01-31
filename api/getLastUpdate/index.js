const { BlobServiceClient } = require("@azure/storage-blob");

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
    context.log('Getting last update time');

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
        const containerClient = blobServiceClient.getContainerClient("cache");
        const blobClient = containerClient.getBlobClient("last_scrape_time.txt");

        const downloadResponse = await blobClient.download(0);
        
        if (!downloadResponse.readableStreamBody) {
            context.res = {
                status: 404,
                body: "Last update time not found."
            };
            return;
        }

        const timeString = await streamToString(downloadResponse.readableStreamBody);

        context.res = {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
            body: timeString.replace(/"/g, '') // Remove quotes from JSON string
        };

    } catch (error) {
        context.log.error(`Error getting last update time: ${error.message}`);
        context.res = {
            status: 500,
            body: "Error retrieving last update time."
        };
    }
};