// Build the deterministic sprite atlas and fail when validation finds a quality regression.
'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const manifest = path.join(root, 'tools', 'art', 'art-manifest.json');

function pythonCandidates() {
  const out = [];
  if (process.env.ART_PYTHON) out.push(process.env.ART_PYTHON);
  out.push('python3', 'python');
  if (process.platform === 'win32' && process.env.USERPROFILE) {
    out.push(path.join(process.env.USERPROFILE, '.cache', 'codex-runtimes', 'codex-primary-runtime',
      'dependencies', 'python', 'python.exe'));
  }
  return out;
}

function findPython() {
  for (const candidate of pythonCandidates()) {
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ['-c', 'from PIL import Image; print(Image.__version__)'], {
      cwd: root, encoding: 'utf8'
    });
    if (probe.status === 0) return candidate;
  }
  throw new Error('Python 3 with Pillow was not found. Set ART_PYTHON to a compatible interpreter.');
}

function run(python, script) {
  const result = spawnSync(python, [path.join(root, 'tools', 'art', script), '--manifest', manifest], {
    cwd: root, stdio: 'inherit'
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

const python = findPython();
run(python, 'pixel-cleanup.py');
run(python, 'validate-sprites.py');
