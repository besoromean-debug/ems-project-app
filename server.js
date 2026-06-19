const express = require('express');
const path = require('path');
const helmet = require('helmet');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const session = require('express-session');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');

const app = express();
const port = 8080;

let db;

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    handler: (req, res) => {
        res.redirect('/login?error=' + encodeURIComponent("Too many requests. Please try again after 15 minutes."));
    }
});

async function initDb() {
    db = await open({ filename: './ems.db', driver: sqlite3.Database });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            username TEXT UNIQUE, 
            password_hash TEXT,
            failed_attempts INTEGER DEFAULT 0,
            lockout_until DATETIME DEFAULT NULL
        );
        CREATE TABLE IF NOT EXISTS employees (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, position TEXT, department TEXT);
    `);
    const admin = await db.get('SELECT * FROM admin_users WHERE username = ?', ['admin']);
    if (!admin) {
        const hash = await bcrypt.hash('admin123', 10);
        await db.run('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', ['admin', hash]);
    }
}

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            "style-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            "font-src": ["'self'", "https://cdn.jsdelivr.net"],
            "img-src": ["'self'", "data:"]
        },
    },
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({ 
    secret: 'cyber-level-2-secret', 
    resave: false, 
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 15 * 60 * 1000 }
}));

const isAuthenticated = (req, res, next) => {
    if (req.session.logged_in) return next();
    res.redirect('/login');
};

app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/dashboard', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));

app.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.redirect('/login?error=' + encodeURIComponent("Required fields missing."));

    const user = await db.get('SELECT * FROM admin_users WHERE username = ?', [username]);
    if (!user) return res.redirect('/login?error=' + encodeURIComponent("Invalid credentials."));

    const now = new Date();
    const lockoutUntil = user.lockout_until ? new Date(user.lockout_until) : null;

    if (lockoutUntil && lockoutUntil > now) {
        const remaining = Math.ceil((lockoutUntil - now) / 60000);
        return res.redirect('/login?error=' + encodeURIComponent(`Locked. Try again in ${remaining} mins.`));
    }

    const match = await bcrypt.compare(password, user.password_hash);

    if (match) {
        await db.run('UPDATE admin_users SET failed_attempts = 0, lockout_until = NULL WHERE id = ?', [user.id]);
        req.session.regenerate((err) => {
            if (err) return res.status(500).send("Session error.");
            req.session.logged_in = true;
            req.session.username = user.username;
            req.session.save(() => res.redirect('/dashboard'));
        });
    } else {
        const attempts = (user.failed_attempts || 0) + 1;
        if (attempts >= 3) {
            const lockoutTime = new Date(now.getTime() + 15 * 60000).toISOString();
            await db.run('UPDATE admin_users SET failed_attempts = ?, lockout_until = ? WHERE id = ?', [attempts, lockoutTime, user.id]);
            return res.redirect('/login?error=' + encodeURIComponent("Account locked for 15 minutes."));
        } else {
            await db.run('UPDATE admin_users SET failed_attempts = ? WHERE id = ?', [attempts, user.id]);
            return res.redirect('/login?error=' + encodeURIComponent(`Invalid password. ${3 - attempts} attempts left.`));
        }
    }
});

// API Endpoints for Employees
app.get('/api/user', isAuthenticated, (req, res) => res.json({ username: req.session.username }));

app.get('/api/employees', isAuthenticated, async (req, res) => {
    const rows = await db.all('SELECT * FROM employees');
    res.json(rows);
});

app.post('/api/employees', isAuthenticated, async (req, res) => {
    const { name, position, department } = req.body;
    await db.run('INSERT INTO employees (name, position, department) VALUES (?, ?, ?)', [name, position, department]);
    res.sendStatus(201);
});

app.put('/api/employees/:id', isAuthenticated, async (req, res) => {
    const { name, position, department } = req.body;
    await db.run('UPDATE employees SET name = ?, position = ?, department = ? WHERE id = ?', [name, position, department, req.params.id]);
    res.sendStatus(200);
});

app.delete('/api/employees/:id', isAuthenticated, async (req, res) => {
    await db.run('DELETE FROM employees WHERE id = ?', [req.params.id]);
    res.sendStatus(200);
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

initDb().then(() => {
    app.listen(port, '0.0.0.0', () => console.log(`Server running at http://localhost:${port}`));
});