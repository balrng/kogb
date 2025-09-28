const fs = require('fs').promises;
const path = require('path');

const configPath = path.join(__dirname, 'config.json');

function getTodayDataFilePath() {
    const now = new Date();
    const dateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return path.join(__dirname, 'data', `${dateString}.json`);
}

async function runCountdown() {
    try {
        const dataFilePath = getTodayDataFilePath();

        // Read necessary files
        const [configData, jsonData] = await Promise.all([
            fs.readFile(configPath, 'utf8'),
            fs.readFile(dataFilePath, 'utf8')
        ]).catch(err => {
            // If one file fails (e.g., data file doesn't exist yet), catch it here
            if (err.code === 'ENOENT') {
                process.stdout.write(`\rWaiting for today's data file to be created...`);
            } else {
                console.error('\nAn error occurred:', err);
            }
            // Return a specific value to signal failure
            return [null, null];
        });

        if (!configData || !jsonData) {
            // Stop if files couldn't be read
            return;
        }
        
        const config = JSON.parse(configData);
        const logIntervalSeconds = config.settings.logIntervalSeconds;

        const data = JSON.parse(jsonData);
        if (!data || data.length === 0) {
            process.stdout.write('\rData file is empty. Waiting for first log...');
            return;
        }

        // Get the last logged entry
        const lastLogEntry = data[data.length - 1];
        const lastLogTime = new Date(lastLogEntry.scrapedAt);

        // Calculate next log time
        const nextLogTime = new Date(lastLogTime.getTime() + logIntervalSeconds * 1000);

        // Calculate remaining time
        const now = new Date();
        const remainingMs = nextLogTime - now;

        if (remainingMs <= 0) {
            process.stdout.write(`\rNext log is overdue. Last log was at: ${lastLogTime.toLocaleTimeString()}`);
            return;
        }

        const remainingSecondsTotal = Math.floor(remainingMs / 1000);
        const minutes = Math.floor(remainingSecondsTotal / 60);
        const seconds = remainingSecondsTotal % 60;

        // Display countdown
        process.stdout.write(`\rNext data log in: ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`);

    } catch (error) {
        // Catch errors from JSON parsing or other unexpected issues
        console.error('\nAn error occurred during countdown execution:', error);
    }
}

// Run every second
console.log('Starting data log countdown timer... (Press Ctrl+C to exit)');
setInterval(runCountdown, 1000);
