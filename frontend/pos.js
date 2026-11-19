/* ==========================================================================
   POS.JS (Point of Sale & Checkout - SQLite Connected)
   ========================================================================== */

const API_INVENTORY = 'http://localhost:3000/api/inventory';
const API_SALES = 'http://localhost:3000/api/sales';
const API_USERS = 'http://localhost:3000/api/users';

let cart = [];
let activePOSCategory = 'all';
let cachedInventory = [];
let cachedUsers = [];

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
    if (document.getElementById('pos-product-grid')) {
        initPOSPage();
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

/* --- Fetch Helpers from SQLite --- */
async function fetchInventory() {
    try {
        const response = await fetch(API_INVENTORY);
        const result = await response.json();
        cachedInventory = result.data || [];
        return cachedInventory;
    } catch (error) {
        console.error('Error fetching inventory:', error);
        return [];
    }
}

async function fetchUsers() {
    try {
        const response = await fetch(API_USERS);
        const result = await response.json();
        cachedUsers = result.data || [];
        return cachedUsers;
    } catch (error) {
        console.error('Error fetching users:', error);
        return [];
    }
}

/* --- POS Page Logic --- */
async function initPOSPage() {
    await fetchInventory();
    await loadPOSAccounts();
    renderPOSGrid();
    setupCustomPriceModal();

    const checkoutBtn = document.getElementById('checkout-btn');
    const clearBtn = document.getElementById('clear-cart-btn');
    const searchInput = document.getElementById('pos-search');
    const categoryPills = document.getElementById('pos-category-pills');

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            cart = [];
            renderCart();
        });
    }

    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', processCheckout);
    }

    if (searchInput) {
        searchInput.addEventListener('input', renderPOSGrid);
    }

    if (categoryPills) {
        categoryPills.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;

            categoryPills.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            activePOSCategory = button.getAttribute('data-category') || 'all';
            renderPOSGrid();
        });
    }
}

async function renderPOSGrid() {
    const grid = document.getElementById('pos-product-grid');
    if (!grid) return;

    // Refresh inventory data before rendering grid
    const inventory = await fetchInventory();
    const searchVal = document.getElementById('pos-search')?.value.toLowerCase() || '';
    
    const filteredInventory = inventory.filter(item => {
        // SQLite stores trackStock as 1 (true) or 0 (false)
        const isAvailable = item.trackStock === 0 || item.stock > 0;
        const matchesSearch = item.name.toLowerCase().includes(searchVal);
        const matchesCategory = activePOSCategory === 'all' || item.category === activePOSCategory;
        
        return isAvailable && matchesSearch && matchesCategory;
    });

    const customTile = `
        <div class="pos-product-card" onclick="document.getElementById('custom-price-modal').classList.add('active')" style="border: 2px dashed var(--accent);">
            <div>
                <strong class="text-accent">+ Custom Item / Charge</strong>
                <p class="text-muted" style="font-size: 0.8rem;">Flexible amount/discount</p>
            </div>
            <strong class="text-accent">₱ Flexible</strong>
        </div>
    `;

    const productTiles = filteredInventory.map(item => `
        <div class="pos-product-card" onclick="addToCart('${item.id}')">
            <div>
                <strong>${item.name}</strong>
                <p class="text-muted" style="font-size: 0.8rem;">
                    ${item.trackStock === 0 ? 'Fresh Portion' : `Stock: ${commas(item.stock)}`}
                </p>
            </div>
            <strong class="text-accent">${peso(item.price)}</strong>
        </div>
    `).join('');

    grid.innerHTML = customTile + productTiles;
}

function setupCustomPriceModal() {
    const modal = document.getElementById('custom-price-modal');
    const priceInput = document.getElementById('custom-item-price');
    const cancelBtn = document.getElementById('cancel-custom-price-btn');
    const confirmBtn = document.getElementById('confirm-custom-price-btn');

    if (!modal) return;

    cancelBtn.onclick = () => modal.classList.remove('active');

    confirmBtn.onclick = () => {
        const val = parseFloat(priceInput.value);
        if (isNaN(val) || val <= 0) {
            showToast('Enter a valid price!', 'warning');
            return;
        }

        const customItem = {
            id: `custom_${Date.now()}`,
            name: `Custom Charge (${peso(val)})`,
            price: val,
            cost: val * 0.6,
            qty: 1,
            trackStock: 0
        };

        cart.push(customItem);
        renderCart();
        showToast(`Added Custom Charge (${peso(val)})`, 'success');
        priceInput.value = '';
        modal.classList.remove('active');
    };
}

function addToCart(itemId) {
    const product = cachedInventory.find(i => i.id === itemId);
    if (!product) return;

    const cartItem = cart.find(c => c.id === itemId);
    if (cartItem) {
        if (product.trackStock === 0 || cartItem.qty < product.stock) {
            cartItem.qty += 1;
        } else {
            showToast('Stock limit reached for this item.', 'warning');
        }
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            cost: product.cost,
            qty: 1,
            trackStock: product.trackStock,
            stock: product.stock,
            category: product.category
        });
    }

    renderCart();
}

