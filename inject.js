'use strict';
const fs = require('fs');
const snap = JSON.parse(fs.readFileSync('snapshot.json', 'utf8'));
let html = fs.readFileSync('index.html', 'utf8');
const marker = 'const EMBEDDED_SNAPSHOT = null; //__SNAPSHOT__\nconst EMBEDDED_SNAPSHOT_TIME = 0; //__SNAPSHOT_TIME__';
const replacement = 'const EMBEDDED_SNAPSHOT = ' + JSON.stringify(snap.articles) + ';\nconst EMBEDDED_SNAPSHOT_TIME = ' + snap.time + ';';
if (html.includes(marker)){
  html = html.replace(marker, replacement);
} else {
  // re-injection: replace the previously injected pair of lines
  const re = /const EMBEDDED_SNAPSHOT = [\s\S]*?;\nconst EMBEDDED_SNAPSHOT_TIME = \d+;/;
  if (!re.test(html)) throw new Error('snapshot marker not found in index.html');
  html = html.replace(re, replacement);
}
fs.writeFileSync('index.html', html);
console.log('injected ' + snap.articles.length + ' live stories, snapshot time ' + new Date(snap.time).toISOString());
