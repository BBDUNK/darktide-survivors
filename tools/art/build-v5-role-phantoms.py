#!/usr/bin/env python3
"""Build six deterministic, pixel-clean role-phantom action systems.

The repaired four-direction heroes provide stable anatomy and action timing.
This pass turns their upper bodies into role-specific ancestral avatars while
preserving the exact 64px grid, hard alpha and shared body pivot.
"""

from pathlib import Path
from PIL import Image, ImageFilter, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
HERO_DIR = ROOT / "assets/art-v4/repaired/characters"
OUT_DIR = ROOT / "assets/art-v5/sprites/avatars"
OUT_DIR.mkdir(parents=True, exist_ok=True)

ROLES = {
    "knight": ((255, 212, 92), (255, 247, 190), "crown"),
    "mage": ((130, 70, 210), (224, 177, 255), "horns"),
    "ranger": ((43, 184, 116), (176, 255, 205), "antlers"),
    "cleric": ((235, 224, 180), (255, 249, 218), "halo"),
    "berserker": ((174, 38, 54), (255, 137, 112), "horns"),
    "chrono": ((39, 183, 211), (196, 251, 255), "gear"),
}
DIRECTIONS = ["down", "right", "left", "up"]
ACTIONS = {"idle": ("idle", [0, 2, 4, 6]), "walk": ("run", list(range(8))),
           "attack": ("attack", list(range(8)))}


def hard_alpha(image):
    image = image.convert("RGBA")
    data = []
    for r, g, b, a in image.getdata():
        data.append((r, g, b, 255 if a >= 128 else 0))
    image.putdata(data)
    return image


def add_identity(frame, kind, base, bright, phase):
    draw = ImageDraw.Draw(frame)
    bob = phase % 2
    if kind == "crown":
        draw.line((27, 10 + bob, 29, 6 + bob, 32, 10 + bob, 35, 5 + bob, 38, 10 + bob), fill=bright, width=1)
    elif kind == "horns":
        draw.line((27, 13 + bob, 23, 8 + bob, 22, 5 + bob), fill=base, width=2)
        draw.line((37, 13 + bob, 41, 8 + bob, 42, 5 + bob), fill=base, width=2)
    elif kind == "antlers":
        draw.line((27, 14, 23, 9, 22, 5), fill=bright)
        draw.line((23, 9, 19, 8), fill=bright)
        draw.line((37, 14, 41, 9, 42, 5), fill=bright)
        draw.line((41, 9, 45, 8), fill=bright)
    elif kind == "halo":
        draw.ellipse((23, 5 + bob, 41, 10 + bob), outline=bright, width=1)
    elif kind == "gear":
        draw.ellipse((24, 5 + bob, 40, 21 + bob), outline=bright, width=1)
        for x, y in ((32, 3 + bob), (32, 23 + bob), (22, 13 + bob), (42, 13 + bob)):
            draw.rectangle((x - 1, y - 1, x + 1, y + 1), fill=base)


def spectral_frame(source, base, bright, identity, phase):
    source = hard_alpha(source)
    alpha = source.getchannel("A")
    # Upper-body avatar: retain head/torso/arms, dissolve legs into a short
    # spectral taper so it can sit directly behind the matching hero.
    mask = Image.new("L", (64, 64), 0)
    mask.paste(alpha.crop((0, 0, 64, 51)), (0, 0))
    md = ImageDraw.Draw(mask)
    for y, opacity in ((49, 255), (50, 220), (51, 165), (52, 105), (53, 55)):
        md.line((18, y, 46, y), fill=opacity)
    lum = source.convert("L")
    colored = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    pixels = []
    for value, a in zip(lum.getdata(), mask.getdata()):
        if not a:
            pixels.append((0, 0, 0, 0))
            continue
        t = value / 255.0
        # Keep deep old-metal shadows while lifting the spectral material.
        if t < 0.24:
            rgb = tuple(max(7, int(c * 0.22)) for c in base)
        else:
            mix = min(1.0, (t - 0.18) / 0.82)
            rgb = tuple(int(base[i] * (1 - mix) + bright[i] * mix) for i in range(3))
        pixels.append((*rgb, 255 if a >= 128 else 0))
    colored.putdata(pixels)
    # One-pixel spectral silhouette, still hard-alpha and palette bounded.
    outline_alpha = mask.filter(ImageFilter.MaxFilter(3))
    outline = Image.new("RGBA", (64, 64), (*tuple(max(4, int(c * 0.2)) for c in base), 0))
    outline.putalpha(outline_alpha.point(lambda a: 255 if a >= 128 else 0))
    outline.alpha_composite(colored)
    add_identity(outline, identity, base, bright, phase)
    return hard_alpha(outline)


def build():
    for role, (base, bright, identity) in ROLES.items():
        for action, (source_action, indexes) in ACTIONS.items():
            source_path = HERO_DIR / f"char_{role}_{source_action}_4dir.png"
            source = Image.open(source_path).convert("RGBA")
            for row, direction in enumerate(DIRECTIONS):
                frames = []
                for phase, col in enumerate(indexes):
                    raw = source.crop((col * 64, row * 64, (col + 1) * 64, (row + 1) * 64))
                    frames.append(spectral_frame(raw, base, bright, identity, phase))
                strip = Image.new("RGBA", (64 * len(frames), 64), (0, 0, 0, 0))
                for index, frame in enumerate(frames):
                    strip.paste(frame, (index * 64, 0), frame)
                strip.save(OUT_DIR / f"avatar_{role}_{action}_{direction}.png", optimize=True)
    print(f"Built {len(ROLES) * len(ACTIONS) * len(DIRECTIONS)} role-phantom action strips in {OUT_DIR}")


if __name__ == "__main__":
    build()
