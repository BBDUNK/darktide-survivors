#!/usr/bin/env python3
"""Deterministic abyss-eye supplementary V6 strips from validated game-ready art."""
from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw


PURPLE = ["#d897ff", "#a64dff", "#663399", "#e8d5ff", "#3c1528"]
PURPLE_RGB = [tuple(int(hex_color[i:i + 2], 16) for i in (1, 3, 5)) for hex_color in PURPLE]


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


def drift(source: Image.Image, frame_count: int, pale: bool = False, frame_size: int = 80) -> list[Image.Image]:
    count = source.width // frame_size
    out = []
    dxs = (-1, 0, 1, 0, -1, 0, 1, 0)
    for index in range(frame_count):
        frame = source.crop(((index % count) * frame_size, 0, (index % count + 1) * frame_size, frame_size))
        if pale:
            px = frame.load()
            tint = Image.new("RGBA", (frame_size, frame_size))
            tp = tint.load()
            for y in range(frame_size):
                for x in range(frame_size):
                    r, g, b, a = px[x, y]
                    if a:
                        blend = 0.55 + (index % 2) * 0.05
                        tp[x, y] = (round(r + (242 - r) * blend), round(g + (238 - g) * blend),
                                    round(b + (246 - b) * blend), 255)
            frame = tint
        shifted = Image.new("RGBA", (frame_size, frame_size))
        shifted.alpha_composite(frame, (dxs[index % len(dxs)], 0))
        out.append(shifted)
    return out


def dissolve(source: Image.Image, frame_count: int = 8, frame_size: int = 80) -> list[Image.Image]:
    count = source.width // frame_size
    out = []
    for index in range(frame_count):
        frame = source.crop(((index % count) * frame_size, 0, (index % count + 1) * frame_size, frame_size))
        px = frame.load()
        keep = (100 - index * 12) if frame_count > 4 else (100 - index * 18)
        for y in range(frame_size):
            for x in range(frame_size):
                if px[x, y][3] and (x * 31 + y * 57 + index * 101) % 100 >= keep:
                    px[x, y] = (0, 0, 0, 0)
        rng_step = index
        for speck in range(6):
            x = 4 + (rng_step * 37 + speck * 53) % (frame_size - 8)
            y = max(6, frame_size - 10 - (rng_step * 7 + speck * 11) % 40)
            if not px[x, y][3]:
                px[x, y] = (*PURPLE_RGB[speck % len(PURPLE_RGB)], 255)
        out.append(frame)
    return out


def gaze_beam(frames: int = 4) -> list[Image.Image]:
    size_w, size_h = 64, 192
    out = []
    for index in range(frames):
        frame = Image.new("RGBA", (size_w, size_h))
        draw = ImageDraw.Draw(frame)
        width = 10 + index * 4
        left = (size_w - width) // 2
        draw.rectangle((left, 4, left + width, size_h - 6), fill=PURPLE[4])
        draw.rectangle((left + 2, 4, left + width - 2, size_h - 6), fill=PURPLE[1])
        draw.rectangle((left + width // 2 - 1, 4, left + width // 2 + 1, size_h - 6), fill="#ffffff")
        out.append(frame)
    return out


def gravity_well(frames: int = 6) -> list[Image.Image]:
    size = 112
    out = []
    for index in range(frames):
        frame = Image.new("RGBA", (size, size))
        draw = ImageDraw.Draw(frame)
        radius = 12 + index * 7
        for ring in range(3):
            rr = radius - ring * 8
            if rr > 2:
                draw.ellipse((56 - rr, 56 - rr, 56 + rr, 56 + rr),
                             outline=PURPLE[ring % len(PURPLE)], width=2 if ring == 0 else 1)
        for swirl in range(8):
            angle = swirl * 0.785 + index * 0.55
            x = 56 + math.cos(angle) * radius
            y = 56 + math.sin(angle) * radius
            if 4 <= x <= 108 and 4 <= y <= 108:
                draw.point((x, y), fill="#e8d5ff")
        out.append(frame)
    return out


def teleport_rift(frames: int = 6) -> list[Image.Image]:
    size = 96
    out = []
    for index in range(frames):
        frame = Image.new("RGBA", (size, size))
        draw = ImageDraw.Draw(frame)
        half = 8 + index * 6
        # Vertical closing rift with jagged purple edge and embers.
        draw.rectangle((48 - half, 10, 48 + half, 86), fill=PURPLE[2])
        draw.rectangle((48 - half + 2, 10, 48 + half - 2, 86), fill=PURPLE[4])
        for jag in range(6):
            y = 12 + jag * 14
            width = half - 2 + (jag % 3) * 3
            draw.line((48 - width, y, 48 + width, y), fill=PURPLE[0], width=1)
        for ember in range(8):
            angle = ember * 0.79 + index
            dist = half + 8
            x = 48 + math.cos(angle) * dist
            y = 48 + math.sin(angle) * dist * 1.4
            if 4 <= x <= 92 and 4 <= y <= 92:
                draw.point((x, y), fill=PURPLE[ember % len(PURPLE)])
        out.append(frame)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", default="assets/art-v6/game-ready/v6")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    out_dir = root / args.out_dir

    p1 = load("boss_abysseye", root)
    remote = load("boss_abysseye_remote_cast", root)
    charge = load("boss_abysseye_charge_dash", root)

    save_strip(drift(p1, 8), out_dir / "boss_abysseye_walk.png")
    save_strip(drift(p1, 4, pale=True), out_dir / "boss_abysseye_hurt.png")
    save_strip(dissolve(p1, 8), out_dir / "boss_abysseye_death.png")
    save_strip(drift(remote, 4), out_dir / "boss_abysseye_remote.png")
    save_strip(drift(remote, 4, pale=True), out_dir / "boss_abysseye_remote_hurt.png")
    save_strip(dissolve(remote, 6), out_dir / "boss_abysseye_remote_death.png")
    save_strip(drift(charge, 4), out_dir / "boss_abysseye_charge.png")
    save_strip(drift(charge, 4, pale=True), out_dir / "boss_abysseye_charge_hurt.png")
    save_strip(dissolve(charge, 6), out_dir / "boss_abysseye_charge_death.png")
    save_strip(gaze_beam(), out_dir / "vfx_abysseye_gaze_beam.png")
    save_strip(gravity_well(), out_dir / "vfx_abysseye_gravity_well.png")
    save_strip(teleport_rift(), out_dir / "vfx_abysseye_rift.png")


if __name__ == "__main__":
    main()
