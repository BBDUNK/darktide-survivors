#!/usr/bin/env python3
"""Build deterministic, hard-alpha action sheets for the V5 vertical slice.

The Image2 source establishes the silhouette and material language.  This
script supplies exact frame grids, stable anchors and repeatable pixel VFX so
the runtime never has to stretch or interpolate a single source painting.
"""

from pathlib import Path
from PIL import Image, ImageDraw
import math

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/art-v5/sprites/weapons/tesla_battle_tank_actions.png"
OUT = ROOT / "assets/art-v5/sprites/weapons"
VFX = ROOT / "assets/art-v5/sprites/vfx"
ELITES = ROOT / "assets/art-v5/sprites/elites"
OUT.mkdir(parents=True, exist_ok=True)
VFX.mkdir(parents=True, exist_ok=True)
ELITES.mkdir(parents=True, exist_ok=True)

CYAN = (111, 241, 255, 255)
PALE = (213, 252, 255, 255)
BLUE = (28, 157, 210, 255)
DARK = (8, 27, 39, 255)


def hard_alpha(im):
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255 if a >= 128 else 0)
    return im


def cell(sheet, col, row, size=96):
    return sheet.crop((col * size, row * size, (col + 1) * size, (row + 1) * size))


def pulse_cyan(im, phase):
    """Animate only electrical pixels; the chassis silhouette never changes."""
    out = im.copy()
    px = out.load()
    gain = (0.72, 0.9, 1.18, 0.94, 0.76, 0.92, 1.12, 0.86)[phase % 8]
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a and b > r * 1.18 and (g + b) > 210:
                px[x, y] = (min(255, int(r * gain)), min(255, int(g * gain)), min(255, int(b * gain)), 255)
    return out


def muzzle(direction):
    return {
        "down": (48, 77, 0, 1),
        "up": (48, 18, 0, -1),
        "left": (15, 49, -1, 0),
        "right": (81, 49, 1, 0),
    }[direction]


def charge_pixels(im, direction, phase):
    out = pulse_cyan(im, phase)
    draw = ImageDraw.Draw(out)
    x, y, dx, dy = muzzle(direction)
    radius = max(1, min(7, phase - 1))
    if phase >= 2:
        draw.rectangle((x - radius, y, x + radius, y), fill=BLUE)
        draw.rectangle((x, y - radius, x, y + radius), fill=BLUE)
        if radius >= 2:
            draw.rectangle((x - radius + 1, y - radius + 1, x + radius - 1, y + radius - 1), outline=CYAN)
        if phase >= 5:
            draw.rectangle((x - 2, y - 2, x + 2, y + 2), fill=PALE)
            draw.line((x, y, x + dx * (5 + phase), y + dy * (5 + phase)), fill=PALE, width=2)
    return out


def build_tank(sheet):
    # Authored direction columns are down, up, left, right.
    dirs = [("down", 0), ("up", 1), ("left", 2), ("right", 3)]
    rows = []
    for direction, col in dirs:
        base = hard_alpha(cell(sheet, col, 0))
        rows.append([pulse_cyan(base, i * 2) for i in range(8)])
        # Track/energy cycling conveys motion without shifting the body or pivot.
        walk = []
        for i in range(8):
            fr = pulse_cyan(base, i)
            d = ImageDraw.Draw(fr)
            offset = i % 4
            if direction in ("down", "up"):
                d.point((20 + offset * 2, 70), fill=CYAN)
                d.point((74 - offset * 2, 70), fill=CYAN)
            else:
                d.point((26 + offset * 8, 72), fill=CYAN)
            walk.append(fr)
        rows.append(walk)
        rows.append([charge_pixels(base, direction, i) for i in range(8)])

    out = Image.new("RGBA", (96 * 8, 96 * len(rows)))
    for row, frames in enumerate(rows):
        for col, fr in enumerate(frames):
            out.alpha_composite(fr, (col * 96, row * 96))
    out.save(OUT / "tesla_battle_tank_full_actions.png")


def build_cannon(sheet):
    source = hard_alpha(cell(sheet, 2, 1))
    flight = Image.new("RGBA", (96 * 8, 96))
    for i in range(8):
        fr = pulse_cyan(source, i)
        d = ImageDraw.Draw(fr)
        x = 18 + (i % 4) * 2
        d.line((x, 48, x + 12, 48), fill=CYAN, width=2)
        if i in (2, 6):
            d.point((50, 42), fill=PALE)
            d.point((50, 54), fill=PALE)
        flight.alpha_composite(fr, (i * 96, 0))
    flight.save(OUT / "tesla_cannon_projectile.png")

    impact = Image.new("RGBA", (96 * 10, 96))
    for i in range(10):
        fr = Image.new("RGBA", (96, 96))
        d = ImageDraw.Draw(fr)
        p = i / 9
        r = int(4 + 39 * math.sin(p * math.pi / 2))
        alpha_col = PALE if i < 4 else CYAN
        for off in (0, 5, 10):
            rr = r - off
            if rr > 1:
                d.ellipse((48 - rr, 48 - rr, 48 + rr, 48 + rr), outline=alpha_col, width=2)
        for arm in range(8):
            a = arm * math.pi / 4 + i * 0.17
            x2 = 48 + int(math.cos(a) * r)
            y2 = 48 + int(math.sin(a) * r)
            d.line((48, 48, x2, y2), fill=BLUE, width=1)
        impact.alpha_composite(fr, (i * 96, 0))
    impact.save(VFX / "tesla_cannon_impact.png")


