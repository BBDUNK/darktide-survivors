'use strict';

// Registers the ImageGen-authored, deterministically pixel-cleaned V2 library.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const manifestPath = path.join(__dirname, 'art-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const next = [];

function add(spec) {
  next.push(Object.assign({
    preservePixels: true,
    allowDuplicateFrames: true,
    minCoverage: 0.006,
    maxColors: 256,
    maxCentroidDrift: 64,
    maxBaselineDrift: 8
  }, spec));
}

const characters = ['knight', 'mage', 'ranger', 'cleric', 'berserker', 'chrono'];
// Image sources place right-facing frames before left-facing frames.  The old
// registration inverted these two rows, making every character run backwards.
const directions = [['down', 0], ['right', 1], ['left', 2], ['up', 3]];
const characterActions = [
  ['idle', 'idle', 8, 7],
  ['walk', 'run', 8, 11],
  ['attack', 'attack', 8, 13]
];

add({
  name: 'merchant', source: 'assets/art-v4/sprites/npcs/merchant_actions.png',
  frameSize: [96, 96], frameRow: 0, frames: 8, fps: 7,
  size: [96, 96], anchor: [48, 93], renderScale: 0.40
});
add({ name: 'merchant_attack', source: 'assets/art-v4/sprites/npcs/merchant_actions.png',
  frameSize: [96, 96], frameRow: 1, frames: 8, fps: 12,
  size: [96, 96], anchor: [48, 93], renderScale: 0.40 });
add({ name: 'merchant_prone', source: 'assets/art-v4/sprites/npcs/merchant_actions.png',
  frameSize: [96, 96], frameRow: 2, frames: 8, fps: 10,
  size: [96, 96], anchor: [48, 93], renderScale: 0.40 });

const characterScale = {
  knight: 0.58, mage: 0.64, ranger: 0.62,
  cleric: 0.62, berserker: 0.72, chrono: 0.62
};

for (const character of characters) {
  for (const [action, fileAction, frames, fps] of characterActions) {
    const source = `assets/art-v4/repaired/characters/char_${character}_${fileAction}_4dir.png`;
    for (const [direction, row] of directions) {
      add({
        name: `char_${character}_${action}_${direction}`,
        source, frameSize: [64, 64], frameRow: row, frames, fps,
        size: character === 'berserker' ? [56, 64] : [48, 64],
        anchor: character === 'berserker' ? [28, 62] : [24, 62], renderScale: characterScale[character]
      });
    }
    // Down-facing compatibility aliases keep old callers and offline fallbacks working.
    const alias = action === 'idle' ? `char_${character}` : `char_${character}_${action}`;
    add({
      name: alias,
      source, frameSize: [64, 64], frameRow: 0, frames, fps,
      size: character === 'berserker' ? [56, 64] : [48, 64],
      anchor: character === 'berserker' ? [28, 62] : [24, 62], renderScale: characterScale[character]
    });
  }
  const reaction = `assets/art-v4/repaired/characters/char_${character}_reaction_4dir.png`;
  for (const [direction, row] of directions) {
    add({
      name: `char_${character}_hurt_${direction}`,
      source: reaction, frameSize: [64, 64], frameRow: row, frames: 3, fps: 10,
      size: character === 'berserker' ? [56, 64] : [48, 64],
      anchor: character === 'berserker' ? [28, 62] : [24, 62], renderScale: characterScale[character]
    });
    add({
      name: `char_${character}_death_${direction}`,
      source: reaction, frameSize: [64, 64], frameRow: row, frameStart: 3, frames: 5, fps: 8,
      size: character === 'berserker' ? [56, 64] : [48, 64],
      anchor: character === 'berserker' ? [28, 62] : [24, 62], renderScale: characterScale[character]
    });
  }
}

const enemies = [
  'bat', 'slime', 'slime_big', 'zombie', 'skeleton', 'ghost', 'spider', 'cultist',
  'orc', 'imp', 'knight_armored', 'werewolf', 'mummy', 'gargoyle', 'bloodbat', 'wraith'
];
const enemyActions = [['', 0, 7], ['_walk', 1, 10], ['_attack', 2, 12], ['_death', 3, 9]];
const enemyScale = { spider: 0.58, slime: 0.54, slime_big: 0.72 };
for (const enemy of enemies) {
  const source = `assets/art-v4/repaired/enemies/${enemy}_actions.png`;
  for (const [suffix, row, fps] of enemyActions) {
    add({
      name: `${enemy}${suffix}`, source, frameSize: [64, 64], frameRow: row, frames: 8, fps,
      size: enemy === 'slime_big' ? [60, 62] : [56, 58],
      anchor: enemy === 'slime_big' ? [30, 60] : [28, 56],
      renderScale: enemyScale[enemy] || 0.48
    });
  }
}

// Every ordinary enemy has a dedicated elite model and the same four complete actions.
for (const enemy of enemies) {
  const source = `assets/art-v3/sprites/elites/elite_${enemy}_actions.png`;
  for (const [suffix, row, fps] of enemyActions) {
    add({
      name: `elite_${enemy}${suffix}`, source, frameSize: [64, 64], frameRow: row, frames: 8, fps,
      size: [52, 60], anchor: [26, 58], renderScale: 0.52
    });
  }
}

