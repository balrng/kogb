document.addEventListener("DOMContentLoaded", () => {
    const table = document.querySelector('table');
    const tableHead = table.querySelector('thead');
    const tableBody = table.querySelector('tbody');
    const lastUpdatedElement = document.getElementById('last-updated');

    // Modal elements
    const modal = document.getElementById('chart-modal');
    const closeModalButton = document.querySelector('.close-button');

    let config = {}; // Store config globally within the scope

    function highlightTableCells() {
        if (!tableBody) return;
        const rowCount = tableBody.rows.length;
        if (rowCount === 0) return;
        const colCount = tableBody.rows[0].cells.length;

        tableBody.querySelectorAll('td.buy, td.sell').forEach(cell => {
            cell.classList.remove('buy', 'sell');
        });

        for (let j = 1; j < colCount; j++) {
            let columnValues = [];
            let cellsInColumn = [];
            for (let i = 0; i < rowCount; i++) {
                const cell = tableBody.rows[i].cells[j];
                cellsInColumn.push(cell);
                const value = parseFloat(cell.querySelector('span')?.textContent || '0');
                columnValues.push(value);
            }
            if (columnValues.length === 0) continue;

            const isSellColumn = (j % 2 !== 0);
            let targetValue;
            if (isSellColumn) {
                const positiveValues = columnValues.filter(v => v > 0);
                targetValue = Math.min(...positiveValues);
            } else {
                targetValue = Math.max(...columnValues);
            }
            const highlightClass = isSellColumn ? 'sell' : 'buy';

            cellsInColumn.forEach((cell, index) => {
                if (columnValues[index] === targetValue && targetValue > 0) {
                    cell.classList.add(highlightClass);
                }
            });
        }
    }

    function renderTable(visibleVendors, visibleServers, priceDataMap) {
        if (!table || !tableHead || !tableBody) return;

        tableHead.innerHTML = '';
        const headerRow1 = tableHead.insertRow();
        headerRow1.innerHTML = '<th class="site-server">Site / Server</th>';
        visibleServers.forEach(server => {
            const cell = document.createElement('th');
            cell.colSpan = 2;
            cell.innerHTML = `${server.name}`;
            headerRow1.appendChild(cell);
        });

        const headerRow2 = tableHead.insertRow();
        headerRow2.innerHTML = '<th></th>';
        visibleServers.forEach(() => {
            headerRow2.innerHTML += '<th>Satış</th><th>Alış</th>';
        });

        tableBody.innerHTML = '';
        visibleVendors.forEach(vendorConfig => {
            const priceInfo = priceDataMap.get(vendorConfig.id);
            const row = tableBody.insertRow();
            row.className = 'clickable-row';
            row.dataset.vendorId = vendorConfig.id;
            if (vendorConfig.websiteUrl) {
                row.dataset.href = vendorConfig.websiteUrl;
            }

            const logoCell = row.insertCell();
            const logoPath = `/img/${vendorConfig.id}.png`;
            logoCell.innerHTML = `<img src="${logoPath}" alt="${vendorConfig.displayName}" onerror="this.onerror=null; this.outerHTML = this.alt;">`;

            visibleServers.forEach(server => {
                let sellPrice = '-', buyPrice = '-', sellTrend = '', buyTrend = '';
                if (priceInfo && priceInfo.servers) {
                    const serverData = priceInfo.servers.find(s => s.serverName === server.name);
                    if (serverData) {
                        sellPrice = serverData.sellPrice;
                        buyPrice = serverData.buyPrice;
                        sellTrend = serverData.sellTrend || '';
                        buyTrend = serverData.buyTrend || '';
                    }
                }
                const sellCell = row.insertCell();
                sellCell.className = 'price-cell';
                sellCell.dataset.vendorId = vendorConfig.id;
                sellCell.dataset.serverName = server.name;
                sellCell.dataset.type = 'sell';
                const sellArrow = sellTrend === 'up' ? '<i class="arrow-up"></i>' : sellTrend === 'down' ? '<i class="arrow-down"></i>' : '';
                sellCell.innerHTML = `<span>${sellPrice}</span>${sellArrow}`;

                const buyCell = row.insertCell();
                buyCell.className = 'price-cell';
                buyCell.dataset.vendorId = vendorConfig.id;
                buyCell.dataset.serverName = server.name;
                buyCell.dataset.type = 'buy';
                const buyArrow = buyTrend === 'up' ? '<i class="arrow-up"></i>' : buyTrend === 'down' ? '<i class="arrow-down"></i>' : '';
                buyCell.innerHTML = `<span>${buyPrice}</span>${buyArrow}`;
            });
        });

        highlightTableCells();
    }

    async function fetchDataAndRender() {
        try {
            // Fetch config only once
            if (!config.vendorConfig) {
                const configResponse = await fetch('/config.json');
                if (!configResponse.ok) throw new Error('Config file not found');
                config = await configResponse.json();
            }

            const [priceResponse, timeResponse] = await Promise.all([
                fetch('/api/getPrices'),
                fetch('/cache/last_scrape_time.txt')
            ]);
            
            const visibleVendors = config.vendorConfig.filter(v => v.visible).sort((a, b) => a.displayOrder - b.displayOrder);
            const visibleServers = config.servers.filter(s => s.visible);

            let priceDataMap = new Map();
            if (priceResponse.ok) {
                const priceData = await priceResponse.json();
                if (priceData.vendors) {
                    priceDataMap = new Map(priceData.vendors.map(v => [v.id, v]));
                }
            }

            if (timeResponse.ok && lastUpdatedElement) {
                const timeString = await timeResponse.text();
                if (timeString) {
                    const scrapedDate = new Date(timeString.trim());
                    lastUpdatedElement.textContent = scrapedDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                }
            }

            renderTable(visibleVendors, visibleServers, priceDataMap);

        } catch (error) {
            console.error('Error fetching or rendering data:', error);
            if (lastUpdatedElement) lastUpdatedElement.textContent = "Yükleme Başarısız.";
        }
    }

    // --- Event Listeners ---
    if (tableBody) {
        tableBody.addEventListener('click', function(e) {
            const priceCell = e.target.closest('.price-cell');
            if (priceCell) {
                // Handle chart opening
                const { vendorId, serverName, type } = priceCell.dataset;
                const vendor = config.vendorConfig.find(v => v.id === vendorId);
                const typeTR = type === 'sell' ? 'Satış' : 'Alış';

                const title = `${vendor.displayName} - ${serverName} ${typeTR} Fiyat Geçmişi`;
                const filter = { vendorId, serverName, type };

                if (modal && typeof createPriceChart === 'function') {
                    createPriceChart('modalPriceChart', title, filter);
                    modal.style.display = 'flex';
                }
                return; // Stop propagation to prevent row click
            }

            const row = e.target.closest('tr.clickable-row');
            if (row && row.dataset.href) {
                // Handle opening vendor website
                window.open(row.dataset.href, '_blank');
            }
        });
    }

    if (modal) {
        // Close modal when clicking the close button or the overlay
        closeModalButton.addEventListener('click', () => modal.style.display = 'none');
        modal.addEventListener('click', (e) => {
            if (e.target === modal) { // Only if clicking the overlay itself
                modal.style.display = 'none';
            }
        });
    }

    const init = async () => {
        await fetchDataAndRender(); // Initial fetch to load data and config

        // Set the interval using the value from the now-loaded config
        const refreshInterval = ((config.cacheDurationSeconds || 60) + 10) * 1000;
        setInterval(fetchDataAndRender, refreshInterval);
    };

    init();
});
