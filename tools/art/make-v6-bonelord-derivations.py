#!/usr/bin/env python3
"""Deterministic bone-lord supplementary V6 strips from validated game-ready art."""
from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw


BONE = ["#e8e0d0", "#c9bfa8", "#8d8677", "#5f5a4e", "#d8e8ff"]


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


def drift_from_idle(idle: Image.Image, frames: int = 8, pale: bool = False) -> list[Image.Image]:
    fw, fh = 96, 96
    count = idle.width // fw
    out = []
    dxs = (-1, 0, 1, 0, -1, 0, 1, 0)
    for index in range(frames):
        frame = idle.crop(((index % count) * fw, 0, (index % count + 1) * fw, fh))
        if pale:
            px = frame.load()
            tint = Image.new("RGBA", (fw, fh))
            tp = tint.load()
            for y in range(fh):
                for x in range(fw):
                    r, g, b, a = px[x, y]
                    if not a:
                        continue
                    blend = 0.55 + (index % 2) * 0.05
                    tp[x, y] = (round(r + (238 - r) * blend), round(g + (242 - g) * blend),
                                round(b + (220 - b) * blend), 255)
            frame = tint
        shifted = Image.new("RGBA", (fw, fh))
        shifted.alpha_composite(frame, (dxs[index % len(dxs)], 0))
        out.append(shifted)
    return out


def bone_prison(frames: int = 8) -> list[Image.Image]:
    size = 96
    out = []
    for index in range(frames):
        frame = Image.new("RGBA", (size, size))
        draw = ImageDraw.Draw(frame)
        cx, cy = 48, 52
        progress = min(1, (index + 1) / 5)
        rise = progress * 34
        for post in range(6):
            angle = math.pi * 2 * post / 6
            px0 = cx + math.cos(angle) * 34
            py0 = cy + math.sin(angle) * 26
            top = max(16, py0 - rise)
            colour = BONE[min(index, len(BONE) - 1)]
            draw.line((px0, py0, px0 + (math.cos(angle) * 2), top), fill=colour, width=2)
            draw.ellipse((px0 - 3, top - 3, px0 + 3, top + 3), fill=BONE[-1])
        if index >= 5:
            # Shatter: bone fragments fly outward.
            for frag in range(10):
                angle = frag * 2.399963 + index
                dist = 20 + (index - 4) * 12
                fx = cx + math.cos(angle) * dist
                fy = cy + math.sin(angle) * dist
                if 2 <= fx <= size - 2 and 2 <= fy <= size - 2:
                    draw.point((fx, fy), fill=BONE[frag % len(BONE)])
        out.append(frame)
    return out


def spear_rain(frames: int = 8) -> list[Image.Image]:
    size = 96
    out = []
    for index in range(frames):
        frame = Image.new("RGBA", (size, size))
        draw = ImageDraw.Draw(frame)
        # Ground warning ellipse for the first two frames, then falling spears.
        if index < 2:
            ry = 88 - index * 3
            draw.ellipse((14, 76, 82, ry), fill=BONE[3])
            draw.ellipse((26, 78, 70, max(84, ry - 4)), fill=BONE[2])
            if index == 1:
                draw.point((48, 81), fill="#ffffff")
        drop = max(0, index - 2)
        for spear in range(3):
            sx = 24 + spear * 24 + (spear % 2) * 6
            tip = 16 + drop * 11 + spear * 3
            if tip > 84:
                continue
            draw.line((sx, tip, sx, min(82, tip + 22)), fill=BONE[0], width=3)
            draw.line((sx, tip - 8, sx, tip), fill=BONE[-1], width=2)
        if index >= 6:
            for spark in range(8):
                angle = spark * 1.9 + index
                dist = 8 + (index - 5) * 5
                x = 48 + math.cos(angle) * dist
                y = 80 + math.sin(angle) * dist * 0.4
                if 4 <= x <= 92 and 68 <= y <= 92:
                    draw.point((x, y), fill=BONE[-1])
        out.append(frame)
    return out


def grave_mark(frames: int = 6) -> list[Image.Image]:
    size = 64
    out = []
    for index in range(frames):
        frame = Image.new("RGBA", (size, size))
        draw = ImageDraw.Draw(frame)
        mound = 8 + index
        draw.ellipse((24 - mound // 2, 54 - mound // 4, 40 + mound // 2, 54 + mound // 4), fill="#4a3a28")
        draw.ellipse((27, 51, 37, 56), fill="#6b5a42")
        # Crack glow and rising soul.
        draw.line((32, 54, 32, 46 - index), fill=BONE[-1], width=1)
        draw.ellipse((30, 38 - index * 2, 34, 42 - index * 2), fill="#d8e8ff")
        out.append(frame)
    return out


def soul_return(frames: int = 6) -> list[Image.Image]:
    size = 64
    out = []
    for index in range(frames):
        frame = Image.new("RGBA", (size, size))
        draw = ImageDraw.Draw(frame)
        for soul in range(3):
            angle = soul * 2.094 + 0.35 * index
            dist = 34 - index * 4
            x = 32 + math.cos(angle) * dist
            y = 34 + math.sin(angle) * dist
            if 4 <= x <= 60 and 4 <= y <= 60:
                draw.ellipse((x - 2, y - 2, x + 2, y + 2), fill=BONE[-1])
                draw.line((x, y, 32 + math.cos(angle) * dist * 0.55, 34 + math.sin(angle) * dist * 0.55),
                          fill=BONE[2], width=1)
        out.append(frame)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", default="assets/art-v6/game-ready/v6")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    out_dir = root / args.out_dir
    idle = load("boss_bonelord", root)
    save_strip(drift_from_idle(idle, 8, False), out_dir / "boss_bonelord_walk.png")
    save_strip(drift_from_idle(idle, 4, True), out_dir / "boss_bonelord_hurt.png")
    save_strip(bone_prison(), out_dir / "vfx_bonelord_bone_prison.png")
    save_strip(spear_rain(), out_dir / "vfx_bonelord_spear_rain.png")
    save_strip(grave_mark(), out_dir / "vfx_bonelord_grave_mark.png")
    save_strip(soul_return(), out_dir / "vfx_bonelord_soul_return.png")


if __name__ == "__main__":
    main()
