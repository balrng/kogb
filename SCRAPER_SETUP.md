# 🚀 Scraper Setup Guide

## Current Solution: GitHub Actions + Puppeteer

The scraper runs on **GitHub Actions** (Ubuntu) using **Puppeteer**, which works reliably for JavaScript-rendered pages like `enucuzgb.com` that are protected by Cloudflare.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   GitHub Actions (Every 15 min)              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 1. Checkout code                                      │   │
│  │ 2. Install Node.js dependencies                       │   │
│  │ 3. Run local-scraper.js (Puppeteer)                   │   │
│  │ 4. Save to local-scrape.json                          │   │
│  │ 5. Upload to Azure Blob Storage                       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    Azure Blob Storage
                  (cache/latest_with_trend.json)
                              ↓
                    Azure Static Web Apps
                       (/api/getPrices)
                              ↓
                      Frontend Display
```

## Setup Steps

### 1. Get Your Azure Storage Connection String

In Azure Portal or Azure CLI:

```bash
az storage account show-connection-string \
  --name kogbdata \
  --resource-group ko-gb
```

Output will be something like:
```
DefaultEndpointsProtocol=https;AccountName=kogbdata;AccountKey=xxx...
```

### 2. Add GitHub Secret

Go to: **https://github.com/balrng/kogb/settings/secrets/actions**

Click **"New repository secret"**:
- **Name**: `KOGB_STORAGE_CONNECTION_STRING`
- **Value**: (Paste the connection string from step 1)

Or using GitHub CLI:
```bash
gh secret set KOGB_STORAGE_CONNECTION_STRING --body "YOUR_CONNECTION_STRING" -R balrng/kogb
```

### 3. Verify the Workflow

Go to: **https://github.com/balrng/kogb/actions**

You should see "Local Scraper (GitHub-hosted)" workflow.

Manually trigger it:
```bash
gh workflow run local-scraper.yml -R balrng/kogb
```

### 4. Check the Results

After the workflow completes:
1. Check **Actions** tab for logs
2. Go to Azure Portal → Storage Account → Blob Containers → cache
3. Verify `latest_with_trend.json` was updated recently
4. Access the frontend API: `https://white-tree-007553003.6.azurestaticapps.net/api/getPrices`

## Files

- **`local-scraper.js`** - Local Puppeteer scraper (runs on GitHub Actions)
- **`local-scrape.json`** - Generated locally (for manual testing)
- **`.github/workflows/local-scraper.yml`** - GitHub Actions workflow
- **`api/scrapeData/index.js`** - Azure Function with cache fallback
- **`api/getPrices/index.js`** - Frontend API that serves cached data

## How It Works

### Local Testing (On Your Machine)

```bash
# Install dependencies
npm install

# Run the scraper locally
node local-scraper.js

# Check the output
cat local-scrape.json
```

### Automated Scheduling (GitHub Actions)

1. Every 15 minutes (configurable via cron)
2. GitHub-hosted Ubuntu runner executes the workflow
3. Puppeteer scrapes the data (works with Cloudflare protection)
4. Results uploaded to Azure Blob Storage
5. Frontend automatically serves fresh data

## Why GitHub Actions + Puppeteer?

| Approach | Status | Reason |
|----------|--------|--------|
| Azure Functions + Puppeteer | ❌ Failed | No Chromium support, size limits |
| Azure Functions + axios | ❌ Failed | Cloudflare blocks basic requests |
| GitHub Actions + Puppeteer | ✅ Works | Full browser environment available |
| Docker + Puppeteer | ⚠️ Complex | SWA doesn't support Docker |

## Troubleshooting

### Workflow Fails: "Secret not set"
- Go to GitHub repo settings → Secrets → Actions
- Add `KOGB_STORAGE_CONNECTION_STRING` secret
- Make sure the value is the complete connection string from Azure

### Workflow Fails: "Upload failed"
- Check the connection string is correct
- Verify container name is "cache"
- Check Azure Storage account permissions

### Data Not Updating
- Verify workflow runs successfully (check Actions tab)
- Check blob storage: `cache/latest_with_trend.json`
- Check timestamps in the JSON

## Performance Notes

- **Scraping time**: ~10-15 seconds (Puppeteer + page load)
- **Upload time**: ~2-3 seconds
- **Total workflow time**: ~30-40 seconds
- **GitHub free tier**: 2000 minutes/month allowed (plenty!)

## References

- [Puppeteer Documentation](https://pptr.dev/)
- [GitHub Actions Scheduling](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule)
- [Azure Blob Storage](https://learn.microsoft.com/en-us/azure/storage/blobs/)
