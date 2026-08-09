"""Procedurally draw the six hero pixel-art action sheets.

Each hero gets a distinct palette, silhouette and weapon, with a 9-frame
walk cycle, a 4-frame attack and a 4-frame idle breathing cycle. The output
is authored at 64x64 cells and then fitted by the normal atlas pipeline.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "sprites" / "sources" / "chars"
CELL = 64
WALK_FRAMES = 9
ATTACK_FRAMES = 4
IDLE_FRAMES = 4

OUTLINE = (26, 22, 36)


HEROES = {
    "knight": {
        "skin": (236, 198, 164),
        "skin_dark": (198, 160, 132),
        "armor": (124, 146, 170),
        "armor_dark": (76, 96, 120),
        "armor_light": (192, 210, 228),
        "trim": (190, 62, 52),
        "leather": (94, 74, 60),
        "weapon": "sword",
        "weapon_color": (214, 226, 240),
    },
    "mage": {
        "skin": (228, 196, 172),
        "skin_dark": (196, 160, 138),
        "robe": (84, 66, 128),
        "robe_dark": (52, 40, 88),
        "robe_light": (140, 120, 186),
        "trim": (224, 188, 92),
        "leather": (70, 56, 96),
        "weapon": "staff",
        "weapon_color": (160, 150, 210),
    },
    "ranger": {
        "skin": (222, 182, 148),
        "skin_dark": (182, 144, 114),
        "leather": (118, 92, 62),
        "leather_dark": (80, 62, 44),
        "tunic": (72, 110, 76),
        "tunic_dark": (46, 78, 54),
        "tunic_light": (126, 160, 116),
        "trim": (226, 198, 120),
        "weapon": "bow",
        "weapon_color": (150, 106, 60),
    },
    "cleric": {
        "skin": (242, 210, 180),
        "skin_dark": (206, 172, 144),
        "robe": (240, 234, 218),
        "robe_dark": (178, 172, 158),
        "robe_light": (255, 252, 242),
        "trim": (220, 176, 88),
        "leather": (140, 112, 84),
        "weapon": "mace",
        "weapon_color": (238, 210, 120),
    },
    "berserker": {
        "skin": (200, 152, 120),
        "skin_dark": (162, 118, 92),
        "tunic": (152, 54, 48),
        "tunic_dark": (102, 36, 34),
        "tunic_light": (200, 94, 72),
        "trim": (110, 88, 66),
        "leather": (82, 58, 48),
        "weapon": "axe",
        "weapon_color": (204, 212, 224),
    },
    "chrono": {
        "skin": (224, 192, 162),
        "skin_dark": (188, 154, 128),
        "robe": (58, 132, 128),
        "robe_dark": (34, 90, 92),
        "robe_light": (116, 192, 182),
        "trim": (238, 200, 94),
        "leather": (50, 74, 84),
        "weapon": "scepter",
        "weapon_color": (160, 232, 224),
    },
}


def canvas() -> Image.Image:
    return Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))


def put(img: Image.Image, x: int, y: int, color) -> None:
    if 0 <= x < CELL and 0 <= y < CELL:
        img.putpixel((x, y), color)


def rect(img: Image.Image, x: int, y: int, w: int, h: int, color) -> None:
    d = ImageDraw.Draw(img)
    d.rectangle([x, y, x + w - 1, y + h - 1], fill=color)


def outline_rect(img: Image.Image, x: int, y: int, w: int, h: int, base, outline) -> None:
    rect(img, x - 1, y - 1, w + 2, h + 2, outline)
    rect(img, x, y, w, h, base)


def limb(img: Image.Image, points, color, width: int = 5, outline=OUTLINE) -> None:
    d = ImageDraw.Draw(img)
    d.line(points, fill=outline, width=width + 2, joint="curve")
    d.line(points, fill=color, width=width, joint="curve")


def shade_torso(img: Image.Image, x: int, y: int, w: int, h: int, light, base, dark) -> None:
    rect(img, x, y, w, h, base)
    rect(img, x, y, w, 2, light)
    rect(img, x, y + h - 2, w, 2, dark)


def face(img: Image.Image, cx: int, top: int, skin, dark, hood=False) -> None:
    outline_rect(img, cx - 3, top, 7, 7, skin, OUTLINE)
    if hood:
        rect(img, cx - 4, top - 1, 9, 3, OUTLINE)
        rect(img, cx - 4, top - 1, 9, 2, (54, 48, 76) if hood is True else hood)
    put(img, cx - 1, top + 3, dark)
    put(img, cx + 2, top + 3, dark)


def draw_legs(img: Image.Image, hip_y: int, hero, phase: float, mode: str, frame: int) -> None:
    dark = hero.get("leather_dark", hero.get("robe_dark", hero.get("armor_dark", OUTLINE)))
    base = hero.get("leather", hero.get("robe", hero.get("armor", dark)))
    if mode == "walk":
        dx_a = round(math.sin(phase) * 4)
        dx_b = -dx_a
        lift_a = round(max(0, -math.cos(phase)) * 3)
        lift_b = round(max(0, math.cos(phase)) * 3)
    elif mode == "idle":
        dx_a, dx_b = 0, 0
        lift_a = 1 if frame in (1, 3) else 0
        lift_b = 0
    else:
        stance = 2 if frame >= 2 else 1
        dx_a, dx_b = -stance, stance
        lift_a, lift_b = 0, 0
    for hip_x, dx, lift, far in ((28, dx_a, lift_a, True), (35, dx_b, lift_b, False)):
        foot_x = hip_x + dx
        foot_y = 59 - lift
        knee_x = hip_x + round(dx * 0.55)
        knee_y = 51 + round(abs(dx) * 0.55)
        limb(img, [(hip_x, hip_y), (knee_x, knee_y), (foot_x, foot_y)], dark if far else base, 4)
        rect(img, foot_x - 1, foot_y, 5, 2, OUTLINE)
        rect(img, foot_x, foot_y, 4, 1, base)


def draw_body(img: Image.Image, bob: int, hero, mode: str, frame: int) -> None:
    robe = hero.get("robe")
    robe_dark = hero.get("robe_dark", hero.get("tunic_dark", hero.get("armor_dark")))
    robe_light = hero.get("robe_light", hero.get("tunic_light", hero.get("armor_light")))
    tunic_base = hero.get("tunic", hero.get("armor"))
    tunic_light = hero.get("tunic_light", hero.get("armor_light"))
    tunic_dark = hero.get("tunic_dark", hero.get("armor_dark"))
    if robe:
        sway = 0
        if mode == "walk":
            sway = round(math.sin(frame * math.pi / 4.5) * 1.5)
        rect(img, 27 + sway - 1, 33 + bob, 13, 2, OUTLINE)
        for i in range(5):
            w = 11 - i
            x = 32 - round(w / 2) + round(sway * (1 - i / 6))
            rect(img, x - 1, 44 + bob + i, w + 2, 2, OUTLINE)
            rect(img, x, 44 + bob + i, w, 1, robe_dark if i < 2 else robe)
        rect(img, 28, 33 + bob, 11, 10, robe)
        rect(img, 28, 33 + bob, 11, 2, robe_light)
        rect(img, 28, 41 + bob, 11, 2, robe_dark)
        rect(img, 27, 41 + bob, 13, 2, OUTLINE)
    else:
        outline_rect(img, 27, 33 + bob, 11, 11, tunic_base, OUTLINE)
        shade_torso(img, 28, 34 + bob, 9, 9, tunic_light, tunic_base, tunic_dark)
    # Belt/trim
    trim = hero["trim"]
    rect(img, 27, 42 + bob, 13, 1, trim)
    put(img, 39, 42 + bob, (255, 230, 150))


def draw_head(img: Image.Image, bob: int, hero, mode: str, frame: int) -> None:
    skin = hero["skin"]
    skin_dark = hero["skin_dark"]
    name = hero.get("_name", "")
    top = 25 + bob
    if name == "knight":
        outline_rect(img, 28, top - 2, 9, 8, hero["armor_dark"], OUTLINE)
        rect(img, 29, top - 1, 7, 3, hero["armor"])
        rect(img, 30, top + 3, 5, 2, (34, 40, 54))
        rect(img, 29, top + 5, 7, 1, hero["armor_light"])
        rect(img, 36, top - 5, 2, 4, OUTLINE)
        rect(img, 35, top - 4, 2, 3, hero["trim"])
        rect(img, 30, top - 3, 6, 1, hero["armor_light"])
    elif name == "mage":
        face(img, 32, top, skin, skin_dark, hood=(66, 50, 102))
        rect(img, 29, top - 4, 8, 4, (66, 50, 102))
        rect(img, 30, top - 6, 5, 3, OUTLINE)
        rect(img, 31, top - 5, 3, 2, hero["trim"])
    elif name == "ranger":
        face(img, 32, top, skin, skin_dark, hood=(44, 70, 48))
        rect(img, 30, top - 3, 6, 2, (44, 70, 48))
        rect(img, 29, top - 4, 8, 2, OUTLINE)
    elif name == "cleric":
        face(img, 32, top, skin, skin_dark)
        rect(img, 29, top - 1, 7, 2, hero["robe_light"])
        rect(img, 28, top - 3, 9, 3, hero["robe"])
        rect(img, 29, top - 4, 7, 2, OUTLINE)
        rect(img, 31, top - 6, 4, 2, (224, 180, 100))
    elif name == "berserker":
        face(img, 32, top, skin, skin_dark)
        rect(img, 28, top - 2, 9, 2, (112, 76, 50))
        rect(img, 27, top - 1, 2, 2, (112, 76, 50))
        rect(img, 36, top - 1, 2, 2, (112, 76, 50))
        rect(img, 29, top + 5, 7, 2, (112, 76, 50))
    elif name == "chrono":
        face(img, 32, top, skin, skin_dark)
        rect(img, 29, top - 1, 7, 2, (34, 44, 62))
        rect(img, 28, top - 3, 9, 3, OUTLINE)
        rect(img, 29, top - 2, 7, 2, (44, 56, 78))
        rect(img, 28, top + 2, 9, 2, (60, 210, 200))
        put(img, 29, top + 3, (210, 250, 244))
        put(img, 36, top + 3, (210, 250, 244))


def draw_arms(img: Image.Image, bob: int, hero, hand: tuple[int, int], mode: str, frame: int, phase: float) -> None:
    skin = hero["skin"]
    sleeve = hero.get("robe", hero.get("tunic", hero.get("armor")))
    left_hand = (23, 44 + bob)
    if mode == "walk":
        left_hand = (23 - round(math.cos(phase) * 2), 43 + bob + round(math.sin(phase)))
    elif mode == "idle":
        left_hand = (23, 43 + bob + (1 if frame in (1, 3) else 0))
    elif mode == "attack":
        left_hand = (25 + (2 if frame >= 2 else 0), 40 + bob + (2 if frame == 3 else 0))
    limb(img, [(26, 35 + bob), left_hand], sleeve, 4)
    put(img, left_hand[0], left_hand[1], skin)
    limb(img, [(37, 34 + bob), hand], sleeve, 4)
    put(img, hand[0], hand[1], skin)


def draw_weapon(img: Image.Image, bob: int, hero, mode: str, frame: int) -> tuple[int, int]:
    kind = hero["weapon"]
    wc = hero["weapon_color"]
    if mode == "attack":
        poses = {
            "sword": [(38, 38), (42, 33), (47, 39), (44, 45)],
            "staff": [(39, 38), (42, 32), (45, 38), (41, 45)],
            "bow": [(40, 37), (41, 34), (46, 38), (42, 44)],
            "mace": [(39, 38), (42, 32), (45, 39), (41, 45)],
            "axe": [(40, 38), (44, 33), (48, 39), (43, 45)],
            "scepter": [(39, 38), (42, 33), (45, 39), (41, 45)],
        }
        hand = poses[kind][frame]
    elif mode == "walk":
        hand = (40, 42 + bob)
    else:
        hand = (40, 41 + bob)
    hx, hy = hand
    if kind == "sword":
        if mode == "attack" and frame >= 2:
            limb(img, [(hx, hy), (hx + 12 - frame * 2, hy - 10 + frame * 2)], wc, 3)
            rect(img, hx + 10 - frame * 2, hy - 12 + frame * 2, 4, 2, (255, 240, 220))
        else:
            rect(img, hx - 1, hy - 2, 3, 2, (120, 90, 60))
            rect(img, hx - 3, hy - 3, 7, 2, (150, 120, 84))
            rect(img, hx - 1, hy - 22, 3, 20, wc)
            rect(img, hx, hy - 20, 1, 16, (255, 255, 255))
    elif kind == "staff":
        limb(img, [(hx, hy), (hx, hy - 30)], (96, 74, 52), 4)
        glow = (150, 140, 230) if frame % 2 == 0 else (200, 190, 255)
        rect(img, hx - 3, hy - 35, 7, 7, OUTLINE)
        rect(img, hx - 2, hy - 34, 5, 5, glow)
        put(img, hx, hy - 33, (255, 255, 255))
    elif kind == "bow":
        d = ImageDraw.Draw(img)
        d.arc([hx - 8, hy - 14, hx + 14, hy + 6], 40, 160, fill=(96, 66, 40), width=3)
        d.arc([hx - 7, hy - 13, hx + 13, hy + 5], 45, 155, fill=wc, width=2)
        if mode == "attack" and frame >= 2:
            limb(img, [(hx - 7, hy), (hx + 21, hy)], (214, 224, 240), 2)
            put(img, hx - 8, hy, (220, 224, 232))
            put(img, hx - 8, hy - 1, (240, 242, 246))
            put(img, hx + 22, hy, (230, 236, 248))
            put(img, hx + 22, hy + 1, (230, 236, 248))
        else:
            d.line([hx - 5, hy - 9, hx - 4, hy + 8], fill=(210, 214, 222), width=1)
    elif kind == "mace":
        limb(img, [(hx, hy), (hx, hy - 22)], (110, 86, 62), 4)
        rect(img, hx - 3, hy - 28, 7, 6, OUTLINE)
        rect(img, hx - 2, hy - 27, 5, 4, wc)
        put(img, hx - 1, hy - 26, (255, 244, 200))
        for dx, dy in ((hx - 4, hy - 24), (hx + 4, hy - 24), (hx, hy - 30), (hx, hy - 22)):
            put(img, dx, dy, wc)
    elif kind == "axe":
        limb(img, [(hx, hy), (hx, hy - 24)], (100, 72, 50), 3)
        rect(img, hx - 9, hy - 28, 18, 7, OUTLINE)
        rect(img, hx - 8, hy - 27, 16, 5, wc)
        rect(img, hx - 8, hy - 27, 5, 5, (226, 234, 246))
        rect(img, hx + 6, hy - 26, 2, 3, (255, 255, 255))
    elif kind == "scepter":
        limb(img, [(hx, hy), (hx, hy - 24)], (70, 90, 100), 4)
        rect(img, hx - 3, hy - 31, 7, 7, OUTLINE)
        rect(img, hx - 2, hy - 30, 5, 5, hero["weapon_color"])
        put(img, hx, hy - 29, (255, 255, 255))
        rect(img, hx - 2, hy - 26, 5, 1, (255, 255, 255))
    return hand


def draw_attack_fx(img: Image.Image, hero, mode: str, frame: int, hand: tuple[int, int]) -> None:
    """Paint weapon-specific strike sparks on top of the action frames."""
    if mode != "attack" or frame < 2:
        return
    kind = hero["weapon"]
    hx, hy = hand
    wc = hero["weapon_color"]
    if kind == "sword":
        limb(img, [(hx + 1, hy + 1), (hx + 9, hy - 7), (hx + 17, hy - 3)], (236, 246, 255), 2)
        put(img, hx + 18, hy - 4, (255, 255, 255))
        put(img, hx + 10, hy - 9, (255, 255, 255))
        for dx, dy in ((hx + 6, hy - 2), (hx + 13, hy - 7), (hx + 16, hy + 1)):
            put(img, dx, dy, (170, 228, 255))
    elif kind == "staff":
        oy = hy - 33
        for ax in range(4):
            ang = ax * math.pi / 2 + frame * 0.35
            sx = hx + round(math.cos(ang) * 6)
            sy = oy + round(math.sin(ang) * 5)
            put(img, sx, sy, (255, 242, 190))
        rect(img, hx - 5, oy - 5, 11, 1, (255, 248, 220))
        rect(img, hx - 5, oy + 4, 11, 1, (255, 248, 220))
        for dx, dy in ((hx - 8, oy - 2), (hx + 9, oy), (hx, oy - 9)):
            put(img, dx, dy, (255, 255, 255))
    elif kind == "bow":
        for ax in range(3):
            ang = frame * 0.5 + ax * math.pi * 2 / 3
            sx = hx + round(math.cos(ang) * 7)
            sy = hy - 6 + round(math.sin(ang) * 4)
            put(img, sx, sy, (255, 236, 150))
        put(img, hx + 23, hy, (255, 250, 210))
        put(img, hx + 20, hy - 2, (255, 255, 255))
    elif kind == "mace":
        hy0 = hy - 27
        for ax in range(5):
            ang = ax * math.pi * 2 / 5 + frame * 0.4
            sx = hx + round(math.cos(ang) * 8)
            sy = hy0 + round(math.sin(ang) * 5)
            put(img, sx, sy, (255, 240, 170))
        put(img, hx, hy0 - 9, (255, 255, 255))
        put(img, hx + 7, hy0 - 4, (255, 255, 255))
        put(img, hx - 7, hy0 + 2, (255, 255, 255))
    elif kind == "axe":
        limb(img, [(hx + 6, hy - 30), (hx + 14, hy - 22), (hx + 12, hy - 13)], (236, 240, 246), 2)
        put(img, hx + 15, hy - 24, (255, 255, 255))
        put(img, hx + 12, hy - 12, (255, 255, 255))
        for dx, dy in ((hx + 10, hy - 26), (hx + 15, hy - 19), (hx + 8, hy - 14)):
            put(img, dx, dy, (200, 228, 255))
    elif kind == "scepter":
        gy = hy - 30
        d = ImageDraw.Draw(img)
        d.arc([hx - 9, gy - 7, hx + 9, gy + 7], -40 + frame * 28, 220 + frame * 28, fill=(150, 240, 232), width=1)
        d.arc([hx - 9, gy - 7, hx + 9, gy + 7], 140 + frame * 28, 40 + frame * 28, fill=(150, 240, 232), width=1)
        put(img, hx + 10, gy - 3, (255, 255, 255))
        put(img, hx - 10, gy + 2, (255, 255, 255))
        put(img, hx + 3, gy - 8, (255, 255, 255))
        put(img, hx - 2, gy + 8, (255, 255, 255))


def draw_cape(img: Image.Image, bob: int, hero, mode: str, frame: int) -> None:
    if not hero.get("robe"):
        return
    dark = hero["robe_dark"]
    base = hero["robe"]
    sway = round(math.sin(frame * math.pi / 4.5) * 2) if mode == "walk" else 0
    for i in range(7):
        x = 26 + round(sway * (1 - i / 8))
        rect(img, x, 42 + bob + i, 4, 2, OUTLINE)
        rect(img, x + 1, 42 + bob + i, 2, 1, dark if i < 3 else base)


def draw_char_frame(hero: dict, mode: str, frame: int) -> Image.Image:
    img = canvas()
    phase = frame / WALK_FRAMES * math.pi * 2
    bob = round(math.sin(phase * 2) * 1.5) if mode == "walk" else (1 if mode == "idle" and frame in (1, 3) else 0)
    if mode == "walk":
        lean = round(math.sin(phase) * 1.2)
    else:
        lean = 0
    if mode == "attack":
        bob = 0
    draw_cape(img, bob, hero, mode, frame)
    draw_legs(img, 44 + bob, hero, phase, mode, frame)
    draw_body(img, bob, hero, mode, frame)
    draw_head(img, bob, hero, mode, frame)
    hand = draw_weapon(img, bob, hero, mode, frame)
    draw_arms(img, bob, hero, hand, mode, frame, phase)
    draw_attack_fx(img, hero, mode, frame, hand)
    return img


def sheet(hero_key: str, mode: str) -> Image.Image:
    hero = HEROES[hero_key]
    hero["_name"] = hero_key
    count = {"walk": WALK_FRAMES, "attack": ATTACK_FRAMES, "idle": IDLE_FRAMES}[mode]
    out = Image.new("RGBA", (CELL * count, CELL), (0, 0, 0, 0))
    for f in range(count):
        out.alpha_composite(draw_char_frame(hero, mode, f), (f * CELL, 0))
    return out


def build_ice_burst() -> Image.Image:
    frames = []
    for f in range(9):
        img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        r = 2.5 + f * 2.1
        cx, cy = 16, 16
        white = (255, 255, 255)
        cyan = (118, 226, 255)
        deep = (56, 150, 232)
        d.ellipse([cx - r * 0.45, cy - r * 0.45, cx + r * 0.45, cy + r * 0.45], fill=(255, 255, 255))
        for a_i in range(6):
            a = a_i * math.pi / 3 + f * 0.12
            for arm in range(2):
                aa = a + (0.32 if arm else -0.32)
                x2 = cx + math.cos(a) * r
                y2 = cy + math.sin(a) * r
                xm = cx + math.cos(aa) * r * 0.45
                ym = cy + math.sin(aa) * r * 0.45
                d.line([(cx, cy), (x2, y2)], fill=cyan, width=2)
                d.line([(x2, y2), (xm, ym)], fill=white, width=1)
                tip = (round(cx + math.cos(a) * (r + 2)), round(cy + math.sin(a) * (r + 2)))
                d.ellipse([tip[0] - 1, tip[1] - 1, tip[0] + 1, tip[1] + 1], fill=white)
        if f >= 2:
            for s in range(4):
                sa = s * math.pi / 2 + 0.5
                sx = round(cx + math.cos(sa) * r * 0.8)
                sy = round(cy + math.sin(sa) * r * 0.8)
                d.line([(sx, sy), (sx + 4, sy - 3)], fill=deep, width=1)
                d.line([(sx + 4, sy - 3), (sx + 5, sy + 1)], fill=deep, width=1)
        frames.append(img)
    out = Image.new("RGBA", (32 * len(frames), 32), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.alpha_composite(f, (i * 32, 0))
    return out


def update_manifest(hero_keys: list[str]) -> None:
    manifest_path = ROOT / "tools" / "art" / "art-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for key in hero_keys:
        for suffix, count, fps in (("", IDLE_FRAMES, 8), ("_walk", WALK_FRAMES, 10), ("_attack", ATTACK_FRAMES, 13)):
            name = f"char_{key}{suffix}"
            for asset in manifest["assets"]:
                if asset["name"] != name:
                    continue
                file_suffix = "_idle" if suffix == "" else suffix
                asset["source"] = f"assets/sprites/sources/chars/char_{key}{file_suffix}.png"
                asset["frameSize"] = [CELL, CELL]
                asset["frameRow"] = 0
                asset["frames"] = count
                asset["fps"] = fps
                asset["preservePixels"] = True
                asset["pixelScale"] = 1
                asset["size"] = [34, 34]
                asset["anchor"] = [17, 33]
                asset["renderScale"] = 0.72
                asset["allowDuplicateFrames"] = True
                asset["minCoverage"] = 0.015
                asset["maxCentroidDrift"] = 8
                asset["maxBaselineDrift"] = 3
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    open_manifest = ROOT / "tools" / "art" / "open-assets-manifest.json"
    if open_manifest.exists():
        om = json.loads(open_manifest.read_text(encoding="utf-8"))
        for asset in om.get("assets", []):
            if asset.get("name") == "vfx_ice":
                asset["source"] = "assets/sprites/sources/chars/vfx_ice_burst.png"
        open_manifest.write_text(
            json.dumps(om, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    keys = list(HEROES)
    for key in keys:
        for mode in ("idle", "walk", "attack"):
            sheet(key, mode).save(OUT / f"char_{key}_{mode}.png", optimize=True)
            print(f"wrote char_{key}_{mode}.png")
    build_ice_burst().save(OUT / "vfx_ice_burst.png", optimize=True)
    print("wrote vfx_ice_burst.png")
    update_manifest(keys)
    print("updated art manifests")


if __name__ == "__main__":
    main()
