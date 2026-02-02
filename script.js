document.addEventListener('DOMContentLoaded', () => {
    const table = document.querySelector('table');
    const tableHead = table?.querySelector('thead');
    const tableBody = table?.querySelector('tbody');
    const lastUpdatedElement = document.getElementById('last-updated');

    const modal = document.getElementById('chart-modal');
    const closeModalButton = document.querySelector('.close-button');
    const API_BASE = (window.location.hostname === 'localhost' && window.location.port !== '7071') ? 'http://localhost:7071' : '';
    let config = {};

    function highlightTableCells() {
        if (!tableBody) return;
        const rowCount = tableBody.rows.length;
        if (rowCount === 0) return;
        const colCount = tableBody.rows[0].cells.length;
        tableBody.querySelectorAll('td.buy, td.sell').forEach(cell => cell.classList.remove('buy', 'sell'));

        for (let j = 1; j < colCount; j++) {
            const columnValues = [];
            const cellsInColumn = [];
            for (let i = 0; i < rowCount; i++) {
                const cell = tableBody.rows[i].cells[j];
                cellsInColumn.push(cell);
                const value = parseFloat(cell.querySelector('span')?.textContent || '0');
                columnValues.push(value);
            }
            if (!columnValues.length) continue;
            const isSellColumn = (j % 2 !== 0);
            const highlightClass = isSellColumn ? 'sell' : 'buy';
            const targetValue = isSellColumn ? Math.min(...columnValues.filter(v => v > 0)) : Math.max(...columnValues);
            cellsInColumn.forEach((cell, idx) => { if (columnValues[idx] === targetValue && targetValue > 0) cell.classList.add(highlightClass); });
        }
    }

    function renderTable(visibleVendors, visibleServers, priceDataMap) {
        if (!table || !tableHead || !tableBody) return;
        tableHead.innerHTML = '';
        const headerRow1 = tableHead.insertRow();
        headerRow1.innerHTML = '<th class="site-server">Site / Server</th>';
        visibleServers.forEach(server => { const cell = document.createElement('th'); cell.colSpan = 2; cell.innerHTML = `${server.name}`; headerRow1.appendChild(cell); });
        const headerRow2 = tableHead.insertRow();
        headerRow2.innerHTML = '<th></th>' + visibleServers.map(()=>'<th>Satış</th><th>Alış</th>').join('');

        tableBody.innerHTML = '';
        visibleVendors.forEach(vendorConfig => {
            const priceInfo = priceDataMap.get(vendorConfig.id);
            const row = tableBody.insertRow();
            row.className = 'clickable-row';
            row.dataset.vendorId = vendorConfig.id;
            if (vendorConfig.websiteUrl) row.dataset.href = vendorConfig.websiteUrl;
            const logoCell = row.insertCell();
            logoCell.innerHTML = `<img src="/img/${vendorConfig.id}.png" alt="${vendorConfig.displayName}" onerror="this.onerror=null; this.outerHTML = this.alt;">`;
            visibleServers.forEach(server => {
                let sellPrice = '-', buyPrice = '-', sellTrend = '', buyTrend = '';
                if (priceInfo && priceInfo.servers) {
                    const sd = priceInfo.servers.find(s=>s.serverName===server.name);
                    if (sd) { sellPrice = sd.sellPrice; buyPrice = sd.buyPrice; sellTrend = sd.sellTrend||''; buyTrend = sd.buyTrend||''; }
                }
                const sellCell = row.insertCell(); sellCell.className='price-cell'; sellCell.dataset.vendorId=vendorConfig.id; sellCell.dataset.serverName=server.name; sellCell.dataset.type='sell'; sellCell.innerHTML = `<span>${sellPrice}</span>${sellTrend==='up'?'<i class="arrow-up"></i>':sellTrend==='down'?'<i class="arrow-down"></i>':''}`;
                const buyCell = row.insertCell(); buyCell.className='price-cell'; buyCell.dataset.vendorId=vendorConfig.id; buyCell.dataset.serverName=server.name; buyCell.dataset.type='buy'; buyCell.innerHTML = `<span>${buyPrice}</span>${buyTrend==='up'?'<i class="arrow-up"></i>':buyTrend==='down'?'<i class="arrow-down"></i>':''}`;
            });
        });
        highlightTableCells();
    }

    async function fetchDataAndRender() {
        try {
            if (!config.vendorConfig) {
                const cfgResp = await fetch(`${API_BASE}/api/getConfig`);
                if (!cfgResp.ok) throw new Error('Config not available');
                config = await cfgResp.json();
            }
            // Fetch prices only and derive last update from the cache blob
            const priceResp = await fetch(`${API_BASE}/api/getPrices`);
            const visibleVendors = (config.vendorConfig||[]).filter(v=>v.visible).sort((a,b)=>a.displayOrder-b.displayOrder);
            const visibleServers = (config.servers||[]).filter(s=>s.visible);
            let priceDataMap = new Map();
            if (priceResp.ok) {
                const pd = await priceResp.json();
                if (pd.vendors) priceDataMap = new Map(pd.vendors.map(v=>[v.id,v]));
                if (pd.scrapedAt && lastUpdatedElement) {
                    try {
                        const d = new Date(pd.scrapedAt);
                        lastUpdatedElement.textContent = d.toLocaleString('tr-TR', { year: 'numeric', month: '2-digit', day: '2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' });
                    } catch (e) {
                        lastUpdatedElement.textContent = pd.scrapedAt;
                    }
                }
            }
            renderTable(visibleVendors, visibleServers, priceDataMap);
        } catch (err) { console.error('Error fetching or rendering data:', err); if (lastUpdatedElement) lastUpdatedElement.textContent = 'Yükleme Başarısız.'; }
    }

    if (tableBody) {
        tableBody.addEventListener('click', async (e) => {
            const priceCell = e.target.closest('.price-cell');
            if (!priceCell) {
                const row = e.target.closest('tr.clickable-row'); if (row && row.dataset.href) window.open(row.dataset.href, '_blank');
                return;
            }

            const { vendorId, serverName, type } = priceCell.dataset;
            const vendor = (config.vendorConfig||[]).find(v=>v.id===vendorId) || { displayName: vendorId };
            const title = `${vendor.displayName} - ${serverName} ${type==='sell'?'Satış':'Alış'} Fiyat Geçmişi`;
            const filter = { vendorId, serverName, type };

            try {
                // Get latest cache once
                let pricesJson = null; let lastTs = null;
                try {
                    const pR = await fetch(`${API_BASE}/api/getPrices`);
                    if (pR.ok) { pricesJson = await pR.json(); lastTs = pricesJson.scrapedAt || pricesJson.updatedAt || null; }
                } catch (e) { console.warn('cache fetch failed', e.message); }

                // decide date to fetch history for
                let dateStr = new Date().toISOString().slice(0,10);
                if (lastTs) try { dateStr = new Date(lastTs).toISOString().slice(0,10); } catch(e) {}

                // client-side per-date cache to avoid repeat requests during a session
                window.historyCache = window.historyCache || {};
                let daySnapshots = window.historyCache[dateStr] || null;
                if (daySnapshots) {
                    // if we have cached daySnapshots, but cache latest (pricesJson) is newer, try refetch to get updated day file
                    try {
                        if (pricesJson && lastTs) {
                            const lastDate = new Date(lastTs);
                            const lastSnapDate = new Date(daySnapshots[daySnapshots.length-1].scrapedAt);
                            if (lastDate > lastSnapDate) {
                                const histResp = await fetch(`${API_BASE}/api/getHistory/${dateStr}`);
                                if (histResp.ok) {
                                    daySnapshots = await histResp.json();
                                    if (Array.isArray(daySnapshots) && daySnapshots.length>0) window.historyCache[dateStr] = daySnapshots;
                                    console.log('Refreshed cached daySnapshots because cache was newer');
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to refresh cached history:', e.message);
                    }
                } else {
                    const histResp = await fetch(`${API_BASE}/api/getHistory/${dateStr}`);
                    if (histResp.ok) {
                        daySnapshots = await histResp.json();
                        if (Array.isArray(daySnapshots) && daySnapshots.length>0) window.historyCache[dateStr] = daySnapshots;
                    }
                }

                if (Array.isArray(daySnapshots) && daySnapshots.length>0) {
                    try {
                        if (pricesJson && lastTs) {
                            const lastDate = new Date(lastTs);
                            const lastSnapDate = new Date(daySnapshots[daySnapshots.length-1].scrapedAt);
                            if (lastDate > lastSnapDate) {
                                const pad = n=>String(n).padStart(2,'0');
                                const localIso = d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                                const now = new Date();
                                const todayStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
                                const useNow = (dateStr===todayStr);
                                const syntheticTime = useNow ? now : lastDate;
                                const synthetic = { scrapedAt: localIso(syntheticTime), vendors: pricesJson.vendors||[] };
                                daySnapshots = daySnapshots.concat([synthetic]);
                            }
                        }
                    } catch (e) { console.warn('append synthetic failed', e.message); }

                    window.fullData = daySnapshots;
                    if (modal && typeof createPriceChart === 'function') { createPriceChart('modalPriceChart', title, filter); modal.style.display = 'flex'; }
                    return;
                }

                // fallback: render modal with whatever fullData currently has
                if (modal && typeof createPriceChart === 'function') { createPriceChart('modalPriceChart', title, filter); modal.style.display = 'flex'; }
            } catch (err) {
                console.error('Error loading daily snapshots:', err);
                if (modal && typeof createPriceChart === 'function') { createPriceChart('modalPriceChart', title, filter); modal.style.display = 'flex'; }
            }
        });
    }

    if (modal) {
        closeModalButton?.addEventListener('click', ()=> modal.style.display='none');
        modal.addEventListener('click', (e)=> { if (e.target===modal) modal.style.display='none'; });
    }

    const init = async ()=>{ await fetchDataAndRender(); const refreshInterval = ((config.cacheDurationSeconds||60)+10)*1000; setInterval(fetchDataAndRender, refreshInterval); };
    init();
});
