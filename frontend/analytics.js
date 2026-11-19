/* ==========================================================================
   ANALYTICS.JS (Market Intelligence & Business Analytics - SQLite Connected)
   ========================================================================== */

const API_INVENTORY = 'http://localhost:3000/api/inventory';
const API_SALES = 'http://localhost:3000/api/sales';
const API_USERS = 'http://localhost:3000/api/users';

let peakHoursChartInstance = null;

/* --- Global Initialization --- */
document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
    if (document.getElementById('kpi-revenue')) {
        initAnalyticsDashboard();
    }
});

function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }
}

// Safely parse items whether SQLite returns an array or a JSON string
function parseSaleItems(saleItems) {
    if (!saleItems) return [];
    if (Array.isArray(saleItems)) return saleItems;
    try {
        return JSON.parse(saleItems);
    } catch (e) {
        console.error('Failed to parse sale items:', e);
        return [];
    }
}

async function initAnalyticsDashboard() {
    try {
        const [invRes, salesRes, usersRes] = await Promise.all([
            fetch(API_INVENTORY),
            fetch(API_SALES),
            fetch(API_USERS)
        ]);

        const invData = await invRes.json();
        const salesData = await salesRes.json();
        const usersData = await usersRes.json();

        const inventory = invData.data || [];
        const sales = salesData.data || [];
        const users = usersData.data || [];

        // 1. Compute Executive KPIs
        let totalRevenue = 0;
        let totalProfit = 0;

        sales.forEach(s => {
            totalRevenue += s.revenue || 0;
            totalProfit += s.profit || 0;
        });

        const marginPercent = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0.0';

        const totalUtang = users
            .filter(u => u.role === 'customer')
            .reduce((sum, u) => sum + (u.balance || 0), 0);

        document.getElementById('kpi-revenue').textContent = `${peso(totalRevenue)}`;
        document.getElementById('kpi-profit').textContent = `${peso(totalProfit)}`;
        document.getElementById('kpi-utang').textContent = `${peso(totalUtang)}`;
        document.getElementById('kpi-transactions').textContent = sales.length;

        const badgeMargin = document.getElementById('badge-margin');
        if (badgeMargin) {
            badgeMargin.textContent = `${marginPercent}% Margin`;
            badgeMargin.className = parseFloat(marginPercent) > 0 ? 'badge badge-success' : 'badge badge-neutral';
        }

        // 2. Render Analytics Modules
        renderCategoryDemand(sales, inventory);
        renderPeakHoursChart(sales);
        renderProfitLeaderboard(sales);
        renderStockRunway(sales, inventory);
        renderSalesLedger(sales);
        setupWhatIfSimulator(totalRevenue);

    } catch (error) {
        console.error('Error loading analytics data:', error);
    }
}

function renderCategoryDemand(sales, inventory) {
    const container = document.getElementById('category-demand-list');
    if (!container) return;

    const categoryMap = {};

    sales.forEach(sale => {
        const items = parseSaleItems(sale.items);
        items.forEach(item => {
            const cat = (item.category || 'General').trim();
            if (!categoryMap[cat]) categoryMap[cat] = {};
            categoryMap[cat][item.name] = (categoryMap[cat][item.name] || 0) + (Number(item.qty) || 0);
        });
    });

    // Exclude 'General', rank items inside each category, and keep Top 3 items per category
    const categoryEntries = Object.keys(categoryMap)
        .filter(cat => cat.toLowerCase() !== 'general')
        .map(cat => {
            const itemsObj = categoryMap[cat];
            const rankedItems = Object.entries(itemsObj)
                .map(([name, qty]) => ({ name, qty: Number(qty) || 0 }))
                .sort((a, b) => b.qty - a.qty)
                .slice(0, 3); // Max Top 3 items per category (shows whatever exists up to 3)

            const totalCategoryQty = rankedItems.reduce((sum, item) => sum + item.qty, 0);

            return {
                category: cat,
                rankedItems,
                totalCategoryQty
            };
        })
        .sort((a, b) => b.totalCategoryQty - a.totalCategoryQty);

    if (categoryEntries.length === 0) {
        container.innerHTML = `<p class="text-muted">No non-General category sales data recorded yet. Complete a checkout in POS to generate forecasts.</p>`;
        return;
    }

    container.innerHTML = categoryEntries.map(entry => {
        const itemsListHtml = entry.rankedItems
            .map((item, idx) => `
                <div style="display: flex; justify-content: space-between; font-size: 0.85rem; padding: 3px 0; color: var(--text-muted);">
                    <span><strong style="color: var(--text-primary);">#${idx + 1}</strong> ${item.name}</span>
                    <span>${commas(item.qty)} sold</span>
                </div>
            `)
            .join('');

        return `
            <div style="padding: 12px 14px; background: var(--bg-surface-secondary); border-radius: 8px; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.06);">
                    <strong style="text-transform: capitalize; font-size: 0.95rem;">${entry.category}</strong>
                    <span class="badge badge-success">${commas(entry.totalCategoryQty)} total units</span>
                </div>
                <div>${itemsListHtml}</div>
            </div>
        `;
    }).join('');
}

