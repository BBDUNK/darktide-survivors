// Merge READY entries from assets/art-v6/production-manifest.json into the runtime art manifest.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const prodPath = path.join(root, 'assets', 'art-v6', 'production-manifest.json');
const artPath = path.join(root, 'tools', 'art', 'art-manifest.json');

const only = new Set((process.argv[2] || '').split(',').map(s => s.trim()).filter(Boolean));
const refresh = process.argv.includes('--refresh');
const prod = JSON.parse(fs.readFileSync(prodPath, 'utf8').replace(/^\uFEFF/, ''));
const art = JSON.parse(fs.readFileSync(artPath, 'utf8').replace(/^\uFEFF/, ''));
let merged = 0;

for (const entry of prod.entries) {
  if (entry.status !== 'READY' && !(refresh && entry.status === 'INTEGRATED')) continue;
  if (only.size && !only.has(entry.name)) continue;
  if (!entry.output || !fs.existsSync(path.join(root, entry.output))) {
    throw new Error(entry.name + ' READY but output missing');
  }
  const spec = {
    name: entry.name,
    source: entry.output,
    frameSize: entry.frameSize,
    frames: entry.frames,
    fps: entry.fps,
    size: entry.frameSize,
    anchor: entry.anchor,
    renderScale: entry.renderScale,
    asIs: true,
    preservePixels: false,
    allowDuplicateFrames: entry.loop ? true : false,
    minCoverage: entry.minCoverage || 0.08,
    maxColors: 40,
    maxCentroidDrift: entry.maxCentroidDrift || 4,
    maxBaselineDrift: entry.maxBaselineDrift || 1
  };
  const index = art.assets.findIndex(a => a.name === entry.name);
  if (index >= 0) art.assets[index] = spec;
  else art.assets.push(spec);
  entry.status = 'INTEGRATED';
  merged++;
  console.log('merge ' + entry.name + ' <- ' + entry.output);
}
fs.writeFileSync(artPath, JSON.stringify(art, null, 2) + '\n', 'utf8');
fs.writeFileSync(prodPath, JSON.stringify(prod, null, 2) + '\n', 'utf8');
console.log('merged ' + merged + ' READY assets; art-manifest and production-manifest saved');
