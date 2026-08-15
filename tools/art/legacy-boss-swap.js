// One-off: swap Abyss Eye -> V4 sheet and Slime King -> V2 sheet in art-manifest.
// Attack and missing role actions are replaced by repeated idle/charge material.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const artPath = path.join(root, 'tools', 'art', 'art-manifest.json');
const art = JSON.parse(fs.readFileSync(artPath, 'utf8').replace(/^\uFEFF/, ''));

const V4 = 'assets/art-v4/repaired/bosses/boss_abysseye_actions.png';
const V2 = 'assets/art-v2/sprites/bosses/boss_slimeking_actions.png';

function legacy(name, source, row, fps, renderScale) {
  return {
    preservePixels: true,
    allowDuplicateFrames: true,
    minCoverage: 0.006,
    maxColors: 256,
    maxCentroidDrift: 64,
    maxBaselineDrift: 8,
    name,
    source,
    frameSize: [96, 96],
    frameRow: row,
    frames: 8,
    fps,
    size: [96, 96],
    anchor: [48, 93],
    renderScale
  };
}

// Row map: 0=idle 1=walk 2=charge 3=attack(not used for attack) 4=death
// Attack is deliberately pointed at idle row so the boss uses repeated idle
// material instead of the old/current attack animation.
const SLIME = {
  boss_slimeking: ['boss_slimeking', V2, 0, 6, 0.72],
  boss_slimeking_walk: ['boss_slimeking_walk', V2, 1, 8, 0.72],
  boss_slimeking_charge: ['boss_slimeking_charge', V2, 2, 10, 0.72],
  boss_slimeking_attack: ['boss_slimeking_attack', V2, 0, 6, 0.72],
  boss_slimeking_death: ['boss_slimeking_death', V2, 4, 8, 0.72],
  boss_slimeking_shield: ['boss_slimeking_shield', V2, 0, 6, 0.72],
  boss_slimeking_hurt: ['boss_slimeking_hurt', V2, 0, 6, 0.72]
};

const ABYSS = {
  boss_abysseye: ['boss_abysseye', V4, 0, 6, 0.58],
  boss_abysseye_walk: ['boss_abysseye_walk', V4, 1, 8, 0.58],
  boss_abysseye_charge: ['boss_abysseye_charge', V4, 2, 10, 0.58],
  boss_abysseye_attack: ['boss_abysseye_attack', V4, 0, 6, 0.58],
  boss_abysseye_death: ['boss_abysseye_death', V4, 4, 8, 0.58],
  boss_abysseye_split: ['boss_abysseye_split', V4, 0, 6, 0.58],
  boss_abysseye_remote_cast: ['boss_abysseye_remote_cast', V4, 0, 6, 0.58],
  boss_abysseye_charge_dash: ['boss_abysseye_charge_dash', V4, 2, 10, 0.58],
  boss_abysseye_remote: ['boss_abysseye_remote', V4, 0, 6, 0.58],
  boss_abysseye_hurt: ['boss_abysseye_hurt', V4, 0, 6, 0.58],
  boss_abysseye_remote_hurt: ['boss_abysseye_remote_hurt', V4, 0, 6, 0.58],
  boss_abysseye_remote_death: ['boss_abysseye_remote_death', V4, 4, 8, 0.58],
  boss_abysseye_charge_hurt: ['boss_abysseye_charge_hurt', V4, 2, 10, 0.58],
  boss_abysseye_charge_death: ['boss_abysseye_charge_death', V4, 4, 8, 0.58]
};

let changed = 0;
for (const map of [SLIME, ABYSS]) {
  for (const key of Object.keys(map)) {
    const [name, source, row, fps, renderScale] = map[key];
    const idx = art.assets.findIndex(a => a.name === key);
    if (idx < 0) throw new Error('missing manifest entry: ' + key);
    art.assets[idx] = legacy(name, source, row, fps, renderScale);
    changed++;
  }
}

fs.writeFileSync(artPath, JSON.stringify(art, null, 2) + '\n', 'utf8');
console.log('swapped ' + changed + ' legacy boss entries');
