// Real-browser acceptance test for the generated atlas and a 400-enemy render load.
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
const OUT = path.join(ROOT, 'shots');

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
  const mainSource = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  assert(mainSource.includes("introImg.src = 'assets/intro.jpg';"), 'original Jade intro image is not configured');
  const atlasMeta = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sprites', 'atlas.json'), 'utf8'));
  const badAnchors = [];
  for (const name of Object.keys(atlasMeta.frames)) {
    for (const frame of atlasMeta.frames[name]) {
      if (frame.anchor.x < 0 || frame.anchor.y < 0 ||
          frame.anchor.x >= frame.w || frame.anchor.y >= frame.h) {
        badAnchors.push(name + '[' + frame.anchor.x + ',' + frame.anchor.y + ']');
      }
    }
  }
  assert(badAnchors.length === 0, 'atlas anchors outside frame bounds: ' + badAnchors.join(','));
  console.log('ANCHOR OK  every atlas frame anchor is inside its bounds');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', err => errors.push('pageerror: ' + err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push('console.error: ' + msg.text());
  });

  await page.goto(URL);
  await page.waitForFunction(() => window.SpriteGen && SpriteGen.atlasStatus().loaded, null, { timeout: 10000 });
  const atlas = await page.evaluate(() => ({
    status: SpriteGen.atlasStatus(),
    heroes: ['char_knight', 'char_mage', 'char_ranger', 'char_cleric', 'char_berserker', 'char_chrono']
      .map(name => ({
        name,
        frames: SpriteGen.frames(name).map(c => [c.width, c.height]),
        walk: SpriteGen.frames(name + '_walk').map(c => [c.width, c.height]),
        attack: SpriteGen.frames(name + '_attack').map(c => [c.width, c.height]),
        fps: SpriteGen.animationFps(name, 0)
      })),
    skeleton: SpriteGen.frames('skeleton').map(c => [c.width, c.height]),
    slimeKing: SpriteGen.frames('boss_slimeking').map(c => [c.width, c.height]),
    explosion: SpriteGen.frames('vfx_explosion').map(c => [c.width, c.height]),
    terrain: SpriteGen.frames('tile_graveyard').map(c => [c.width, c.height]),
    arrow: SpriteGen.frames('p_arrow').map(c => [c.width, c.height]),
    skeletonFps: SpriteGen.animationFps('skeleton', 0),
    slimeKingFps: SpriteGen.animationFps('boss_slimeking', 0),
    arrowFps: SpriteGen.animationFps('p_arrow', 0),
    knightScale: SpriteGen.renderScale('char_knight'),
    bossScale: SpriteGen.renderScale('boss_slimeking')
  }));
  assert(atlas.status.count === 143, 'expected 143 atlas assets, got ' + atlas.status.count);
  for (const hero of atlas.heroes) {
    assert(JSON.stringify(hero.frames) === '[[34,34],[34,34],[34,34],[34,34]]',
      hero.name + ' atlas frames are incorrect');
    assert(JSON.stringify(hero.walk) === '[[34,34],[34,34],[34,34],[34,34]]',
      hero.name + ' walk frames are incorrect');
    assert(JSON.stringify(hero.attack) === '[[34,34],[34,34],[34,34],[34,34]]',
      hero.name + ' attack frames are incorrect');
    assert(hero.fps === 8, hero.name + ' animation fps is incorrect');
  }
  assert(JSON.stringify(atlas.skeleton) === '[[32,32],[32,32],[32,32],[32,32]]', 'skeleton atlas frames are incorrect');
  assert(JSON.stringify(atlas.slimeKing) === '[[48,48],[48,48],[48,48],[48,48]]', 'slime king atlas frames are incorrect');
  assert(JSON.stringify(atlas.arrow) === '[[44,22]]', 'arrow atlas frames are incorrect');
  assert(atlas.skeletonFps === 7 && atlas.slimeKingFps === 5, 'enemy animation fps values are incorrect');
  assert(atlas.arrowFps === 12, 'arrow animation fps is incorrect');
  assert(atlas.knightScale === 0.72 && Math.abs(atlas.bossScale - 0.666667) < 0.00001,
    'atlas art scales are incorrect');
  assert(JSON.stringify(atlas.explosion) === '[[32,32],[32,32],[32,32],[32,32],[32,32]]',
    'explosion VFX atlas frames are incorrect');
  assert(JSON.stringify(atlas.terrain) === '[[16,16]]', 'graveyard terrain tile is incorrect');
  console.log('ATLAS OK  143 assets, 343 frames, complete hero actions, VFX and art scales');

  const animStats = await page.evaluate(() => {
    function stats(name) {
      const frames = SpriteGen.frames(name);
      const out = [];
      for (let i = 0; i < frames.length; i++) {
        const canvas = frames[i];
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let opaque = 0;
        let hash = 2166136261;
        for (let p = 0; p < pixels.length; p += 4) {
          if (!pixels[p + 3]) continue;
          opaque++;
          hash = ((hash ^ pixels[p]) * 16777619) >>> 0;
          hash = ((hash ^ pixels[p + 1]) * 16777619) >>> 0;
          hash = ((hash ^ pixels[p + 2]) * 16777619) >>> 0;
        }
        out.push({ opaque, hash: hash >>> 0 });
      }
      return out;
    }
    const names = [];
    for (const hero of ['char_knight', 'char_mage', 'char_ranger', 'char_cleric', 'char_berserker', 'char_chrono']) {
      names.push(hero + '_walk', hero + '_attack');
    }
    names.push('skeleton', 'boss_slimeking', 'vfx_explosion', 'vfx_slash', 'vfx_lightning');
    const result = {};
    for (const name of names) result[name] = stats(name);
    return result;
  });
  for (const name of Object.keys(animStats)) {
    const frames = animStats[name];
    assert(frames.length > 1, name + ' has no animation frames');
    for (let i = 0; i < frames.length; i++) {
      assert(frames[i].opaque > 8, name + ' frame ' + i + ' is nearly empty (' + frames[i].opaque + 'px)');
    }
    for (let i = 1; i < frames.length; i++) {
      assert(frames[i].hash !== frames[i - 1].hash,
        name + ' consecutive frames are pixel-identical (' + i + '/' + (i - 1) + ')');
    }
  }
  console.log('ANIM OK  hero walk/attack and enemy/VFX animations have distinct non-empty frames');

  // Skip intro and start the default knight/graveyard run through the real UI.
  await page.mouse.click(640, 360);
  await page.waitForFunction(() => document.fonts.check('16px "Fusion Pixel"'));
  await page.waitForFunction(() => Debug.menuBackground().loaded);
  const theme = await page.evaluate(() => {
    const button = document.querySelector('.menu-screen:not(.hidden) .menu-col .btn:not(.primary)');
    const panel = document.querySelector('.menu-screen:not(.hidden) .menu-board');
    return {
      font: getComputedStyle(document.body).fontFamily,
      buttonSkin: getComputedStyle(button).borderImageSource,
      panelSkin: getComputedStyle(panel).borderImageSource,
      titleFont: getComputedStyle(document.querySelector('.gothic-title')).fontFamily,
      menuBackground: Debug.menuBackground()
    };
  });
  assert(theme.font.includes('Fusion Pixel'), 'Fusion Pixel font is not active');
  assert(theme.buttonSkin.includes('button-neutral-0.png'), 'Dark Dwellers button skin is not active');
  assert(theme.panelSkin.includes('panel-base.png'), 'Dark Dwellers panel skin is not active');
  assert(theme.titleFont.includes('Darktide Gothic'), 'gothic title font is not active');
  assert(theme.menuBackground.loaded && theme.menuBackground.src.includes('menu-monolith.png'),
    'menu background asset was not loaded');
  console.log('THEME OK  local OFL body/gothic fonts, CC0 controls, panels and menu background');
  await page.getByText('开始远征').click();
  await page.getByText('下一步').click();
  await page.getByText('出发').click();
  await page.waitForFunction(() => Debug.state() === 'run' && !!Debug.run(), null, { timeout: 10000 });

  const spawned = await page.evaluate(() => {
    const run = Debug.run();
    const p = run.player;
    Entities.clearEnemies(run);
    run.weapons.length = 0;
    p.hp = p.maxHp = 1000000000;
    let count = 0;
    for (let i = 0; i < 400; i++) {
      const col = i % 25;
      const row = Math.floor(i / 25);
      const x = p.x - 500 + col * 40;
      const y = p.y - 300 + row * 40;
      if (Entities.spawnEnemy(run, 'skeleton', x, y, { allowNear: true })) count++;
    }
    return count;
  });
  assert(spawned === 400, 'could only spawn ' + spawned + ' of 400 enemies');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'art-400-enemies.png') });

  const perf = await page.evaluate(() => new Promise(resolve => {
    const samples = [];
    let previous = 0;
    function frame(now) {
      if (previous) samples.push(now - previous);
      previous = now;
      if (samples.length < 180) requestAnimationFrame(frame);
      else {
        const sorted = samples.slice().sort((a, b) => a - b);
        const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
        resolve({
          samples: samples.length,
          meanMs: mean,
          p95Ms: sorted[Math.floor(sorted.length * 0.95)],
          fps: 1000 / mean,
          alive: Entities.countAlive()
        });
      }
    }
    requestAnimationFrame(frame);
  }));
  assert(perf.alive >= 390, 'enemy population unexpectedly fell to ' + perf.alive);
  assert(perf.meanMs < 33.4, '400-enemy mean frame time is too high: ' + perf.meanMs.toFixed(2) + 'ms');
  console.log(`PERF OK   400 enemies: ${perf.fps.toFixed(1)} FPS mean, p95 ${perf.p95Ms.toFixed(1)}ms, ${perf.alive} alive`);

  await browser.close();
  await new Promise(resolve => server.close(resolve));
  if (errors.length) throw new Error([...new Set(errors)].join('\n'));
  console.log('ART OK    real-browser atlas, render and load acceptance passed');
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
