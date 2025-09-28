
// Make data and chart instance globally accessible
let priceChartInstance;
let fullData = [];
let visibleVendors = [];
const VENDOR_COLORS = [ '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e74c3c', '#1abc9c', '#f39c12', '#00bcd4', '#d35400' ];

const transformDataForChart = (filter) => {
    if (fullData.length === 0) return { labels: [], datasets: [] };

    const labels = fullData.map(entry => {
        const d = new Date(entry.scrapedAt);
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

        fullData.forEach(snapshot => {
            const vendorPrices = snapshot.vendors.find(v => v.id === config.id);
            let price = null;
            if (vendorPrices && vendorPrices.servers) {
                const serverData = vendorPrices.servers.find(s => s.serverName === filter.serverName);
                if (serverData) {
                    price = filter.type === 'buy' ? serverData.buyPrice : serverData.sellPrice;
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
            const now = new Date();
            const dateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            const [configResponse, dataResponse] = await Promise.all([
                fetch('/config.json'),
                fetch(`data/${dateString}.json`)
            ]);

            if (!configResponse.ok) throw new Error('config.json could not be loaded');
            if (!dataResponse.ok) throw new Error(`Bugünün veri dosyası henüz oluşturulmadı. (data/${dateString}.json)`);

            const config = await configResponse.json();
            fullData = await dataResponse.json();

            if (fullData.length === 0) throw new Error('Veri dosyası boş.');

            visibleVendors = config.vendorConfig.filter(v => v.visible).sort((a, b) => a.displayOrder - b.displayOrder);
            const visibleServersConfig = config.servers.filter(s => s.visible);

            if (visibleServersConfig.length === 0) throw new Error('Yapılandırma dosyasında görünür sunucu bulunamadı.');

            // Only run main chart logic if the server select dropdown exists
            if (serverSelect) {
                serverSelect.innerHTML = '';
                visibleServersConfig.forEach(server => {
                    serverSelect.innerHTML += `<option value="${server.name}">${server.name}</option>`;
                });

                serverSelect.addEventListener('change', updateMainChart);
                typeSelect.addEventListener('change', updateMainChart);
                updateMainChart();
            }

        } catch (error) {
            console.error('Error loading or processing data:', error);
            // Displaying error in a more user-friendly way, e.g., in a specific div
            const errorDisplay = document.getElementById('chart-error-display');
            if(errorDisplay) errorDisplay.innerText = 'Grafik verileri yüklenemedi: ' + error.message;
            else alert('Grafik verileri yüklenemedi: ' + error.message);
        }
    };

    loadDataAndInit();
});
