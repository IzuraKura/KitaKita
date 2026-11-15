const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// Connect to SQLite database file
const db = new sqlite3.Database('./kitakita.db', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        createTables();
    }
});

// Create Tables with proper relationships
function createTables() {
    db.run(`CREATE TABLE IF NOT EXISTS inventory (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        price REAL,
        cost REAL,
        stock INTEGER,
        trackStock INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'customer',
        balance REAL DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        timestamp TEXT,
        revenue REAL,
        profit REAL,
        userId TEXT,
        items TEXT,
        FOREIGN KEY(userId) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS daily_history (
        dayNumber INTEGER PRIMARY KEY,
        date TEXT,
        totalSalesCount INTEGER,
        revenue REAL,
        profit REAL
    )`);
}

// ==========================================
// 1. INVENTORY API ROUTES
// ==========================================

app.get('/api/inventory', (req, res) => {
    const sql = `SELECT * FROM inventory ORDER BY name ASC`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "success", data: rows });
    });
});

app.post('/api/inventory', (req, res) => {
    const { id, name, category, price, cost, stock, trackStock } = req.body;
    const sql = `INSERT INTO inventory (id, name, category, price, cost, stock, trackStock) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET 
                 name=excluded.name, 
                 category=excluded.category, 
                 price=excluded.price, 
                 cost=excluded.cost, 
                 stock=excluded.stock, 
                 trackStock=excluded.trackStock`;
    const params = [id, name, category, price, cost, stock, trackStock ? 1 : 0];

    db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "success", id: id });
    });
});

// Delete an inventory item
app.delete('/api/inventory/:id', (req, res) => {
    const { id } = req.params;
    const sql = `DELETE FROM inventory WHERE id = ?`;
    
    db.run(sql, [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "success" });
    });
});

// ==========================================
// 2. AUTH & USER ACCOUNTS API ROUTES
// ==========================================

// Get all users (for admin management)
app.get('/api/users', (req, res) => {
    const sql = `SELECT id, full_name, username, role, balance FROM users ORDER BY full_name ASC`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "success", data: rows });
    });
});

// Register a new user or customer account with hashed password
app.post('/api/register', async (req, res) => {
    const { id, full_name, username, password, role, balance } = req.body;
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = `INSERT INTO users (id, full_name, username, password, role, balance) 
                     VALUES (?, ?, ?, ?, ?, ?)`;
        const params = [id, full_name, username, hashedPassword, role || 'customer', balance || 0];

        db.run(sql, params, function (err) {
            if (err) {
                return res.status(400).json({ error: "Username already exists or invalid data." });
            }
            res.json({ message: "success", id: id });
        });
    } catch (e) {
        res.status(500).json({ error: "Server error hashing password." });
    }
});

// User Login Route
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const sql = `SELECT * FROM users WHERE username = ?`;

    db.get(sql, [username], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: "Invalid username or password." });

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) return res.status(401).json({ error: "Invalid username or password." });

        // Send back user details (exclude password hash)
        res.json({
            message: "success",
            user: {
                id: user.id,
                full_name: user.full_name,
                username: user.username,
                role: user.role,
                balance: user.balance
            }
        });
    });
});

// Update user tab balance (Utang adjustment / payment)
app.post('/api/users/balance', (req, res) => {
    const { id, balance } = req.body;
    const sql = `UPDATE users SET balance = ? WHERE id = ?`;
    
    db.run(sql, [balance, id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "success" });
    });
});

// Delete a user account
app.delete('/api/users/:id', (req, res) => {
    const { id } = req.params;
    const sql = `DELETE FROM users WHERE id = ?`;
    db.run(sql, [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "success" });
    });
});

// Get purchase history for a specific user (for the Customer Portal)
app.get('/api/users/:id/sales', (req, res) => {
    const { id } = req.params;
    const sql = `SELECT * FROM sales WHERE userId = ? ORDER BY timestamp DESC`;
    db.all(sql, [id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "success", data: rows });
    });
});

// ==========================================
// 3. SALES & ANALYTICS API ROUTES
// ==========================================

app.get('/api/sales', (req, res) => {
    const sql = `SELECT * FROM sales ORDER BY timestamp DESC`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "success", data: rows });
    });
});

app.post('/api/sales', (req, res) => {
    const { id, timestamp, revenue, profit, userId, items } = req.body;
    const sql = `INSERT INTO sales (id, timestamp, revenue, profit, userId, items) 
                 VALUES (?, ?, ?, ?, ?, ?)`;
    const params = [id, timestamp, revenue, profit, userId || null, JSON.stringify(items)];

    db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "success", id: id });
    });
});

// ==========================================
// 4. DAILY HISTORY & END-OF-DAY API ROUTES
// ==========================================

app.get('/api/daily-history', (req, res) => {
    const sql = `SELECT * FROM daily_history ORDER BY dayNumber ASC`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "success", data: rows });
    });
});

app.post('/api/daily-history', (req, res) => {
    const { dayNumber, date, totalSalesCount, revenue, profit } = req.body;
    const sql = `INSERT INTO daily_history (dayNumber, date, totalSalesCount, revenue, profit) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [dayNumber, date, totalSalesCount, revenue, profit], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "success" });
    });
});

// Clear active shift sales upon End-Of-Day
app.delete('/api/sales/clear', (req, res) => {
    const sql = `DELETE FROM sales`;
    db.run(sql, [], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "success" });
    });
});

// ==========================================
// TEST ROUTE & START SERVER
// ==========================================
app.get('/', (req, res) => {
    res.json({ message: "KitaKita Backend is running live with SQLite & Auth!" });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});