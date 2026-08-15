// 加载期流畅度 A/B 探针:统计从导航到图集就绪期间的最长 rAF 间隔(主线程卡顿)。
// 不进回归矩阵,仅供 v0.22 性能对比。用法: node test/jank-probe.js
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const PW = process.env.PW_ROOT ||
  path.join(process.env.LOCALAPPDATA || process.env.TMPDIR || '/tmp', 'Temp', 'pwshot', 'node_modules', 'playwright');
let chromium;
try { chromium = require(PW).chromium; }
catch (e) { chromium = require(path.join(process.env.TEMP || '/tmp', 'pwshot', 'node_modules', 'playwright')).chromium; }

const ROOT = path.join(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg'
};

(async () => {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/index.html';

  const browser = await chromium.launch();
  const results = [];
  for (let run = 0; run < 3; run++) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.addInitScript(() => {
      window.__gaps = [];
      window.__prev = 0;
      window.__stopped = false;
      requestAnimationFrame(function loop(now) {
        if (window.__stopped) return;
        if (window.__prev) window.__gaps.push(now - window.__prev);
        window.__prev = now;
        requestAnimationFrame(loop);
      });
    });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const s = window.SpriteGen && SpriteGen.atlasStatus();
      return s && (s.loaded || s.error);
    }, null, { timeout: 20000 });
    const stats = await page.evaluate(() => {
      window.__stopped = true;
      const g = window.__gaps.slice();
      g.sort((a, b) => a - b);
      return {
        frames: g.length,
        maxMs: g[g.length - 1],
        p99Ms: g[Math.floor(g.length * 0.99)] || 0,
        over33: g.filter(x => x > 33.4).length,
        over50: g.filter(x => x > 50).length
      };
    });
    results.push(stats);
    await page.close();
  }
  await browser.close();
  server.close();
  const worst = {
    maxMs: Math.max(...results.map(r => r.maxMs)),
    p99Ms: Math.max(...results.map(r => r.p99Ms)),
    over33: Math.max(...results.map(r => r.over33)),
    over50: Math.max(...results.map(r => r.over50))
  };
  console.log(JSON.stringify({ runs: results, worst }, null, 2));
})().catch(err => { console.error(err.message); process.exit(1); });
