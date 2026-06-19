const express = require('express');
const path = require('path');
const app = express();
const port = 8080;

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

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
});