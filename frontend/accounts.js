/* ==========================================================================
   ACCOUNTS.JS (Customer & Staff Accounts - SQLite Connected)
   ========================================================================== */

const API_USERS = 'http://localhost:3000/api/users';
const API_REGISTER = 'http://localhost:3000/api/register';

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
    if (document.getElementById('accounts-table-body')) {
        initAccountsPage();
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

/* --- Fetch Users from SQLite --- */
async function fetchUsers() {
    try {
        const response = await fetch(API_USERS);
        const result = await response.json();
        cachedUsers = result.data || [];
        return cachedUsers;
    } catch (error) {
        console.error('Failed to fetch users:', error);
        showToast('Server offline or unreachable.', 'danger');
        return [];
    }
}

/* --- Accounts Page Logic --- */
async function initAccountsPage() {
    await renderAccountsTable();

    const accountModal = document.getElementById('account-modal');
    const openAccountBtn = document.getElementById('open-account-modal-btn');
    const closeAccountBtn = document.getElementById('close-account-modal-btn');
    const cancelAccountBtn = document.getElementById('cancel-account-modal-btn');
    const accountForm = document.getElementById('account-form');

    const paymentModal = document.getElementById('payment-modal');
    const closePaymentBtn = document.getElementById('close-payment-modal-btn');
    const cancelPaymentBtn = document.getElementById('cancel-payment-modal-btn');
    const paymentForm = document.getElementById('payment-form');

    const searchInput = document.getElementById('account-search');

    // Modal toggles for Registration
    const openAccountModal = () => accountModal.classList.add('active');
    const closeAccountModal = () => {
        accountModal.classList.remove('active');
        accountForm.reset();
    };

    if (openAccountBtn) openAccountBtn.addEventListener('click', openAccountModal);
    if (closeAccountBtn) closeAccountBtn.addEventListener('click', closeAccountModal);
    if (cancelAccountBtn) cancelAccountBtn.addEventListener('click', closeAccountModal);

    // Modal toggles for Payment / Settlement
    const closePaymentModal = () => {
        paymentModal.classList.remove('active');
        paymentForm.reset();
    };

    if (closePaymentBtn) closePaymentBtn.addEventListener('click', closePaymentModal);
    if (cancelPaymentBtn) cancelPaymentBtn.addEventListener('click', closePaymentModal);

    // Handle New Account Registration (with hashed password support)
    accountForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const fullName = document.getElementById('acc-name').value.trim();
        const initialBalance = parseFloat(document.getElementById('acc-balance').value) || 0;
        
        // Auto-generate username from name (e.g., "Juan Dela Cruz" -> "juandelacruz")
        const username = fullName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const defaultPassword = 'password123'; // Default student portal password
        const userId = 'user_' + Date.now();

        const userData = {
            id: userId,
            full_name: fullName,
            username: username,
            password: defaultPassword,
            role: 'customer',
            balance: initialBalance
        };

        try {
            const response = await fetch(API_REGISTER, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });

            const result = await response.json();
            if (response.ok && result.message === 'success') {
                showToast(`Registered ${fullName} successfully! (Default Pass: password123)`, 'success');
                closeAccountModal();
                await renderAccountsTable();
            } else {
                showToast(result.error || 'Failed to register account.', 'danger');
            }
        } catch (error) {
            console.error('Error registering user:', error);
            showToast('Server error during registration.', 'danger');
        }
    });

    // Handle Utang Payment / Settlement
    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const userId = document.getElementById('pay-account-id').value;
        const payAmount = parseFloat(document.getElementById('pay-amount').value) || 0;

        const user = cachedUsers.find(u => u.id === userId);
        if (!user) return;

        const newBalance = Math.max(0, (user.balance || 0) - payAmount);

        try {
            const response = await fetch(`${API_USERS}/balance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: userId, balance: newBalance })
            });

            const result = await response.json();
            if (result.message === 'success') {
                showToast(`Payment of ₱${payAmount.toFixed(2)} recorded for ${user.full_name}!`, 'success');
                closePaymentModal();
                await renderAccountsTable();
            }
        } catch (error) {
            console.error('Error processing payment:', error);
            showToast('Failed to update balance on server.', 'danger');
        }
    });

    if (searchInput) {
        searchInput.addEventListener('input', renderAccountsTable);
    }
}

async function renderAccountsTable() {
    const tableBody = document.getElementById('accounts-table-body');
    if (!tableBody) return;

    const searchVal = document.getElementById('account-search')?.value.toLowerCase() || '';
    const users = await fetchUsers();
    
    // Filter only customer accounts for the ledger table
    const customers = users.filter(u => u.role === 'customer' && u.full_name.toLowerCase().includes(searchVal));

    if (customers.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-state">
                    <p class="text-muted">No customer accounts found.</p>
                </td>
            </tr>`;
        return;
    }

    tableBody.innerHTML = customers.map(acc => `
        <tr>
            <td>
                <strong>${acc.full_name}</strong>
                <p class="text-muted" style="font-size: 0.8rem;">@${acc.username}</p>
            </td>
            <td><code>${acc.id}</code></td>
            <td><strong class="${acc.balance > 0 ? 'text-danger' : 'text-success'}">₱${(acc.balance || 0).toFixed(2)}</strong></td>
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button onclick="openPaymentModal('${acc.id}', '${acc.full_name}', ${acc.balance || 0})" 
                        style="background-color: #5865f2; color: white; border: none; padding: 6px 12px; font-size: 0.85rem; font-weight: 550; border-radius: 6px; cursor: pointer; white-space: nowrap; transition: opacity 0.2s;"
                        onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
                        Settle / Pay
                    </button>
                    <button class="btn-icon text-danger" onclick="deleteAccount('${acc.id}')" title="Delete Account">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function openPaymentModal(id, name, currentBalance) {
    const modal = document.getElementById('payment-modal');
    if (!modal) return;

    document.getElementById('pay-account-id').value = id;
    document.getElementById('pay-account-label').textContent = `Account: ${name}`;
    document.getElementById('pay-account-balance-display').textContent = `Current Balance (Utang): ₱${currentBalance.toFixed(2)}`;
    document.getElementById('pay-amount').value = '';

    modal.classList.add('active');
}

async function deleteAccount(id) {
    if (!confirm('Are you sure you want to delete this customer account?')) return;

    try {
        const response = await fetch(`${API_USERS}/${id}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        if (result.message === 'success') {
            showToast('Account deleted from database.', 'danger');
            await renderAccountsTable();
        }
    } catch (error) {
        console.error('Error deleting account:', error);
    }
}

// Attach globally for inline HTML template triggers
window.openPaymentModal = openPaymentModal;
window.deleteAccount = deleteAccount;