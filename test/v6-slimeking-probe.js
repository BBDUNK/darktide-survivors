// V6 slime king real-browser acceptance: six skills, bossAction sync and death strip.
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
const OUT = path.join(ROOT, 'shots', 'v6-slimeking');
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

  const facts = await page.evaluate(() => ({
    idle: SpriteGen.frames('boss_slimeking').length,
    walk: SpriteGen.frames('boss_slimeking_walk').length,
    charge: SpriteGen.frames('boss_slimeking_charge').length,
    attack: SpriteGen.frames('boss_slimeking_attack').length,
    shield: SpriteGen.frames('boss_slimeking_shield').length,
    death: SpriteGen.frames('boss_slimeking_death').length,
    hurt: SpriteGen.frames('boss_slimeking_hurt').length
  }));
  assert(facts.idle === 6 && facts.walk === 8 && facts.charge === 8 && facts.attack === 8 &&
    facts.shield === 6 && facts.death === 10 && facts.hurt === 4,
    'slime king strip lengths are incorrect: ' + JSON.stringify(facts));
  console.log('SLIMEKING ATLAS OK  6 idle / 8 walk / 8 charge / 8 attack / 6 shield / 10 death / 4 hurt');

  await page.evaluate(() => {
    const r = Debug.run();
    UI.setTestMode(false);
    Entities.clearEnemies(r); Weapons.reset();
    r.player.hp = r.player.maxHp = 1000000000;
    const boss = Entities.spawnEnemy(r, 'boss_slimeking', r.player.x + 230, r.player.y - 20, { allowNear: true });
    if (boss) { r.boss = boss; boss.aiT = 0; boss.skillCycle = 0; }
  });
  const boss = () => page.evaluate(() => {
    const r = Debug.run();
    const b = r.boss || null;
    if (!b) return null;
    return {
      action: b.bossAction, phase: b.bossActionPhase, skill: b.bossSkill,
      tick: b.bossActionTick, guard: b.guard, hp: b.hp, dying: b.dying,
      slimes: Entities.countAlive ? null : 0
    };
  });
  const driveSkill = (cycle, lowHp) => page.evaluate(([cycle, lowHp]) => {
    const r = Debug.run(); const b = r.boss;
    if (!b) return false;
    b.bossAction = 'idle'; b.bossActionTick = r.frame; b.bossActionPhase = 0;
    b.bossSkill = ''; b.skillT = 0; b.aiT = 0; b.skillCycle = cycle;
    b.bounceCd = 0; b.summonCd = 0; b.shieldCd = 0;
    if (lowHp) b.hp = Math.min(b.hp, Math.floor(b.maxHp * 0.2));
    b.squash = 1; b.hop = 0; b.guard = 0;
    return true;
  }, [cycle, lowHp]);

  // fan (cycle 1) -> ring (cycle 2) -> jump (cycle 3) -> summon (cycle 4) -> shield (cycle 5)
  const skills = [
    ['fan', 0, 'attack', false], ['ring', 1, 'attack', false], ['jump', 2, 'charge', false],
    ['summon', 3, 'attack', false], ['shield', 4, 'shield', false]
  ];
  for (const [name, cycle, expectedAction, lowHp] of skills) {
    await driveSkill(cycle, lowHp);
    await page.waitForFunction(({ action }) => {
      const b = Debug.run().boss;
      return b && b.alive && b.bossAction === action && b.bossActionPhase >= 1;
    }, { action: expectedAction }, { timeout: 6000 });
    await page.waitForTimeout(name === 'shield' ? 500 : name === 'jump' ? 550 : 450);
    const state = await boss();
    assert(state && state.action === expectedAction, name + ' did not enter ' + expectedAction + ': ' + JSON.stringify(state));
    if (name === 'fan') {
      await page.waitForFunction(() => Entities.getShots().some(s => s.alive && s.sprite === 'p_boss_slimeking_acid_orb'),
        null, { timeout: 3000 });
    }
    if (name === 'shield') {
      await page.waitForFunction(() => { const b = Debug.run().boss; return b && b.guard > 0; }, null, { timeout: 3000 });
    }
    if (name === 'summon') {
      await page.waitForFunction(() => Entities.pool.filter(e => e.alive && e.id === 'slime').length >= 4,
        null, { timeout: 3000 });
    }
    await page.screenshot({ path: path.join(OUT, '01-skill-' + name + '.png') });
    console.log('SLIMEKING SKILL OK  ' + name + ' ' + JSON.stringify(state));
  }

  // low-HP multi-bounce
  await driveSkill(0, true);
  await page.waitForTimeout(800);
  console.log('BOUNCE DEBUG ' + JSON.stringify(await boss()));
  await page.waitForFunction(() => {
    const b = Debug.run().boss;
    return b && b.alive && b.bossSkill === 'bounce' && b.bossActionPhase >= 1;
  }, null, { timeout: 8000 });
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(OUT, '02-skill-bounce.png') });
  console.log('SLIMEKING BOUNCE OK');

  // Death strip: hp -> 0, animation holds death and resolves after its strip.
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
    return { dying: b.dying, action: b.bossAction, tick: b.bossActionTick };
  });
  assert(death.dying && death.action === 'death', 'boss did not enter death strip: ' + JSON.stringify(death));
  await page.waitForTimeout(420);
  await page.screenshot({ path: path.join(OUT, '03-death.png') });
  await page.waitForTimeout(900);
  console.log('DEATH DEBUG ' + JSON.stringify(await boss()));
  console.log('DEATH DEBUG2 ' + JSON.stringify(await page.evaluate(() => {
    const r = Debug.run(); const b = r.boss;
    return b ? { alive: b.alive, dying: b.dying, dyingT: b.dyingT, frame: r.frame, state: Debug.state() } : null;
  })));
  await page.waitForFunction(() => { const b = Debug.run().boss; return !b || !b.alive; }, null, { timeout: 8000 });
  console.log('SLIMEKING DEATH OK  10-frame strip resolved before loot');

  await browser.close();
  await new Promise(resolve => server.close(resolve));
  if (errors.length) throw new Error([...new Set(errors)].join('\n'));
  console.log('SLIMEKING OK   six skills, multi-bounce and death strip accepted in a real browser');
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});

