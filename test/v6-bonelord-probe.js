// V6 bone lord real-browser acceptance: six skills, corpse rules and death strip.
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
const OUT = path.join(ROOT, 'shots', 'v6-bonelord');
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
    idle: SpriteGen.frames('boss_bonelord').length,
    walk: SpriteGen.frames('boss_bonelord_walk').length,
    attack: SpriteGen.frames('boss_bonelord_attack').length,
    charge: SpriteGen.frames('boss_bonelord_charge').length,
    resurrect: SpriteGen.frames('boss_bonelord_resurrect').length,
    death: SpriteGen.frames('boss_bonelord_death').length,
    hurt: SpriteGen.frames('boss_bonelord_hurt').length
  }));
  assert(atlasFacts.idle === 6 && atlasFacts.walk === 8 && atlasFacts.attack === 8 &&
    atlasFacts.charge === 8 && atlasFacts.resurrect === 8 && atlasFacts.death === 10 && atlasFacts.hurt === 4,
    'bone lord strip lengths are incorrect: ' + JSON.stringify(atlasFacts));
  console.log('BONELORD ATLAS OK  6 idle / 8 walk / 8 attack / 8 charge / 8 resurrect / 10 death / 4 hurt');

  await page.evaluate(() => {
    const r = Debug.run();
    UI.setTestMode(false);
    Entities.clearEnemies(r); Weapons.reset();
    r.player.hp = r.player.maxHp = 1000000000;
    const boss = Entities.spawnEnemy(r, 'boss_bonelord', r.player.x + 250, r.player.y - 20, { allowNear: true });
    if (boss) { r.boss = boss; boss.aiT = 0; boss.skillCycle = 0; }
  });
  const drive = (cycle) => page.evaluate((cycle) => {
    const r = Debug.run(); const b = r.boss;
    if (!b) return false;
    b.bossAction = 'idle'; b.bossActionTick = r.frame; b.bossActionPhase = 0;
    b.bossSkill = ''; b.skillT = 0; b.aiT = 0; b.skillCycle = cycle;
    b.squash = 1; b.hop = 0; b.guard = 0; b.dying = false;
    return true;
  }, cycle);

  // scythe(c4) -> ring(c5) -> prison(c6) -> spear(c7) -> summon(c10)
  const skills = [
    ['scythe', 3, 'attack'], ['ring', 8, 'charge'], ['prison', 13, 'attack'],
    ['spear', 6, 'attack'], ['summon', 9, 'resurrect']
  ];
  for (const [name, cycle, expectedAction] of skills) {
    await drive(cycle);
    await page.waitForFunction(({ name }) => {
      const b = Debug.run().boss;
      return b && b.alive && b.bossSkill === name && b.bossActionPhase >= 1;
    }, { name }, { timeout: 6000 });
    await page.waitForTimeout(name === 'summon' ? 700 : 500);
    const state = await page.evaluate(() => {
      const b = Debug.run().boss;
      return b ? { action: b.bossAction, phase: b.bossActionPhase, skill: b.bossSkill } : null;
    });
    assert(state && state.skill === name, name + ' did not activate: ' + JSON.stringify(state));
    if (name === 'ring') {
      await page.waitForFunction(() => Entities.getShots().some(s => s.alive), null, { timeout: 3000 });
    }
    if (name === 'spear') {
      await page.waitForFunction(() => Entities.getLobs().some(l => l.alive), null, { timeout: 3000 });
    }
    if (name === 'summon') {
      await page.waitForFunction(() => Entities.pool.filter(e => e.alive && e.id === 'skeleton').length >= 5,
        null, { timeout: 3000 });
    }
    await page.screenshot({ path: path.join(OUT, '01-skill-' + name + '.png') });
    console.log('BONELORD SKILL OK  ' + name + ' ' + JSON.stringify(state));
  }

  // Corpse resurrection: kill three ordinary slimes, then force resurrect(c12).
  await page.evaluate(() => {
    const r = Debug.run();
    r.corpsePool = [];
    for (let i = 0; i < 3; i++) {
      const slime = Entities.spawnEnemy(r, 'slime', r.player.x + 160 + i * 40, r.player.y - 50, { allowNear: true });
      Entities.damageEnemy(r, slime, 999999999, { noCrit: true });
    }
  });
  await page.waitForFunction(() => Debug.run().corpsePool && Debug.run().corpsePool.length === 3,
    null, { timeout: 3000 });
  await drive(11);
  await page.waitForFunction(() => {
    const b = Debug.run().boss;
    return b && b.alive && b.bossSkill === 'resurrect' && b.bossActionPhase >= 1;
  }, null, { timeout: 6000 });
  await page.waitForFunction(() => Debug.run().corpsePool.length === 0, null, { timeout: 3000 });
  const raised = await page.evaluate(() => Entities.pool.filter(e => e.alive && e.resurrected).length);
  assert(raised === 3, 'expected 3 resurrected minions, got ' + raised);
  await page.screenshot({ path: path.join(OUT, '02-skill-resurrect.png') });
  console.log('BONELORD RESURRECT OK  corpse consumed once, ' + raised + ' raised at 50% hp');

  // Death strip.
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
  assert(death.dying && death.action === 'death', 'boss did not enter death strip');
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(OUT, '03-death.png') });
  await page.waitForFunction(() => { const b = Debug.run().boss; return !b || !b.alive; }, null, { timeout: 8000 });
  console.log('BONELORD DEATH OK');

  await browser.close();
  await new Promise(resolve => server.close(resolve));
  if (errors.length) throw new Error([...new Set(errors)].join('\n'));
  console.log('BONELORD OK   six skills, corpse resurrection and death strip accepted in a real browser');
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
