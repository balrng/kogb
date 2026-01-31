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
    context.log('Getting config from blob storage');

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
        const containerClient = blobServiceClient.getContainerClient("config");
        const blobClient = containerClient.getBlobClient("config.json");

        const downloadResponse = await blobClient.download(0);
        
        if (!downloadResponse.readableStreamBody) {
            context.res = {
                status: 404,
                body: "Config file not found."
            };
            return;
        }

        const configData = await streamToString(downloadResponse.readableStreamBody);

        context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: configData
        };

    } catch (error) {
        context.log.error(`Error getting config: ${error.message}`);
        context.res = {
            status: 500,
            body: "Error retrieving config."
        };
    }
};