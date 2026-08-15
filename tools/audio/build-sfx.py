"""Build the file-based SFX set from vendored Kenney CC0 audio packs.

Reads tools/audio/sfx-manifest.json (game sfx name -> pack/file/gain/rate),
extracts each OGG, converts to mono 22.05 kHz 16-bit WAV with peak
normalization, silence trimming and a 12 ms fade-out, and writes
assets/audio/sfx/<name>.wav.  Run: py tools/audio/build-sfx.py
"""

from __future__ import annotations

import io
import json
import sys
import zipfile
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
VENDOR = ROOT / "assets" / "audio" / "vendor"
OUT_DIR = ROOT / "assets" / "audio" / "sfx"
MANIFEST = ROOT / "tools" / "audio" / "sfx-manifest.json"
TARGET_SR = 22050
PEAK = 0.89          # normalize ceiling before per-sound gain


def load_pack(name: str) -> zipfile.ZipFile:
    matches = sorted(VENDOR.glob(f"kenney_{name}*.zip"))
    if not matches:
        raise FileNotFoundError(f"missing vendor zip for pack {name} in {VENDOR}")
    return zipfile.ZipFile(matches[0])


def trim_and_fade(samples: np.ndarray, sr: int) -> np.ndarray:
    env = np.abs(samples)
    threshold = max(1e-4, float(env.max()) * 0.02)
    idx = np.nonzero(env > threshold)[0]
    if len(idx) == 0:
        return samples
    head = max(0, int(idx[0]) - int(0.004 * sr))          # keep ~4 ms pre-attack
    tail = min(len(samples), int(idx[-1]) + int(0.010 * sr))
    out = samples[head:tail].copy()
    fade = min(len(out), int(0.012 * sr))
    if fade > 0:
        out[-fade:] *= np.linspace(1.0, 0.0, fade)
    return out


def convert(entry: dict) -> tuple[int, float]:
    pack = load_pack(entry["pack"])
    member = "Audio/" + entry["file"]
    data, sr = sf.read(io.BytesIO(pack.read(member)), always_2d=True)
    mono = data.mean(axis=1)
    if sr != TARGET_SR:
        ratio = sr / TARGET_SR
        n_out = int(len(mono) / ratio)
        idx = np.minimum(np.arange(n_out) * ratio, len(mono) - 1).astype(np.int64)
        mono = mono[idx]
    mono = trim_and_fade(mono, TARGET_SR)
    peak = float(np.abs(mono).max()) or 1.0
    mono = mono * (PEAK / peak) * float(entry.get("gain", 1.0))
    mono = np.clip(mono, -1.0, 1.0)
    out = OUT_DIR / (entry["name"] + ".wav")
    sf.write(out, mono.astype(np.float32), TARGET_SR, subtype="PCM_16")
    return len(mono), len(mono) / TARGET_SR


def main() -> int:
    spec = json.loads(MANIFEST.read_text(encoding="utf-8"))["entries"]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    total = 0.0
    for entry in spec:
        n, dur = convert(entry)
        total += dur
        print(f"{entry['name']:<14} {entry['pack'][:9]:<9} {entry['file']:<34} {dur * 1000:6.0f} ms")
    size = sum(f.stat().st_size for f in OUT_DIR.glob("*.wav"))
    print(f"--- {len(spec)} files, {total:.1f}s audio, {size // 1024} KB -> {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
