// 全界面截图审查:菜单/选人/选图/圣坛/成就/百科/设置/联机/结算/局内/暂停/升级。node test/allui-shots.js
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
const OUT = path.join(ROOT, 'shots', 'allui');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
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
  await page.waitForSelector('.menu-screen:not(.hidden)');
  await sleep(1500);
  const shot = n => page.screenshot({ path: path.join(OUT, n + '.png') });
  const clickByText = async (t) => {
    const ok = await page.evaluate((t) => {
      const btns = Array.from(document.querySelectorAll('.btn'));
      const vis = btns.filter(b => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && b.offsetParent !== null && !b.closest('.hidden');
      });
      const b = vis.find(x => x.textContent.trim().indexOf(t) >= 0);
      if (b) { b.click(); return true; }
      return false;
    }, t);
    if (!ok) console.log('  (missed button: ' + t + ')');
    return ok;
  };

  await shot('01-menu');
  await clickByText('强化圣坛'); await sleep(700); await shot('02-shop'); await clickByText('返回'); await sleep(500);
  await clickByText('成就'); await sleep(700); await shot('03-achv'); await clickByText('返回'); await sleep(500);
  await clickByText('百科'); await sleep(700); await shot('04-codex'); 
  await clickByText('敌人'); await sleep(500); await shot('05-codex-enemy');
  await clickByText('故事'); await sleep(500); await shot('06-codex-story');
  await clickByText('返回'); await sleep(500);
  await clickByText('设置'); await sleep(700); await shot('07-settings'); await clickByText('返回'); await sleep(500);
  await clickByText('联机远征'); await sleep(900); await shot('08-coop'); await clickByText('返回'); await sleep(500);
  // 开局
  await clickByText('开始远征'); await sleep(700); await shot('09-charsel');
  await clickByText('→'); await sleep(600); await shot('10-mapsel');
  await page.evaluate(() => {
    const list = document.querySelectorAll('.screen:not(.hidden) .btn-row .btn.primary');
    list[list.length - 1].click();
  });
  await page.waitForFunction(() => Debug.state() === 'run', null, { timeout: 15000 });
  await sleep(5000); await shot('11-run');
  await page.evaluate(() => {
    const run = Debug.run();
    if (Entities.gainXP) Entities.gainXP(run, run.xpNeed + 1); else run.xp = run.xpNeed + 1;
  });
  await sleep(900); await shot('12-levelup');
  await page.keyboard.press('Escape'); await sleep(500); await shot('13-pause');
  await browser.close();
  server.close();
  console.log('all ui shots -> ' + OUT);
})().catch(err => { console.error(err); process.exit(1); });
