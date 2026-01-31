const { BlobServiceClient } = require("@azure/storage-blob");

// Do NOT store credentials in source. Provide the connection string via environment variable.
const connectionString = process.env.KOGB_STORAGE_CONNECTION_STRING || "";
const containerName = "cache";
const blobName = "latest_with_trend.json";

const sampleData = {
  scrapedAt: new Date().toISOString(),
  vendors: [
    {
      id: "bynogame",
      servers: [
        { serverName: "ZERO", sellPrice: 100, buyPrice: 90, sellTrend: "up", buyTrend: "down" },
        { serverName: "FELIS", sellPrice: 110, buyPrice: 95, sellTrend: "down", buyTrend: "up" }
      ]
    },
    {
      id: "oyuneks",
      servers: [
        { serverName: "ZERO", sellPrice: 105, buyPrice: 92, sellTrend: "stable", buyTrend: "stable" },
        { serverName: "FELIS", sellPrice: 115, buyPrice: 97, sellTrend: "up", buyTrend: "down" }
      ]
    }
  ]
};

async function uploadSample() {
  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlockBlobClient(blobName);
    const buffer = Buffer.from(JSON.stringify(sampleData, null, 2));
    await blobClient.upload(buffer, buffer.length, { blobHTTPHeaders: { blobContentType: "application/json" } });
    console.log("Sample vendor data uploaded.");
  } catch (err) {
    console.error("Upload error:", err);
  }
}

uploadSample();
