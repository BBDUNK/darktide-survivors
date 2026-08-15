#!/usr/bin/env python3
"""Derive the missing ordinary-monster action rows from V6 concept game-ready strips."""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def load(name: str, root: Path) -> Image.Image:
    return Image.open(root / "assets" / "art-v6" / "game-ready" / "v6" / f"{name}.png").convert("RGBA")


def quantize(frame: Image.Image, colors: int = 40) -> Image.Image:
    alpha = frame.getchannel("A")
    rgb = Image.new("RGB", frame.size, (0, 0, 0))
    rgb.paste(frame.convert("RGB"), mask=alpha)
    out = rgb.quantize(colors=colors, method=Image.Quantize.MEDIANCUT,
                       dither=Image.Dither.NONE).convert("RGBA")
    out.putalpha(alpha)
    return out


def save_strip(frames: list[Image.Image], out_path: Path) -> None:
    fw, fh = frames[0].size
    strip = Image.new("RGBA", (fw * len(frames), fh))
    for index, frame in enumerate(frames):
        strip.alpha_composite(quantize(frame), (index * fw, 0))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    strip.save(out_path, optimize=False)
    print(f"wrote {out_path} {strip.width}x{strip.height}")


def cells(strip: Image.Image, size: int, order: list[int]) -> list[Image.Image]:
    return [strip.crop((index * size, 0, (index + 1) * size, size)) for index in order]


def attack_eight(base: Image.Image, size: int) -> list[Image.Image]:
    order = [0, 1, 2, 3, 2, 1, 0, 1]
    return cells(base, size, order)


def walk_eight(base: Image.Image, size: int) -> list[Image.Image]:
    dxs = (-1, 0, 1, 0, -1, 0, 1, 0)
    out = []
    for index in range(8):
        frame = cells(base, size, [index % 4])[0]
        shifted = Image.new("RGBA", (size, size))
        shifted.alpha_composite(frame, (dxs[index], 0))
        out.append(shifted)
    return out


def hurt_four(base: Image.Image, size: int) -> list[Image.Image]:
    out = []
    for index in range(4):
        frame = cells(base, size, [index])[0]
        px = frame.load()
        tint = Image.new("RGBA", (size, size))
        tp = tint.load()
        for y in range(size):
            for x in range(size):
                r, g, b, a = px[x, y]
                if a:
                    blend = 0.5 + index * 0.05
                    tp[x, y] = (round(r + (244 - r) * blend), round(g + (238 - g) * blend),
                                round(b + (236 - b) * blend), 255)
        shifted = Image.new("RGBA", (size, size))
        shifted.alpha_composite(tint, (index % 2, 0))
        out.append(shifted)
    return out


def death_eight(base: Image.Image, size: int) -> list[Image.Image]:
    out = []
    for index in range(8):
        frame = cells(base, size, [index % 4])[0].copy()
        px = frame.load()
        drop = index * 11
        for y in range(size):
            for x in range(size):
                if px[x, y][3] and (x * 31 + y * 57 + index * 101) % 100 < drop:
                    px[x, y] = (0, 0, 0, 0)
        out.append(frame)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", default="assets/art-v6/game-ready/v6")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    out_dir = root / args.out_dir

    jobs = [
        ("slime", 32), ("slime_big", 48), ("spider", 32)
    ]
    for name, size in jobs:
        idle = load(name, root)
        attack = load(name + "_attack", root)
        save_strip(attack_eight(attack, size), out_dir / f"{name}_attack.png")
        save_strip(walk_eight(idle, size), out_dir / f"{name}_walk.png")
        save_strip(hurt_four(idle, size), out_dir / f"{name}_hurt.png")
        save_strip(death_eight(idle, size), out_dir / f"{name}_death.png")


if __name__ == "__main__":
    main()
