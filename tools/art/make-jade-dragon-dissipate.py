#!/usr/bin/env python3
"""Deterministically derive the 6-frame jade spirit dragon dissipate strip.

Input: the processed single-row p_dragon strip (8 frames, 224x112 each).
Output: vfx_jade_dragon_dissipate.png, six 224x112 hard-alpha frames.

The last flight frame is progressively eroded, deterministically dissolved and
seeded with a few jade spirit pixels. No new directional variants are created.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


JADE = [(104, 244, 184), (72, 220, 168), (148, 255, 210), (44, 180, 140), (196, 255, 232)]


def mulberry32(seed: int):
    value = (seed + 0x6D2B79F5) & 0xFFFFFFFF
    def next_int() -> int:
        nonlocal value
        value = (value + 0x6D2B79F5) & 0xFFFFFFFF
        t = value
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + ((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)
        return t ^ (t >> 14)
    return next_int


def dissolve_frame(source: Image.Image, step: int) -> Image.Image:
    dissolve_pct = (0, 6, 12, 20, 30, 42)[step]
    erosion = step + 1
    frame = source.convert("RGBA")
    src = frame.load()
    for _ in range(erosion):
        keep = Image.new("RGBA", frame.size)
        src_prev, keep_px = frame.load(), keep.load()
        for y in range(frame.height):
            for x in range(frame.width):
                if src_prev[x, y][3] == 0:
                    continue
                neighbours = ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))
                if all(0 <= nx < frame.width and 0 <= ny < frame.height and src_prev[nx, ny][3]
                       for nx, ny in neighbours):
                    keep_px[x, y] = src_prev[x, y]
        frame = keep
        src = frame.load()

    rng = mulberry32(0x6A6433 + step * 7919)
    dropped = 0
    for y in range(frame.height):
        for x in range(frame.width):
            if src[x, y][3] and rng() % 100 < dissolve_pct:
                src[x, y] = (0, 0, 0, 0)
                dropped += 1

    # Seed a few jade spirit pixels drifting outward from the body silhouette.
    alpha = frame.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        ring = []
        x0, y0, x1, y1 = bbox
        for x in range(x0, x1 + 1):
            ring.append((x, max(0, y0 - 1 - step)))
            ring.append((x, min(frame.height - 1, y1 + 1 + step)))
        for y in range(y0, y1 + 1):
            ring.append((max(0, x0 - 1 - step), y))
            ring.append((min(frame.width - 1, x1 + 1 + step), y))
        rng = mulberry32(0xD1550 + step * 104729)
        count = 10 + step * 6
        placed = 0
        while ring and placed < count:
            x, y = ring.pop(rng() % len(ring))
            if not src[x, y][3]:
                src[x, y] = (*JADE[rng() % len(JADE)], 255)
                placed += 1
    return frame


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()

    strip = Image.open(args.input).convert("RGBA")
    if strip.width % 8 != 0:
        raise SystemExit("input is not an eight-frame single-row dragon strip")
    frame_w = strip.width // 8
    frame_h = strip.height
    last = strip.crop(((8 - 1) * frame_w, 0, 8 * frame_w, frame_h))
    out = Image.new("RGBA", (frame_w * 6, frame_h))
    for step in range(6):
        out.alpha_composite(dissolve_frame(last, step), (step * frame_w, 0))
    # Re-quantize the derived strip to the same 40-colour budget as the source
    # strip so the atlas validation gate stays at 0 errors.
    alpha = out.getchannel("A")
    rgb = Image.new("RGB", out.size, (0, 0, 0))
    rgb.paste(out.convert("RGB"), mask=alpha)
    quantized = rgb.quantize(colors=40, method=Image.Quantize.MEDIANCUT,
                             dither=Image.Dither.NONE).convert("RGBA")
    quantized.putalpha(alpha)
    out = quantized
    args.out.parent.mkdir(parents=True, exist_ok=True)
    out.save(args.out, optimize=False)
    print(f"wrote {args.out} {out.width}x{out.height}")


if __name__ == "__main__":
    main()
