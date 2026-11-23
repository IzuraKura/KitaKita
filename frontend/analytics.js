/* ==========================================================================
   ANALYTICS.JS (Market Intelligence & Business Analytics - SQLite Connected)
   ========================================================================== */

const API_INVENTORY = 'http://localhost:3000/api/inventory';
const API_SALES = 'http://localhost:3000/api/sales';
const API_USERS = 'http://localhost:3000/api/users';

let peakHoursChartInstance = null;
let cachedInventory = [];
let cachedAllSales = [];
let cachedUsers = [];

const filterState = {
    mode: 'all', // 'all' | 'week' | 'month' | 'range' | 'date'
    weekNum: 48,
    weekYear: new Date().getFullYear(),
    month: '',
    rangeStart: '',
    rangeEnd: '',
    singleDate: ''
};

const calendarState = {
    viewYear: new Date().getFullYear(),
    viewMonth: new Date().getMonth(), // 0-11
    rangeStep: 'start' // 'start' | 'end'
};

/* --- Global Initialization --- */
document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
    if (document.getElementById('kpi-revenue')) {
        initFilterControls();
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

function toLocalDateStr(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function toLocalMonthStr(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function getIsoWeekInfo(dateObj) {
    const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const isoYear = d.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return { weekNo, isoYear };
}

function getIsoWeekBounds(year, weekNo) {
    const jan4 = new Date(year, 0, 4);
    const jan4Day = jan4.getDay() || 7;
    const week1Monday = new Date(year, 0, 4 - (jan4Day - 1));

    const start = new Date(week1Monday);
    start.setDate(week1Monday.getDate() + (weekNo - 1) * 7);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return { start, end };
}

function getFilteredSales(sales) {
    if (filterState.mode === 'all') {
        return sales;
    }

    if (filterState.mode === 'date') {
        if (!filterState.singleDate) return sales;
        const start = new Date(`${filterState.singleDate}T00:00:00`).getTime();
        const end = new Date(`${filterState.singleDate}T23:59:59.999`).getTime();
        return sales.filter(s => {
            const ts = new Date(s.timestamp).getTime();
            return !Number.isNaN(ts) && ts >= start && ts <= end;
        });
    }

    if (filterState.mode === 'range') {
        const start = filterState.rangeStart ? new Date(`${filterState.rangeStart}T00:00:00`).getTime() : -Infinity;
        const end = filterState.rangeEnd ? new Date(`${filterState.rangeEnd}T23:59:59.999`).getTime() : Infinity;
        return sales.filter(s => {
            const ts = new Date(s.timestamp).getTime();
            return !Number.isNaN(ts) && ts >= start && ts <= end;
        });
    }

    if (filterState.mode === 'month') {
        if (!filterState.month) return sales;
        const [yearStr, monthStr] = filterState.month.split('-');
        const year = Number(yearStr);
        const monthIdx = Number(monthStr) - 1;
        const start = new Date(year, monthIdx, 1, 0, 0, 0, 0).getTime();
        const end = new Date(year, monthIdx + 1, 0, 23, 59, 59, 999).getTime();
        return sales.filter(s => {
            const ts = new Date(s.timestamp).getTime();
            return !Number.isNaN(ts) && ts >= start && ts <= end;
        });
    }

    if (filterState.mode === 'week') {
        const bounds = getIsoWeekBounds(filterState.weekYear, filterState.weekNum);
        if (!bounds) return sales;
        const start = bounds.start.getTime();
        const end = bounds.end.getTime();
        return sales.filter(s => {
            const ts = new Date(s.timestamp).getTime();
            return !Number.isNaN(ts) && ts >= start && ts <= end;
        });
    }

    return sales;
}

function updateFilterSummary() {
    const labelEl = document.getElementById('analytics-filter-summary');
    if (!labelEl) return;

    if (filterState.mode === 'all') {
        labelEl.textContent = 'Showing: All Time';
    } else if (filterState.mode === 'week') {
        labelEl.textContent = `Showing: Week ${filterState.weekNum} (${filterState.weekYear})`;
    } else if (filterState.mode === 'month') {
        labelEl.textContent = `Showing: Month (${filterState.month || 'Current'})`;
    } else if (filterState.mode === 'range') {
        const fromTxt = filterState.rangeStart || 'Start';
        const toTxt = filterState.rangeEnd || 'End';
        labelEl.textContent = `Showing: ${fromTxt} to ${toTxt}`;
    } else if (filterState.mode === 'date') {
        labelEl.textContent = `Showing: ${filterState.singleDate || 'Selected Date'}`;
    }
}

function syncPickerLabels() {
    const dateLabel = document.getElementById('date-picker-label');
    const rangeLabel = document.getElementById('range-picker-label');

    if (dateLabel) dateLabel.textContent = filterState.singleDate || 'Select date';
    if (rangeLabel) {
        rangeLabel.textContent = `${filterState.rangeStart || 'Start'} → ${filterState.rangeEnd || 'End'}`;
    }
}

function renderCalendarPopover(popoverEl, pickerType) {
    if (!popoverEl) return;

    const year = calendarState.viewYear;
    const month = calendarState.viewMonth;
    const monthName = new Date(year, month, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const todayStr = toLocalDateStr(new Date());

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    let cellsHtml = '';
    const totalCells = 42;

    for (let i = 0; i < totalCells; i++) {
        let cellDate;
        let isMuted = false;

        if (i < firstDayIndex) {
            const dNum = prevMonthDays - firstDayIndex + i + 1;
            cellDate = new Date(year, month - 1, dNum);
            isMuted = true;
        } else if (i < firstDayIndex + daysInMonth) {
            const dNum = i - firstDayIndex + 1;
            cellDate = new Date(year, month, dNum);
        } else {
            const dNum = i - (firstDayIndex + daysInMonth) + 1;
            cellDate = new Date(year, month + 1, dNum);
            isMuted = true;
        }

        const iso = toLocalDateStr(cellDate);
        const classes = ['cal-day-btn'];
        if (isMuted) classes.push('muted');
        if (iso === todayStr) classes.push('today');

        if (pickerType === 'date' && iso === filterState.singleDate) {
            classes.push('selected');
        } else if (pickerType === 'range') {
            if (iso === filterState.rangeStart || iso === filterState.rangeEnd) {
                classes.push('range-edge');
            } else if (filterState.rangeStart && filterState.rangeEnd && iso > filterState.rangeStart && iso < filterState.rangeEnd) {
                classes.push('in-range');
            }
        }

        cellsHtml += `<button type="button" class="${classes.join(' ')}" data-date="${iso}">${cellDate.getDate()}</button>`;
    }

    popoverEl.innerHTML = `
        <div class="cal-header">
            <button type="button" class="cal-nav-btn" data-cal-nav="prev">‹</button>
            <span class="cal-title">${monthName}</span>
            <button type="button" class="cal-nav-btn" data-cal-nav="next">›</button>
        </div>
        <div class="cal-weekdays">
            <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
        </div>
        <div class="cal-days-grid">${cellsHtml}</div>
        <div class="cal-footer">
            <button type="button" class="cal-mini-btn" data-cal-today="1">Today</button>
            <button type="button" class="cal-mini-btn" data-cal-close="1">Done</button>
        </div>
    `;

    popoverEl.querySelector('[data-cal-nav="prev"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        calendarState.viewMonth -= 1;
        if (calendarState.viewMonth < 0) {
            calendarState.viewMonth = 11;
            calendarState.viewYear -= 1;
        }
        renderCalendarPopover(popoverEl, pickerType);
    });

    popoverEl.querySelector('[data-cal-nav="next"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        calendarState.viewMonth += 1;
        if (calendarState.viewMonth > 11) {
            calendarState.viewMonth = 0;
            calendarState.viewYear += 1;
        }
        renderCalendarPopover(popoverEl, pickerType);
    });

    popoverEl.querySelector('[data-cal-today="1"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const now = new Date();
        calendarState.viewYear = now.getFullYear();
        calendarState.viewMonth = now.getMonth();
        const todayIso = toLocalDateStr(now);
        if (pickerType === 'date') filterState.singleDate = todayIso;
        if (pickerType === 'range') {
            filterState.rangeStart = todayIso;
            filterState.rangeEnd = todayIso;
        }
        syncPickerLabels();
        renderCalendarPopover(popoverEl, pickerType);
    });

    popoverEl.querySelector('[data-cal-close="1"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        popoverEl.classList.remove('open');
    });

    popoverEl.querySelectorAll('.cal-day-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const picked = btn.dataset.date;
            if (!picked) return;

            if (pickerType === 'date') {
                filterState.singleDate = picked;
                popoverEl.classList.remove('open');
            } else if (pickerType === 'range') {
                if (calendarState.rangeStep === 'start') {
                    filterState.rangeStart = picked;
                    filterState.rangeEnd = picked;
                    calendarState.rangeStep = 'end';
                } else {
                    if (picked < filterState.rangeStart) {
                        filterState.rangeEnd = filterState.rangeStart;
                        filterState.rangeStart = picked;
                    } else {
                        filterState.rangeEnd = picked;
                    }
                    calendarState.rangeStep = 'start';
                    popoverEl.classList.remove('open');
                }
            }

            syncPickerLabels();
            renderCalendarPopover(popoverEl, pickerType);
        });
    });
}

