// V6 abyss eye real-browser acceptance: five P1 skills, split roles and rage rule.
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
const OUT = path.join(ROOT, 'shots', 'v6-abysseye');
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
    p1: SpriteGen.frames('boss_abysseye').length,
    split: SpriteGen.frames('boss_abysseye_split').length,
    remote: SpriteGen.frames('boss_abysseye_remote').length,
    remoteCast: SpriteGen.frames('boss_abysseye_remote_cast').length,
    remoteDeath: SpriteGen.frames('boss_abysseye_remote_death').length,
    charger: SpriteGen.frames('boss_abysseye_charge').length,
    chargerDash: SpriteGen.frames('boss_abysseye_charge_dash').length,
    chargerDeath: SpriteGen.frames('boss_abysseye_charge_death').length
  }));
  assert(atlasFacts.p1 === 6 && atlasFacts.split === 8 && atlasFacts.remote === 4 &&
    atlasFacts.remoteCast === 8 && atlasFacts.remoteDeath === 6 && atlasFacts.charger === 4 &&
    atlasFacts.chargerDash === 8 && atlasFacts.chargerDeath === 6,
    'abyss eye strips are incorrect: ' + JSON.stringify(atlasFacts));
  console.log('ABYSSEYE ATLAS OK  P1/split/remote-cast/remote-death/charger-dash/charger-death strips');

  await page.evaluate(() => {
    const r = Debug.run();
    UI.setTestMode(false);
    Entities.clearEnemies(r); Weapons.reset();
    r.player.hp = r.player.maxHp = 1000000000;
    const boss = Entities.spawnEnemy(r, 'boss_abysseye', r.player.x + 250, r.player.y - 20, { allowNear: true });
    if (boss) { r.boss = boss; boss.aiT = 0; boss.skillCycle = 0; }
  });
  const drive = (cycle) => page.evaluate((cycle) => {
    const r = Debug.run(); const b = r.boss;
    if (!b) return false;
    b.bossAction = 'idle'; b.bossActionTick = r.frame; b.bossActionPhase = 0;
    b.bossSkill = ''; b.skillT = 0; b.aiT = 0; b.skillCycle = cycle;
    b.splitT = 0; b.stiffT = 0; b.guard = 0; b.dying = false;
    return true;
  }, cycle);

  const skills = [
    ['spiral', 4], ['gaze', 5], ['well', 6], ['rift', 7], ['summon', 8]
  ];
  for (const [name, cycle] of skills) {
    await drive(cycle);
    await page.waitForFunction(({ name }) => {
      const b = Debug.run().boss;
      return b && b.alive && b.bossSkill === name && b.bossActionPhase >= 1;
    }, { name }, { timeout: 6000 });
    await page.waitForTimeout(name === 'well' ? 850 : name === 'gaze' ? 550 : 450);
    const state = await page.evaluate(() => {
      const b = Debug.run().boss;
      return b ? { action: b.bossAction, phase: b.bossActionPhase, skill: b.bossSkill } : null;
    });
    assert(state && state.skill === name, name + ' did not activate: ' + JSON.stringify(state));
    await page.screenshot({ path: path.join(OUT, '01-skill-' + name + '.png') });
    console.log('ABYSSEYE SKILL OK  ' + name + ' ' + JSON.stringify(state));
  }

  // Split into two distinct roles and keep the shared bar / once-only reward rules.
  await page.evaluate(() => {
    const r = Debug.run();
    r.pendingLevels = 0;
    const card = document.querySelector('.modal:not(.hidden) .lu-card');
    if (card) card.click();
  });
  await page.waitForFunction(() => Debug.state() === 'run', null, { timeout: 5000 });
  const split = await page.evaluate(() => {
    const r = Debug.run(); const b = r.boss;
    b.hp = 1;
    Entities.damageEnemy(r, b, 999999999, { noCrit: true });
    const parts = Entities.pool.filter(e => e.alive && e.bossType === 'boss_abysseye' && e.phase2);
    return {
      count: parts.length,
      roles: parts.map(e => e.eyeRole).sort(),
      actions: parts.map(e => e.bossAction),
      hp: parts.reduce((s, e) => s + e.hp, 0),
      max: parts.reduce((s, e) => s + e.maxHp, 0)
    };
  });
  assert(split.count === 2 && split.roles.join(',') === 'caster,charger' && split.actions.every(a => a === 'split'),
    'split roles are incorrect: ' + JSON.stringify(split));
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(OUT, '02-split.png') });
  console.log('ABYSSEYE SPLIT OK   ' + JSON.stringify(split));

  // Kill one half: survivor must rage +25% and no duplicate reward.
  await page.evaluate(() => {
    const r = Debug.run();
    const parts = Entities.pool.filter(e => e.alive && e.bossType === 'boss_abysseye' && e.phase2);
    const first = parts[0];
    Entities.damageEnemy(r, first, 999999999, { noCrit: true });
  });
  await page.waitForFunction(() =>
    Entities.pool.filter(e => e.alive && e.bossType === 'boss_abysseye' && e.phase2).length === 1,
    null, { timeout: 8000 });
  await page.screenshot({ path: path.join(OUT, '03-half-death.png') });
  const rage = await page.evaluate(() => {
    const survivor = Entities.pool.find(e => e.alive && e.bossType === 'boss_abysseye' && e.phase2);
    return { survivor: survivor ? survivor.eyeRage : -1 };
  });
  assert(rage.survivor === 1.25,
    'eye death/rage rules failed: ' + JSON.stringify(rage));
  console.log('ABYSSEYE RAGE OK   survivor attack speed x1.25, dying half uses role death strip');

  await browser.close();
  await new Promise(resolve => server.close(resolve));
  if (errors.length) throw new Error([...new Set(errors)].join('\n'));
  console.log('ABYSSEYE OK   five P1 skills, split, role strips and once-only reward rules accepted');
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
