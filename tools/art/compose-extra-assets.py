"""Compose LPC character walk sheets and small prop sprites for the game atlas."""
from __future__ import annotations

import math
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "_unused" / "vendor" / "lpc" / "raw"
OUT_LPC = ROOT / "assets" / "sprites" / "sources" / "lpc"
OUT_PROPS = ROOT / "assets" / "sprites" / "sources" / "props"


def hard_alpha(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    image = image.convert("RGBA")
    image.putalpha(alpha.point(lambda a: 255 if a >= 96 else 0))
    return image


def tint_layer(image: Image.Image, rgb: tuple[int, int, int], darken: float = 1.0) -> Image.Image:
    """Multiply each opaque pixel's colour, preserving the authored shading."""
    image = hard_alpha(image.convert("RGBA"))
    px = image.load()
    w, h = image.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if not a:
                continue
            nr = min(255, int(r * rgb[0] / 255 * darken))
            ng = min(255, int(g * rgb[1] / 255 * darken))
            nb = min(255, int(b * rgb[2] / 255 * darken))
            px[x, y] = (nr, ng, nb, 255)
    return image


def cell(image: Image.Image, row: int, frame: int, size: int = 64) -> Image.Image:
    return image.crop((frame * size, row * size, (frame + 1) * size, (row + 1) * size))


def composite_walk(layers, tints, weapon: str, row: int = 9, frames: int = 9) -> Image.Image:
    sheet = Image.new("RGBA", (frames * 64, 64), (0, 0, 0, 0))
    for f in range(frames):
        canvas = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        for key in ("body", "legs", "feet", "torso", "head", "hair"):
            im = tint_layer(layers[key], tints.get(key, (255, 255, 255)))
            canvas.alpha_composite(cell(im, row, f))
        if weapon == "bow":
            bg = hard_alpha(layers["bow_bg"].convert("RGBA"))
            fg = hard_alpha(layers["bow_fg"].convert("RGBA"))
            q = hard_alpha(layers["quiver"].convert("RGBA"))
            canvas.alpha_composite(cell(bg, row, f))
            canvas.alpha_composite(cell(fg, row, f))
            canvas.alpha_composite(cell(q, row, f))
        else:
            sword = tint_layer(layers["sword"], tints.get("sword", (230, 235, 244)))
            canvas.alpha_composite(cell(sword, row, f))
        sheet.alpha_composite(canvas, (f * 64, 0))
    return hard_alpha(sheet)


def compose_lpc_characters() -> None:
    OUT_LPC.mkdir(parents=True, exist_ok=True)
    names = [
        "body_bodies_male_light.png",
        "legs_pants_male_leather.png",
        "feet_boots_male_black.png",
        "torso_armour_plate_male_steel.png",
        "head_heads_human_male_light.png",
        "hair_balding_adult_black.png",
        "weapon_sword_arming_universal_fg_steel.png",
        "weapon_ranged_bow_normal_universal_background_light.png",
        "weapon_ranged_bow_normal_universal_foreground_light.png",
        "quiver_quiver.png",
    ]
    layers = {}
    for name in names:
        key = name.replace(".png", "")
        if name.startswith("body_"):
            key = "body"
        elif name.startswith("legs_"):
            key = "legs"
        elif name.startswith("feet_"):
            key = "feet"
        elif name.startswith("torso_"):
            key = "torso"
        elif name.startswith("head_"):
            key = "head"
        elif name.startswith("hair_"):
            key = "hair"
        elif "sword_arming_universal" in name:
            key = "sword"
        elif "bow_normal_universal_background" in name:
            key = "bow_bg"
        elif "bow_normal_universal_foreground" in name:
            key = "bow_fg"
        elif name.startswith("quiver_"):
            key = "quiver"
        layers[key] = Image.open(RAW / name).convert("RGBA")

    # Each class gets its own palette/gear while sharing the same high-quality base.
    classes = {
        "char_knight": {
            "weapon": "sword",
            "tints": {
                "body": (224, 198, 172),
                "legs": (88, 98, 122),
                "feet": (42, 46, 58),
                "torso": (178, 192, 212),
                "head": (224, 198, 172),
                "hair": (64, 62, 68),
                "sword": (218, 226, 238),
            },
        },
        "char_mage": {
            "weapon": "sword",
            "tints": {
                "body": (206, 186, 214),
                "legs": (88, 72, 128),
                "feet": (58, 50, 84),
                "torso": (128, 104, 178),
                "head": (222, 206, 230),
                "hair": (48, 48, 66),
                "sword": (168, 130, 236),
            },
        },
        "char_ranger": {
            "weapon": "bow",
            "tints": {
                "body": (218, 196, 168),
                "legs": (94, 116, 74),
                "feet": (76, 58, 40),
                "torso": (126, 150, 92),
                "head": (218, 196, 168),
                "hair": (70, 58, 44),
                "sword": (214, 220, 230),
            },
        },
        "char_cleric": {
            "weapon": "sword",
            "tints": {
                "body": (226, 206, 184),
                "legs": (120, 108, 96),
                "feet": (94, 84, 74),
                "torso": (216, 208, 188),
                "head": (226, 206, 184),
                "hair": (108, 92, 72),
                "sword": (244, 218, 150),
            },
        },
        "char_berserker": {
            "weapon": "sword",
            "tints": {
                "body": (216, 184, 162),
                "legs": (84, 56, 58),
                "feet": (46, 40, 46),
                "torso": (150, 66, 62),
                "head": (216, 184, 162),
                "hair": (38, 34, 42),
                "sword": (208, 216, 228),
            },
        },
        "char_chrono": {
            "weapon": "sword",
            "tints": {
                "body": (198, 216, 226),
                "legs": (70, 92, 112),
                "feet": (52, 68, 88),
                "torso": (104, 158, 178),
                "head": (204, 222, 232),
                "hair": (74, 88, 108),
                "sword": (128, 208, 236),
            },
        },
    }
    for name, spec in classes.items():
        sheet = composite_walk(layers, spec["tints"], spec["weapon"])
        path = OUT_LPC / (name + "_walk.png")
        sheet.save(path)
        print("wrote", path)


def draw_props() -> None:
    OUT_PROPS.mkdir(parents=True, exist_ok=True)

    # Small horizontal arrow pointing right (24x10). Drawn at native pixel scale,
    # rendered without rotation and flipped only for the leftward flight.
    arrow = Image.new("RGBA", (24, 10), (0, 0, 0, 0))
    d = ImageDraw.Draw(arrow)
    d.line((2, 5, 20, 5), fill=(66, 48, 30), width=2)
    d.line((1, 5, 1, 5), fill=(66, 48, 30))
    d.line((21, 3, 23, 5), fill=(222, 230, 240), width=2)
    d.line((23, 5, 21, 7), fill=(196, 206, 220), width=2)
    d.line((21, 3, 23, 3), fill=(244, 250, 255))
    d.line((2, 2, 7, 3), fill=(84, 192, 92))
    d.line((2, 8, 7, 7), fill=(46, 136, 58))
    d.line((0, 5, 1, 5), fill=(84, 192, 92))
    d.line((8, 3, 8, 7), fill=(66, 48, 30))
    arrow.save(OUT_PROPS / "p_arrow_small.png")

    # Classic red/blue horseshoe magnet (28x28).
    magnet = Image.new("RGBA", (28, 28), (0, 0, 0, 0))
    d = ImageDraw.Draw(magnet)
    d.rounded_rectangle((4, 3, 11, 19), radius=2, fill=(202, 52, 52))
    d.rounded_rectangle((16, 3, 23, 19), radius=2, fill=(52, 88, 214))
    d.rounded_rectangle((4, 2, 23, 8), radius=2, fill=(228, 234, 244))
    d.line((7, 4, 9, 6), fill=(250, 150, 150))
    d.line((18, 4, 20, 6), fill=(140, 180, 255))
    d.rectangle((6, 19, 9, 21), fill=(214, 220, 232))
    d.rectangle((18, 19, 21, 21), fill=(214, 220, 232))
    d.point((12, 11), fill=(255, 255, 255))
    d.point((11, 12), fill=(255, 255, 255))
    d.point((12, 13), fill=(255, 255, 255))
    d.line((9, 22, 7, 25), fill=(120, 226, 255), width=1)
    d.line((18, 22, 20, 25), fill=(120, 226, 255), width=1)
    d.line((6, 25, 4, 27), fill=(160, 240, 255), width=1)
    d.line((21, 25, 23, 27), fill=(160, 240, 255), width=1)
    magnet.save(OUT_PROPS / "magnet_horseshoe.png")

    # Classic round bomb with lit fuse (26x26).
    bomb = Image.new("RGBA", (26, 26), (0, 0, 0, 0))
    d = ImageDraw.Draw(bomb)
    d.ellipse((4, 7, 22, 25), fill=(40, 42, 50))
    d.ellipse((4, 7, 22, 25), outline=(18, 18, 24), width=1)
    d.arc((8, 11, 14, 16), 180, 300, fill=(82, 86, 100), width=2)
    d.arc((13, 13, 19, 19), 200, 320, fill=(70, 74, 88), width=1)
    d.line((13, 8, 15, 5), fill=(58, 42, 28), width=2)
    d.line((15, 5, 16, 3), fill=(128, 92, 48), width=2)
    d.point((17, 2), fill=(255, 214, 74))
    d.point((16, 1), fill=(255, 240, 160))
    d.point((18, 3), fill=(255, 170, 60))
    d.line((13, 8, 11, 10), fill=(58, 42, 28), width=1)
    bomb.save(OUT_PROPS / "bomb_round.png")


def make_tesla_source() -> None:
    """Key the green-screen master and pre-scale it for the atlas."""
    src = ROOT / "assets" / "art-library" / "generated" / "05_tesla_coil_master.png"
    dst = ROOT / "assets" / "sprites" / "sources" / "tesla_tower_128.png"
    image = Image.open(src).convert("RGBA")
    # Chroma key: exact #00FF00 background. Use a small tolerance and a border
    # flood fill so interior green detail is preserved.
    px = image.load()
    w, h = image.size
    tol = 18
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and abs(r) < tol and g > 255 - tol and abs(b) < tol:
                px[x, y] = (0, 0, 0, 0)
    # Despill: neutralise remaining green fringe on hard edges.
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if not a:
                continue
            g = min(g, max(r, b) + 4)
            px[x, y] = (r, g, b, 255)
    image = hard_alpha(image)
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        raise RuntimeError("tesla source is empty after keying")
    image = image.crop(bbox)
    scale = 128.0 / max(image.size)
    image = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))),
                         Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    canvas.alpha_composite(image, ((128 - image.width) // 2, 128 - image.height))
    canvas.save(dst)
    print("wrote", dst, canvas.getchannel("A").getbbox())


def main() -> None:
    compose_lpc_characters()
    draw_props()
    make_tesla_source()


if __name__ == "__main__":
    main()