function renderCart() {
    const cartList = document.getElementById('cart-list');
    const totalEl = document.getElementById('cart-total');
    const subtotalEl = document.getElementById('cart-subtotal');
    const checkoutBtn = document.getElementById('checkout-btn');

    if (!cartList) return;

    if (cart.length === 0) {
        cartList.innerHTML = `<li class="empty-state"><p class="text-muted">Cart is empty. Tap products to add.</p></li>`;
        totalEl.textContent = '₱0.00';
        subtotalEl.textContent = '₱0.00';
        checkoutBtn.disabled = true;
        return;
    }

    let subtotal = 0;
    cartList.innerHTML = cart.map(item => {
        const itemTotal = item.price * item.qty;
        subtotal += itemTotal;
        return `
            <li class="cart-item">
                <div>
                    <strong>${item.name}</strong>
                    <p class="text-muted" style="font-size: 0.8rem;">${peso(item.price)} x ${commas(item.qty)}</p>
                </div>
                <strong>${peso(itemTotal)}</strong>
            </li>`;
    }).join('');

    subtotalEl.textContent = `${peso(subtotal)}`;
    totalEl.textContent = `${peso(subtotal)}`;
    checkoutBtn.disabled = false;
}

async function processCheckout() {
    if (cart.length === 0) return;

    const customerSelect = document.getElementById('pos-customer-select');
    const selectedUserId = customerSelect ? customerSelect.value : 'walkin';

    // Pre-calculate cart totals BEFORE touching inventory or database
    let totalRevenue = 0;
    let totalCost = 0;
    for (const cartItem of cart) {
        totalRevenue += cartItem.price * cartItem.qty;
        totalCost += (cartItem.cost || 0) * cartItem.qty;
    }

    // 0. UTANG CREDIT LIMIT & FREEZE CHECK (Runs before any DB changes)
    let targetUser = null;
    if (selectedUserId !== 'walkin') {
        targetUser = cachedUsers.find(u => u.id === selectedUserId);
        if (targetUser) {
            const currentBalance = Number(targetUser.balance) || 0;
            const projectedBalance = currentBalance + totalRevenue;

            if (projectedBalance > MAX_UTANG_LIMIT) {
                showToast(
                    `UTANG FROZEN: ${targetUser.full_name}'s balance (${peso(currentBalance)}) + order (${peso(totalRevenue)}) exceeds the ${peso(MAX_UTANG_LIMIT)} limit!`,
                    'danger'
                );
                return; // Stop checkout completely—no stock deducted, no sale logged
            }
        }
    }

    // 1. Deduct stock from SQLite inventory for tracked items
    for (const cartItem of cart) {
        const invItem = cachedInventory.find(i => i.id === cartItem.id);
        if (invItem && invItem.trackStock !== 0) {
            invItem.stock = Math.max(0, invItem.stock - cartItem.qty);
            
            // Send updated stock back to server
            await fetch(API_INVENTORY, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(invItem)
            });
        }
    }

    // 2. If a registered user account was selected, update their utang balance
    if (targetUser) {
        const newBalance = (Number(targetUser.balance) || 0) + totalRevenue;
        await fetch(`${API_USERS}/balance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: targetUser.id, balance: newBalance })
        });
    }

    // 3. Record the sale in the SQLite sales table
    const saleRecord = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        revenue: totalRevenue,
        profit: totalRevenue - totalCost,
        userId: selectedUserId !== 'walkin' ? selectedUserId : null,
        items: cart
    };

    try {
        await fetch(API_SALES, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(saleRecord)
        });

        showToast('Sale completed successfully!', 'success');
        cart = [];
        renderCart();
        await fetchInventory();
        renderPOSGrid();
        await loadPOSAccounts();
    } catch (error) {
        console.error('Checkout error:', error);
        showToast('Failed to record sale on server.', 'danger');
    }
}

// Load registered user accounts into the POS customer dropdown
async function loadPOSAccounts() {
    const select = document.getElementById('pos-customer-select');
    if (!select) return;

    const users = await fetchUsers();
    
    // Filter to only show customer role accounts (or all accounts)
    const customerAccounts = users.filter(u => u.role === 'customer');

    let optionsHtml = `<option value="walkin">Walk-in Customer (General Cash)</option>`;
    
    customerAccounts.forEach(acc => {
        const isFrozen = (Number(acc.balance) || 0) >= MAX_UTANG_LIMIT;
        const freezeTag = isFrozen ? ' [FROZEN - LIMIT REACHED]' : '';
        optionsHtml += `<option value="${acc.id}">${acc.full_name} (@${acc.username}) - Tab Balance: ${peso(acc.balance)}${freezeTag}</option>`;
    });

    select.innerHTML = optionsHtml;
}

// Attach globally for template triggers
window.addToCart = addToCart;