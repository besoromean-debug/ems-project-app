const express = require('express');
const session = require('express-session');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const pool = mysql.createPool({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const initDb = async () => {
    try {
        // Gumawa ng temporary connection para masiguro na may ems_db
        const setupConn = await mysql.createConnection({
            host: '127.0.0.1',
            port: 3306,
            user: 'root',
            password: ''
        });
        await setupConn.query('CREATE DATABASE IF NOT EXISTS ems_db');
        await setupConn.end();

        // Gamitin ang ems_db pagkatapos masiguro na gawa na ito
        await pool.query('USE ems_db');
        const connection = await pool.getConnection();
        console.log('--------------------------------------------------');
        console.log('[OK] Connected successfully to MySQL (127.0.0.1).');
        
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS admin_users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                failed_attempts INT DEFAULT 0,
                lockout_until DATETIME DEFAULT NULL,
                last_login DATETIME DEFAULT NULL
            )
        `);

        const [rows] = await connection.execute('SELECT * FROM admin_users WHERE username = ?', ['admin']);
        if (rows.length === 0) {
            const hash = await bcrypt.hash('admin123', 10);
            await connection.execute('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', ['admin', hash]);
            console.log('[DB] Account Created: admin / admin123');
        }
        console.log('--------------------------------------------------');
        connection.release();
        return true;
    } catch (err) { 
        console.error('[ERROR] DB Initialization Failed:', err.message);
        console.log('TIP: Buksan ang XAMPP at i-click ang "Start" sa tabi ng MySQL.');
        console.log('--------------------------------------------------');
        return false;
    }
};

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: "Masyadong maraming login attempts, subukan muli pagkatapos ng 15 minuto."
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
    res.send(`
        <div style="font-family: sans-serif; padding: 20px;">
            <h1>Welcome sa Dashboard!</h1>
            <p>Naka-login ka na nang ligtas.</p>
            <a href="/logout">Logout</a>
        </div>`);
});

app.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).send("Kailangan ang username at password.");

    try {
        // Siguraduhing nasa tamang database bago mag-query
        const [users] = await pool.execute('SELECT * FROM ems_db.admin_users WHERE username = ?', [username]);
        if (users.length === 0) return res.status(401).send("Maling credentials.");

        const user = users[0];
        const now = new Date();

        if (user.lockout_until && user.lockout_until > now) {
            const remaining = Math.ceil((user.lockout_until - now) / 60000);
            return res.status(403).send(`Account locked. Subukan muli sa loob ng ${remaining} minuto.`);
        }

        const match = await bcrypt.compare(password, user.password_hash);

        if (match) {
            await pool.execute(
                'UPDATE ems_db.admin_users SET failed_attempts = 0, lockout_until = NULL, last_login = CURRENT_TIMESTAMP WHERE id = ?',
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
                const lockout = new Date(now.getTime() + 15 * 60000);
                await pool.execute(
                    'UPDATE ems_db.admin_users SET failed_attempts = ?, lockout_until = ? WHERE id = ?',
                    [attempts, lockout, user.id]
                );
                return res.status(403).send("Account locked. Wala ka nang natitirang attempts. Balik ka ulit after 15 mins.");
            } else {
                await pool.execute(
                    'UPDATE ems_db.admin_users SET failed_attempts = ? WHERE id = ?',
                    [attempts, user.id]
                );
                return res.status(401).send(`Invalid credentials. Attempts left: ${3 - attempts}/3`);
            }
        }
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            res.status(500).send("DB Connection Error: Siguraduhing naka-START ang MySQL sa XAMPP.");
        } else {
            console.error('[Login Error]', error);
            res.status(500).send(`Server error: ${error.message}`);
        }
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

const start = async () => {
    const dbReady = await initDb();
    if (dbReady) {
        app.listen(8080, () => console.log('Server running at http://localhost:8080'));
    } else {
        console.error('[CRITICAL] Server cannot start without database connection.');
        process.exit(1);
    }
};
start();