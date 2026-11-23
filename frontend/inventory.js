/* ==========================================================================
   INVENTORY.JS (Connected to SQLite Backend)
   ========================================================================== */

const API_URL = 'http://localhost:3000/api/inventory';
const LIMITS_API_URL = 'http://localhost:3000/api/category-limits';
const DEFAULT_CATEGORY_LIMITS = { default: 100 };
const MAX_ADJUST_INPUT = 9999;

async function getInventory() {
    try {
        const response = await fetch(API_URL);
        const result = await response.json();
        return result.data || [];
    } catch (error) {
        console.error('Failed to fetch inventory from server:', error);
        showToast('Server offline or unreachable.', 'danger');
        return [];
    }
}

async function getCategoryLimits() {
    try {
        const response = await fetch(LIMITS_API_URL);
        const result = await response.json();
        return { ...DEFAULT_CATEGORY_LIMITS, ...(result.data || {}) };
    } catch (error) {
        console.error('Failed to fetch category limits:', error);
        showToast('Could not load category limits from server.', 'danger');
        return { ...DEFAULT_CATEGORY_LIMITS };
    }
}

async function saveCategoryLimits(limitsObj) {
    const response = await fetch(LIMITS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(limitsObj)
    });
    const result = await response.json();
    if (!response.ok || result.message !== 'success') {
        throw new Error(result.error || 'Failed to save category limits.');
    }
    return result;
}

function getCategoryMaxCapacity(category, limitsObj = DEFAULT_CATEGORY_LIMITS) {
    const key = (category || '').trim();
    if (key && typeof limitsObj[key] === 'number' && limitsObj[key] > 0) {
        return limitsObj[key];
    }
    return Number(limitsObj.default) > 0 ? Number(limitsObj.default) : 100;
}

function getCategoryCurrentStock(inventory, category, excludeItemId = null) {
    const targetCat = (category || '').trim().toLowerCase();
    return inventory.reduce((sum, item) => {
        if (item.trackStock === 0) return sum;
        if (excludeItemId && String(item.id) === String(excludeItemId)) return sum;
        if ((item.category || '').trim().toLowerCase() === targetCat) {
            return sum + (Number(item.stock) || 0);
        }
        return sum;
    }, 0);
}

function clampInputMax(inputEl) {
    if (!inputEl) return;
    const val = Number(inputEl.value);
    if (Number.isFinite(val) && val > MAX_ADJUST_INPUT) {
        inputEl.value = MAX_ADJUST_INPUT;
    } else if (Number.isFinite(val) && val < -MAX_ADJUST_INPUT) {
        inputEl.value = -MAX_ADJUST_INPUT;
    }
}

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
    if (document.getElementById('inventory-table-body')) {
        initInventoryPage();
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

/* --- Inventory Page Logic --- */
async function initInventoryPage() {
    await renderInventoryTable();
    await initStorageLimits();

    const modal = document.getElementById('item-modal');
    const openBtn = document.getElementById('open-modal-btn');
    const closeBtn = document.getElementById('close-modal-btn');
    const cancelBtn = document.getElementById('cancel-modal-btn');
    const itemForm = document.getElementById('item-form');
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');

    const openModal = () => modal.classList.add('active');
    const closeModal = () => {
        modal.classList.remove('active');
        itemForm.reset();
    };

    if (openBtn) openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    itemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const nameInput = document.getElementById('item-name').value.trim();
        const categoryInput = document.getElementById('item-category').value;
        const stockInput = parseInt(document.getElementById('item-stock').value, 10) || 0;
        const costInput = parseFloat(document.getElementById('item-cost').value) || 0;
        const priceInput = parseFloat(document.getElementById('item-price').value) || 0;

        const [inventory, limits] = await Promise.all([getInventory(), getCategoryLimits()]);
        const isMeal = categoryInput.toLowerCase().includes('meal') || categoryInput.toLowerCase().includes('ulam');
        const existing = inventory.find(item => item.name.toLowerCase() === nameInput.toLowerCase());

        let finalStock = Math.max(0, stockInput);
        let itemId = Date.now().toString();

        if (existing) {
            itemId = existing.id;
            if (!isMeal) {
                finalStock = Math.max(0, (Number(existing.stock) || 0) + stockInput);
            }
        }

        if (!isMeal) {
            const catCap = getCategoryMaxCapacity(categoryInput, limits);
            const otherStock = getCategoryCurrentStock(inventory, categoryInput, existing ? existing.id : null);
            const maxAllowed = Math.max(0, catCap - otherStock);

            if (finalStock > maxAllowed) {
                finalStock = maxAllowed;
                showToast(`${categoryInput} limit (${commas(catCap)} max) reached — set to ${commas(finalStock)}.`, 'warning');
            }
        }

        const itemData = {
            id: itemId,
            name: nameInput,
            category: categoryInput,
            price: priceInput,
            cost: costInput,
            stock: isMeal ? 0 : finalStock,
            trackStock: !isMeal ? 1 : 0
        };

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(itemData)
            });

            const result = await response.json();
            if (result.message === 'success') {
                showToast(existing ? `Updated ${nameInput}!` : `Added ${nameInput} to menu!`, 'success');
                await renderInventoryTable();
                closeModal();
            }
        } catch (error) {
            console.error('Error saving item:', error);
            showToast('Failed to save item to SQLite.', 'danger');
        }
    });

    if (searchInput) searchInput.addEventListener('input', renderInventoryTable);
    if (categoryFilter) categoryFilter.addEventListener('change', renderInventoryTable);
}

