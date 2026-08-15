// One-off: mix legacy and V6 boss art per user request.
// - Abyss Eye: P1 = V4, P2 = V6
// - Dark Lord: P1 = V4, P2 = V6
// - Bone Lord: size only (config), no manifest change.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const root = path.resolve(__dirname, '..', '..');
const artPath = path.join(root, 'tools', 'art', 'art-manifest.json');
const art = JSON.parse(fs.readFileSync(artPath, 'utf8').replace(/^\uFEFF/, ''));
const prev = JSON.parse(execSync('git show HEAD~1:tools/art/art-manifest.json', { cwd: root, encoding: 'utf8' }).replace(/^\uFEFF/, ''));

function legacy(name, source, row, fps) {
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
    renderScale: 1
  };
}

function setEntry(name, spec) {
  const idx = art.assets.findIndex(a => a.name === name);
  if (idx < 0) throw new Error('missing manifest entry: ' + name);
  art.assets[idx] = spec;
}

// Abyss Eye P2 -> restore original V6 entries.
const ABYSS_P2 = [
  'boss_abysseye_charge',
  'boss_abysseye_remote',
  'boss_abysseye_split',
  'boss_abysseye_remote_cast',
  'boss_abysseye_charge_dash',
  'boss_abysseye_remote_hurt',
  'boss_abysseye_remote_death',
  'boss_abysseye_charge_hurt',
  'boss_abysseye_charge_death'
];
for (const name of ABYSS_P2) {
  const spec = prev.assets.find(a => a.name === name);
  if (!spec) throw new Error('previous manifest missing ' + name);
  setEntry(name, JSON.parse(JSON.stringify(spec)));
}

// Dark Lord P1 -> V4 legacy sheet (96x96 rows). Phase2 stays V6.
const V4_DARK = 'assets/art-v4/repaired/bosses/boss_darklord_actions.png';
setEntry('boss_darklord', legacy('boss_darklord', V4_DARK, 0, 6));
setEntry('boss_darklord_walk', legacy('boss_darklord_walk', V4_DARK, 1, 8));
setEntry('boss_darklord_charge', legacy('boss_darklord_charge', V4_DARK, 2, 10));
setEntry('boss_darklord_attack', legacy('boss_darklord_attack', V4_DARK, 3, 11));
setEntry('boss_darklord_death', legacy('boss_darklord_death', V4_DARK, 4, 8));
setEntry('boss_darklord_hurt', legacy('boss_darklord_hurt', V4_DARK, 0, 6));

fs.writeFileSync(artPath, JSON.stringify(art, null, 2) + '\n', 'utf8');
console.log('mixed boss art applied: Abyss P2 -> V6, DarkLord P1 -> V4');
