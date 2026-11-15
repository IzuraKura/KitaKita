/* ==========================================================================
   INDEX.JS (Dashboard & Global Init - SQLite Connected)
   ========================================================================== */

const API_INVENTORY = 'http://localhost:3000/api/inventory';
const API_SALES = 'http://localhost:3000/api/sales';
const API_HISTORY = 'http://localhost:3000/api/daily-history';

/* --- Toast Notifications --- */
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 250);
    }, 3000);
}

/* --- Global Initialization --- */
document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
    if (document.getElementById('revenueChart')) {
        initDashboard();
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

/* --- Dashboard & End-Of-Day System --- */
let activeChart = null;

async function initDashboard() {
    try {
        // Fetch all required data concurrently from SQLite backend
        const [invRes, salesRes, historyRes] = await Promise.all([
            fetch(API_INVENTORY),
            fetch(API_SALES),
            fetch(API_HISTORY)
        ]);

        const invData = await invRes.json();
        const salesData = await salesRes.json();
        const historyData = await historyRes.json();

        const inventory = invData.data || [];
        const currentSales = salesData.data || [];
        const dailyHistory = historyData.data || [];

        const totalRevenue = currentSales.reduce((sum, s) => sum + s.revenue, 0);
        const totalProfit = currentSales.reduce((sum, s) => sum + s.profit, 0);
        const trackedItems = inventory.filter(i => i.trackStock !== 0);
        const totalStockCount = trackedItems.reduce((sum, i) => sum + i.stock, 0);
        const criticalItems = trackedItems.filter(i => i.stock <= 5);

        const marginPercent = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0.0';

        document.getElementById('val-revenue').textContent = `₱${totalRevenue.toFixed(2)}`;
        document.getElementById('val-profit').textContent = `₱${totalProfit.toFixed(2)}`;
        document.getElementById('val-stock').textContent = totalStockCount;
        document.getElementById('val-alerts').textContent = `${criticalItems.length} Items`;

        const badgeRevenue = document.getElementById('badge-revenue');
        const badgeProfit = document.getElementById('badge-profit');
        const badgeAlerts = document.getElementById('badge-alerts');
        const badgeStock = document.getElementById('badge-stock');

        if (badgeRevenue) {
            badgeRevenue.textContent = currentSales.length === 0 ? 'No sales yet today' : `${currentSales.length} Today`;
            badgeRevenue.className = currentSales.length > 0 ? 'badge badge-success' : 'badge badge-neutral';
        }

        if (badgeProfit) {
            badgeProfit.textContent = `${marginPercent}% Margin`;
            badgeProfit.className = parseFloat(marginPercent) > 0 ? 'badge badge-success' : 'badge badge-neutral';
        }

        if (badgeAlerts) {
            if (criticalItems.length > 0) {
                badgeAlerts.textContent = 'Needs Reorder';
                badgeAlerts.className = 'badge badge-danger';
            } else {
                badgeAlerts.textContent = 'Stock Healthy';
                badgeAlerts.className = 'badge badge-success';
            }
        }

        if (badgeStock) {
            const totalSKUs = inventory.length;
            badgeStock.textContent = `${totalSKUs} SKUs`;
            badgeStock.className = totalSKUs > 0 ? 'badge badge-success' : 'badge badge-neutral';
        }

        const alertList = document.getElementById('depletion-list');
        if (alertList) {
            if (criticalItems.length === 0) {
                alertList.innerHTML = `<li class="empty-state"><p class="text-muted">Stock healthy. No low stock warnings.</p></li>`;
            } else {
                alertList.innerHTML = criticalItems.map(i => `
                    <li class="alert-item">
                        <div>
                            <strong>${i.name}</strong>
                            <p class="text-muted">${i.stock} units remaining</p>
                        </div>
                        <span class="badge badge-danger">Low Stock</span>
                    </li>
                `).join('');
            }
        }

        // Graph Assembly
        const chartLabels = dailyHistory.map(d => `Day #${d.dayNumber}`);
        const chartRevenue = dailyHistory.map(d => d.revenue);
        const chartProfit = dailyHistory.map(d => d.profit);

        chartLabels.push(`Day #${dailyHistory.length + 1} (Active)`);
        chartRevenue.push(totalRevenue);
        chartProfit.push(totalProfit);

        const ctx = document.getElementById('revenueChart').getContext('2d');
        
        if (activeChart) activeChart.destroy();

        activeChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartLabels,
                datasets: [
                    {
                        label: 'Revenue (₱)',
                        data: chartRevenue,
                        borderColor: '#5865f2',
                        backgroundColor: 'rgba(88, 101, 242, 0.1)',
                        fill: true,
                        tension: 0.3
                    },
                    {
                        label: 'Net Profit (₱)',
                        data: chartProfit,
                        borderColor: '#57f287',
                        backgroundColor: 'rgba(87, 242, 135, 0.1)',
                        fill: true,
                        tension: 0.3
                    }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

        setupEndDayControls(dailyHistory.length + 1, currentSales);

    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

function setupEndDayControls(nextDayNumber, currentSales) {
    const endDayBtn = document.getElementById('end-day-btn');
    const modal = document.getElementById('end-day-modal');
    const cancelBtn = document.getElementById('cancel-end-day-btn');
    const confirmBtn = document.getElementById('confirm-end-day-btn');

    if (!endDayBtn || !modal) return;

    endDayBtn.onclick = () => modal.classList.add('active');
    cancelBtn.onclick = () => modal.classList.remove('active');

    confirmBtn.onclick = async () => {
        if (currentSales.length === 0) {
            showToast('No sales recorded today to summarize!', 'warning');
            modal.classList.remove('active');
            return;
        }

        const totalRevenue = currentSales.reduce((sum, s) => sum + s.revenue, 0);
        const totalProfit = currentSales.reduce((sum, s) => sum + s.profit, 0);

        const dayRecord = {
            dayNumber: nextDayNumber,
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            totalSalesCount: currentSales.length,
            revenue: totalRevenue,
            profit: totalProfit
        };

        try {
            // 1. Save day summary to backend history
            await fetch(API_HISTORY, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dayRecord)
            });

            // 2. Clear active shift sales from database
            await fetch(`${API_SALES}/clear`, {
                method: 'DELETE'
            });

            modal.classList.remove('active');
            showToast(`Day #${dayRecord.dayNumber} closed! ₱${totalRevenue.toFixed(2)} archived.`, 'success');

            // Refresh dashboard
            initDashboard();
        } catch (error) {
            console.error('Error closing day:', error);
            showToast('Failed to close day on server.', 'danger');
        }
    };
}