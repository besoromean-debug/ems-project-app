const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite'); // Import open function from 'sqlite'
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
let db; // Global variable para sa SQLite database connection
const initDb = async () => {
    try {
        // Bubuksan o gagawa ng file na 'ems.db'
        db = await open({
            filename: './ems.db', // Ang database file ay nasa root ng iyong project
            driver: sqlite3.Database
        });
        console.log('--------------------------------------------------');
        console.log('[OK] Connected to SQLite Database (ems.db).');
        
        // Gumawa ng admin_users table kung wala pa
        await db.exec(`
            CREATE TABLE IF NOT EXISTS admin_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                failed_attempts INTEGER DEFAULT 0,
                lockout_until DATETIME DEFAULT NULL,
                last_login DATETIME DEFAULT NULL
            )
        `);

        // I-check kung may admin user na, kung wala, gumawa
        const user = await db.get('SELECT * FROM admin_users WHERE username = ?', ['admin']);
        if (!user) {
            const hash = await bcrypt.hash('admin123', 10);
            await db.run('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', ['admin', hash]);
            console.log('[DB] Account Created: admin / admin123');
        }
        console.log('--------------------------------------------------');
        return true;
    } catch (err) { 
        console.error('[ERROR] Database Initialization Failed:', err.message);
        console.log('--------------------------------------------------');
        return false;
    }
};

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3, 
    handler: (req, res) => {
        res.redirect('/login?error=' + encodeURIComponent("Too many failed attempts. Access locked for 15 minutes."));
    }
});

app.use(session({
    secret: 'cyber-level-2-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true if using HTTPS
        httpOnly: true, 
        maxAge: 15 * 60 * 1000 
    }
}));

// Middleware para protektahan ang mga routes
const isAuthenticated = (req, res, next) => {
    if (req.session.logged_in) return next();
    res.redirect('/login');
};

app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/dashboard', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// API Endpoint para makuha ang profile ng user
app.get('/api/user', isAuthenticated, (req, res) => {
    res.json({ username: req.session.username });
});

app.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.redirect('/login?error=' + encodeURIComponent("Username and password are required."));

    try {
        const user = await db.get('SELECT * FROM admin_users WHERE username = ?', [username]); // Gamit ang db.get para sa SQLite
        if (!user) return res.redirect('/login?error=' + encodeURIComponent("Invalid credentials."));

        const now = new Date();
        const lockoutUntil = user.lockout_until ? new Date(user.lockout_until) : null; // Convert string to Date object

        if (lockoutUntil && lockoutUntil > now) {
            const remaining = Math.ceil((lockoutUntil - now) / 60000);
            return res.redirect('/login?error=' + encodeURIComponent(`Account locked. Please try again in ${remaining} minutes.`));
        }

        const match = await bcrypt.compare(password, user.password_hash);

        if (match) {
            await db.run( // Gamit ang db.run para sa SQLite
                'UPDATE admin_users SET failed_attempts = 0, lockout_until = NULL, last_login = CURRENT_TIMESTAMP WHERE id = ?',
                [user.id]
            );
            req.session.regenerate((err) => {
                if (err) return res.status(500).send("Session error.");
                req.session.logged_in = true;
                req.session.username = user.username;
                res.redirect('/dashboard');
            });
        } else {
            const attempts = user.failed_attempts + 1;
            if (attempts >= 3) {
                const lockoutTime = new Date(now.getTime() + 15 * 60000).toISOString(); // ISO string format para sa DATETIME sa SQLite
                await db.run( // Gamit ang db.run para sa SQLite
                    'UPDATE admin_users SET failed_attempts = ?, lockout_until = ? WHERE id = ?',
                    [attempts, lockoutTime, user.id]
                );
                return res.redirect('/login?error=' + encodeURIComponent("Account locked. No attempts left. Please try again after 15 minutes."));
            } else {
                await db.run( // Gamit ang db.run para sa SQLite
                    'UPDATE admin_users SET failed_attempts = ? WHERE id = ?',
                    [attempts, user.id]
                );
                return res.redirect('/login?error=' + encodeURIComponent(`Invalid credentials. Attempts left: ${3 - attempts}/3`));
            }
        }
    } catch (error) {
        console.error('[Login Error]', error); // Mas specific na error logging
        res.status(500).send(`Server error: ${error.message}`); // Ipakita ang error message sa user
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

const start = async () => {
    const dbReady = await initDb();
    if (dbReady) { // Kung successful ang database initialization, saka lang i-start ang server
        app.listen(8080, () => console.log('Server running at http://localhost:8080'));
    } else {
        console.error('[CRITICAL] Server cannot start without a functional database connection.');
        process.exit(1);
    }
};
start();