// V6 dark lord real-browser acceptance: P1/P2 skills, transform, gate and death.
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
const OUT = path.join(ROOT, 'shots', 'v6-darklord');
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
    p1: SpriteGen.frames('boss_darklord').length,
    attack: SpriteGen.frames('boss_darklord_attack').length,
    transform: SpriteGen.frames('boss_darklord_transform').length,
    charge: SpriteGen.frames('boss_darklord_charge').length,
    breath: SpriteGen.frames('boss_darklord_phase2_breath').length,
    death: SpriteGen.frames('boss_darklord_death').length,
    gate: SpriteGen.frames('vfx_darklord_escape_gate').length,
    rain: SpriteGen.frames('vfx_darklord_blackflame_rain').length
  }));
  assert(atlasFacts.p1 === 8 && atlasFacts.attack === 8 && atlasFacts.transform === 8 &&
    atlasFacts.charge === 8 && atlasFacts.breath === 8 && atlasFacts.death === 8 &&
    atlasFacts.gate === 4 && atlasFacts.rain === 8,
    'mixed V4 P1 / V6 P2 dark lord strips are incorrect: ' + JSON.stringify(atlasFacts));
  console.log('DARKLORD ATLAS OK   V4 P1 + V6 P2 mixed strips');

  await page.evaluate(() => {
    const r = Debug.run();
    UI.setTestMode(false);
    Entities.clearEnemies(r); Weapons.reset();
    r.player.hp = r.player.maxHp = 1000000000;
    const boss = Entities.spawnEnemy(r, 'boss_darklord', r.player.x + 260, r.player.y - 30, { allowNear: true });
    if (boss) { r.boss = boss; boss.aiT = 0; boss.skillCycle = 0; }
  });
  const drive = (cycle) => page.evaluate((cycle) => {
    const r = Debug.run(); const b = r.boss;
    if (!b) return false;
    b.bossAction = 'idle'; b.bossActionTick = r.frame; b.bossActionPhase = 0;
    b.bossSkill = ''; b.skillT = 0; b.aiT = 0; b.skillCycle = cycle;
    b.stiffT = 0; b.chargeSeq = 0; b.chargePhase = 0; b.guard = 0; b.dying = false; b.transformT = 0;
    return true;
  }, cycle);

  const p1Skills = [['blade', 3], ['split', 4], ['slash', 5], ['curse', 6]];
  for (const [name, cycle] of p1Skills) {
    await drive(cycle);
    await page.waitForFunction(({ name }) => {
      const b = Debug.run().boss;
      return b && b.alive && b.bossSkill === name && b.bossActionPhase >= 1;
    }, { name }, { timeout: 6000 });
    await page.waitForTimeout(name === 'slash' ? 700 : 500);
    await page.screenshot({ path: path.join(OUT, '01-p1-' + name + '.png') });
    console.log('DARKLORD P1 OK  ' + name);
  }

  // Transform into P2: 5M health, authored transform strip, gate opens.
  await page.evaluate(() => {
    const r = Debug.run();
    r.pendingLevels = 0;
    const card = document.querySelector('.modal:not(.hidden) .lu-card');
    if (card) card.click();
  });
  await page.waitForFunction(() => Debug.state() === 'run', null, { timeout: 5000 });
  const transform = await page.evaluate(() => {
    const r = Debug.run(); const b = r.boss;
    r.exitGate = r.exitGate || { x: r.player.x + 320, y: r.player.y - 80, open: false, used: false, openedAt: 0 };
    b.guard = 0; b.hp = 1;
    Entities.damageEnemy(r, b, 999999999, { noCrit: true });
    return { phase2: b.phase2, action: b.bossAction, transformT: b.transformT, hp: b.hp, gate: !!(r.exitGate && r.exitGate.open) };
  });
  assert(transform.phase2 && transform.action === 'transform' && transform.transformT > 0 &&
    transform.hp === 5000000 && transform.gate,
    'P1->P2 transform facts failed: ' + JSON.stringify(transform));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '02-transform.png') });
  console.log('DARKLORD TRANSFORM OK   ' + JSON.stringify(transform));

  const p2Skills = [['breath', 4], ['wing', 5], ['rain', 6], ['clone', 7], ['rift', 8]];
  for (const [name, cycle] of p2Skills) {
    await drive(cycle);
    await page.waitForFunction(({ name }) => {
      const b = Debug.run().boss;
      return b && b.alive && b.bossSkill === name && b.bossActionPhase >= 1;
    }, { name }, { timeout: 6000 });
    await page.waitForTimeout(name === 'wing' ? 700 : 500);
    if (name === 'wing') {
      await page.waitForFunction(() => {
        const b = Debug.run().boss;
        return b && (b.chargeSeq > 0 || b.bossAction === 'charge');
      }, null, { timeout: 3000 });
    }
    await page.screenshot({ path: path.join(OUT, '03-p2-' + name + '.png') });
    console.log('DARKLORD P2 OK  ' + name);
  }

  // Final death strip.
  await page.evaluate(() => {
    const r = Debug.run();
    r.pendingLevels = 0;
    const card = document.querySelector('.modal:not(.hidden) .lu-card');
    if (card) card.click();
  });
  await page.waitForFunction(() => Debug.state() === 'run', null, { timeout: 5000 });
  const death = await page.evaluate(() => {
    const r = Debug.run(); const b = r.boss;
    b.guard = 0; b.hp = 1;
    Entities.damageEnemy(r, b, 999999999, { noCrit: true });
    return { dying: b.dying, action: b.bossAction };
  });
  assert(death.dying && death.action === 'death', 'P2 death strip did not start');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '04-death.png') });
  await page.waitForFunction(() => { const b = Debug.run().boss; return !b || !b.alive; }, null, { timeout: 8000 });
  console.log('DARKLORD DEATH OK');

  await browser.close();
  await new Promise(resolve => server.close(resolve));
  if (errors.length) throw new Error([...new Set(errors)].join('\n'));
  console.log('DARKLORD OK   P1 four skills, transform, P2 five skills, gate and death strip accepted');
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
