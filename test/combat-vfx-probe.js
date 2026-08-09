// combat-vfx-probe.js - 真实浏览器像素探针：验证特斯拉电塔、剑气与箭矢的渲染方向/尺寸。
// 当前会话无法直接“看”截图，改用前后两帧画布差分的包围盒与颜色统计来验收。
'use strict';

const path = require('path');
const http = require('http');
const fs = require('fs');
const PW = process.env.PW_ROOT ||
  path.join(process.env.LOCALAPPDATA || process.env.TMPDIR || '/tmp', 'Temp', 'pwshot', 'node_modules', 'playwright');
let chromium;
try { chromium = require(PW).chromium; }
catch (e) { chromium = require(path.join(process.env.TEMP || '/tmp', 'pwshot', 'node_modules', 'playwright')).chromium; }

const ROOT = path.join(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

function filteredBBox(fg, bg, w, h, threshold) {
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const dr = fg.data[o] - bg.data[o];
    const dg = fg.data[o + 1] - bg.data[o + 1];
    const db = fg.data[o + 2] - bg.data[o + 2];
    if (dr * dr + dg * dg + db * db > threshold) mask[i] = 1;
  }
  const keep = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    const x = i % w, y = Math.floor(i / w);
    let neighbors = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (mask[ny * w + nx]) neighbors++;
      }
    }
    if (neighbors >= 3) keep[i] = 1;
  }
  let minX = w, minY = h, maxX = -1, maxY = -1, count = 0;
  for (let i = 0; i < w * h; i++) {
    if (!keep[i]) continue;
    const x = i % w, y = Math.floor(i / w);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    count++;
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, count };
}

function maskTotal(fg, bg, w, h, threshold) {
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const dr = fg.data[o] - bg.data[o];
    const dg = fg.data[o + 1] - bg.data[o + 1];
    const db = fg.data[o + 2] - bg.data[o + 2];
    if (dr * dr + dg * dg + db * db > threshold) n++;
  }
  return n;
}

function colorCount(fg, w, h, match) {
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (match(fg.data[o], fg.data[o + 1], fg.data[o + 2])) n++;
  }
  return n;
}

