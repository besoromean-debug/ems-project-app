const express = require('express');
const session = require('express-session');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const pool = mysql.createPool({
    host: 'localhost',
    host: '127.0.0.1',
    user: 'root',
    password: 'password',
    database: 'ems_db'
});

// Database Initialization - Gagawa ng table at admin user kung wala pa
const initDb = async () => {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log('[DB] Connected successfully to MySQL.');
        
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
            console.log('[DB] Admin user created: admin / admin123');
        }
    } catch (err) { 
        console.error('[DB Error] Failed to initialize database:', err.message);
        console.log('TIP: Siguraduhing nagawa mo na ang database na "ems_db" sa MySQL.');
    } finally {
        if (connection) connection.release();
    }
};
initDb();

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
        const [users] = await pool.execute('SELECT * FROM admin_users WHERE username = ?', [username]);
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
                'UPDATE admin_users SET failed_attempts = 0, lockout_until = NULL, last_login = NOW() WHERE id = ?',
                [user.id]
            );
            req.session.regenerate((err) => {
                if (err) return res.status(500).send("Session error.");
                req.session.logged_in = true;
                req.session.userId = user.id;
                res.redirect('/dashboard');
            });
        } else {
            const attempts = user.failed_attempts + 1;
            if (attempts >= 3) {
                const lockout = new Date(now.getTime() + 15 * 60000);
                await pool.execute(
                    'UPDATE admin_users SET failed_attempts = ?, lockout_until = ? WHERE id = ?',
                    [attempts, lockout, user.id]
                );
                return res.status(403).send("Account locked. No attempts left.");
            } else {
                await pool.execute(
                    'UPDATE admin_users SET failed_attempts = ? WHERE id = ?',
                    [attempts, user.id]
                );
                return res.status(401).send(`Invalid credentials. Attempts left: ${3 - attempts}/3`);
            }
        }
    } catch (error) {
        console.error('[Login Error]', error);
        res.status(500).send(`Server error: ${error.message}`);
        if (error.code === 'ECONNREFUSED') {
            res.status(500).send("Server error: Hindi makakonekta sa MySQL. Siguraduhing naka-ON ang MySQL sa XAMPP.");
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

app.listen(8080, () => console.log('Server running at http://localhost:8080'));
const start = async () => {
    await initDb();
    app.listen(8080, () => console.log('Server running at http://localhost:8080'));
};
start();