// 现状截图:主菜单/选人/局内 HUD/升级/暂停,供美术审查。node test/audit-shots.js
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
const OUT = path.join(ROOT, 'shots', 'audit');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.Debug && Debug.state() === 'menu', null, { timeout: 30000 });
  await page.waitForSelector('.menu-screen:not(.hidden)', { timeout: 15000 });
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, '01-menu.png') });
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.menu-screen:not(.hidden) .btn'));
    const start = btns.find(b => b.textContent.indexOf('开始远征') >= 0);
    if (start) start.click();
  });
  await page.waitForSelector('.character-select-screen:not(.hidden)');
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, '02-charsel.png') });
  await page.evaluate(() => { document.querySelector('.character-select-screen:not(.hidden) .btn-row .btn').click(); });
  await sleep(400);
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const list = document.querySelectorAll('.screen:not(.hidden) .btn-row .btn.primary');
    const b = list[list.length - 1];
    if (b) b.click();
  });
  await page.waitForFunction(() => Debug.state() === 'run', null, { timeout: 15000 }).catch(() => {});
  await sleep(5000);
  await page.screenshot({ path: path.join(OUT, '03-run-hud.png') });
  try {
    await page.evaluate(() => {
      const run = Debug.run();
      if (Entities.gainXP) Entities.gainXP(run, run.xpNeed + 1);
      else run.xp = run.xpNeed + 1;
    });
    await sleep(900);
    await page.screenshot({ path: path.join(OUT, '04-levelup.png') });
  } catch (e) { console.log('levelup shot skipped'); }
  try {
    await page.keyboard.press('Escape');
    await sleep(500);
    await page.screenshot({ path: path.join(OUT, '05-pause.png') });
  } catch (e) { console.log('pause shot skipped'); }
  await browser.close();
  server.close();
  console.log('shots written to ' + OUT);
})().catch(err => { console.error(err); process.exit(1); });
