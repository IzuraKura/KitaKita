/* ==========================================================================
   INVENTORY.JS (Connected to SQLite Backend)
   ========================================================================== */

const API_URL = 'http://localhost:3000/api/inventory';

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
function initInventoryPage() {
    renderInventoryTable();

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

        const inventory = await getInventory();
        const isMeal = categoryInput.toLowerCase().includes('meal') || categoryInput.toLowerCase().includes('ulam');
        const existing = inventory.find(item => item.name.toLowerCase() === nameInput.toLowerCase());

        let finalStock = stockInput;
        let itemId = Date.now().toString();

        if (existing) {
            itemId = existing.id;
            if (!isMeal) {
                finalStock = existing.stock + stockInput;
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
                renderInventoryTable();
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
                    ${item.trackStock !== 0 ? `
                    <button class="btn-icon text-accent" onclick="quickRestock('${item.id}')" title="Add 10 Units" style="margin-right: 8px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>` : ''}
                    <button class="btn-icon text-danger" onclick="deleteItem('${item.id}')" title="Delete Item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </td>
            </tr>`;
    }).join('');
}

async function quickRestock(id) {
    const inventory = await getInventory();
    const item = inventory.find(i => i.id === id);
    
    if (item && item.trackStock !== 0) {
        item.stock += 10;
        
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            const result = await response.json();
            if (result.message === 'success') {
                renderInventoryTable();
                showToast(`Added +10 stock to ${item.name}`, 'success');
            }
        } catch (error) {
            console.error('Error restocking item:', error);
        }
    }
}

async function deleteItem(id) {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        if (result.message === 'success') {
            renderInventoryTable();
            showToast('Item deleted from database.', 'danger');
        }
    } catch (error) {
        console.error('Error deleting item:', error);
    }
}

// Attach globally for inline HTML template triggers
window.quickRestock = quickRestock;
window.deleteItem = deleteItem;