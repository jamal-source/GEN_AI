import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const js   = fs.readFileSync(path.join(root, 'public', 'script.js'), 'utf8');

console.log('--- STATIC AUDIT OF JS & HTML INTEGRATION ---');

// 1. Verify all inline onclick handlers exist in script.js
const onclicks = html.match(/onclick="([^"]+)"/g) || [];
const handlers = onclicks.map(o => o.replace(/onclick="|"/g, '').split('(')[0]);
console.log('Inline onclick functions found in HTML:', [...new Set(handlers)]);

const missingInJs = [];
[...new Set(handlers)].forEach(fn => {
  if (!js.includes(`window.${fn}`) && !js.includes(`function ${fn}`)) {
    missingInJs.push(fn);
  }
});

console.log('Missing functions in JS:', missingInJs);

if (missingInJs.length === 0) {
  console.log('\n✅ AUDIT RESULT: 100% PERFECT MATCH BETWEEN HTML & JS!');
} else {
  console.log('\n❌ AUDIT RESULT: MISSING FUNCTIONS:', missingInJs);
}
