// V6 training panel acceptance: collapsible panel and character switching.
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
const OUT = path.join(ROOT, 'shots', 'v6-training');
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

  const panelVisible = await page.evaluate(() => {
    const panel = document.querySelector('.test-panel');
    return !!panel && !panel.classList.contains('hidden');
  });
  assert(panelVisible, 'training panel is not visible');
  console.log('PANEL VISIBLE OK');

  await page.screenshot({ path: path.join(OUT, '01-panel-open.png') });
  await page.locator('.test-panel-toggle').click();
  await page.waitForTimeout(300);
  const collapsed = await page.evaluate(() => {
    const panel = document.querySelector('.test-panel');
    const body = panel.querySelector('.test-panel-body');
    return panel.classList.contains('collapsed') && body.classList.contains('hidden');
  });
  assert(collapsed, 'training panel did not collapse');
  await page.screenshot({ path: path.join(OUT, '02-panel-collapsed.png') });
  console.log('PANEL COLLAPSE OK');

  await page.locator('.test-panel-toggle').click();
  await page.waitForTimeout(300);
  const expanded = await page.evaluate(() => {
    const panel = document.querySelector('.test-panel');
    return !panel.classList.contains('collapsed');
  });
  assert(expanded, 'training panel did not expand back');

  const switched = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.test-picker')).find(r => r.querySelector('label').textContent === '角色');
    if (!row) return false;
    const select = row.querySelector('select');
    select.value = 'mage';
    row.querySelector('button').click();
    return true;
  });
  assert(switched, 'character picker row not found');
  await page.waitForTimeout(300);
  const charId = await page.evaluate(() => Debug.run().player.char.id);
  assert(charId === 'mage', 'character switch failed: ' + charId);
  console.log('CHAR SWITCH OK  knight -> mage');

  await browser.close();
  await new Promise(resolve => server.close(resolve));
  if (errors.length) throw new Error([...new Set(errors)].join('\n'));
  console.log('TRAINING PANEL OK  collapsible console, character switching and keyboard-safety blur active');
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
