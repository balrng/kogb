
// Make data and chart instance globally accessible
let priceChartInstance;
let fullData = [];
let visibleVendors = [];
let chartViewMode = 'hourly'; // 'hourly' or 'daily'
const VENDOR_COLORS = [ '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e74c3c', '#1abc9c', '#f39c12', '#00bcd4', '#d35400' ];

const transformDataForChart = (filter) => {
    if (fullData.length === 0) return { labels: [], datasets: [] };

    // If underlying data is denser (e.g. 30min), aggregate into 2-hour bins for readability
    const getAggregatedData = (source) => {
        // group size for 2 hours when source interval is 30min: 4 samples
        const groupSize = 4;
        if (!Array.isArray(source) || source.length === 0) return [];
        if (source.length < groupSize) return source.slice();
        const out = [];
        for (let i = 0; i < source.length; i += groupSize) {
            const group = source.slice(i, i + groupSize);
            // average vendor prices across group
            const vendorsById = {};
            group.forEach(snap => {
                (snap.vendors || []).forEach(v => {
                    if (!vendorsById[v.id]) vendorsById[v.id] = {};
                    (v.servers || []).forEach(server => {
                        const key = (server.serverName || '').trim();
                        if (!vendorsById[v.id][key]) vendorsById[v.id][key] = { sell: [], buy: [] };
                        // Coerce prices to numbers when possible (allow strings from blob)
                        const sellVal = server.sellPrice == null ? null : Number(String(server.sellPrice).replace(/,/g, ''));
                        const buyVal = server.buyPrice == null ? null : Number(String(server.buyPrice).replace(/,/g, ''));
                        if (!Number.isNaN(sellVal)) vendorsById[v.id][key].sell.push(sellVal);
                        if (!Number.isNaN(buyVal)) vendorsById[v.id][key].buy.push(buyVal);
                    });
                });
            });
            const averagedVendors = Object.keys(vendorsById).map(vid => ({
                id: vid,
                servers: Object.keys(vendorsById[vid]).map(sname => {
                    const arr = vendorsById[vid][sname];
                    const avg = (arrVals) => arrVals.length ? +(arrVals.reduce((a,b)=>a+b,0)/arrVals.length).toFixed(2) : null;
                    return { serverName: sname, sellPrice: avg(arr.sell), buyPrice: avg(arr.buy) };
                })
            }));
            // use first timestamp in group as label timestamp
            out.push({ scrapedAt: group[0].scrapedAt, vendors: averagedVendors });
        }
        return out;
    };

    const dataSource = (chartViewMode === 'hourly') ? getAggregatedData(fullData) : fullData;

    const labels = dataSource.map(entry => {
        const d = new Date(entry.scrapedAt);
        if (chartViewMode === 'daily') {
            // Show full date for daily summaries
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    });

    const datasets = [];
    const vendorsToDraw = filter.vendorId 
        ? visibleVendors.filter(v => v.id === filter.vendorId)
        : visibleVendors;

    vendorsToDraw.forEach((config, index) => {
        const vendorData = {
            label: config.displayName,
            data: [],
            borderColor: VENDOR_COLORS[visibleVendors.findIndex(v => v.id === config.id) % VENDOR_COLORS.length],
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#fff',
            tension: 0.1
        };

        dataSource.forEach(snapshot => {
            const vendorPrices = (snapshot.vendors || []).find(v => v.id === config.id);
            let price = null;
            if (vendorPrices && vendorPrices.servers) {
                // Normalize server name comparison to be tolerant of whitespace/case
                const target = (filter.serverName || '').trim().toLowerCase();
                const serverData = vendorPrices.servers.find(s => ((s.serverName||'').trim().toLowerCase() === target));
                if (serverData) {
                    const raw = filter.type === 'buy' ? serverData.buyPrice : serverData.sellPrice;
                    const num = raw == null ? null : Number(String(raw).replace(/,/g, ''));
                    price = Number.isNaN(num) ? null : num;
                }
            }
            vendorData.data.push(price);
        });
        datasets.push(vendorData);
    });
    return { labels, datasets };
};

function createPriceChart(canvasId, title, filter, customLegendContainerId) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const { labels, datasets } = transformDataForChart(filter);

    // If a chart instance exists for this canvas, destroy it first.
    if (window[canvasId + '_instance']) {
        window[canvasId + '_instance'].destroy();
    }

    const chartConfig = {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { type: 'category', title: { display: true, text: 'Zaman', color: '#ccc' }, ticks: { color: '#ccc' }, grid: { color: 'rgba(204, 204, 204, 0.2)' } },
                y: { title: { display: true, text: 'Fiyat (₺)', color: '#ccc' }, ticks: { color: '#ccc' }, grid: { color: 'rgba(204, 204, 204, 0.2)' } }
            },
            plugins: {
                legend: {
                    display: !customLegendContainerId, // Disable default legend only if custom legend is used
                    position: 'top',
                    labels: {
                        color: '#fff'
                    }
                },
                title: { display: true, text: title, color: '#fff', font: { size: 16 } }
            }
        },
        plugins: [] // For custom plugin registration
    };

    if (customLegendContainerId) {
        chartConfig.options.plugins.legend.display = false;
        chartConfig.plugins.push({
            id: 'customLegendPlugin',
            afterUpdate: (chart) => {
                renderCustomLegend(chart, customLegendContainerId, filter);
            }
        });
        chartConfig.options.plugins.legend.onClick = (e, legendItem, legend) => {
            const index = legendItem.datasetIndex;
            const ci = legend.chart;
            if (ci.isDatasetVisible(index)) {
                ci.hide(index);
                legendItem.hidden = true;
            } else {
                ci.show(index);
                legendItem.hidden = false;
            }
        };
    }

    const newChartInstance = new Chart(ctx, chartConfig);
    window[canvasId + '_instance'] = newChartInstance;

    // If this is the main chart, add click handler to open daily details
    if (canvasId === 'priceChart') {
        newChartInstance.options.onClick = async (evt, elements) => {
            if (!elements || elements.length === 0) return;
            const el = elements[0];
            const idx = el.index;
            const label = newChartInstance.data.labels[idx];
            if (!label) return;
            // label is YYYY-MM-DD for daily summary
            try {
                const API_BASE = (window.location.hostname === 'localhost' && window.location.port !== '7071') ? 'http://localhost:7071' : '';
                // If chartViewMode is daily, label is YYYY-MM-DD; otherwise attempt to use last update's date
                const targetDate = chartViewMode === 'daily' ? label : (document.getElementById('last-updated')?.innerText || label);
                const resp = await fetch(`${API_BASE}/api/getHistory/${targetDate}`);
                if (!resp.ok) throw new Error('Daily history not available');
                const daySnapshots = await resp.json();
                if (!Array.isArray(daySnapshots) || daySnapshots.length === 0) throw new Error('No snapshots for that day');
                // Temporarily set fullData to daySnapshots and open modal chart
                const backup = fullData;
                fullData = daySnapshots;
                const selectedServer = document.getElementById('server-select')?.value || (fullData[0]?.vendors?.[0]?.servers?.[0]?.serverName || '');
                const selectedType = document.getElementById('type-select')?.value || 'sell';
                const filter = { serverName: selectedServer, type: selectedType };
                createPriceChart('modalPriceChart', `Detay: ${label} - ${selectedServer}`, filter);
                const modal = document.getElementById('chart-modal');
                if (modal) modal.style.display = 'flex';
                // restore fullData when modal closed (modal close handler in script.js will handle display)
                fullData = backup;
            } catch (e) {
                console.error('Could not load daily snapshots:', e.message);
            }
        };
    }
}

