// Real-browser loading regression: first paint must not wait for the sprite atlas,
// and a stalled/blocked atlas must fall back instead of hanging on a black screen.
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
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2'
};

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

async function startServer() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, url: 'http://127.0.0.1:' + server.address().port + '/index.html' };
}

async function runCase(name, mode, atlasDelay) {
  const { server, url } = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    // 主动中止图集请求时浏览器会打一条预期的网络错误,不算游戏错误。
    if (m.type() !== 'error') return;
    if (m.text().indexOf('Failed to load resource') >= 0) return;
    errors.push('console.error: ' + m.text());
  });

  if (mode !== 'normal') {
    await page.route('**/assets/sprites/atlas.png', async route => {
      if (mode === 'stall') return; // hold the request open forever
      if (mode === 'blocked') { await route.abort(); return; }
      if (atlasDelay > 0) await new Promise(r => setTimeout(r, atlasDelay));
      route.continue();
    });
  }

  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const domMs = Date.now() - t0;
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const firstPaintMs = Date.now() - t0;
  const painted = await page.evaluate(() => {
    const c = document.getElementById('game');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let nonzero = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] || d[i + 1] || d[i + 2] || d[i + 3]) nonzero++;
    }
    return { nonzero, state: window.Debug ? Debug.state() : null };
  });

  const finished = await page.waitForFunction(() => {
    const s = window.SpriteGen.atlasStatus();
    return s.loaded || s.error;
  }, null, { timeout: 20000 }).catch(() => null);
  const atlasMs = Date.now() - t0;
  const status = await page.evaluate(() => window.SpriteGen.atlasStatus());

  // The intro auto-skips after 5s; a deferred skip must resolve once the atlas settles.
  await page.waitForFunction(() => window.Debug && Debug.state() === 'menu', null, { timeout: 25000 })
    .catch(() => {});
  const state = await page.evaluate(() => window.Debug.state());
  const menuPainted = await page.evaluate(() => {
    const c = document.getElementById('game');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let nonzero = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] || d[i + 1] || d[i + 2] || d[i + 3]) nonzero++;
    }
    return nonzero;
  });

  console.log(JSON.stringify({ name, domMs, firstPaintMs, atlasMs, firstPaintNonzero: painted.nonzero, atlas: { loaded: status.loaded, error: status.error ? String(status.error).slice(0, 60) : null }, state, menuPainted, errors }, null, 2));

  assert(!!finished, name + ': atlas promise never settled');
  assert(painted.nonzero > 0, name + ': first paint canvas is blank');
  assert(firstPaintMs < 2000, name + ': first paint took too long (' + firstPaintMs + 'ms)');
  assert(state === 'menu', name + ': game did not reach menu');
  assert(menuPainted > 0, name + ': menu canvas is blank');
  assert(errors.length === 0, name + ': console errors: ' + errors.join(' | '));
  if (mode === 'stall') assert(status.error && status.error.indexOf('timed out') >= 0, name + ': expected timeout fallback');
  if (mode === 'blocked') assert(status.error && status.error.indexOf('failed') >= 0, name + ': expected load failure fallback');
  if (mode === 'normal') assert(status.loaded, name + ': atlas should load normally');

  await browser.close();
  server.close();
}

(async () => {
  await runCase('normal', 'normal', 0);
  await runCase('slow-3s', 'slow', 3000);
  await runCase('blocked', 'blocked', 0);
  await runCase('stall', 'stall', 0);
  console.log('=== 加载回归探针全部通过 ===');
})().catch(err => { console.error(err.message); process.exit(1); });