async function initStorageLimits() {
    const limitsModal = document.getElementById('limits-modal');
    const openBtn = document.getElementById('open-limits-btn');
    const closeBtn = document.getElementById('close-limits-btn');
    const cancelBtn = document.getElementById('cancel-limits-btn');
    const form = document.getElementById('limits-form');
    const fieldsContainer = document.getElementById('limits-fields');

    if (!limitsModal || !openBtn || !form || !fieldsContainer) return;

    const closeModal = () => limitsModal.classList.remove('active');

    openBtn.addEventListener('click', async () => {
        const [inventory, limits] = await Promise.all([getInventory(), getCategoryLimits()]);

        const selectCategories = Array.from(document.querySelectorAll('#item-category option'))
            .map(opt => opt.value.trim())
            .filter(cat => {
                const lower = cat.toLowerCase();
                return cat && !lower.includes('meal') && !lower.includes('ulam');
            });

        const categories = [...new Set([
            ...selectCategories,
            ...inventory
                .filter(i => i.trackStock !== 0)
                .map(i => (i.category || '').trim())
                .filter(Boolean),
            ...Object.keys(limits).filter(k => k !== 'default')
        ])];

        fieldsContainer.innerHTML = categories.map(cat => {
            const cap = getCategoryMaxCapacity(cat, limits);
            const used = getCategoryCurrentStock(inventory, cat);
            return `
                <div class="form-group">
                    <label for="limit-${cat.replace(/\W+/g, '-')}" style="display: flex; justify-content: space-between; align-items: center;">
                        <span>${cat}</span>
                        <span class="text-muted" style="font-weight: 400; font-size: 0.8rem;">Used: ${commas(used)} / ${commas(cap)}</span>
                    </label>
                    <input
                        id="limit-${cat.replace(/\W+/g, '-')}"
                        type="number"
                        min="1"
                        max="99999"
                        step="1"
                        data-category="${cat}"
                        value="${cap}"
                        class="limit-input"
                        required
                    />
                </div>
            `;
        }).join('');

        limitsModal.classList.add('active');
    });

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const updated = { ...DEFAULT_CATEGORY_LIMITS };
        fieldsContainer.querySelectorAll('.limit-input').forEach(inp => {
            const catKey = inp.dataset.category;
            const parsed = parseInt(inp.value, 10);
            if (catKey && Number.isInteger(parsed) && parsed > 0) {
                updated[catKey] = Math.min(99999, parsed);
            }
        });

        try {
            await saveCategoryLimits(updated);
            closeModal();
            await renderInventoryTable();
            showToast('Category storage limits saved!', 'success');
        } catch (error) {
            console.error('Error saving limits:', error);
            showToast(error.message || 'Failed to save limits.', 'danger');
        }
    });
}

