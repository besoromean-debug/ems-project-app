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
            filename: path.join(__dirname, 'ems.db'),
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

        // Gumawa ng employees table para sa management
        await db.exec(`
            CREATE TABLE IF NOT EXISTS employees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                position TEXT NOT NULL,
                department TEXT NOT NULL
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

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'", "'unsafe-inline'"], // Pinapayagan ang script sa login.html
            "style-src": ["'self'", "https://cdn.jsdelivr.net"],
            "font-src": ["'self'", "https://cdn.jsdelivr.net"],
        },
    },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10, // Ginawa nating 10 para hindi mag-conflict sa 3-strike rule ng account
    handler: (req, res) => {
        res.redirect('/login?error=' + encodeURIComponent("Too many requests from this IP. Please try again after 15 minutes."));
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

app.get('/employees', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'employees.html'));
});

// API Endpoint para makuha ang profile ng user
app.get('/api/user', isAuthenticated, (req, res) => {
    res.json({ username: req.session.username });
});

// --- Employee API Endpoints ---

app.get('/api/employees', isAuthenticated, async (req, res) => {
    const rows = await db.all('SELECT * FROM employees');
    res.json(rows);
});

app.post('/api/employees', isAuthenticated, async (req, res) => {
    const { name, position, department } = req.body;
    if (!name || !position || !department) return res.status(400).send("Missing fields");
    await db.run('INSERT INTO employees (name, position, department) VALUES (?, ?, ?)', [name, position, department]);
    res.sendStatus(201);
});

app.put('/api/employees/:id', isAuthenticated, async (req, res) => {
    const { name, position, department } = req.body;
    await db.run(
        'UPDATE employees SET name = ?, position = ?, department = ? WHERE id = ?',
        [name, position, department, req.params.id]
    );
    res.sendStatus(200);
});

app.delete('/api/employees/:id', isAuthenticated, async (req, res) => {
    await db.run('DELETE FROM employees WHERE id = ?', [req.params.id]);
    res.sendStatus(200);
});

app.post('/login', loginLimiter, async (req, res) => {
    let { username, password } = req.body;
    if (!username || !password) return res.redirect('/login?error=' + encodeURIComponent("Username and password are required."));

    // Trim whitespace to prevent accidental space errors
    username = username.trim();
    password = password.trim();

    try {
        const user = await db.get('SELECT * FROM admin_users WHERE username = ?', [username]); // Gamit ang db.get para sa SQLite
        if (!user) {
            console.log(`[Login Alert] Unknown user: ${username}`);
            return res.redirect('/login?error=' + encodeURIComponent("Invalid username or password."));
        }

        const now = new Date();
        // SQLite stores dates as strings, convert to Date object for comparison
        const lockoutUntil = user.lockout_until ? new Date(user.lockout_until) : null;

        if (lockoutUntil && lockoutUntil > now) {
            const remaining = Math.ceil((lockoutUntil - now) / 60000);
            return res.redirect('/login?error=' + encodeURIComponent(`This account is locked. Please try again in ${remaining} minute(s).`));
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
                // Siguraduhing na-save ang session bago mag-redirect
                req.session.save(() => {
                    console.log(`[Login Success] User: ${username}`);
                    res.redirect('/dashboard');
                });
            });
        } else {
            // Increment failed attempts
            const attempts = user.failed_attempts + 1;
            console.log(`[Security] Failed attempt ${attempts}/3 for user: ${username}`); // Visible in terminal
            
            if (attempts >= 3) {
                // Lock the account on the 3rd failed attempt
                const lockoutTime = new Date(now.getTime() + 15 * 60000).toISOString();
                await db.run(
                    'UPDATE admin_users SET failed_attempts = ?, lockout_until = ? WHERE id = ?',
                    [attempts, lockoutTime, user.id]
                );
                console.log(`[Security] Account Locked: ${username} (3 failed attempts)`);
                return res.redirect('/login?error=' + encodeURIComponent("Account locked due to 3 failed attempts. Access is restricted for 15 minutes."));
            } else {
                // Update attempt count and show remaining
                await db.run(
                    'UPDATE admin_users SET failed_attempts = ? WHERE id = ?',
                    [attempts, user.id]
                );
                const remaining = 3 - attempts;
                return res.redirect('/login?error=' + encodeURIComponent(`Invalid password. You have ${remaining} attempt(s) remaining.`));
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
        const PORT = process.env.PORT || 8080;
        app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
    } else {
        console.error('[CRITICAL] Server cannot start without a functional database connection.');
        process.exit(1);
    }
};
start();