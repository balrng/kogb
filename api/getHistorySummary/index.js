const { BlobServiceClient } = require('@azure/storage-blob');

module.exports = async function (context, req) {
    context.log('getHistorySummary: Function triggered');
    const connectionString = process.env.KOGB_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
        context.log.error('getHistorySummary: Storage connection string not set');
        context.res = { status: 500, body: 'Storage connection string not set' };
        return;
    }

    const daysParam = parseInt(req.params.days || req.query.days || '30', 10);
    const days = Math.max(1, Math.min(365, isNaN(daysParam) ? 30 : daysParam));
    const metric = (req.query.metric || 'last').toLowerCase(); // 'last' or 'avg'

    try {
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient('data');

        const results = [];
        const now = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            const dateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const blobName = `${dateString}.json`;
            const blobClient = containerClient.getBlobClient(blobName);
            if (!(await blobClient.exists())) continue;
            const download = await blobClient.download();
            const body = await streamToString(download.readableStreamBody);
            const dailyArray = JSON.parse(body || '[]');
            if (!Array.isArray(dailyArray) || dailyArray.length === 0) continue;

            let daySnapshot = null;
            if (metric === 'last') {
                daySnapshot = dailyArray[dailyArray.length - 1];
            } else if (metric === 'avg') {
                // compute averages per vendor/server
                const agg = new Map();
                dailyArray.forEach(snapshot => {
                    (snapshot.vendors || []).forEach(v => {
                        const vid = v.id;
                        if (!agg.has(vid)) agg.set(vid, new Map());
                        const sMap = agg.get(vid);
                        (v.servers || []).forEach(s => {
                            const key = s.serverName;
                            if (!sMap.has(key)) sMap.set(key, { sellSum: 0, buySum: 0, sellCount: 0, buyCount: 0 });
                            const stats = sMap.get(key);
                            if (typeof s.sellPrice === 'number') { stats.sellSum += s.sellPrice; stats.sellCount += 1; }
                            if (typeof s.buyPrice === 'number') { stats.buySum += s.buyPrice; stats.buyCount += 1; }
                        });
                    });
                });

                const vendors = [];
                for (const [vid, sMap] of agg.entries()) {
                    const servers = [];
                    for (const [serverName, stats] of sMap.entries()) {
                        servers.push({
                            serverName,
                            sellPrice: stats.sellCount ? stats.sellSum / stats.sellCount : null,
                            buyPrice: stats.buyCount ? stats.buySum / stats.buyCount : null
                        });
                    }
                    vendors.push({ id: vid, servers });
                }
                daySnapshot = { scrapedAt: dateString, vendors };
            } else {
                daySnapshot = dailyArray[dailyArray.length - 1];
            }

            if (daySnapshot) results.push({ date: dateString, snapshot: daySnapshot });
        }

        context.res = { status: 200, body: { days: results } };
    } catch (e) {
        context.log.error('getHistorySummary error:', e.message);
        context.res = { status: 500, body: { error: e.message } };
    }
};

async function streamToString(readable) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        readable.on('data', (data) => chunks.push(data.toString()));
        readable.on('end', () => resolve(chunks.join('')));
        readable.on('error', reject);
    });
}
