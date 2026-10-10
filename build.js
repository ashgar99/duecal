// Builds bookmarklet.txt and the install page (docs/index.html) from duecal.js.
// Run with: node build.js

const fs = require('fs');
const path = require('path');

const root = __dirname;
const source = fs.readFileSync(path.join(root, 'duecal.js'), 'utf8');

// Drop comment-only lines and indentation to keep the bookmark short
const compact = source
  .split('\n')
  .map(line => line.trim())
  .filter(line => line && !line.startsWith('//'))
  .join('\n');

const bookmarklet = 'javascript:' + encodeURIComponent(compact);

fs.writeFileSync(path.join(root, 'bookmarklet.txt'), bookmarklet + '\n');

const template = fs.readFileSync(path.join(root, 'site', 'index.template.html'), 'utf8');
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs', 'index.html'), template.split('{{BOOKMARKLET}}').join(bookmarklet));

console.log(`Built bookmarklet.txt (${bookmarklet.length} characters) and docs/index.html`);
