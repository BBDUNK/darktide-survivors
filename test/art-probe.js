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
        fps: SpriteGen.animationFps(name, 0),
        walkFps: SpriteGen.animationFps(name + '_walk', 0),
        attackFps: SpriteGen.animationFps(name + '_attack', 0)
      })),
    skeleton: SpriteGen.frames('skeleton').map(c => [c.width, c.height]),
    eliteSkeleton: SpriteGen.frames('elite_skeleton_attack').map(c => [c.width, c.height]),
    merchantProne: SpriteGen.frames('merchant_prone').map(c => [c.width, c.height]),
    deadTree: SpriteGen.frames('deco_deadtree_large1').map(c => [c.width, c.height]),
    exitGate: SpriteGen.frames('exit_gate').map(c => [c.width, c.height]),
    slimeKing: SpriteGen.frames('boss_slimeking').map(c => [c.width, c.height]),
    explosion: SpriteGen.frames('vfx_explosion').map(c => [c.width, c.height]),
    holyAura: SpriteGen.frames('vfx_holy_aura').map(c => [c.width, c.height]),
    archangel: SpriteGen.frames('vfx_archangel').map(c => [c.width, c.height]),
    frostImpact: SpriteGen.frames('vfx_frost_impact').map(c => [c.width, c.height]),
    frostRadial: SpriteGen.frames('vfx_frost_radial').map(c => [c.width, c.height]),
    frostKiss: SpriteGen.frames('vfx_frost_kiss_radial').map(c => [c.width, c.height]),
    arcaneOrb: SpriteGen.frames('p_arcane_orb').map(c => [c.width, c.height]),
    teslaCannon: SpriteGen.frames('p_tesla_cannon').map(c => [c.width, c.height]),
    teslaImpact: SpriteGen.frames('vfx_tesla_cannon_impact').map(c => [c.width, c.height]),
    teslaOverload: SpriteGen.frames('vfx_tesla_overload').map(c => [c.width, c.height]),
    teslaTankActions: ['idle', 'walk', 'attack'].flatMap(action =>
      ['down', 'up', 'left', 'right'].map(dir =>
        SpriteGen.frames('tesla_battle_tank_' + action + '_' + dir).map(c => [c.width, c.height]))),
    avatars: ['knight', 'mage', 'ranger', 'cleric', 'berserker', 'chrono'].flatMap(role =>
      ['idle', 'walk', 'attack'].flatMap(action =>
        ['down', 'right', 'left', 'up'].map(dir => {
          const name = 'avatar_' + role + '_' + action + '_' + dir;
          return { name, action, frames: SpriteGen.frames(name).map(c => [c.width, c.height]),
            anchors: SpriteGen.frames(name).map(c => c._atlasAnchor || null), fps: SpriteGen.animationFps(name, 0) };
        }))),
    terrain: SpriteGen.frames('tile_graveyard').map(c => [c.width, c.height]),
    terrainV4: ['terrain_grave_ground', 'terrain_grave_swamp', 'terrain_grave_road',
      'terrain_wild_ground', 'terrain_wild_grass', 'terrain_wild_road',
      'terrain_abyss_ground', 'terrain_abyss_water', 'terrain_abyss_road']
      .map(name => SpriteGen.frames(name).map(c => [c.width, c.height])),
    gems: ['gem1', 'gem2', 'gem3', 'gem_big'].map(name => SpriteGen.frames(name).map(c => [c.width, c.height])),
    knightRight: SpriteGen.frames('char_knight_walk_right').map(c => [c.width, c.height]),
    knightLeft: SpriteGen.frames('char_knight_walk_left').map(c => [c.width, c.height]),
    knightAnchors: SpriteGen.frames('char_knight_walk_right').map(c => c._atlasAnchor || null),
    arrow: SpriteGen.frames('p_arrow').map(c => [c.width, c.height]),
    skeletonFps: SpriteGen.animationFps('skeleton', 0),
    slimeKingFps: SpriteGen.animationFps('boss_slimeking', 0),
    arrowFps: SpriteGen.animationFps('p_arrow', 0),
    tesla: SpriteGen.frames('tesla_tower').map(c => [c.width, c.height]),
    teslaFps: SpriteGen.animationFps('tesla_tower', 0),
    knightScale: SpriteGen.renderScale('char_knight'),
    bossScale: SpriteGen.renderScale('boss_slimeking')
  }));
  const totalFrames = Object.values(atlasMeta.frames).reduce((sum, frames) => sum + frames.length, 0);
  assert(atlas.status.count >= 539, 'expected at least 539 atlas assets, got ' + atlas.status.count);
  assert(totalFrames >= 3172, 'expected at least 3172 atlas frames, got ' + totalFrames);
  for (const hero of atlas.heroes) {
    const heroSize = hero.name === 'char_berserker' ? '[56,64]' : '[48,64]';
    assert(hero.frames.length === 8 && hero.frames.every(frame => JSON.stringify(frame) === heroSize),
      hero.name + ' atlas frames are incorrect');
    assert(hero.walk.length === 8 && hero.walk.every(frame => JSON.stringify(frame) === heroSize),
      hero.name + ' walk frames are incorrect');
    assert(hero.attack.length === 8 && hero.attack.every(frame => JSON.stringify(frame) === heroSize),
      hero.name + ' attack frames are incorrect');
    assert(hero.fps === 7, hero.name + ' idle animation fps is incorrect');
    assert(hero.walkFps === 11, hero.name + ' walk animation fps is incorrect');
    assert(hero.attackFps === 13, hero.name + ' attack animation fps is incorrect');
  }
  assert(atlas.avatars.length === 72, 'six roles must expose 72 four-direction avatar actions');
  for (const avatar of atlas.avatars) {
    const expectedFrames = avatar.action === 'idle' ? 4 : 8;
    const expectedFps = avatar.action === 'idle' ? 7 : (avatar.action === 'walk' ? 11 : 13);
    assert(avatar.frames.length === expectedFrames && avatar.frames.every(frame => JSON.stringify(frame) === '[64,64]'),
      avatar.name + ' frame grid is incorrect');
    assert(avatar.anchors.every(anchor => anchor && anchor.x === 32 && anchor.y === 54),
      avatar.name + ' does not share the [32,54] body pivot');
    assert(avatar.fps === expectedFps, avatar.name + ' animation fps is incorrect');
  }
  assert(atlas.skeleton.length === 8 && atlas.skeleton.every(frame => JSON.stringify(frame) === '[56,58]'), 'skeleton atlas frames are incorrect');
  assert(atlas.eliteSkeleton.length === 8 && atlas.eliteSkeleton.every(frame => JSON.stringify(frame) === '[52,60]'), 'elite skeleton attack frames are incorrect');
  assert(atlas.merchantProne.length === 8 && atlas.merchantProne.every(frame => JSON.stringify(frame) === '[96,96]'), 'merchant prone frames are incorrect');
  assert(JSON.stringify(atlas.deadTree) === '[[128,128]]', 'large dead tree frame is incorrect');
  assert(JSON.stringify(atlas.exitGate) === '[[128,192]]', 'Darklord exit gate atlas frame is incorrect');
  assert(atlas.slimeKing.length === 8 && atlas.slimeKing.every(frame => JSON.stringify(frame) === '[96,96]'), 'slime king atlas frames are incorrect');
  assert(atlas.arrow.length === 8 && atlas.arrow.every(frame => JSON.stringify(frame) === '[32,24]'), 'arrow atlas frames are incorrect');
  assert(atlas.tesla.length === 8 && atlas.tesla.every(frame => JSON.stringify(frame) === '[112,112]'), 'tesla tower atlas frame is incorrect');
  assert(atlas.skeletonFps === 7 && atlas.slimeKingFps === 6, 'enemy animation fps values are incorrect');
  assert(atlas.arrowFps === 14, 'arrow animation fps is incorrect');
  assert(atlas.teslaFps === 8, 'tesla tower animation fps is incorrect');
  assert(atlas.knightScale === 0.58 && Math.abs(atlas.bossScale - 0.72) < 0.00001,
    'atlas art scales are incorrect');
  assert(atlas.explosion.length === 8 && atlas.explosion.every(frame => JSON.stringify(frame) === '[48,48]'),
    'explosion VFX atlas frames are incorrect');
  assert(JSON.stringify(atlas.terrain) === '[[16,16]]', 'graveyard terrain tile is incorrect');
  assert(atlas.holyAura.length === 8 && atlas.holyAura.every(frame => JSON.stringify(frame) === '[96,96]'),
    'holy aura V4 frames are incorrect');
  assert(atlas.archangel.length === 8 && atlas.archangel.every(frame => JSON.stringify(frame) === '[72,88]'),
    'archangel V4 frames are incorrect');
  assert(atlas.frostImpact.length === 8 && atlas.frostImpact.every(frame => JSON.stringify(frame) === '[96,96]'),
    'frost impact V4 frames are incorrect');
  assert(atlas.frostRadial.length === 8 && atlas.frostRadial.every(frame => JSON.stringify(frame) === '[96,96]'),
    'frost radial V4 frames are incorrect');
  assert(atlas.frostKiss.length === 12 && atlas.frostKiss.every(frame => JSON.stringify(frame) === '[160,160]'),
    'V5 frost kiss must be a twelve-frame 160x160 radial ground effect');
  assert(atlas.arcaneOrb.length === 8 && atlas.arcaneOrb.every(frame => JSON.stringify(frame) === '[32,32]'),
    'V5 arcane orb frames are incorrect');
  assert(atlas.teslaCannon.length === 8 && atlas.teslaCannon.every(frame => JSON.stringify(frame) === '[80,80]'),
    'V5 Tesla cannon flight frames are incorrect');
  assert(atlas.teslaImpact.length === 10 && atlas.teslaImpact.every(frame => JSON.stringify(frame) === '[96,96]'),
    'V5 Tesla cannon impact frames are incorrect');
  assert(atlas.teslaOverload.length === 12 && atlas.teslaOverload.every(frame => JSON.stringify(frame) === '[160,160]'),
    'V5 Tesla overload ring frames are incorrect');
  assert(atlas.teslaTankActions.length === 12 && atlas.teslaTankActions.every(group =>
    group.length === 8 && group.every(frame => JSON.stringify(frame) === '[96,96]')),
    'Tesla tank does not have complete four-direction idle/walk/attack actions');
  assert(atlas.terrainV4.every(group => group.length === 1 && JSON.stringify(group[0]) === '[128,128]'),
    'V4 terrain tiles are incorrect');
  assert(atlas.gems.every(group => group.length === 1 && JSON.stringify(group[0]) === '[32,32]'),
    'V4 experience gem tiers are incorrect');
  assert(atlas.knightRight.length === 8 && atlas.knightLeft.length === 8,
    'left/right player movement animations are incomplete');
  assert(atlas.knightAnchors.length === 8 && atlas.knightAnchors.every(a => a && a.x >= 0 && a.y >= 0),
    'runtime atlas slicing discarded actor anchors');
  console.log(`ATLAS OK  ${atlas.status.count} assets, ${totalFrames} frames, four-direction hero actions, VFX and art scales`);

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
          if (pixels[p + 3]) opaque++;
          // Include transparent positions and alpha in the signature.  A
          // crisp one-pixel gait shift has identical opaque colours but is
          // still a genuinely different frame on screen.
          hash = Math.imul(hash ^ pixels[p], 16777619) >>> 0;
          hash = Math.imul(hash ^ pixels[p + 1], 16777619) >>> 0;
          hash = Math.imul(hash ^ pixels[p + 2], 16777619) >>> 0;
          hash = Math.imul(hash ^ pixels[p + 3], 16777619) >>> 0;
        }
        out.push({ opaque, hash: hash >>> 0 });
      }
      return out;
    }
    const names = [];
    for (const hero of ['char_knight', 'char_mage', 'char_ranger', 'char_cleric', 'char_berserker', 'char_chrono']) {
      names.push(hero + '_walk', hero + '_attack');
      for (const action of ['idle', 'walk', 'attack', 'hurt', 'death']) {
        for (const dir of ['down', 'right', 'left', 'up']) names.push(hero + '_' + action + '_' + dir);
      }
    }
    // The previous check sampled just skeleton.  Every shipped ordinary enemy
    // and its elite counterpart has a four-row, eight-frame action sheet;
    // validate the actual atlas output so a damaged row can never quietly
    // regress into the game again.
    const enemies = [
      'bat', 'slime', 'slime_big', 'zombie', 'skeleton', 'ghost', 'spider', 'cultist',
      'orc', 'imp', 'knight_armored', 'werewolf', 'mummy', 'gargoyle', 'bloodbat', 'wraith'
    ];
    for (const enemy of enemies) {
      for (const suffix of ['', '_walk', '_attack', '_death']) names.push(enemy + suffix);
      for (const suffix of ['', '_walk', '_attack', '_death']) names.push('elite_' + enemy + suffix);
    }
    for (const boss of ['boss_slimeking', 'boss_bonelord', 'boss_abysseye', 'boss_darklord']) {
      for (const suffix of ['', '_walk', '_charge', '_attack', '_death']) names.push(boss + suffix);
    }
    names.push('vfx_explosion', 'vfx_slash', 'vfx_lightning', 'p_arcane_orb',
      'vfx_frost_kiss_radial', 'p_tesla_cannon', 'vfx_tesla_cannon_impact', 'vfx_tesla_overload');
    for (const action of ['idle', 'walk', 'attack']) {
      for (const dir of ['down', 'up', 'left', 'right']) names.push('tesla_battle_tank_' + action + '_' + dir);
    }
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
      // Slime/spider masters have seven authored poses and deliberately hold
      // the final pose once to satisfy the common eight-frame API.  A hold is
      // acceptable only at the loop tail; every earlier transition must move.
      assert(frames[i].hash !== frames[i - 1].hash || i === frames.length - 1,
        name + ' has a frozen action transition (' + i + '/' + (i - 1) + ')');
    }
    // Some symmetrical eight-frame loops intentionally repeat a pose on the
    // return stroke (for example a bow walk cycle).  Three genuinely distinct
    // poses is the minimum readable animation; frozen adjacent frames remain
    // prohibited above.
    assert(new Set(frames.map(frame => frame.hash)).size >= Math.min(3, frames.length),
      name + ' has fewer than three visually distinct action poses');
  }
  for (const hero of ['char_knight', 'char_mage', 'char_ranger', 'char_cleric', 'char_berserker', 'char_chrono']) {
    for (const action of ['idle', 'walk', 'attack']) {
      const left = animStats[hero + '_' + action + '_left'].map(f => f.hash).join(',');
      const right = animStats[hero + '_' + action + '_right'].map(f => f.hash).join(',');
      assert(left !== right, hero + ' ' + action + ' left/right rows are identical');
    }
  }
  console.log('ANIM OK  hero, 16 ordinary enemies, 16 elite enemies, all boss and VFX actions have distinct non-empty frames');

  // Skip intro and start the default knight/graveyard run through the real UI.
  await page.mouse.click(640, 360);
  await page.waitForFunction(() => document.fonts.check('16px "Fusion Pixel"'));
  await page.waitForFunction(() => Debug.menuBackground().loaded);
  const theme = await page.evaluate(() => {
    const button = document.querySelector('.menu-screen:not(.hidden) .menu-col .btn:not(.primary)');
    const panel = document.querySelector('.menu-screen:not(.hidden) .menu-board');
    const altar = document.querySelector('.menu-screen:not(.hidden) .menu-altar');
    const altarIcon = altar.querySelector('.menu-altar-icon');
    const altarTitle = altar.querySelector('.menu-altar-title');
    return {
      font: getComputedStyle(document.body).fontFamily,
      buttonBackground: getComputedStyle(button).backgroundImage,
      buttonBorder: getComputedStyle(button).borderColor,
      panelBackground: getComputedStyle(panel).backgroundImage,
      panelBorder: getComputedStyle(panel).borderColor,
      altarBackground: getComputedStyle(altar).backgroundImage,
      altarTitle: altarTitle.textContent,
      altarIconBackground: getComputedStyle(altarIcon).backgroundImage,
      altarIconBox: [Math.round(altarIcon.getBoundingClientRect().width), Math.round(altarIcon.getBoundingClientRect().height)],
      titleFont: getComputedStyle(document.querySelector('.gothic-title')).fontFamily,
      titleText: document.querySelector('.gothic-title').textContent,
      menuBackground: Debug.menuBackground()
    };
  });
  console.log('THEME STATE ' + JSON.stringify(theme));
  assert(theme.font.includes('Fusion Pixel'), 'Fusion Pixel font is not active');
  assert(theme.buttonBackground.includes('menu_btn_frame_edge.png') || theme.buttonBackground.includes('hud_coin_frame.png'),
    'Baroque framed main-menu button skin is not active');
  assert(theme.panelBackground.includes('battle_report_panel.png') && theme.altarBackground.includes('holy_altar_panel.png'),
    'generated battle-report/altar panel art is not active');
  assert(theme.altarTitle === '强化圣坛', 'altar title should not contain a leading emoji icon');
  assert(theme.altarIconBackground.includes('altar_cross_states.png') && theme.altarIconBox[0] >= 180 && theme.altarIconBox[1] >= 160,
    'altar cross emblem does not fill its presentation frame');
  assert(theme.titleFont.includes('Darktide Gothic'), 'gothic title font is not active');
  assert(theme.titleText === 'DarkEscaper', 'DarkEscaper title text is incorrect: ' + theme.titleText);
  assert(theme.menuBackground.loaded && theme.menuBackground.src.includes('menu-monolith.png'),
    'menu background asset was not loaded');
  console.log('THEME OK  Baroque framed menu, large altar cross, authored report/altar panels, DarkEscaper title and local fonts');
  await page.getByText('开始远征').click();
  await page.waitForSelector('.character-select-screen:not(.hidden)');
  // Wait for the shared .screen fade-in to finish.  Capturing its first frame
  // makes the menu canvas appear to bleed through an otherwise opaque page.
  await page.waitForTimeout(400);
  const characterUi = await page.evaluate(() => {
    const screen = document.querySelector('.character-select-screen:not(.hidden)');
    const grid = screen.querySelector('.card-grid');
    const cards = Array.from(grid.querySelectorAll('.card'));
    const info = screen.querySelector('.info-box');
    const buttonRow = screen.querySelector('.btn-row');
    const screenBox = screen.getBoundingClientRect();
    const infoBox = info.getBoundingClientRect();
    const buttonBox = buttonRow.getBoundingClientRect();
    return {
      gridBorder: getComputedStyle(grid).borderImageSource,
      gridColumns: getComputedStyle(grid).gridTemplateColumns,
      cardBorders: cards.map(card => getComputedStyle(card).borderImageSource),
      cardBoxes: cards.map(card => [Math.round(card.getBoundingClientRect().width), Math.round(card.getBoundingClientRect().height)]),
      infoWidth: Math.round(info.getBoundingClientRect().width),
      contentBottoms: [Math.round(infoBox.bottom), Math.round(buttonBox.bottom), Math.round(screenBox.bottom)],
      infoChildBottom: Math.round(Math.max(...Array.from(info.children).map(child => child.getBoundingClientRect().bottom))),
      background: getComputedStyle(screen).backgroundImage + ' / ' + getComputedStyle(screen).backgroundColor,
      centerStack: document.elementsFromPoint(innerWidth / 2, innerHeight / 2)
        .slice(0, 8).map(el => el.tagName + '#' + el.id + '.' + el.className),
      visible: !!screen && screen.getBoundingClientRect().width > 0
    };
  });
  assert(characterUi.visible, 'character selection screen is not visible');
  assert(characterUi.gridBorder.includes('baroque_menu_frame.png'), 'character grid does not use the gapless Baroque nine-slice');
  assert(characterUi.cardBorders.every(value => value.includes('baroque_menu_frame.png')),
    'one or more character cards are missing their Baroque frame');
  assert(characterUi.cardBoxes.every(box => box[0] >= 146 && box[1] >= 142),
    'character cards are too small or clipped: ' + JSON.stringify(characterUi.cardBoxes));
  assert(characterUi.infoWidth >= 600, 'character detail panel is too narrow: ' + characterUi.infoWidth);
  assert(characterUi.contentBottoms[0] <= characterUi.contentBottoms[2] &&
    characterUi.contentBottoms[1] <= characterUi.contentBottoms[2],
    'character detail/actions are clipped below the screen: ' + JSON.stringify(characterUi.contentBottoms));
  assert(characterUi.infoChildBottom <= characterUi.contentBottoms[0],
    'character detail text overflows its frame: ' + characterUi.infoChildBottom + ' > ' + characterUi.contentBottoms[0]);
  console.log('SECONDARY UI STATE ' + JSON.stringify(characterUi));
  await page.screenshot({ path: path.join(OUT, 'v5-character-select.png') });
  console.log('SECONDARY UI OK  framed character grid/cards/detail panel fit at 1280x720');
  await page.getByText('下一步').click();
  await page.getByText('出发').click();
  await page.waitForFunction(() => Debug.state() === 'run' && !!Debug.run(), null, { timeout: 10000 });

  await page.evaluate(() => {
    const run = Debug.run();
    Entities.clearEnemies(run);
    Weapons.reset();
    run.weapons.length = 0;
    run.player.hp = run.player.maxHp = 1000000000;
    run.weapons.push({ id: 'arcanebolt', lv: 5, evolved: false, evoId: null, cdT: 0 });
    Entities.spawnEnemy(run, 'skeleton', run.player.x + 280, run.player.y, { allowNear: true });
  });
  await page.waitForFunction(() => Weapons.getBullets().some(b => b.alive && b.spr === 'p_arcane_orb'));
  const arcaneRuntime = await page.evaluate(() => {
    const b = Weapons.getBullets().find(x => x.alive && x.spr === 'p_arcane_orb');
    return { kind: b.kind, pierce: b.pierce, mark: b.arcaneMark, speed: Math.round(Math.hypot(b.vx, b.vy)) };
  });
  assert(arcaneRuntime.kind === 'homing' && arcaneRuntime.pierce === 1 && arcaneRuntime.mark,
    'Lv5 arcane orb did not unlock refraction and Void Brand: ' + JSON.stringify(arcaneRuntime));

  await page.evaluate(() => {
    const run = Debug.run();
    Entities.clearEnemies(run);
    Weapons.reset();
    run.weapons.length = 0;
    run.weapons.push({ id: 'teslacoil', lv: 8, evolved: true, evoId: 'skynet', cdT: 0 });
  });
  await page.waitForFunction(() => Weapons.getBullets().some(b => b.alive && b.kind === 'tank'));
  await page.evaluate(() => { Weapons.getBullets().find(b => b.alive && b.kind === 'tank').fireT = 0.72; });
  await page.waitForFunction(() => {
    const tank = Weapons.getBullets().find(b => b.alive && b.kind === 'tank');
    return tank && tank.tankAction === 'attack' && tank.chargeProgress > 0;
  });
  await page.waitForFunction(() => Weapons.getBullets().some(b => b.alive && b.kind === 'teslaCannon'), null, { timeout: 2500 });
  const tankRuntime = await page.evaluate(() => {
    const tank = Weapons.getBullets().find(b => b.alive && b.kind === 'tank');
    const shell = Weapons.getBullets().find(b => b.alive && b.kind === 'teslaCannon');
    return {
      direction: tank.tankDir,
      shellSprite: shell.spr,
      shellSpeed: Math.round(Math.hypot(shell.vx, shell.vy)),
      shellSize: shell.size
    };
  });
  assert(tankRuntime.shellSprite === 'p_tesla_cannon' && tankRuntime.shellSpeed === 270 && tankRuntime.shellSize >= 76,
    'Tesla tank did not fire its slow authored cannon shell: ' + JSON.stringify(tankRuntime));
  await page.waitForTimeout(320);
  await page.screenshot({ path: path.join(OUT, 'v5-tesla-tank.png') });

  await page.evaluate(() => {
    const run = Debug.run();
    Entities.clearEnemies(run);
    Weapons.reset();
    run.weapons.length = 0;
    run.weapons.push({ id: 'frostnova', lv: 8, evolved: false, evoId: null, cdT: 0 });
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI * 2 / 12;
      Entities.spawnEnemy(run, 'skeleton', run.player.x + Math.cos(a) * 120,
        run.player.y + Math.sin(a) * 120, { allowNear: true });
    }
  });
  await page.waitForFunction(() => Weapons.getBullets().some(b => b.alive && b.kind === 'nova'));
  await page.waitForTimeout(260);
  await page.screenshot({ path: path.join(OUT, 'v5-frost-kiss.png') });

  const sliceActors = await page.evaluate(() => {
    const run = Debug.run();
    Entities.clearEnemies(run);
    Weapons.reset();
    run.weapons.length = 0;
    const boss = Entities.spawnEnemy(run, 'boss_slimeking', run.player.x + 185, run.player.y - 25, { allowNear: true });
    const elite = Entities.spawnEnemy(run, 'skeleton', run.player.x - 165, run.player.y - 20, { allowNear: true, elite: true });
    boss.attackAnimT = 0.8;
    elite.attackAnimT = 0.8;
    return { boss: boss.bossType, elite: elite.eliteSkill };
  });
  assert(sliceActors.boss === 'boss_slimeking' && sliceActors.elite === 'archer',
    'vertical-slice boss/elite did not enter their dedicated runtime models');
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(OUT, 'v5-slimeking-elite-archer.png') });

  await page.evaluate(() => {
    const run = Debug.run();
    Entities.clearEnemies(run); Weapons.reset();
    run.player.char = CFG.CHARS.find(c => c.id === 'mage');
    run.kills = 300;
    run.weapons = [{ id: 'arcanebolt', lv: 8, evolved: true, evoId: 'arcanestorm', cdT: 99,
      phantomBaseKills: 0, phantomKills: 0, arcaneBeamTick: 0 }];
    Entities.recomputeStats(run);
    for (let i = 0; i < 5; i++) Entities.spawnEnemy(run, 'skeleton', run.player.x + 125 + i * 42,
      run.player.y - 80 + i * 34, { allowNear: true });
  });
  await page.waitForFunction(() => {
    const run = Debug.run(), w = run.weapons[0];
    return w.phantomKills === 300 && w.arcaneLocks && w.arcaneLocks.length === 4;
  });
  await page.waitForTimeout(180);
  await page.screenshot({ path: path.join(OUT, 'v5-mage-avatar-beams-max.png') });
  console.log('V5 COMBAT OK  arcane refraction/brand, six-role avatar runtime and charged 270px/s Tesla cannon run in a real browser');

  const spawned = await page.evaluate(() => {
    const run = Debug.run();
    const p = run.player;
    Entities.clearEnemies(run);
    Weapons.reset();
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
