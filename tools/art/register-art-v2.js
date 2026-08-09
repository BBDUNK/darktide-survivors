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
const directions = [['down', 0], ['left', 1], ['right', 2], ['up', 3]];
const characterActions = [
  ['idle', 'idle', 8, 7],
  ['walk', 'run', 8, 11],
  ['attack', 'attack', 8, 13]
];

add({
  name: 'merchant', source: 'assets/art-v2/sprites/npcs/merchant_idle_4dir.png',
  frameSize: [64, 64], frameRow: 0, frames: 8, fps: 7,
  size: [64, 64], anchor: [32, 62], renderScale: 1
});

for (const character of characters) {
  for (const [action, fileAction, frames, fps] of characterActions) {
    const source = `assets/art-v2/sprites/characters/char_${character}_${fileAction}_4dir.png`;
    for (const [direction, row] of directions) {
      add({
        name: `char_${character}_${action}_${direction}`,
        source, frameSize: [64, 64], frameRow: row, frames, fps,
        size: [48, 64], anchor: [24, 62], renderScale: 0.42
      });
    }
    // Down-facing compatibility aliases keep old callers and offline fallbacks working.
    const alias = action === 'idle' ? `char_${character}` : `char_${character}_${action}`;
    add({
      name: alias,
      source, frameSize: [64, 64], frameRow: 0, frames, fps,
      size: [48, 64], anchor: [24, 62], renderScale: 0.42
    });
  }
  const reaction = `assets/art-v2/sprites/characters/char_${character}_reaction_4dir.png`;
  for (const [direction, row] of directions) {
    add({
      name: `char_${character}_hurt_${direction}`,
      source: reaction, frameSize: [64, 64], frameRow: row, frames: 3, fps: 10,
      size: [48, 64], anchor: [24, 62], renderScale: 0.42
    });
    add({
      name: `char_${character}_death_${direction}`,
      source: reaction, frameSize: [64, 64], frameRow: row, frameStart: 3, frames: 5, fps: 8,
      size: [48, 64], anchor: [24, 62], renderScale: 0.42
    });
  }
}

const enemies = [
  'bat', 'slime', 'slime_big', 'zombie', 'skeleton', 'ghost', 'spider', 'cultist',
  'orc', 'imp', 'knight_armored', 'werewolf', 'mummy', 'gargoyle', 'bloodbat', 'wraith'
];
const enemyActions = [['', 0, 7], ['_walk', 1, 10], ['_attack', 2, 12], ['_death', 3, 9]];
for (const enemy of enemies) {
  const source = `assets/art-v2/sprites/enemies/${enemy}_actions.png`;
  for (const [suffix, row, fps] of enemyActions) {
    add({
      name: `${enemy}${suffix}`, source, frameSize: [64, 64], frameRow: row, frames: 8, fps,
      size: [48, 56], anchor: [24, 54], renderScale: 0.45
    });
  }
}

const bosses = ['boss_slimeking', 'boss_bonelord', 'boss_abysseye', 'boss_darklord'];
const bossActions = [['', 0, 6], ['_walk', 1, 8], ['_charge', 2, 10], ['_attack', 3, 11], ['_death', 4, 8]];
for (const boss of bosses) {
  const source = `assets/art-v2/sprites/bosses/${boss}_actions.png`;
  for (const [suffix, row, fps] of bossActions) {
    add({
      name: `${boss}${suffix}`, source, frameSize: [96, 96], frameRow: row, frames: 8, fps,
      size: [96, 96], anchor: [48, 93], renderScale: 0.27
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

rowAnimations('assets/art-v2/sprites/weapons/orbitblade_actions.png', [
  ['p_orbitblade', 0, 12, [40, 40]], ['p_orbitblade_fly', 1, 14, [40, 32]],
  ['vfx_orbitblade_hit', 2, 15, [48, 48]]
]);
rowAnimations('assets/art-v2/sprites/weapons/tesla_tower_actions.png', [
  ['tesla_tower', 0, 8, [96, 96]], ['tesla_tower_deploy', 1, 10, [96, 96]],
  ['p_turret', 2, 12, [64, 64]]
]);

function iconGrid(source, columns, names) {
  names.forEach((name, index) => add({
    name, source, frameSize: [64, 64], frameRow: Math.floor(index / columns),
    frameStart: index % columns, frames: 1, fps: 0,
    size: [32, 32], anchor: [16, 30], renderScale: 1
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
iconGrid('assets/art-v2/sprites/icons/pickup_icons.png', 4, [
  'coin', 'meat', 'chest', 'magnet', 'heart', 'gem1', 'chest_boss', 'merchant_token'
]);

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