(async () => {
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
  page.on('pageerror', err => errors.push('pageerror: ' + err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console.error: ' + msg.text()); });

  await page.goto(URL);
  await page.waitForFunction(() => window.SpriteGen && SpriteGen.atlasStatus().loaded, null, { timeout: 10000 });
  await page.mouse.click(640, 360);
  await page.getByText('开始远征').click();
  await page.getByText('下一步').click();
  await page.getByText('出发').click();
  await page.waitForFunction(() => Debug.state() === 'run' && !!Debug.run(), null, { timeout: 10000 });

  await page.evaluate(() => {
    const run = Debug.run();
    Entities.clearEnemies(run);
    run.weapons.length = 0;
    run.passives = {};
    Entities.recomputeStats(run);
    run.player.x = 0;
    run.player.y = 0;
    run.player.hp = run.player.maxHp = 1000000000;
    FX.setCfg({ ambient: false });
    FX.reset();

    window.__clearProbeBullets = function () {
      const bs = Weapons.getBullets();
      for (let i = 0; i < bs.length; i++) bs[i].alive = false;
    };
    window.__setProbeBullet = function (cfg) {
      const run2 = Debug.run();
      const bs = Weapons.getBullets();
      for (let i = 0; i < bs.length; i++) bs[i].alive = false;
      const b = bs[0];
      b.alive = true;
      b.kind = cfg.kind || 'straight';
      b.spr = cfg.spr;
      b.x = cfg.x; b.y = cfg.y;
      b.vx = cfg.vx || 0; b.vy = cfg.vy || 0;
      b.ttl = cfg.ttl || 8; b.born = run2.t;
      b.dmg = 0; b.pierce = 9999; b.size = cfg.size || 16; b.knock = 0;
      b.angle = cfg.angle || 0; b.spin = 0; b.phase = 0;
      b.owner = run2.player; b.ownerX = run2.player.x; b.ownerY = run2.player.y;
      b.slow = 0; b.slowDur = 0; b.stun = 0; b.aux = 0; b.aux2 = 0;
      b.evolved = false; b.blessed = false;
      b.zapFlash = cfg.zapFlash || 0;
      if (!b.hitCd) { b.hitCd = new Map(); b.hitSet = new Set(); }
      b.hitCd.clear(); b.hitSet.clear();
    };
    window.__sampleProbe = function (cfg) {
      const c = document.getElementById('game');
      const ctx = c.getContext('2d');
      const cam = Engine.cam;
      const cx = Math.round(CFG.GAME.W / 2 + cfg.x - cam.x);
      const cy = Math.round(CFG.GAME.H / 2 + cfg.y - cam.y);
      const left = cx - Math.floor(cfg.w / 2);
      const top = cy - Math.floor(cfg.h / 2);
      return {
        data: Array.from(ctx.getImageData(left, top, cfg.w, cfg.h).data),
        w: cfg.w, h: cfg.h, left, top
      };
    };
  });
  await page.waitForTimeout(250);

  async function diffShot(cfg, threshold) {
    await page.evaluate(() => { FX.reset(); });
    await page.evaluate(() => window.__clearProbeBullets());
    await page.waitForTimeout(50);
    const bg = await page.evaluate(c => window.__sampleProbe(c), { x: cfg.x, y: cfg.y, w: cfg.w, h: cfg.h });
    await page.evaluate(c => window.__setProbeBullet(c), cfg);
    await page.waitForTimeout(50);
    const fg = await page.evaluate(c => window.__sampleProbe(c), { x: cfg.x, y: cfg.y, w: cfg.w, h: cfg.h });
    return {
      bg, fg,
      box: filteredBBox(fg, bg, cfg.w, cfg.h, threshold),
      total: maskTotal(fg, bg, cfg.w, cfg.h, threshold)
    };
  }

  // 特斯拉电塔：经典塔形，尺寸明显大于旧 32px 精灵，且铜线圈/电球可被像素识别。
  const tower = await diffShot({ spr: 'p_turret', kind: 'turret', x: 220, y: 0, size: 16, w: 170, h: 210, ttl: 10, zapFlash: 0.4 }, 1400);
  assert(tower.box.w >= 64, 'tower too narrow: ' + tower.box.w + 'px');
  assert(tower.box.h >= 108, 'tower too short: ' + tower.box.h + 'px');
  const copper = colorCount(tower.fg, tower.fg.w, tower.fg.h, (r, g, b) =>
    r >= 150 && r <= 235 && g >= 95 && g <= 180 && b >= 25 && b <= 120);
  const orb = colorCount(tower.fg, tower.fg.w, tower.fg.h, (r, g, b) =>
    r >= 110 && r <= 245 && g >= 185 && b >= 200);
  assert(copper >= 40, 'tesla copper coil pixels too few: ' + copper);
  assert(orb >= 12, 'tesla orb pixels too few: ' + orb);
  const topCyan = (() => {
    let n = 0;
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < tower.fg.w; x++) {
        const o = (y * tower.fg.w + x) * 4;
        const r = tower.fg.data[o];
        const g = tower.fg.data[o + 1];
        const b = tower.fg.data[o + 2];
        if (r >= 130 && r <= 245 && g >= 195 && b >= 220) n++;
      }
    }
    return n;
  })();
  assert(topCyan >= 18, 'tesla orb/spark glow too weak near tower top: ' + topCyan);
  console.log(`VFX TESLA OK   bbox ${tower.box.w}x${tower.box.h} (${tower.box.count}px), copper ${copper}px, orb ${orb}px, top cyan ${topCyan}px`);

  // 剑气：发射后角度必须保持固定，不再逐帧朝速度方向旋转。
  await page.evaluate(c => window.__setProbeBullet(c), {
    spr: 'p_slash', kind: 'straight', x: 180, y: -170, vx: 240, vy: 0,
    angle: 1.23, size: 16, ttl: 6, w: 110, h: 110
  });
  await page.waitForTimeout(260);
  const slashState = await page.evaluate(() => {
    const b = Weapons.getBullets()[0];
    return { angle: b.angle, x: b.x, y: b.y };
  });
  assert(Math.abs(slashState.angle - 1.23) < 0.001,
    'slash angle rotated with velocity: ' + slashState.angle.toFixed(3));
  console.log('VFX SLASH OK   angle stays ' + slashState.angle.toFixed(3) + ' while moving horizontally');

  // 箭矢：真实横向精灵，横飞时宽 > 高，竖飞时高 > 宽，且角度不再被逐帧改写。
  const arrowH = await diffShot({ spr: 'p_arrow', kind: 'straight', x: 190, y: 170, vx: 0, vy: 0, angle: 0, size: 12, w: 84, h: 64, ttl: 6 }, 900);
  assert(arrowH.box.w > arrowH.box.h * 1.3,
    'horizontal arrow orientation wrong: ' + arrowH.box.w + 'x' + arrowH.box.h);
  assert(arrowH.box.w >= 30 && arrowH.box.h >= 8,
    'horizontal arrow too small to see: ' + arrowH.box.w + 'x' + arrowH.box.h);
  const arrowV = await diffShot({ spr: 'p_arrow', kind: 'straight', x: -190, y: 120, vx: 0, vy: 0, angle: Math.PI / 2, size: 12, w: 64, h: 84, ttl: 6 }, 900);
  assert(arrowV.box.h > arrowV.box.w * 1.3,
    'vertical arrow orientation wrong: ' + arrowV.box.w + 'x' + arrowV.box.h);
  assert(arrowV.box.h >= 30 && arrowV.box.w >= 8,
    'vertical arrow too small to see: ' + arrowV.box.w + 'x' + arrowV.box.h);
  await page.evaluate(c => window.__setProbeBullet(c), {
    spr: 'p_arrow', kind: 'straight', x: 190, y: 170, vx: 260, vy: 0,
    angle: 1.0, size: 12, ttl: 6
  });
  await page.waitForTimeout(260);
  const arrowMoving = await page.evaluate(() => {
    const b = Weapons.getBullets()[0];
    return { angle: b.angle, x: b.x, y: b.y };
  });
  assert(Math.abs(arrowMoving.angle - 1.0) < 0.001,
    'arrow angle rotated with velocity: ' + arrowMoving.angle.toFixed(3));
  const arrowMeta = await page.evaluate(() => ({
    frames: SpriteGen.frames('p_arrow').length,
    angle: Weapons.getBullets()[0].angle
  }));
  assert(arrowMeta.frames === 8, 'arrow must use the complete 8-frame flight/impact sheet, got ' + arrowMeta.frames + ' frames');
  assert(Math.abs(arrowMeta.angle - 1.0) < 0.001, 'arrow angle was rewritten during flight');
  console.log(`VFX ARROW OK   horizontal ${arrowH.box.w}x${arrowH.box.h} (${arrowH.box.count}px), vertical ${arrowV.box.w}x${arrowV.box.h} (${arrowV.box.count}px), 8 frames`);

  await browser.close();
  await new Promise(resolve => server.close(resolve));
  if (errors.length) throw new Error([...new Set(errors)].join('\n'));
  console.log('VFX OK    real-browser tower/slash/arrow pixel acceptance passed');
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
