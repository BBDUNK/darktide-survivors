#!/usr/bin/env python3
"""Deterministic dark-lord supplementary V6 strips from validated game-ready art."""
from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw


DARK = ["#e8e0d0", "#a33b4f", "#7a2b3f", "#3c1528", "#ffd76b", "#241423"]


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


def drift(source: Image.Image, frame_index: int, frame_count: int,
          frame_size: int, pale: bool = False) -> list[Image.Image]:
    count = source.width // frame_size
    out = []
    dxs = (-1, 0, 1, 0, -1, 0, 1, 0)
    for index in range(frame_count):
        frame = source.crop(((frame_index + index % max(1, count - frame_index)) * frame_size, 0,
                             (frame_index + index % max(1, count - frame_index) + 1) * frame_size, frame_size))
        if pale:
            px = frame.load()
            tint = Image.new("RGBA", (frame_size, frame_size))
            tp = tint.load()
            for y in range(frame_size):
                for x in range(frame_size):
                    r, g, b, a = px[x, y]
                    if a:
                        blend = 0.5 + index * 0.05
                        tp[x, y] = (round(r + (244 - r) * blend), round(g + (238 - g) * blend),
                                    round(b + (236 - b) * blend), 255)
            frame = tint
        shifted = Image.new("RGBA", (frame_size, frame_size))
        shifted.alpha_composite(frame, (dxs[index % len(dxs)], index % 2))
        out.append(shifted)
    return out


def blackflame_rain(frames: int = 8) -> list[Image.Image]:
    size = 96
    out = []
    for index in range(frames):
        frame = Image.new("RGBA", (size, size))
        draw = ImageDraw.Draw(frame)
        for drop in range(6):
            x = 8 + drop * 13 + ((index * 5 + drop * 3) % 9)
            y = 8 + ((index * 17 + drop * 23) % 60)
            length = 10 + drop % 4 * 5
            if y + length > 88:
                length = max(4, 88 - y)
            draw.line((x, y, max(4, x - 2), y + length), fill=DARK[2], width=2)
            draw.line((x, y, min(92, x + 2), y + length), fill=DARK[1], width=1)
            draw.point((x, y), fill=DARK[4])
        out.append(frame)
    return out


def shadow_clone(charge: Image.Image, frames: int = 6) -> list[Image.Image]:
    size = 144
    base = charge.crop((4 * size, 0, 5 * size, size))
    px = base.load()
    clone = Image.new("RGBA", (size, size))
    cp = clone.load()
    for y in range(size):
        for x in range(size):
            r, g, b, a = px[x, y]
            if a:
                cp[x, y] = (round(r * 0.3 + 24), round(g * 0.2 + 16), round(b * 0.25 + 20), 255)
    out = []
    for index in range(frames):
        frame = Image.new("RGBA", (size, size))
        frame.alpha_composite(clone, (-8 + index * 2, 0))
        out.append(frame)
    return out


def full_rift(frames: int = 6) -> list[Image.Image]:
    size = 96
    out = []
    for index in range(frames):
        frame = Image.new("RGBA", (size, size))
        draw = ImageDraw.Draw(frame)
        for crack in range(7):
            angle = crack * 0.897 + 0.2
            length = 14 + index * 7 + (crack % 3) * 6
            x0 = 48 + math.cos(angle) * 6
            y0 = 48 + math.sin(angle) * 6
            x1 = 48 + math.cos(angle) * min(44, length)
            y1 = 48 + math.sin(angle) * min(44, length)
            draw.line((x0, y0, x1, y1), fill=DARK[crack % 3], width=2 if crack == 0 else 1)
        draw.ellipse((42, 42, 54, 54), fill=DARK[4])
        out.append(frame)
    return out


def gate_glow(frames: int = 4) -> list[Image.Image]:
    size = 64
    out = []
    for index in range(frames):
        frame = Image.new("RGBA", (size, size))
        draw = ImageDraw.Draw(frame)
        radius = 8 + index * 7
        draw.ellipse((32 - radius, 30 - radius * 0.6, 32 + radius, 30 + radius * 0.6),
                     outline=DARK[4], width=2)
        draw.ellipse((30 - radius // 2, 29 - radius // 3, 34 + radius // 2, 31 + radius // 3), fill=DARK[1])
        out.append(frame)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", default="assets/art-v6/game-ready/v6")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    out_dir = root / args.out_dir

    p1 = load("boss_darklord", root)
    transform = load("boss_darklord_transform", root)
    charge = load("boss_darklord_charge", root)

    save_strip(drift(p1, 0, 8, 112), out_dir / "boss_darklord_walk.png")
    save_strip(drift(p1, 0, 4, 112, pale=True), out_dir / "boss_darklord_hurt.png")
    save_strip(drift(transform, 7, 4, 144), out_dir / "boss_darklord_phase2.png")
    save_strip(drift(transform, 7, 8, 144), out_dir / "boss_darklord_phase2_walk.png")
    save_strip(drift(transform, 7, 4, 144, pale=True), out_dir / "boss_darklord_phase2_hurt.png")
    save_strip(blackflame_rain(), out_dir / "vfx_darklord_blackflame_rain.png")
    save_strip(shadow_clone(charge), out_dir / "vfx_darklord_shadow_clone.png")
    save_strip(full_rift(), out_dir / "vfx_darklord_rift.png")
    save_strip(gate_glow(), out_dir / "vfx_darklord_gate_enter.png")


if __name__ == "__main__":
    main()