const bosses = ['boss_slimeking', 'boss_bonelord', 'boss_abysseye', 'boss_darklord'];
const bossActions = [['', 0, 6], ['_walk', 1, 8], ['_charge', 2, 10], ['_attack', 3, 11], ['_death', 4, 8]];
for (const boss of bosses) {
  const source = `assets/art-v4/repaired/bosses/${boss}_actions.png`;
  for (const [suffix, row, fps] of bossActions) {
    add({
      name: `${boss}${suffix}`, source, frameSize: [96, 96], frameRow: row, frames: 8, fps,
      size: [96, 96], anchor: [48, 93], renderScale: boss === 'boss_slimeking' ? 0.72 : 0.58
    });
  }
}

function rowAnimations(source, rows) {
  for (const [name, row, fps, size = [32, 32], scale = 1] of rows) {
    add({ name, source, frameSize: [64, 64], frameRow: row, frames: 8, fps,
      size, anchor: [Math.floor(size[0] / 2), size[1] - 2], renderScale: scale });
  }
}

rowAnimations('assets/art-v2/sprites/vfx/projectiles_actions.png', [
  ['p_slash', 0, 15], ['p_slash_big', 0, 15], ['p_arrow', 1, 14, [32, 24]],
  ['p_axe', 2, 12], ['p_dagger', 3, 15, [28, 24]], ['p_shadow', 3, 15],
  ['p_fireflask', 4, 12], ['p_bolt', 5, 14], ['p_enemy_bolt', 5, 12],
  ['p_book', 6, 11], ['p_holy', 6, 11], ['p_web', 7, 10]
]);

rowAnimations('assets/art-v2/sprites/vfx/attack_effects.png', [
  ['vfx_lightning', 0, 15, [48, 48]], ['p_spark', 0, 15], ['p_firepool', 1, 10, [48, 32]],
  ['vfx_explosion', 2, 14, [48, 48]], ['vfx_ice', 3, 14], ['vfx_slash', 4, 15],
  ['vfx_heal', 5, 12, [48, 48]], ['vfx_shield', 5, 10, [48, 48]],
  ['vfx_shadow', 6, 11, [48, 48]], ['vfx_spirit', 6, 11], ['vfx_smoke', 6, 10],
  ['p_dragon', 7, 12, [48, 32]]
]);

add({ name: 'vfx_holy_aura', source: 'assets/art-v4/sprites/vfx/holy_ground_actions.png',
  frameSize: [96, 96], frameRow: 0, frames: 8, fps: 5,
  size: [96, 96], anchor: [48, 48], renderScale: 1, maxBaselineDrift: 96 });

add({ name: 'vfx_frost_radial', source: 'assets/art-v4/sprites/vfx/frost_radial_actions.png',
  frameSize: [96, 96], frameRow: 0, frames: 8, fps: 10,
  size: [96, 96], anchor: [48, 48], renderScale: 1, maxBaselineDrift: 96 });

add({ name: 'vfx_archangel', source: 'assets/art-v4/sprites/vfx/archangel_actions.png',
  frameSize: [96, 96], frameRow: 0, frames: 8, fps: 10,
  size: [72, 88], anchor: [36, 84], renderScale: 0.72,
  maxCentroidDrift: 24, maxBaselineDrift: 12 });

['toxic', 'arcane', 'blood', 'bone', 'hellfire', 'ice', 'electric', 'eye'].forEach((kind, index) => {
  add({ name: `p_enemy_${kind}`, source: 'assets/art-v4/sprites/vfx/enemy_projectiles.png',
    frameSize: [64, 64], frameRow: 0, frameStart: index, frames: 1, fps: 0,
    size: [32, 32], anchor: [16, 16], renderScale: 1 });
});

rowAnimations('assets/art-v2/sprites/weapons/orbitblade_actions.png', [
  ['p_orbitblade', 0, 12, [40, 40]], ['p_orbitblade_fly', 1, 14, [40, 32]],
  ['vfx_orbitblade_hit', 2, 15, [48, 48]]
]);
for (const [name, row, fps] of [
  ['tesla_tower', 0, 8], ['tesla_tower_deploy', 1, 10],
  ['tesla_tower_attack', 2, 15], ['tesla_tower_overload', 3, 12]
]) {
  add({ name, source: 'assets/art-v3/sprites/weapons/tesla_tower_actions.png',
    frameSize: [112, 112], frameRow: row, frames: 8, fps,
    size: [112, 112], anchor: [56, 109], renderScale: 1 });
}
// Compatibility projectile icon for network snapshots and old callers.
add({ name: 'p_turret', source: 'assets/art-v3/sprites/weapons/tesla_tower_actions.png',
  frameSize: [112, 112], frameRow: 2, frames: 8, fps: 15,
  size: [64, 64], anchor: [32, 62], renderScale: 1 });

