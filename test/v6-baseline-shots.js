// Real-browser V6 baseline: four target viewports, key screens and first-load timing.
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
const OUT = path.join(ROOT, 'shots', 'v6-baseline');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp'
};

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
  const report = { url: URL, screens: [] };

  async function newPage(viewport) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
    return { page, errors };
  }

  async function load(page) {
    const t0 = Date.now();
    await page.goto(URL);
    await page.waitForFunction(() => window.SpriteGen && SpriteGen.atlasStatus().loaded, null, { timeout: 15000 });
    await page.waitForTimeout(300);
    const loadMs = Date.now() - t0;
    const perf = await page.evaluate(() => {
      const entries = performance.getEntriesByType('resource').filter(e => e.name.includes('/assets/'));
      return {
        resources: entries.length,
        atlasMs: Math.max(0, ...entries.map(e => e.responseEnd - e.startTime)),
        fonts: document.fonts.check('700 96px "Darktide Gothic"')
      };
    });
    return { loadMs, perf };
  }

  async function shot(page, name) {
    const file = name + '.png';
    await page.screenshot({ path: path.join(OUT, file) });
    report.screens.push(file);
    console.log('  shot ' + file);
  }

  async function skipIntro(page) {
    try {
      await page.mouse.click(page.viewportSize().width / 2, page.viewportSize().height / 2);
      await page.waitForTimeout(700);
    } catch (e) { /* already past intro */ }
  }

  async function toMenu(page) {
    await skipIntro(page);
    await page.waitForSelector('.menu-screen:not(.hidden)', { timeout: 10000 });
  }

  async function startRun(page) {
    await page.getByText('开始远征').first().click();
    await page.waitForSelector('.character-select-screen:not(.hidden)');
    await page.waitForTimeout(350);
    await page.getByText('下一步').click();
    await page.waitForTimeout(350);
    await page.getByText('出发').click();
    await page.waitForFunction(() => Debug.state() === 'run' && !!Debug.run(), null, { timeout: 10000 });
    await page.waitForTimeout(1600);
  }

  // ---- 1280x720 full flow with timing ----
  {
    const { page, errors } = await newPage({ width: 1280, height: 720 });
    const timing = await load(page);
    report.load1280 = timing;
    console.log('LOAD 1280x720 ' + JSON.stringify(timing));
    await shot(page, '1280x720-01-title');
    await toMenu(page);
    await shot(page, '1280x720-02-menu');
    await page.getByText('开始远征').first().click();
    await page.waitForSelector('.character-select-screen:not(.hidden)');
    await page.waitForTimeout(350);
    await shot(page, '1280x720-03-chars');
    await page.getByText('下一步').click();
    await page.waitForTimeout(350);
    await shot(page, '1280x720-04-maps');
    await page.getByText('出发').click();
    await page.waitForFunction(() => Debug.state() === 'run' && !!Debug.run(), null, { timeout: 10000 });
    await page.waitForTimeout(1800);
    await shot(page, '1280x720-05-run-hud');

    // Pause
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await shot(page, '1280x720-06-pause');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => Debug.state() === 'run', null, { timeout: 5000 });

    // Level-up overlay
    await page.evaluate(() => { const r = Debug.run(); r.pendingLevels = 1; });
    await page.waitForFunction(() => Debug.state() === 'levelup', null, { timeout: 5000 });
    await page.waitForTimeout(500);
    await shot(page, '1280x720-07-levelup');
    await page.evaluate(() => {
      const card = document.querySelector('.modal:not(.hidden) .lu-card');
      if (card) card.click();
      const r = Debug.run(); r.pendingLevels = 0;
    });
    await page.waitForFunction(() => Debug.state() === 'run', null, { timeout: 5000 });

    // Boss fight (slime king visual vertical slice with banner)
    await page.evaluate(() => {
      const r = Debug.run();
      Entities.clearEnemies(r); Weapons.reset();
      r.player.hp = r.player.maxHp = 1000000000;
      const boss = Entities.spawnEnemy(r, 'boss_slimeking', r.player.x + 220, r.player.y - 30, { allowNear: true });
      r.boss = boss;
    });
    await page.waitForTimeout(900);
    await shot(page, '1280x720-08-boss-fight');

    // Result
    await page.evaluate(() => { const r = Debug.run(); r.over = true; r.victory = false; });
    await page.waitForFunction(() => Debug.state() === 'result', null, { timeout: 8000 });
    await page.waitForTimeout(500);
    await shot(page, '1280x720-09-result');

    // Training ground: back to menu, open char select, enter training
    const back = page.locator('.screen:not(.hidden) .btn', { hasText: '返回' }).first();
    if (await back.count()) { await back.click(); await page.waitForTimeout(600); }
    await toMenu(page);
    await page.getByText('开始远征').first().click();
    await page.waitForSelector('.character-select-screen:not(.hidden)');
    await page.locator('.character-select-screen:not(.hidden) button', { hasText: '训练场' }).click();
    await page.waitForFunction(() => Debug.state() === 'run' && !!Debug.run() && Debug.run().testMode, null, { timeout: 8000 });
    await page.waitForTimeout(1200);
    await shot(page, '1280x720-10-training');
    await page.close();
    if (errors.length) throw new Error('1280x720 errors: ' + [...new Set(errors)].join(' | '));
  }

  // ---- Three remaining target viewports ----
  for (const viewport of [
    { width: 960, height: 540 },
    { width: 390, height: 844 },
    { width: 844, height: 390 }
  ]) {
    const tag = viewport.width + 'x' + viewport.height;
    const { page, errors } = await newPage(viewport);
    await load(page);
    await shot(page, tag + '-01-title');
    await toMenu(page);
    await shot(page, tag + '-02-menu');
    await page.getByText('开始远征').first().click();
    await page.waitForSelector('.character-select-screen:not(.hidden)');
    await page.waitForTimeout(350);
    await shot(page, tag + '-03-chars');
    await page.getByText('下一步').click();
    await page.waitForTimeout(350);
    await shot(page, tag + '-04-maps');
    await page.getByText('出发').click();
    await page.waitForFunction(() => Debug.state() === 'run' && !!Debug.run(), null, { timeout: 10000 });
    await page.waitForTimeout(1600);
    await shot(page, tag + '-05-run-hud');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await shot(page, tag + '-06-pause');
    await page.close();
    if (errors.length) throw new Error(tag + ' errors: ' + [...new Set(errors)].join(' | '));
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  console.log('\n=== V6 baseline screenshots complete ===');
  console.log(JSON.stringify(report, null, 2));
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
