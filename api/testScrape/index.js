const { BlobServiceClient } = require("@azure/storage-blob");
const scrapeData = require("../scrapeData/index.js");

module.exports = async function (context, req) {
    context.log("testScrape HTTP trigger called");
    // Timer parametresi olmadan scrapeData fonksiyonunu çağır
    await scrapeData(context, null);
    context.res = {
        status: 200,
        body: "Scrape completed. Check logs and Blob for results."
    };
};
// Import the scraping logic from scrapeData
const scrapeFunction = require('../scrapeData/index.js');

module.exports = async function (context, req) {
    context.log('Manual scrape test triggered');
    
    try {
        // Create a mock timer object
        const mockTimer = {
            isPastDue: false,
            scheduledTime: new Date().toISOString()
        };
        
        // Call the scraping function
        await scrapeFunction(context, mockTimer);
        
        context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: {
                message: "Scraping completed successfully",
                timestamp: new Date().toISOString()
            }
        };
        
    } catch (error) {
        context.log.error(`Manual scrape test failed: ${error.message}`);
        context.res = {
            status: 500,
            body: `Scraping failed: ${error.message}`
        };
    }
};