const deadwoodNames = [
  'deco_deadtree_large1', 'deco_deadtree_large2', 'deco_deadtree_large3', 'deco_deadtree_large4',
  'deco_deadstump', 'deco_fallenlog', 'deco_deadroots', 'deco_deadreeds'
];
deadwoodNames.forEach((name, index) => add({
  name, source: 'assets/art-v3/sprites/environment/deadwood_props.png',
  frameSize: [128, 128], frameRow: Math.floor(index / 4), frameStart: index % 4,
  frames: 1, fps: 0, size: [128, 128], anchor: [64, 124],
  renderScale: index < 4 ? 0.82 : 0.48
}));

function iconGrid(source, columns, names) {
  names.forEach((name, index) => add({
    name, source, frameSize: [64, 64], frameRow: Math.floor(index / columns),
    frameStart: index % columns, frames: 1, fps: 0,
    size: [32, 32], anchor: [16, 30], renderScale: 1
  }));
}

function spriteGrid(source, frameSize, columns, names, outputSize, renderScale) {
  names.forEach((name, index) => add({
    name, source, frameSize: [frameSize, frameSize], frameRow: Math.floor(index / columns),
    frameStart: index % columns, frames: 1, fps: 0,
    size: [outputSize, outputSize], anchor: [Math.floor(outputSize / 2), outputSize - 2],
    renderScale
  }));
}

iconGrid('assets/art-v2/sprites/icons/weapon_icons.png', 4, [
  'w_crossblade', 'w_arcanebolt', 'w_windbow', 'w_holyaura',
  'w_whirlaxe', 'w_chainlight', 'w_frostnova', 'w_fireflask',
  'w_shadowdagger', 'w_orbitblade', 'w_holytome', 'w_teslacoil'
]);
iconGrid('assets/art-v2/sprites/icons/evolution_icons.png', 4, [
  'we_crossjudge', 'we_arcanestorm', 'we_featherstorm', 'we_sanctuary',
  'we_worldender', 'we_thorwrath', 'we_absolutezero', 'we_infernosea',
  'we_thousandcuts', 'we_bladestorm', 'we_forbidden', 'we_skynet'
]);
iconGrid('assets/art-v2/sprites/icons/passive_icons.png', 3, [
  'ps_power', 'ps_core', 'ps_eagle', 'ps_pendant', 'ps_belt',
  'ps_boots', 'ps_magnetstone', 'ps_clover', 'ps_barrier'
]);
for (const [name, index] of [['chest', 2], ['chest_boss', 6], ['merchant_token', 7]]) {
  add({ name, source: 'assets/art-v2/sprites/icons/pickup_icons.png',
    frameSize: [64, 64], frameRow: Math.floor(index / 4), frameStart: index % 4,
    frames: 1, fps: 0, size: [32, 32], anchor: [16, 30], renderScale: 1 });
}

iconGrid('assets/art-v4/sprites/pickups/pickup_gems.png', 5, [
  'clock', 'meat', 'bomb', 'magnet', 'heart',
  'gem1', 'gem2', 'gem3', 'gem_big', 'coin'
]);

spriteGrid('assets/art-v4/sprites/terrain/terrain_tiles.png', 128, 3, [
  'terrain_grave_ground', 'terrain_grave_swamp', 'terrain_grave_road',
  'terrain_wild_ground', 'terrain_wild_grass', 'terrain_wild_road',
  'terrain_abyss_ground', 'terrain_abyss_water', 'terrain_abyss_road'
], 128, 1);
// Transparent sprite padding on a repeated tile becomes a visible square grid.
for (const asset of next.slice(-9)) asset.seamlessTile = true;

['terrain_grave_swamp_puddle1', 'terrain_grave_swamp_puddle2',
  'terrain_grave_swamp_puddle3', 'terrain_grave_swamp_puddle4'].forEach((name, index) => add({
    name, source: 'assets/art-v4/sprites/terrain/swamp_puddles.png',
    frameSize: [320, 224], frameRow: Math.floor(index / 2), frameStart: index % 2,
    frames: 1, fps: 0, size: [320, 224], anchor: [160, 112], renderScale: 1
  }));

spriteGrid('assets/art-v4/sprites/environment/terrain_props.png', 96, 4, [
  'deco_wither_cluster1', 'deco_wither_cluster2', 'deco_swamp_reeds', 'deco_lilypad',
  'deco_road_marker', 'deco_wagon_rut', 'deco_abyss_coral', 'deco_rune_cluster'
], 96, 0.62);

add({
  name: 'hud_minimap_frame', source: 'assets/art-v2/ui/hud_minimap_frame.png', frames: 1,
  size: [132, 132], anchor: [66, 66], renderScale: 1
});

const replaced = new Set(next.map(asset => asset.name));
manifest.assets = manifest.assets.filter(asset => !replaced.has(asset.name)).concat(next);
manifest.atlasWidth = 2048;
manifest.version = Math.max(2, Number(manifest.version) || 1);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`Registered ${next.length} V2 atlas entries; ${manifest.assets.length} local entries total.`);
