import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const js   = fs.readFileSync(path.join(root, 'public', 'script.js'), 'utf8');

const regex = /(?:getElementById|\$)\(['"]([^'"]+)['"]\)/g;
let match;
const found = new Set();
const missing = new Set();

while ((match = regex.exec(js)) !== null) {
  const id = match[1];
  found.add(id);
  if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) {
    missing.add(id);
  }
}

console.log('Total IDs found in JS:', found.size);
console.log('Missing IDs in index.html:', Array.from(missing));
