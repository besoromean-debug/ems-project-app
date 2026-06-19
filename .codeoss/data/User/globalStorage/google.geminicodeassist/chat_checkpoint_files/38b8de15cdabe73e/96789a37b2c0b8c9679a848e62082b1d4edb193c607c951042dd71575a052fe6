const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const helmet = require('helmet');

const app = express();
const port = 8080;

app.use(helmet()); // Nagdadagdag ng secure HTTP headers

// Setup storage para sa mga uploaded files
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 10 * 1024 * 1024 } // Limitahan sa 10MB
});

let latestUpload = null; // Dito natin ise-save temporary yung info ng file

// Serve static files (para sa uploads folder kung gusto makita)
app.use('/uploads', express.static('uploads'));
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Server is running. All HTML pages and EMS modules have been removed.');
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