const renderCustomLegend = (chart, containerId, filter) => {
    const legendContainer = document.getElementById(containerId);
    if (!legendContainer) return;
    legendContainer.innerHTML = '';

    const vendorsToDraw = filter.vendorId 
        ? visibleVendors.filter(v => v.id === filter.vendorId)
        : visibleVendors;

    chart.data.datasets.forEach((dataset, index) => {
        const vendorConfig = vendorsToDraw.find(v => v.displayName === dataset.label);
        if (!vendorConfig) return;

        const legendItem = document.createElement('div');
        legendItem.className = 'legend-item';
        legendItem.onclick = () => {
            const isVisible = chart.isDatasetVisible(index);
            chart.setDatasetVisibility(index, !isVisible);
            legendItem.classList.toggle('hidden', isVisible);
            chart.update();
        };

        const logoPath = `/img/${vendorConfig.id}.png`;
        legendItem.innerHTML = `<span class="legend-color-box" style="background-color:${dataset.borderColor}"></span>
                              <img src="${logoPath}" alt="${vendorConfig.displayName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';"> 
                              <span class="legend-text" style="display:none;">${vendorConfig.displayName}</span>`;

        if (!chart.isDatasetVisible(index)) {
            legendItem.classList.add('hidden');
        }
        
        legendContainer.appendChild(legendItem);
    });
};


