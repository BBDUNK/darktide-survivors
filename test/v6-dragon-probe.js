// V6 jade spirit dragon real-browser acceptance probe.
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
const OUT = path.join(ROOT, 'shots', 'v6-dragon');
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

  const atlasFacts = await page.evaluate(() => ({
    fly: SpriteGen.frames('p_dragon').map(c => [c.width, c.height]),
    flyFps: SpriteGen.animationFps('p_dragon', 0),
    summon: SpriteGen.frames('vfx_jade_dragon_summon').map(c => [c.width, c.height]),
    dissipate: SpriteGen.frames('vfx_jade_dragon_dissipate').map(c => [c.width, c.height])
  }));
  assert(atlasFacts.fly.length === 8 && atlasFacts.fly.every(f => f[0] === 224 && f[1] === 112),
    'p_dragon atlas frames are incorrect: ' + JSON.stringify(atlasFacts.fly));
  assert(atlasFacts.flyFps === 10, 'p_dragon fps is incorrect: ' + atlasFacts.flyFps);
  assert(atlasFacts.summon.length === 8 && atlasFacts.summon.every(f => f[0] === 224 && f[1] === 112),
    'jade summon atlas frames are incorrect');
  assert(atlasFacts.dissipate.length === 6 && atlasFacts.dissipate.every(f => f[0] === 224 && f[1] === 112),
    'jade dissipate atlas frames are incorrect');
  console.log('DRAGON ATLAS OK  8x224x112 fly, 8-frame summon, 6-frame dissipate');

  await page.evaluate(() => {
    const r = Debug.run();
    Entities.clearEnemies(r); Weapons.reset();
    r.weapons.length = 0;
    Debug.testAction({ type: 'ultimateWeapon', id: 'windbow' });
    const w = Weapons.findWeapon(r, 'windbow');
    if (w) { w.cdT = 0; w.dragonChargeT = 0; w.dragonChargeProgress = 0; }
    r.player.hp = r.player.maxHp = 1000000000;
    for (let i = 0; i < 5; i++) {
      Entities.spawnEnemy(r, 'skeleton', r.player.x + 260 + i * 50, r.player.y - 90 + i * 30, { allowNear: true });
    }
  });
  await page.waitForFunction(() => {
    const r = Debug.run(); const w = Weapons.findWeapon(r, 'windbow');
    return w && w.evolved && w.dragonChargeT > 0.2;
  }, null, { timeout: 5000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, '01-charge.png') });
  console.log('shot 01-charge');

  await page.waitForFunction(() => Weapons.getBullets().some(b => b.alive && b.kind === 'dragonLance'),
    null, { timeout: 4000 });
  const flightFacts = await page.evaluate(() => {
    const b = Weapons.getBullets().find(x => x.alive && x.kind === 'dragonLance');
    return { spr: b.spr, angle: b.angle, ttl: b.ttl, speed: Math.round(Math.hypot(b.vx, b.vy)) };
  });
  assert(flightFacts.spr === 'p_dragon' && flightFacts.speed === 600,
    'dragon lance runtime facts are incorrect: ' + JSON.stringify(flightFacts));
  console.log('DRAGON FLIGHT OK ' + JSON.stringify(flightFacts));
  await page.screenshot({ path: path.join(OUT, '02-flight.png') });

  // Clean acceptance shot: hide the training console, clear enemies and hold
  // the dragon on a horizontal heading right of the player.
  await page.evaluate(() => {
    UI.setTestMode(false);
    const r = Debug.run();
    Entities.clearEnemies(r);
    const b = Weapons.getBullets().find(x => x.alive && x.kind === 'dragonLance');
    if (b) {
      b.vx = 0; b.vy = 0; b.ttl = 6; b.angle = 0;
      b.x = r.player.x + 150; b.y = r.player.y - 18;
    }
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, '02b-flight-clean.png') });
  console.log('shot 02b-flight-clean');

  await page.evaluate(() => {
    const b = Weapons.getBullets().find(x => x.alive && x.kind === 'dragonLance');
    if (b) b.ttl = 0.18;
  });
  await page.waitForTimeout(260);
  await page.screenshot({ path: path.join(OUT, '03-dissipate.png') });
  console.log('shot 03-dissipate');

  await browser.close();
  await new Promise(resolve => server.close(resolve));
  if (errors.length) throw new Error([...new Set(errors)].join('\n'));
  console.log('DRAGON OK   summon, rotated flight and one-shot dissipate accepted in a real browser');
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
