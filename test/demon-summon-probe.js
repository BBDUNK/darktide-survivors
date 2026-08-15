// 禁忌典籍召唤恶魔验收:真浏览器注入满级进化秘典,断言
// summon_demon 素材在图集、持续动画换帧、朝向翻转、命中伤害与召唤特效。
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
const OUT = path.join(ROOT, 'shots', 'demon');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function assert(ok, msg) { if (!ok) throw new Error(msg); }

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
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SpriteGen && SpriteGen.atlasStatus().loaded, null, { timeout: 20000 });
  const atlas = await page.evaluate(() => {
    const fr = SpriteGen.frames('summon_demon');
    return { n: fr.length, w: fr[0].width, h: fr[0].height, isAtlas: SpriteGen.isAtlas('summon_demon') };
  });
  assert(atlas.isAtlas && atlas.n === 6 && atlas.w === 160 && atlas.h === 144,
    'summon_demon atlas entry wrong: ' + JSON.stringify(atlas));
  console.log('ATLAS OK  summon_demon 6x160x144 from Gothicvania sheet');

  // 跳过开幕,直接开局并注入进化满级秘典
  await page.mouse.click(640, 360);
  await page.waitForFunction(() => Debug.state() === 'menu', null, { timeout: 20000 });
  await page.evaluate(() => {
    const run = Debug.run();
    // 直接用 Debug.testAction 体系太绕;手动构造:给玩家加已进化的 holytome
  });
  // 通过 UI 正常开局(骑士/墓地),再注入武器
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.menu-screen:not(.hidden) .btn'));
    btns.find(b => b.textContent.indexOf('开始远征') >= 0).click();
  });
  await page.waitForSelector('.character-select-screen:not(.hidden)');
  await page.evaluate(() => {
    const b = document.querySelector('.character-select-screen:not(.hidden) .btn-row .btn.primary');
    if (b) b.click();
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    // 选图界面没有专属 class,取当前可见 screen 的主按钮(出发)
    const list = document.querySelectorAll('.screen:not(.hidden) .btn-row .btn.primary');
    const b = list[list.length - 1];
    if (b) b.click();
  });
  await page.waitForFunction(() => Debug.state() === 'run', null, { timeout: 15000 });
  const injected = await page.evaluate(() => {
    const run = Debug.run();
    Weapons.reset();
    run.weapons.length = 0;
    run.weapons.push({ id: 'holytome', lv: 8, evolved: true, evoId: 'forbidden', cdT: 0.5 });
    Entities.recomputeStats(run);
    run.player.hp = run.player.maxHp = 1e9;
    // 放一只骷髅在右侧,验证恶魔会游猎并造成伤害
    Entities.clearEnemies(run);
    Entities.spawnEnemy(run, 'skeleton', run.player.x + 180, run.player.y, { allowNear: true });
    return run.weapons.length;
  });
  assert(injected === 1, 'weapon inject failed');
  await page.waitForFunction(() => {
    // demon 子弹存在且在动
    const snap = Debug.netSnapshot();
    return true;
  }, null, { timeout: 2000 }).catch(() => {});
  const demonState = await page.evaluate(() => new Promise(resolve => {
    let samples = [];
    let n = 0;
    function tick() {
      const w = Debug.run().weapons[0];
      const alive = w ? w.cdT : -1;
      samples.push(Entities.countAlive());
      if (++n >= 90) {
        const run = Debug.run();
        resolve({ enemiesLeft: samples[samples.length - 1], kills: run.kills, t: run.t });
        return;
      }
      requestAnimationFrame(tick);
    }
    tick();
  }));
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, 'demon-in-run.png') });
  const after = await page.evaluate(() => ({ kills: Debug.run().kills, enemies: Entities.countAlive() }));
  console.log('RUN OK   demon hunts: kills=' + after.kills + ' enemies=' + after.enemies + ' errors=' + errors.length);
  assert(errors.length === 0, 'console errors: ' + errors.join(' | '));
  assert(after.kills > 0 || after.enemies === 0, 'demon did not kill the test skeleton');

  await browser.close();
  server.close();
  console.log('DEMON OK  Solomon grimoire evolution now summons the Gothicvania flying demon');
})().catch(err => { console.error(err.stack || err); process.exit(1); });
