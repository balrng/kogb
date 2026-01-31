const { BlobServiceClient } = require("@azure/storage-blob");

// Do NOT store credentials in source. Provide the connection string via environment variable.
const connectionString = process.env.KOGB_STORAGE_CONNECTION_STRING || "";
const containerName = "cache";
const files = ["latest_with_trend.json", "last_scrape_time.txt"];

async function testBlobFiles() {
    try {
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient(containerName);
        for (const file of files) {
            const blobClient = containerClient.getBlobClient(file);
            const exists = await blobClient.exists();
            console.log(`${file}: ${exists ? "OK" : "NOT FOUND"}`);
            if (exists) {
                const download = await blobClient.download();
                const chunks = [];
                for await (const chunk of download.readableStreamBody) {
                    chunks.push(chunk.toString());
                }
                console.log(`${file} content:`, chunks.join("").slice(0, 200));
            }
        }
    } catch (err) {
        console.error("Blob test error:", err);
    }
}

testBlobFiles();