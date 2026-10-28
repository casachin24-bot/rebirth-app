const fs = require('fs');
const path = require('path');
const distDir = path.join(__dirname, '..', 'www', 'dist');
if (!fs.existsSync(distDir)) { fs.mkdirSync(distDir, { recursive: true }); }
const files = fs.readdirSync(distDir);
console.log('www/dist contains', files.length, 'files:', files.join(', '));
console.log('Build check complete.');
