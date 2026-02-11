const http = require("http");
const { scrapeAndUpload } = require("./scrape");

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const intervalMs = parseInt(
  process.env.SCRAPE_INTERVAL_MS || process.env.TRIGGER_INTERVAL_MS || String(DEFAULT_INTERVAL_MS),
  10
);

let isRunning = false;

async function runScrape() {
  if (isRunning) {
    console.log("Scrape already running, skipping");
    return;
  }

  isRunning = true;
  try {
    await scrapeAndUpload();
    console.log(`[${new Date().toISOString()}] Scrape completed`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Scrape failed: ${err.message}`);
  } finally {
    isRunning = false;
  }
}

function startScheduler() {
  console.log("Scheduler starting");
  console.log(`Interval: ${intervalMs}ms`);

  runScrape();
  setInterval(runScrape, intervalMs);
}

const port = parseInt(process.env.PORT || "3000", 10);
const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.url === "/run-scrape") {
    runScrape()
      .then(() => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("started");
      })
      .catch(() => {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("failed");
      });
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("kogb scheduler running");
});

server.listen(port, () => {
  console.log(`HTTP server listening on ${port}`);
  startScheduler();
});
