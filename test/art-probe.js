// Real-browser acceptance test for the generated atlas and a 400-enemy render load.
'use strict';

const fs = require('fs');
const path = require('path');
const PW = process.env.PW_ROOT ||
  path.join(process.env.LOCALAPPDATA || process.env.TMPDIR || '/tmp', 'Temp', 'pwshot', 'node_modules', 'playwright');
let chromium;
try { chromium = require(PW).chromium; }
catch (e) { chromium = require(path.join(process.env.TEMP || '/tmp', 'pwshot', 'node_modules', 'playwright')).chromium; }

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'shots');
const URL = 'file://' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const mainSource = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  assert(mainSource.includes("introImg.src = 'assets/intro.jpg';"), 'original Jade intro image is not configured');
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
        fps: SpriteGen.animationFps(name, 0)
      })),
    skeleton: SpriteGen.frames('skeleton').map(c => [c.width, c.height]),
    slimeKing: SpriteGen.frames('boss_slimeking').map(c => [c.width, c.height]),
    skeletonFps: SpriteGen.animationFps('skeleton', 0),
    slimeKingFps: SpriteGen.animationFps('boss_slimeking', 0),
    knightScale: SpriteGen.renderScale('char_knight'),
    bossScale: SpriteGen.renderScale('boss_slimeking')
  }));
  assert(atlas.status.count === 13, 'expected 13 atlas assets, got ' + atlas.status.count);
  for (const hero of atlas.heroes) {
    assert(JSON.stringify(hero.frames) === '[[32,32],[32,32],[32,32],[32,32]]',
      hero.name + ' atlas frames are incorrect');
    assert(hero.fps === 8, hero.name + ' animation fps is incorrect');
  }
  assert(JSON.stringify(atlas.skeleton) === '[[32,32],[32,32],[32,32],[32,32]]', 'skeleton atlas frames are incorrect');
  assert(JSON.stringify(atlas.slimeKing) === '[[48,48],[48,48],[48,48],[48,48]]', 'slime king atlas frames are incorrect');
  assert(atlas.skeletonFps === 7 && atlas.slimeKingFps === 5, 'enemy animation fps values are incorrect');
  assert(atlas.knightScale === 0.75 && Math.abs(atlas.bossScale - 0.666667) < 0.00001,
    'atlas art scales are incorrect');
  console.log('ATLAS OK  13 assets, 37 frames, per-sprite timing and art scales');

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
      menuBackground: Debug.menuBackground()
    };
  });
  assert(theme.font.includes('Fusion Pixel'), 'Fusion Pixel font is not active');
  assert(theme.buttonSkin.includes('button-neutral-0.png'), 'Dark Dwellers button skin is not active');
  assert(theme.panelSkin.includes('panel-base.png'), 'Dark Dwellers panel skin is not active');
  assert(theme.menuBackground.loaded && theme.menuBackground.src.includes('menu-monolith.png'),
    'menu background asset was not loaded');
  console.log('THEME OK  local OFL font, CC0 controls, panels and menu background');
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
  if (errors.length) throw new Error([...new Set(errors)].join('\n'));
  console.log('ART OK    real-browser atlas, render and load acceptance passed');
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
