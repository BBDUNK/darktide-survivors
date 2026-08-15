#!/usr/bin/env python3
"""Derive the deterministic supplementary slime-king V6 strips.

Only reads already validated game-ready strips; never loads high-res sources.
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw


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


def hurt_from_idle(idle: Image.Image, frame_count: int = 4) -> list[Image.Image]:
    fw, fh = 80, 80
    n = idle.width // fw
    out = []
    shifts = (0, 1, 0, -1)
    for index in range(frame_count):
        frame = idle.crop(((index % n) * fw, 0, (index % n + 1) * fw, fh))
        px = frame.load()
        pale = Image.new("RGBA", (fw, fh))
        pp = pale.load()
        for y in range(fh):
            for x in range(fw):
                r, g, b, a = px[x, y]
                if not a:
                    continue
                # Hurt flash: keep silhouette, push colours toward pale sickly green-white.
                blend = 0.55 + (index % 2) * 0.06
                pp[x, y] = (round(r + (226 - r) * blend), round(g + (240 - g) * blend),
                            round(b + (214 - b) * blend), 255)
        shifted = Image.new("RGBA", (fw, fh))
        dx = shifts[index % len(shifts)]
        shifted.alpha_composite(pale, (dx, 0))
        out.append(shifted)
    return out


def fan_telegraph(frames: int = 4) -> list[Image.Image]:
    size = 112
    out = []
    for index in range(frames):
        frame = Image.new("RGBA", (size, size))
        draw = ImageDraw.Draw(frame)
        cx, cy = 56, 104
        progress = (index + 1) / frames
        radius = 22 + progress * 30
        # Fan centered on the player direction is rotated at runtime; author
        # a symmetric 76-degree arc pointing up from the ground anchor.
        for step in range(5):
            rr = radius - step * 5
            if rr <= 6:
                continue
            draw.arc((cx - rr, cy - rr, cx + rr, cy + rr), 180 + 14, 360 - 14,
                     fill="#a4ef6c" if step == 0 else "#6fdb4f", width=2 if step == 0 else 1)
        if index == frames - 1:
            draw.arc((cx - radius, cy - radius, cx + radius, cy + radius),
                     180 + 14, 360 - 14, fill="#eaffe2", width=2)
        out.append(quantize(frame))
    return out


def summon_gel(death: Image.Image, frames: int = 6) -> list[Image.Image]:
    fw, fh = 80, 80
    n = death.width // fw
    mud = death.crop(((n - 1) * fw, 0, n * fw, fh))
    out = []
    for index in range(frames):
        frame = Image.new("RGBA", (96, 96))
        # Mud pool scaled into the lower centre of the larger canvas.
        pool = mud.resize((64, 64), Image.Resampling.NEAREST)
        frame.alpha_composite(pool, (16, 28))
        draw = ImageDraw.Draw(frame)
        # Small slimes bubble up around the pool edges.
        for blob in range(2 + index // 2):
            angle = (blob * 2.399963 + index * 0.45)
            dist = 22 + (index * 3) % 20
            bx = 48 + math.cos(angle) * dist
            by = 68 - (index + 1) * 3 - blob * 3
            if by < 12 or by > 92 or bx < 8 or bx > 88:
                continue
            rr = 4 + (blob % 2) * 2
            draw.ellipse((bx - rr, by - rr, bx + rr, by + rr), fill="#8fdf5a")
            draw.ellipse((bx - rr + 1, by - rr - 1, bx + rr - 1, by + rr - 1), fill="#c8ff9a")
        out.append(frame)
    return out


def bounce_afterimage(charge: Image.Image, frames: int = 6) -> list[Image.Image]:
    fw, fh = 80, 80
    # Frame 4 is the airborne stretch pose; it reads best as a motion ghost.
    base = charge.crop((4 * fw, 0, 5 * fw, fh))
    px = base.load()
    ghost = Image.new("RGBA", (fw, fh))
    gp = ghost.load()
    for y in range(fh):
        for x in range(fw):
            r, g, b, a = px[x, y]
            if not a:
                continue
            gp[x, y] = (round(r * 0.35 + 92), round(g * 0.65 + 110),
                        round(b * 0.45 + 70), 255)
    out = []
    for index in range(frames):
        frame = Image.new("RGBA", (fw, fh))
        frame.alpha_composite(ghost, (-4 + index, 0))
        out.append(frame)
    return out


def wave_dissipate(wave: Image.Image, frames: int = 4) -> list[Image.Image]:
    fw, fh = 112, 112
    base = wave.crop((7 * fw, 0, 8 * fw, fh))
    out = []
    for index in range(frames):
        frame = base.copy()
        px = frame.load()
        # Drop an increasing deterministic fraction of the surviving ring pixels.
        drop_pct = index * 14
        for y in range(fh):
            for x in range(fw):
                if px[x, y][3] and (x * 73 + y * 151 + index * 977) % 100 < drop_pct:
                    px[x, y] = (0, 0, 0, 0)
        out.append(frame)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", default="assets/art-v6/game-ready/v6")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    out_dir = root / args.out_dir

    save_strip(hurt_from_idle(load("boss_slimeking", root)), out_dir / "boss_slimeking_hurt.png")
    save_strip(fan_telegraph(), out_dir / "vfx_boss_slimeking_fan_telegraph.png")
    save_strip(summon_gel(load("boss_slimeking_death", root)), out_dir / "vfx_boss_slimeking_summon_gel.png")
    save_strip(bounce_afterimage(load("boss_slimeking_charge", root)),
               out_dir / "vfx_boss_slimeking_bounce_afterimage.png")
    save_strip(wave_dissipate(load("vfx_boss_slimeking_ground_wave", root)),
               out_dir / "vfx_boss_slimeking_wave_dissipate.png")


if __name__ == "__main__":
    main()
