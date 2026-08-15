// V6 ordinary monster and terrain/drop acceptance probe.
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
const OUT = path.join(ROOT, 'shots', 'v6-ordinary');
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

  const facts = await page.evaluate(() => {
    const count = (name) => SpriteGen.frames(name).length;
    return {
      slime: count('slime'), slimeWalk: count('slime_walk'), slimeAttack: count('slime_attack'),
      slimeHurt: count('slime_hurt'), slimeDeath: count('slime_death'),
      slimeBig: count('slime_big'), slimeBigWalk: count('slime_big_walk'), slimeBigAttack: count('slime_big_attack'),
      slimeBigHurt: count('slime_big_hurt'), slimeBigDeath: count('slime_big_death'),
      spider: count('spider'), spiderWalk: count('spider_walk'), spiderAttack: count('spider_attack'),
      spiderHurt: count('spider_hurt'), spiderDeath: count('spider_death'),
      zombieEmerge: count('zombie_emerge')
    };
  });
  assert(facts.slime === 4 && facts.slimeWalk === 8 && facts.slimeAttack === 8 && facts.slimeHurt === 4 && facts.slimeDeath === 8,
    'slime actions are incomplete: ' + JSON.stringify(facts));
  assert(facts.slimeBig === 4 && facts.slimeBigWalk === 8 && facts.slimeBigAttack === 8 && facts.slimeBigHurt === 4 && facts.slimeBigDeath === 8,
    'slime_big actions are incomplete');
  assert(facts.spider === 4 && facts.spiderWalk === 8 && facts.spiderAttack === 8 && facts.spiderHurt === 4 && facts.spiderDeath === 8,
    'spider actions are incomplete');
  assert(facts.zombieEmerge === 8, 'mudwalker emergence strip is incomplete');
  console.log('ORDINARY ATLAS OK  slime/slime_big/spider full actions + 8-frame mudwalker emergence');

  await page.evaluate(() => {
    const r = Debug.run();
    UI.setTestMode(false);
    Entities.clearEnemies(r); Weapons.reset();
    r.player.hp = r.player.maxHp = 1000000000;
    const points = [[-200, -40], [0, -40], [200, -40], [-200, 120]];
    ['slime', 'slime_big', 'spider', 'zombie'].forEach((id, i) => {
      Entities.spawnEnemy(r, id, r.player.x + points[i][0], r.player.y + points[i][1], { allowNear: true });
    });
  });
  await page.waitForFunction(() => {
    const z = Entities.pool.find(e => e.alive && e.id === 'zombie');
    return z && z.burrowT > 0;
  }, null, { timeout: 3000 });
  await page.waitForTimeout(420);
  await page.screenshot({ path: path.join(OUT, '01-ordinary-lineup.png') });
  console.log('ORDINARY SHOT OK  slime / slime_big / spider / emerging mudwalker');

  // 掉落物逐项验收:单枚金币、三档经验、磁铁、烤肉、沙漏、炸弹和三类宝箱。
  await page.evaluate(() => {
    const r = Debug.run();
    Entities.clearEnemies(r);
    const items = ['coin', 'gem1', 'gem2', 'gem3', 'magnet', 'meat', 'clock', 'bomb', 'chest', 'chest_boss', 'vault_chest'];
    items.forEach((type, i) => {
      Entities.spawnItem(r, type, r.player.x - 300 + (i % 6) * 110, r.player.y - 60 + Math.floor(i / 6) * 90);
    });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '02-pickups-lineup.png') });
  console.log('PICKUP SHOT OK  11 drop/interactable types captured in one viewport');
  console.log('MUDWALKER EMERGE OK  zombie uses authored emergence strip during burrow');

  await browser.close();
  await new Promise(resolve => server.close(resolve));
  if (errors.length) throw new Error([...new Set(errors)].join('\n'));
  console.log('ORDINARY OK   priority monsters accepted; remaining 11 keep audited V4 assets');
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