document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE = (window.location.hostname === 'localhost' && window.location.port !== '7071') ? 'http://localhost:7071' : '';
    const serverSelect = document.getElementById('server-select');
    const typeSelect = document.getElementById('type-select');
    const selectAllBtn = document.getElementById('select-all-btn');
    const deselectAllBtn = document.getElementById('deselect-all-btn');

    const setAllDatasetsVisibility = (visible) => {
        const chart = window['priceChart_instance'];
        if (!chart) return;
        chart.data.datasets.forEach((_, index) => {
            chart.setDatasetVisibility(index, visible);
        });
        chart.update();
    };

    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => setAllDatasetsVisibility(true));
    }
    if (deselectAllBtn) {
        deselectAllBtn.addEventListener('click', () => setAllDatasetsVisibility(false));
    }
    
    const updateMainChart = () => {
        if (!serverSelect || !typeSelect) return; // Do nothing if elements don't exist
        const selectedServer = serverSelect.value;
        const selectedType = typeSelect.value;
        const typeText = selectedType === 'buy' ? 'Alış' : 'Satış';

        const title = `${selectedServer} Sunucusu ${typeText} Fiyatları`;
        const filter = { serverName: selectedServer, type: selectedType };
        createPriceChart('priceChart', title, filter, 'custom-legend-container');
    };

    const loadDataAndInit = async () => {
        try {
            // Load config and 30-day daily summary (default metric=last)
            const configResponse = await fetch(`${API_BASE}/api/getConfig`);
            if (!configResponse.ok) throw new Error('config.json could not be loaded');
            const config = await configResponse.json();

            // Default: show today's hourly snapshots first (chartViewMode = 'hourly')
            chartViewMode = 'hourly';
            const today = getLocalDateString(new Date());
            const todayResp = await fetch(`${API_BASE}/api/getHistory/${today}`);
            if (!todayResp.ok) {
                // fallback to summary if today's snapshots not present
                const days = 30;
                const summaryResponse = await fetch(`${API_BASE}/api/getHistorySummary/${days}?metric=last`);
                if (!summaryResponse.ok) throw new Error('Summary data could not be loaded');
                const summaryJson = await summaryResponse.json();
                // Build fullData from summary: each entry's scrapedAt will be the date string
                fullData = (summaryJson.days || []).map(d => d.snapshot || d);
                chartViewMode = 'daily';
            } else {
                fullData = await todayResp.json();
                chartViewMode = 'hourly';
            }

            visibleVendors = config.vendorConfig.filter(v => v.visible).sort((a, b) => a.displayOrder - b.displayOrder);
            const visibleServersConfig = config.servers.filter(s => s.visible);

            if (visibleServersConfig.length === 0) throw new Error('Yapılandırma dosyasında görünür sunucu bulunamadı.');

            // Populate server select
            if (serverSelect) {
                serverSelect.innerHTML = '';
                visibleServersConfig.forEach(server => {
                    serverSelect.innerHTML += `<option value="${server.name}">${server.name}</option>`;
                });
                serverSelect.addEventListener('change', updateMainChart);
                typeSelect.addEventListener('change', updateMainChart);
            }

            // Render initial chart
            updateMainChart();

            // Attach toggle button handler
            const toggleBtn = document.getElementById('toggle-daily-btn');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', async () => {
                    try {
                        if (chartViewMode === 'hourly') {
                            // switch to daily summary
                            const days = 30;
                            const resp = await fetch(`${API_BASE}/api/getHistorySummary/${days}?metric=last`);
                            if (!resp.ok) throw new Error('Summary fetch failed');
                            const json = await resp.json();
                            fullData = (json.days || []).map(d => d.snapshot || d);
                            chartViewMode = 'daily';
                            toggleBtn.innerText = 'Günlük (Aktif)';
                        } else {
                            // switch back to today's hourly
                            const today = getLocalDateString(new Date());
                            const resp = await fetch(`${API_BASE}/api/getHistory/${today}`);
                            if (!resp.ok) throw new Error('Today fetch failed');
                            fullData = await resp.json();
                            chartViewMode = 'hourly';
                            toggleBtn.innerText = 'Günlük';
                        }
                        updateMainChart();
                    } catch (e) {
                        console.error('Toggle failed', e.message);
                        alert('Veri alınırken hata: ' + e.message);
                    }
                });
                // reflect current mode
                toggleBtn.innerText = chartViewMode === 'daily' ? 'Günlük (Aktif)' : 'Günlük';
            }
        } catch (error) {
            console.error('Error loading or processing data:', error);
            const errorDisplay = document.getElementById('chart-error-display');
            if (errorDisplay) errorDisplay.innerText = 'Grafik verileri yüklenemedi: ' + error.message;
            else alert('Grafik verileri yüklenemedi: ' + error.message);
        }
    };

    // Helper: return YYYY-MM-DD for a Date
    function getLocalDateString(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Helper: return YYYY-MM-DD for a Date
    function getLocalDateString(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Only initialize chart data when the main chart exists (avoid forcing getHistory on index.html where only modal canvas exists)
    if (document.getElementById('priceChart')) {
        loadDataAndInit();
    } else {
        console.log('graph.js: main chart not present, skipping initial history load');
    }
});
