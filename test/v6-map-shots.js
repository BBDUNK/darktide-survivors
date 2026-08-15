// V6 map acceptance: real browser captures the three authored maps.
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
const OUT = path.join(ROOT, 'shots', 'v6-maps');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg'
};

function assert(ok, message) { if (!ok) throw new Error(message); }

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const file = path.normalize(path.join(ROOT, urlPath));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const URL = 'http://127.0.0.1:' + server.address().port + '/index.html';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

  await page.goto(URL);
  await page.waitForFunction(() => window.SpriteGen && SpriteGen.atlasStatus().loaded, null, { timeout: 15000 });
  await page.mouse.click(640, 360);
  await page.waitForSelector('.menu-screen:not(.hidden)');
  await page.getByText('开始远征').first().click();
  await page.waitForSelector('.character-select-screen:not(.hidden)');
  await page.locator('.character-select-screen:not(.hidden) button', { hasText: '训练场' }).click();
  await page.waitForFunction(() => Debug.state() === 'run' && !!Debug.run() && Debug.run().testMode, null, { timeout: 8000 });

  const swampFacts = await page.evaluate(() => [5, 6].map(i =>
    SpriteGen.frames('terrain_grave_swamp_puddle' + i).map(c => [c.width, c.height])));
  assert(swampFacts.every(group => group.length === 1 && group[0][0] === 320 && group[0][1] === 224),
    'sixth graveyard swamp set is incomplete: ' + JSON.stringify(swampFacts));
  console.log('SWAMP OK   graveyard exposes six 320x224 mud-rimmed swamp puddles');

  for (const [index, tag] of [[0, 'graveyard'], [1, 'wilds'], [2, 'abyss']]) {
    if (index > 0) {
      await page.evaluate((index) => { Debug.run().map = CFG.MAPS[index]; }, index);
    }
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, 'map-' + tag + '.png') });
    console.log('MAP SHOT OK  ' + tag);
  }

  await browser.close();
  await new Promise(resolve => server.close(resolve));
  if (errors.length) throw new Error([...new Set(errors)].join('\n'));
  console.log('MAPS OK   three authored maps render in a real browser');
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
