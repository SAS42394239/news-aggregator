'use strict';
/* Parses feeds/*.xml into snapshot.json — freshly fetched headlines */
const fs = require('fs');
const path = require('path');

function unescape(s){
  return String(s)
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'")
    .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&');
}
function stripTags(s){ return String(s).replace(/<[^>]*>/g,' '); }
function cleanText(s){
  // unescape entities FIRST, then strip any (now-visible) markup,
  // then unescape again for double-encoded fragments
  let t = String(s).replace(/<!\[CDATA\[/g,'').replace(/\]\]>/g,'');
  t = unescape(t);
  t = stripTags(t);
  t = unescape(t);
  return t.replace(/\s+/g,' ').trim();
}
function hash(s){
  let h = 5381;
  const t = String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return h;
}

const HOMES = {
  bbc:'https://www.bbc.com/news', cnn:'https://www.cnn.com',
  guardian:'https://www.theguardian.com', aljazeera:'https://www.aljazeera.com',
  ap:'https://apnews.com', france24:'https://www.france24.com/en',
  dw:'https://www.dw.com/en', nyt:'https://www.nytimes.com'
};

const files = fs.readdirSync('feeds').filter(f => f.endsWith('.xml'));
const articles = [];

for (const f of files){
  const base = f.replace(/\.xml$/,'');
  const us = base.indexOf('_');
  if (us < 0) continue;
  const source = base.slice(0, us);
  const category = base.slice(us + 1);
  const xml = fs.readFileSync(path.join('feeds', f), 'utf8');
  const blocks = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map(m => m[0]);
  let count = 0;

  for (const block of blocks.slice(0, 12)){
    const mTitle = block.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const title = mTitle ? cleanText(mTitle[1]) : '';
    if (!title) continue;

    // link
    let link = '';
    let isGNews = block.includes('news.google.com');
    let m = block.match(/<link[^>]*>([\s\S]*?)<\/link>/);
    if (m) link = unescape(m[1].trim());
    if (!link){
      m = block.match(/<link[^>]*href=["']([^"']+)["']/);
      if (m) link = unescape(m[1]);
    }
    if (isGNews || link.includes('news.google.com')){
      const mSrc = block.match(/<source[^>]*url=["']([^"']+)["']/);
      if (mSrc) link = unescape(mSrc[1]);
    }
    if (!link || link.includes('news.google.com')) link = HOMES[source] || '#';

    // description (Google News items only repeat the title in a link)
    let desc = '';
    if (!isGNews){
      const mD = block.match(/<description[^>]*>([\s\S]*?)<\/description>/);
      if (mD) desc = cleanText(mD[1]).slice(0, 230);
    }

    // date
    let date = new Date();
    for (const tag of ['pubDate', 'dc:date', 'date', 'created']){
      const mP = block.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
      if (mP){
        const d = new Date(mP[1].trim());
        if (!isNaN(d.getTime())){ date = d; break; }
      }
    }
    const now = Date.now();
    if (date.getTime() > now + 10*60*1000) date = new Date(now);

    // image
    let img = '';
    const mImg = block.match(/<media:(?:content|thumbnail)[^>]*url=["']([^"']+)["']/);
    if (mImg) img = unescape(mImg[1]);
    if (!img){
      const mI = block.match(/<img[^>]*src=["']([^"']+)["']/);
      if (mI) img = unescape(mI[1]);
    }
    if (!img){
      const mE = block.match(/<enclosure[^>]*url=["']([^"']+)["']/);
      if (mE && /\.(jpe?g|png|webp|gif)$/i.test(mE[1])) img = unescape(mE[1]);
    }
    if (img && /sprite|1x1|pixel/i.test(img)) img = '';

    articles.push({
      id: hash(title), source, category, title, link, desc,
      date: Math.round(date.getTime()), img
    });
    count++;
  }
  console.log('parsed ' + source + '/' + category + ': ' + count + ' items');
}

// sort newest first, dedupe by title
articles.sort((a,b) => b.date - a.date);
const seen = new Set();
const deduped = [];
for (const a of articles){
  if (seen.has(a.id)) continue;
  seen.add(a.id);
  deduped.push(a);
}

const bySource = {};
for (const a of deduped) bySource[a.source] = (bySource[a.source] || 0) + 1;
console.log('\nTOTAL: ' + deduped.length + ' unique stories');
for (const [s,n] of Object.entries(bySource)) console.log('  ' + s + ': ' + n);

fs.writeFileSync('snapshot.json', JSON.stringify({time: Date.now(), articles: deduped}));
console.log('\nwrote snapshot.json (' + fs.statSync('snapshot.json').size + ' bytes)');