function renderPeakHoursChart(sales) {
    const canvas = document.getElementById('peakHoursChart');
    if (!canvas) return;

    const hourCounts = Array(24).fill(0);
    sales.forEach(sale => {
        const hour = new Date(sale.timestamp).getHours();
        hourCounts[hour] += 1;
    });

    const labels = ['7AM', '8AM', '9AM', '10AM', '11AM', '12PM', '1PM', '2PM', '3PM', '4PM', '5PM', '6PM'];
    const data = labels.map((_, index) => hourCounts[index + 7]);

    const ctx = canvas.getContext('2d');
    if (peakHoursChartInstance) peakHoursChartInstance.destroy();

    peakHoursChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Transactions',
                data: data,
                backgroundColor: '#5865f2',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { stepSize: 1 } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderProfitLeaderboard(sales) {
    const tbody = document.getElementById('profit-leaderboard-body');
    if (!tbody) return;

    const itemProfits = {};

    sales.forEach(sale => {
        const items = parseSaleItems(sale.items);
        items.forEach(item => {
            const itemTotalRev = item.price * item.qty;
            const itemTotalCost = (item.cost || (item.price * 0.6)) * item.qty;
            const profit = itemTotalRev - itemTotalCost;

            if (!itemProfits[item.name]) {
                itemProfits[item.name] = { qty: 0, profit: 0 };
            }
            itemProfits[item.name].qty += item.qty;
            itemProfits[item.name].profit += profit;
        });
    });

    const sortedItems = Object.keys(itemProfits)
        .map(name => ({ name, ...itemProfits[name] }))
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 5);

    if (sortedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-muted">No sales data available.</td></tr>`;
        return;
    }

    tbody.innerHTML = sortedItems.map(item => `
        <tr>
            <td><strong>${item.name}</strong></td>
            <td>${commas(item.qty)}</td>
            <td class="text-accent">+${peso(item.profit)}</td>
        </tr>
    `).join('');
}

function renderStockRunway(sales, inventory) {
    const tbody = document.getElementById('stock-runway-body');
    if (!tbody) return;

    const salesCountMap = {};
    sales.forEach(sale => {
        const items = parseSaleItems(sale.items);
        items.forEach(item => {
            salesCountMap[item.id] = (salesCountMap[item.id] || 0) + item.qty;
        });
    });

    const trackedInventory = inventory.filter(i => i.trackStock !== 0).slice(0, 5);

    if (trackedInventory.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-muted">No tracked stock items found.</td></tr>`;
        return;
    }

    tbody.innerHTML = trackedInventory.map(item => {
        const sold = salesCountMap[item.id] || 1;
        const daysRemaining = item.stock <= 0 ? 0 : Math.max(1, Math.round(item.stock / Math.max(1, sold * 0.2)));
        const badgeClass = item.stock <= 5 ? 'badge badge-danger' : (item.stock <= 15 ? 'badge badge-neutral' : 'badge badge-success');

        return `
            <tr>
                <td><strong>${item.name}</strong></td>
                <td>${item.stock} units</td>
                <td><span class="${badgeClass}">~${daysRemaining} days left</span></td>
            </tr>
        `;
    }).join('');
}

function renderSalesLedger(sales) {
    const tbody = document.getElementById('sales-ledger-body');
    if (!tbody) return;

    if (sales.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state text-muted">No recorded transactions yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = sales.slice().reverse().map(sale => {
        const timeFormatted = new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const isAccount = sale.userId && sale.userId !== 'null';

        return `
            <tr>
                <td><code>#${sale.id.slice(-6)}</code></td>
                <td>${timeFormatted}</td>
                <td><strong>${peso(sale.revenue)}</strong></td>
                <td class="text-accent">+${peso(sale.profit)}</td>
                <td><span class="badge ${isAccount ? 'badge-neutral' : 'badge-success'}">${isAccount ? 'Customer Tab' : 'Cash'}</span></td>
            </tr>
        `;
    }).join('');
}

function setupWhatIfSimulator(currentRevenue) {
    const btn = document.getElementById('run-simulation-btn');
    const select = document.getElementById('simulator-modifier');
    const display = document.getElementById('simulation-result');

    if (!btn || !select || !display) return;

    const calculate = () => {
        const modifier = parseFloat(select.value);
        const projected = currentRevenue * modifier;
        const diff = projected - currentRevenue;
        display.textContent = `${peso(projected)} (${diff >= 0 ? '+' : ''}${peso(diff)})`;
    };

    calculate();
    btn.onclick = calculate;
    select.onchange = calculate;
}