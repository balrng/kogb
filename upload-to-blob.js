const { BlobServiceClient } = require("@azure/storage-blob");
const fs = require("fs");

async function uploadToBlobStorage() {
    const connectionString = process.env.KOGB_STORAGE_CONNECTION_STRING;
    
    if (!connectionString) {
        console.error("✗ KOGB_STORAGE_CONNECTION_STRING environment variable not set");
        process.exit(1);
    }
    
    try {
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient("cache");
        const blobClient = containerClient.getBlobClient("latest_with_trend.json");
        
        // Read the scraped data
        const fileContent = fs.readFileSync("scraped-data.json", "utf-8");
        const data = JSON.parse(fileContent);
        
        console.log(`Uploading ${data.vendors.length} vendors to Azure Blob Storage...`);
        
        // Upload to blob
        await blobClient.upload(fileContent, Buffer.byteLength(fileContent));
        
        console.log("✓ Successfully uploaded latest_with_trend.json");
        console.log(`  Vendors: ${data.vendors.length}`);
        console.log(`  Timestamp: ${data.scrapedAt}`);
        console.log(`  Updated: ${new Date().toISOString()}`);
        
    } catch (error) {
        console.error("✗ Error uploading to blob:", error.message);
        process.exit(1);
    }
}

uploadToBlobStorage();
