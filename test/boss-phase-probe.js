// boss-phase-probe.js — verifies that the Abyss Eye's split is a real,
// reward-safe two-body phase rather than a cosmetic flag.
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const PW = process.env.PW_ROOT || path.join(process.env.LOCALAPPDATA || process.env.TEMP, 'Temp', 'pwshot', 'node_modules', 'playwright');
const { chromium } = require(PW);
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
function assert(value, message) { if (!value) throw new Error(message); }

(async () => {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(() => SpriteGen.atlasStatus().loaded);
  const state = await page.evaluate(() => {
    Entities.reset();
    const player = Entities.makePlayer(CFG.CHARS[0]);
    const run = {
      t: 900, frame: 60, map: CFG.MAPS[0], player, weapons: [], passives: {}, seen: {},
      coopHpMul: 1, kills: 0, bossesKilled: 0, dmgTotal: 0,
      cb: { onWarn: function () {}, onBoss: function () {} }
    };
    Entities.recomputeStats(run); player.hp = player.stats.hp;
    const eye = Entities.spawnEnemy(run, 'boss_abysseye', 440, 0, { allowNear: true });
    run.boss = eye;
    const phaseOneMax = eye.maxHp;
    Entities.damageEnemy(run, eye, phaseOneMax + 1000, { noCrit: true });
    const parts = Entities.pool.filter(e => e.alive && e.bossType === 'boss_abysseye' && e.phase2);
    const roles = parts.map(e => e.eyeRole).sort();
    const totalMax = parts.reduce((sum, e) => sum + e.maxHp, 0);
    const totalHp = parts.reduce((sum, e) => sum + e.hp, 0);
    let peakChargeSpeed = 0;
    for (let tick = 0; tick < 220; tick++) {
      run.frame++;
      Entities.updateEnemies(run, 1 / 60);
      const charger = parts.find(e => e.alive && e.eyeRole === 'charger');
      if (charger) peakChargeSpeed = Math.max(peakChargeSpeed, Math.hypot(charger.vx, charger.vy));
    }
    const phaseShots = Entities.getShots().filter(shot => shot.alive).length;
    const chestCount = () => Entities.getItems().filter(item => item.alive && item.type === 'chest').length;
    const before = chestCount();
    Entities.damageEnemy(run, parts[0], parts[0].hp + 1000, { noCrit: true });
    const afterFirst = { chest: chestCount(), bossesKilled: run.bossesKilled, remaining: Entities.pool.filter(e => e.alive && e.bossType === 'boss_abysseye').length };
    const last = Entities.pool.find(e => e.alive && e.bossType === 'boss_abysseye');
    Entities.damageEnemy(run, last, last.hp + 1000, { noCrit: true });
    return { phaseOneMax, count: parts.length, roles, totalMax, totalHp, phaseShots, peakChargeSpeed, barName: run.bossBarName,
      before, afterFirst, finalChest: chestCount(), finalBossesKilled: run.bossesKilled };
  });
  assert(state.count === 2 && state.roles.join(',') === 'caster,charger', 'split must create caster and charger: ' + JSON.stringify(state));
  assert(state.totalMax === state.phaseOneMax * 2 && state.totalHp === state.totalMax, 'split health must be exactly doubled: ' + JSON.stringify(state));
  assert(state.phaseShots > 0 && state.peakChargeSpeed >= 450, 'split roles did not fire/charge: ' + JSON.stringify(state));
  assert(state.afterFirst.chest === state.before && state.afterFirst.bossesKilled === 0 && state.afterFirst.remaining === 1,
    'first eye kill must not settle encounter twice: ' + JSON.stringify(state));
  assert(state.finalChest === state.before + 1 && state.finalBossesKilled === 1, 'second eye kill must settle once: ' + JSON.stringify(state));
  assert(errors.length === 0, 'browser errors: ' + errors.join('; '));
  console.log('BOSS OK   abyss eye splits into two roles, doubles phase health, and rewards once');
  await browser.close(); await new Promise(resolve => server.close(resolve));
})().catch(error => { console.error(error); process.exitCode = 1; });