function setActiveTab(mode) {
    filterState.mode = mode;

    document.querySelectorAll('.analytics-mode-btn').forEach(btn => {
        const isMatch = btn.dataset.mode === mode;
        btn.classList.toggle('btn-primary', isMatch);
        btn.classList.toggle('active', isMatch);
        btn.classList.toggle('btn-secondary', !isMatch);
    });

    const panels = {
        week: document.getElementById('panel-week'),
        month: document.getElementById('panel-month'),
        range: document.getElementById('panel-range'),
        date: document.getElementById('panel-date')
    };

    Object.entries(panels).forEach(([key, el]) => {
        if (el) el.style.display = key === mode ? 'flex' : 'none';
    });

    updateFilterSummary();
}

function initFilterControls() {
    const now = new Date();
    const todayStr = toLocalDateStr(now);
    const monthStr = toLocalMonthStr(now);
    const { weekNo, isoYear } = getIsoWeekInfo(now);

    filterState.singleDate = todayStr;
    filterState.weekNum = weekNo;
    filterState.weekYear = isoYear;
    filterState.rangeStart = todayStr;
    filterState.rangeEnd = todayStr;
    filterState.month = monthStr;

    const weekSelect = document.getElementById('analytics-week-select');
    const weekYearSelect = document.getElementById('analytics-week-year-select');
    const monthSelect = document.getElementById('analytics-month-select');
    const yearSelect = document.getElementById('analytics-year-select');
    const [curYear, curMonth] = monthStr.split('-');

    if (weekSelect) {
        let weeksHtml = '';
        for (let w = 1; w <= 52; w++) {
            weeksHtml += `<option value="${w}">Week ${w}</option>`;
        }
        weekSelect.innerHTML = weeksHtml;
        weekSelect.value = String(weekNo);
    }

    const startY = Number(curYear) - 3;
    const endY = Number(curYear) + 1;
    let yearsHtml = '';
    for (let y = endY; y >= startY; y--) {
        yearsHtml += `<option value="${y}">${y}</option>`;
    }

    if (weekYearSelect) {
        weekYearSelect.innerHTML = yearsHtml;
        weekYearSelect.value = String(isoYear);
    }

    if (yearSelect) {
        yearSelect.innerHTML = yearsHtml;
        yearSelect.value = curYear;
    }
    if (monthSelect) {
        monthSelect.value = curMonth;
    }

    syncPickerLabels();

    const pickerConfigs = [
        { triggerId: 'date-picker-trigger', popoverId: 'date-calendar-popover', type: 'date' },
        { triggerId: 'range-picker-trigger', popoverId: 'range-calendar-popover', type: 'range' }
    ];

    pickerConfigs.forEach(({ triggerId, popoverId, type }) => {
        const trigger = document.getElementById(triggerId);
        const popover = document.getElementById(popoverId);
        if (!trigger || !popover) return;

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = popover.classList.contains('open');
            document.querySelectorAll('.custom-calendar-popover.open').forEach(p => p.classList.remove('open'));
            if (!isOpen) {
                if (type === 'range') calendarState.rangeStep = 'start';
                renderCalendarPopover(popover, type);
                popover.classList.add('open');
            }
        });
    });

    document.addEventListener('click', () => {
        document.querySelectorAll('.custom-calendar-popover.open').forEach(p => p.classList.remove('open'));
    });

    document.querySelectorAll('.analytics-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            setActiveTab(mode);
            if (mode === 'all') {
                renderAnalyticsView();
            }
        });
    });

    document.getElementById('apply-week-btn')?.addEventListener('click', () => {
        filterState.weekNum = Number(weekSelect?.value || weekNo);
        filterState.weekYear = Number(weekYearSelect?.value || isoYear);
        updateFilterSummary();
        renderAnalyticsView();
    });

    document.getElementById('apply-month-btn')?.addEventListener('click', () => {
        const mVal = monthSelect?.value || curMonth;
        const yVal = yearSelect?.value || curYear;
        filterState.month = `${yVal}-${mVal}`;
        updateFilterSummary();
        renderAnalyticsView();
    });

    document.getElementById('apply-range-btn')?.addEventListener('click', () => {
        if (filterState.rangeStart && filterState.rangeEnd && filterState.rangeStart > filterState.rangeEnd) {
            if (typeof showToast === 'function') {
                showToast('"From" date cannot be after "To" date.', 'warning');
            }
            return;
        }
        updateFilterSummary();
        renderAnalyticsView();
    });

    document.getElementById('apply-date-btn')?.addEventListener('click', () => {
        updateFilterSummary();
        renderAnalyticsView();
    });
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

        cachedInventory = invData.data || [];
        cachedAllSales = salesData.data || [];
        cachedUsers = usersData.data || [];

        renderAnalyticsView();
    } catch (error) {
        console.error('Error loading analytics data:', error);
    }
}

function renderAnalyticsView() {
    const sales = getFilteredSales(cachedAllSales);
    const inventory = cachedInventory;
    const users = cachedUsers;

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

    const categoryEntries = Object.keys(categoryMap)
        .filter(cat => cat.toLowerCase() !== 'general')
        .map(cat => {
            const itemsObj = categoryMap[cat];
            const rankedItems = Object.entries(itemsObj)
                .map(([name, qty]) => ({ name, qty: Number(qty) || 0 }))
                .sort((a, b) => b.qty - a.qty)
                .slice(0, 3);

            const totalCategoryQty = rankedItems.reduce((sum, item) => sum + item.qty, 0);

            return {
                category: cat,
                rankedItems,
                totalCategoryQty
            };
        })
        .sort((a, b) => b.totalCategoryQty - a.totalCategoryQty);

    if (categoryEntries.length === 0) {
        container.innerHTML = `<p class="text-muted">No non-General category sales data recorded for this selection.</p>`;
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
        if (!Number.isNaN(hour)) {
            hourCounts[hour] += 1;
        }
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
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state text-muted">No recorded transactions for this selection.</td></tr>`;
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