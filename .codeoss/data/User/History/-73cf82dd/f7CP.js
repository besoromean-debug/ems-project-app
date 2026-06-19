const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const helmet = require('helmet');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express();
const port = 8080;

app.use(helmet()); // Nagdadagdag ng secure HTTP headers
let db;
async function initDb() {
    db = await open({ filename: './ems.db', driver: sqlite3.Database });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS admin_users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT);
        CREATE TABLE IF NOT EXISTS employees (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, position TEXT, department TEXT);
    `);
    const admin = await db.get('SELECT * FROM admin_users WHERE username = ?', ['admin']);
    if (!admin) {
        const hash = await bcrypt.hash('admin123', 10);
        await db.run('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', ['admin', hash]);
    }
}

// Setup storage para sa mga uploaded files
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 10 * 1024 * 1024 } // Limitahan sa 10MB
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'cyber-secret', resave: false, saveUninitialized: false }));

const isAuthenticated = (req, res, next) => {
    if (req.session.logged_in) return next();
    res.redirect('/login');
};

app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/dashboard', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await db.get('SELECT * FROM admin_users WHERE username = ?', [username]);
    if (user && await bcrypt.compare(password, user.password_hash)) {
        req.session.logged_in = true;
        req.session.username = user.username;
        res.redirect('/dashboard');
    } else {
        res.status(401).send('Invalid credentials');
    }
});

let latestUpload = null; // Dito natin ise-save temporary yung info ng file
// API Endpoints for Employees
app.get('/api/user', isAuthenticated, (req, res) => res.json({ username: req.session.username }));

// Serve static files (para sa uploads folder kung gusto makita)
app.use('/uploads', express.static('uploads'));
app.use(express.json());
app.get('/api/employees', isAuthenticated, async (req, res) => {
    const rows = await db.all('SELECT * FROM employees');
    res.json(rows);
});

app.get('/', (req, res) => {
    res.send('Server is running. All HTML pages and EMS modules have been removed.');
app.post('/api/employees', isAuthenticated, async (req, res) => {
    const { name, position, department } = req.body;
    await db.run('INSERT INTO employees (name, position, department) VALUES (?, ?, ?)', [name, position, department]);
    res.sendStatus(201);
});

// Endpoint para tanggapin ang file mula sa mobile
app.post('/upload', upload.single('file'), (req, res) => {
    if (req.file) {
        latestUpload = {
            filename: req.file.filename,
            originalname: req.file.originalname,
            path: req.file.path
        };
        console.log('File received:', latestUpload.originalname);
        res.send('Success! You can now look at the computer screen.');
    } else {
        res.status(400).send('No file uploaded.');
    }
app.put('/api/employees/:id', isAuthenticated, async (req, res) => {
    const { name, position, department } = req.body;
    await db.run('UPDATE employees SET name = ?, position = ?, department = ? WHERE id = ?', [name, position, department, req.params.id]);
    res.sendStatus(200);
});

// Endpoint para i-check ng desktop client kung may file na
app.get('/check-status', (req, res) => {
    res.json({ uploaded: !!latestUpload, file: latestUpload });
app.delete('/api/employees/:id', isAuthenticated, async (req, res) => {
    await db.run('DELETE FROM employees WHERE id = ?', [req.params.id]);
    res.sendStatus(200);
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

initDb().then(() => {
    app.listen(port, '0.0.0.0', () => console.log(`Server running at http://localhost:${port}`));
});