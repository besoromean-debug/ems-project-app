const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const port = 8080;

// Setup storage para sa mga uploaded files
const upload = multer({ dest: 'uploads/' });
let latestUpload = null; // Dito natin ise-save temporary yung info ng file

// Serve static files (para sa uploads folder kung gusto makita)
app.use('/uploads', express.static('uploads'));
app.use(express.json());

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
});

// Endpoint para i-check ng desktop client kung may file na
app.get('/check-status', (req, res) => {
    res.json({ uploaded: !!latestUpload, file: latestUpload });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
});