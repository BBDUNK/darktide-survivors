// Real-browser acceptance: terrain gameplay rules, decor collision and two-finger HUD input.
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const PW = process.env.PW_ROOT ||
  path.join(process.env.LOCALAPPDATA || process.env.TEMP, 'Temp', 'pwshot', 'node_modules', 'playwright');
let chromium;
try { chromium = require(PW).chromium; }
catch (_) { chromium = require(path.join(process.env.TEMP, 'pwshot', 'node_modules', 'playwright')).chromium; }

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
function assert(value, message) { if (!value) throw new Error(message); }

(async () => {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(() => SpriteGen.atlasStatus().loaded);

  const terrain = await page.evaluate(() => {
    const grave = CFG.MAPS.find(map => map.id === 'graveyard');
    const road = Engine.terrainEffect(grave, 0, Engine.roadBend(0, 0.8));
    let swamp = null;
    for (let y = -1200; y <= 1200 && !swamp; y += 8) {
      for (let x = -1200; x <= 1200; x += 8) {
        const hit = Engine.terrainEffect(grave, x, y);
        if (hit.type === 'swamp') { swamp = { x, y, mul: hit.mul }; break; }
      }
    }
    let collision = null, invalidTerrain = [], overlap = null, allDecor = [];
    Engine.forEachDecor(grave, -1800, -1800, 1800, 1800, decor => {
      const area = Engine.terrainEffect(grave, decor.x, decor.y);
      if (area.type === 'road' || area.type === 'swamp' || area.type === 'water') invalidTerrain.push({ name: decor.name, type: area.type });
      for (const other of allDecor) {
        const safe = Engine.decorVisualRadius(decor.name) + Engine.decorVisualRadius(other.name) + 18;
        if (!overlap && Math.hypot(decor.x - other.x, decor.y - other.y) < safe) overlap = { a: decor.name, b: other.name };
      }
      allDecor.push(decor);
      if (collision) return;
      const radius = Engine.decorCollisionRadius(decor.name);
      if (!radius) return;
      const body = { x: decor.x + 1, y: decor.y, r: 9 };
      Engine.resolveDecorCollision(grave, body);
      collision = { radius, distance: Math.hypot(body.x - decor.x, body.y - decor.y), name: decor.name };
    });
    return { road, swamp, collision, invalidTerrain, overlap, decorCount: allDecor.length };
  });
  assert(terrain.road.type === 'road' && Math.abs(terrain.road.mul - 1.2) < 1e-6,
    'road must increase movement speed by 20%');
  assert(terrain.swamp && Math.abs(terrain.swamp.mul - 0.6) < 1e-6,
    'graveyard swamp must reduce movement speed by 40%');
  assert(terrain.collision && terrain.collision.distance >= terrain.collision.radius + 8.9,
    'solid decor collision did not push the player outside');
  assert(terrain.invalidTerrain.length === 0, 'decor appeared on restricted terrain: ' + JSON.stringify(terrain.invalidTerrain));
  assert(!terrain.overlap, 'decor overlap: ' + JSON.stringify(terrain.overlap));
  console.log(`TERRAIN OK  road×${terrain.road.mul}, swamp×${terrain.swamp.mul}, ${terrain.collision.name} collision, ${terrain.decorCount} clear props`);

  await page.mouse.click(420, 195);
  await page.getByText('开始远征').click();
  await page.getByText('下一步').click();
  await page.getByText('出发').click();
  await page.waitForFunction(() => Debug.state() === 'run');
  const touch = await page.evaluate(() => {
    const canvas = document.getElementById('game');
    const pointer = (type, id, target, x, y) => target.dispatchEvent(new PointerEvent(type, {
      pointerId: id, pointerType: 'touch', isPrimary: id === 41, bubbles: true, cancelable: true,
      clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1
    }));
    pointer('pointerdown', 41, canvas, 120, 260);
    pointer('pointermove', 41, window, 176, 260);
    const movingBefore = Engine.touchState.active && Engine.touchState.dx > 40;
    pointer('pointerdown', 42, document.querySelector('.hud-pausebtn'), 660, 40);
    pointer('pointerup', 42, window, 660, 40);
    const pausedWhileMoving = Debug.state() === 'pause' && Engine.touchState.active;
    pointer('pointerdown', 43, document.querySelector('.hud-pausebtn'), 660, 40);
    pointer('pointerup', 43, window, 660, 40);
    const modeBefore = Weapons.getTargetModeName();
    pointer('pointerdown', 44, document.querySelector('.hud-targetbtn'), 660, 82);
    pointer('pointerup', 44, window, 660, 82);
    const targetWhileMoving = modeBefore !== Weapons.getTargetModeName() && Engine.touchState.active;
    pointer('pointerup', 41, window, 176, 260);
    // Two short, matching joystick flicks request the same dash that desktop
    // double-tapping a direction key does.
    pointer('pointerdown', 51, canvas, 120, 250); pointer('pointermove', 51, window, 180, 250); pointer('pointerup', 51, window, 180, 250);
    pointer('pointerdown', 52, canvas, 120, 250); pointer('pointermove', 52, window, 180, 250); pointer('pointerup', 52, window, 180, 250);
    const dash = Engine.consumeDash();
    return { movingBefore, pausedWhileMoving, targetWhileMoving, released: !Engine.touchState.active, dash };
  });
  assert(touch.movingBefore && touch.pausedWhileMoving && touch.targetWhileMoving && touch.released && touch.dash && touch.dash.x > 0.9,
    'two-finger movement/HUD input failed: ' + JSON.stringify(touch));
  assert(errors.length === 0, 'browser errors: ' + errors.join('; '));
  console.log('TOUCH OK  movement remains active while pause and target-mode buttons use a second finger');
  await browser.close();
  await new Promise(resolve => server.close(resolve));
})().catch(error => { console.error(error); process.exitCode = 1; });