def build_overload():
    sheet = Image.new("RGBA", (160 * 12, 160))
    for i in range(12):
        fr = Image.new("RGBA", (160, 160))
        d = ImageDraw.Draw(fr)
        p = i / 11
        r = int(8 + 66 * p)
        for branch in range(18):
            a = branch * math.tau / 18 + (i % 3 - 1) * 0.025
            jitter = ((branch * 13 + i * 7) % 7) - 3
            inner = max(4, r - 10 - abs(jitter))
            x1 = 80 + int(math.cos(a) * inner)
            y1 = 80 + int(math.sin(a) * inner)
            amid = a + jitter * 0.018
            x2 = 80 + int(math.cos(amid) * (r - 3))
            y2 = 80 + int(math.sin(amid) * (r - 3))
            x3 = 80 + int(math.cos(a) * r)
            y3 = 80 + int(math.sin(a) * r)
            d.line((x1, y1, x2, y2, x3, y3), fill=PALE if branch % 3 == 0 else CYAN, width=2)
        d.ellipse((80-r, 80-r, 80+r, 80+r), outline=BLUE, width=2)
        sheet.alpha_composite(fr, (i * 160, 0))
    sheet.save(VFX / "tesla_overload_ground.png")


def build_frost_ground():
    """Twelve-frame radial ground frost: thin cracks/mist, no vertical shards."""
    sheet = Image.new("RGBA", (160 * 12, 160))
    frost = (154, 224, 246, 255)
    bright = (218, 250, 255, 255)
    shadow = (61, 118, 164, 255)
    for i in range(12):
        fr = Image.new("RGBA", (160, 160))
        d = ImageDraw.Draw(fr)
        p = i / 11
        radius = int(12 + 62 * (1 - (1 - p) ** 1.45))
        # Broken concentric arcs read as frost spreading across the floor,
        # while their small thickness keeps actors and projectiles legible.
        for ring_offset, col in ((-2, shadow), (0, frost), (2, bright)):
            rr = radius + ring_offset
            for seg in range(12):
                if ring_offset == 2 and seg % 3 != i % 3:
                    continue
                start = seg * 30 + ((seg * 7 + i * 3) % 8)
                extent = 16 + ((seg * 11 + i * 5) % 10)
                if i >= 10 and seg % 3 == i % 3:
                    continue
                d.arc((80 - rr, 80 - rr, 80 + rr, 80 + rr), start=start,
                      end=start + extent, fill=col, width=1 if ring_offset else 2)
        # Short radial frost cracks.  No branch rises more than 10 px beyond
        # the ring, unlike the former screen-blocking ice columns.
        for branch in range(24):
            a = branch * math.tau / 24 + ((branch * 5 + i) % 5 - 2) * 0.018
            inner = max(4, radius - 8 - ((branch + i) % 5))
            outer = min(77, radius + 3 + ((branch * 3 + i) % 7))
            x1 = 80 + int(math.cos(a) * inner)
            y1 = 80 + int(math.sin(a) * inner)
            bend = a + (((branch * 13 + i * 7) % 7) - 3) * 0.025
            xm = 80 + int(math.cos(bend) * ((inner + outer) * 0.5))
            ym = 80 + int(math.sin(bend) * ((inner + outer) * 0.5))
            x2 = 80 + int(math.cos(a) * outer)
            y2 = 80 + int(math.sin(a) * outer)
            d.line((x1, y1, xm, ym, x2, y2), fill=bright if branch % 7 == 0 else frost, width=1)
        # Sparse ground mist/frost grains, deterministically placed.
        grain_count = 84 if i < 9 else 48
        for grain in range(grain_count):
            a = ((grain * 47 + i * 19) % 360) * math.pi / 180
            band = radius - 12 + ((grain * 17 + i * 11) % 24)
            x = 80 + int(math.cos(a) * band)
            y = 80 + int(math.sin(a) * band)
            d.point((x, y), fill=frost if grain % 3 else bright)
            if grain % 13 == 0:
                d.point((x + 1, y), fill=shadow)
                d.point((x, y + 1), fill=shadow)
        sheet.alpha_composite(fr, (i * 160, 0))
    sheet.save(VFX / "frost_kiss_radial_actions_linear.png")


def repair_elite_skeleton():
    """Keep the authored archer, replacing its bodyless final attack cell."""
    source = hard_alpha(Image.open(ROOT / "assets/art-v3/sprites/elites/elite_skeleton_actions.png"))
    repaired = source.copy()
    complete_release = cell(source, 6, 2, 64)
    clear = Image.new("RGBA", (64, 64))
    repaired.paste(clear, (7 * 64, 2 * 64))
    repaired.alpha_composite(complete_release, (7 * 64, 2 * 64))
    repaired.save(ELITES / "elite_skeleton_actions_repaired.png")


def main():
    source = hard_alpha(Image.open(SOURCE))
    build_tank(source)
    build_cannon(source)
    build_overload()
    build_frost_ground()
    repair_elite_skeleton()


if __name__ == "__main__":
    main()