async function renderInventoryTable() {
    const tableBody = document.getElementById('inventory-table-body');
    if (!tableBody) return;

    const searchVal = document.getElementById('search-input')?.value.toLowerCase() || '';
    const filterVal = document.getElementById('category-filter')?.value || 'all';
    
    const inventory = await getInventory();
    
    const filtered = inventory.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchVal);
        const matchesCategory = filterVal === 'all' || item.category === filterVal;
        return matchesSearch && matchesCategory;
    });

    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <p class="text-muted">No inventory items.</p>
                </td>
            </tr>`;
        return;
    }

    tableBody.innerHTML = filtered.map(item => {
        let statusBadge = '<span class="badge badge-success">In Stock</span>';
        let displayStock = item.stock;

        // SQLite stores boolean as 1 or 0
        if (item.trackStock === 0) {
            statusBadge = '<span class="badge badge-neutral">Uncounted Meal</span>';
            displayStock = '∞ (Portions)';
        } else if (item.stock === 0) {
            statusBadge = '<span class="badge badge-danger">Out of Stock</span>';
        } else if (item.stock <= 5) {
            statusBadge = '<span class="badge badge-warning">Low Stock</span>';
        }

        return `
            <tr>
                <td><strong>${item.name}</strong></td>
                <td><span class="text-muted">${item.category}</span></td>
                <td>${peso(item.cost)}</td>
                <td>${peso(item.price)}</td>
                <td>${typeof displayStock === 'number' ? commas(displayStock) : displayStock}</td>
                <td>${statusBadge}</td>
                <td>
                    <div class="stock-action-row">
                        ${item.trackStock !== 0 ? `
                        <div class="stock-pill-control">
                            <input
                                id="stock-adj-${item.id}"
                                type="number"
                                step="1"
                                min="-9999"
                                max="9999"
                                value="1"
                                oninput="clampInputMax(this)"
                                class="stock-pill-input"
                                aria-label="Adjust stock for ${item.name}"
                            />
                            <button
                                type="button"
                                class="stock-circle-btn"
                                onclick="adjustStock('${item.id}')"
                                title="Apply integer stock adjustment (negative allowed)"
                            >
                                +
                            </button>
                        </div>` : ''}
                        <button class="btn-icon text-danger" onclick="deleteItem('${item.id}')" title="Delete Item">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');
}

async function adjustStock(id) {
    const inputEl = document.getElementById(`stock-adj-${id}`);
    if (!inputEl) return;

    clampInputMax(inputEl);
    const rawVal = inputEl.value.trim();
    const delta = Number(rawVal);

    if (!rawVal || !Number.isInteger(delta) || delta === 0) {
        showToast('Enter a non-zero integer (e.g., 5 or -2).', 'danger');
        return;
    }

    const [inventory, limits] = await Promise.all([getInventory(), getCategoryLimits()]);
    const item = inventory.find(i => i.id === id);

    if (item && item.trackStock !== 0) {
        const catCap = getCategoryMaxCapacity(item.category, limits);
        const otherStock = getCategoryCurrentStock(inventory, item.category, item.id);
        const maxAllowedForItem = Math.max(0, catCap - otherStock);

        const currentStock = Number(item.stock) || 0;
        const desiredStock = Math.max(0, currentStock + delta);
        const nextStock = Math.min(maxAllowedForItem, desiredStock);
        const appliedDelta = nextStock - currentStock;

        const updatedItem = {
            ...item,
            stock: nextStock
        };

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedItem)
            });
            const result = await response.json();
            if (result.message === 'success') {
                await renderInventoryTable();
                const sign = appliedDelta > 0 ? `+${appliedDelta}` : `${appliedDelta}`;
                if (nextStock < desiredStock) {
                    showToast(`${sign} stock on ${item.name} — capped at ${item.category} limit (${commas(catCap)}).`, 'warning');
                } else {
                    showToast(`${sign} stock on ${item.name} (Now: ${commas(nextStock)})`, 'success');
                }
            }
        } catch (error) {
            console.error('Error adjusting stock:', error);
            showToast('Failed to update stock on server.', 'danger');
        }
    }
}

async function deleteItem(id) {
    const confirmed = await confirmModal({
        title: 'Delete Inventory Item',
        message: 'Are you sure you want to delete this item from inventory? This cannot be undone.',
        confirmText: 'Delete Item',
        cancelText: 'Cancel',
        danger: true
    });

    if (!confirmed) return;

    try {
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        if (result.message === 'success') {
            await renderInventoryTable();
            showToast('Item deleted from database.', 'danger');
        }
    } catch (error) {
        console.error('Error deleting item:', error);
        showToast('Failed to delete item from server.', 'danger');
    }
}

// Attach globally for inline HTML template triggers
window.adjustStock = adjustStock;
window.deleteItem = deleteItem;
window.clampInputMax = clampInputMax;