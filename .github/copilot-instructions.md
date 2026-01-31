# Ko_gb Project - AI Coding Assistant Instructions

## Project Overview
Knight Online price comparison web application that tracks and displays gold bar (GB) prices across multiple vendors and game servers. Built as an Azure Static Web App with serverless functions.

## Architecture & Structure
- **Frontend**: Vanilla JavaScript SPA with dynamic table generation (`script.js`, `index.html`)
- **Backend**: Azure Functions API (`api/getPrices/`) that serves cached pricing data from Azure Blob Storage
- **Data Flow**: External scraper → Azure Blob Storage → API → Frontend display
- **Configuration**: `config.json` defines vendors, servers, and display settings

### Key Files
- `script.js`: Main application logic, table rendering, modal interactions
- `config.json`: Vendor configurations, server list, and app settings
- `api/getPrices/index.js`: Azure Function that retrieves pricing data from blob storage
- `graph.js`: Chart visualization for price history trends

## Development Workflows
- **Deployment**: Auto-deploys to Azure Static Web Apps via GitHub Actions on main branch push
- **Local Development**: Serve static files directly (no build process required)
- **API Testing**: Use Azure Functions Core Tools for local API development

## Code Conventions
- **Configuration-Driven**: Vendors and servers defined in `config.json` with visibility flags
- **Data Attributes**: Use `dataset` properties for interactive elements (vendor IDs, server names)
- **Event Delegation**: Single event listener on table body handles all price cell clicks
- **Error Handling**: Graceful fallbacks for missing data, API failures, and image load errors
- **Turkish Localization**: UI text and date formatting in Turkish (`tr-TR`)

### Table Rendering Pattern
```javascript
// Standard pattern for adding vendor rows
visibleVendors.forEach(vendorConfig => {
    const row = tableBody.insertRow();
    row.dataset.vendorId = vendorConfig.id;
    // Cell creation with fallback handling
});
```

## Key Integration Points
- **Azure Blob Storage**: Pricing data stored as `latest_with_trend.json`
- **External Scraper**: Populates blob storage (not part of this repo)
- **Vendor Websites**: Direct links from table rows via `websiteUrl` in config
- **Chart.js**: Price history visualization in modal overlays

## Getting Started for AI Assistants
1. Check `config.json` for current vendor and server configurations
2. Understand the data flow: Scraper → Blob Storage → API → Frontend
3. Key interactive elements use `data-*` attributes for event handling
4. Price cells support both table highlighting and chart modal opening
5. All vendor logos should exist in `/img/{vendorId}.png` format

## Common Tasks
- **Adding Vendors**: Update `config.json` vendorConfig array with new vendor object and logo
- **Server Management**: Modify `servers` array in config.json, update table headers if needed
- **Price Cell Logic**: Modify highlighting in `highlightTableCells()` for buy/sell comparison
- **API Debugging**: Check Azure Function logs and blob storage connection
- **UI Updates**: Turkish text updates, responsive table styling in `style.css`

## Critical Data Structures
- **Price Data**: `{ vendors: [{ id, servers: [{ serverName, sellPrice, buyPrice, sellTrend, buyTrend }] }] }`
- **Config Structure**: `{ vendorConfig: [], servers: [], settings: { cacheDurationSeconds } }`