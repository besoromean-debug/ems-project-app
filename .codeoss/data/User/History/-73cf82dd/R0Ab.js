const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const mysql = require('mysql2/promise');
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express();
const port = 8080;

// Database Configuration (Katulad ng sa PHP mo)
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'ems_database'
};

// Setup storage para sa mga uploaded files
const upload = multer({ dest: 'uploads/' });
let activeUploads = {}; // Gumamit ng object para sa multiple users base sa Session ID

// Serve static files (para sa uploads folder kung gusto makita)
app.use('/uploads', express.static('uploads'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration (Cyber Level 2 Security)
app.use(session({
    secret: 'printing_shop_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false, // Gawing true kung naka-HTTPS
        maxAge: 1000 * 60 * 60 // 1 hour
    }
}));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

app.get('/home.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'home.html')); 
});

app.get('/print_process.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'print_process.html'));
});

app.get('/process.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'process.html'));
});

app.get('/review.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'review.html'));
});

// Route para sa mobile upload page (ito yung ma-scan sa QR)
app.get('/upload.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'upload.html'));
});

// Login Page Route
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'login.html'));
});

// Login Logic (Converted mula sa login.php)
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute(
            'SELECT id, password_hash, failed_attempts, lockout_until FROM admin_users WHERE username = ? LIMIT 1',
            [username]
        );

        if (rows.length === 0) {
            return res.status(401).send('Maling username o password.');
        }

        const user = rows[0];
        const now = new Date();

        // Check Account Lockout
        if (user.lockout_until && new Date(user.lockout_until) > now) {
            return res.status(403).send('Masyadong maraming maling login. Subukan muli mamaya.');
        }

        // Password Verification
        const match = await bcrypt.compare(password, user.password_hash);

        if (match) {
            // Success: Reset failed attempts
            await connection.execute(
                'UPDATE admin_users SET failed_attempts = 0, lockout_until = NULL, last_login = NOW() WHERE id = ?',
                [user.id]
            );

            req.session.userId = user.id;
            req.session.username = username;
            req.session.loggedIn = true;

            await connection.end();
            return res.redirect('/dashboard');
        } else {
            // Failure logic
            const newAttempts = user.failed_attempts + 1;
            if (newAttempts >= 3) {
                const lockoutTime = new Date(now.getTime() + 15 * 60000); // 15 mins lockout
                await connection.execute(
                    'UPDATE admin_users SET failed_attempts = ?, lockout_until = ? WHERE id = ?',
                    [newAttempts, lockoutTime, user.id]
                );
                await connection.end();
                return res.status(403).send('Account locked for 15 minutes.');
            } else {
                await connection.execute(
                    'UPDATE admin_users SET failed_attempts = ? WHERE id = ?',
                    [newAttempts, user.id]
                );
                await connection.end();
                return res.status(401).send(`Maling username o password. Subok na natira: ${3 - newAttempts}`);
            }
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Database error.');
    }
});

// Protected Dashboard Route
app.get('/dashboard', (req, res) => {
    if (!req.session.loggedIn) {
        return res.redirect('/login');
    }
    res.send(`<h1>Welcome to Dashboard, ${req.session.username}!</h1><a href="/logout">Logout</a>`);
});

// Logout Route
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Endpoint para tanggapin ang file mula sa mobile
app.post('/upload/:sessionId', upload.single('file'), (req, res) => {
    if (req.file) {
        const sessionId = req.params.sessionId;
        activeUploads[sessionId] = {
            filename: req.file.filename,
            originalname: req.file.originalname,
            path: req.file.path
        };
        console.log(`File received for session ${sessionId}:`, req.file.originalname);
        res.send('Success! You can now look at the computer screen.');
    } else {
        res.status(400).send('No file uploaded.');
    }
});

// Endpoint para i-check ng desktop client kung may file na
app.get('/check-status/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    const data = activeUploads[sessionId];
    res.json({ uploaded: !!data, file: data });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
});