#!/usr/bin/env python3
"""Build dedicated elite action sheets from the cleaned ordinary enemy sheets.

The transform is deliberately pixel-preserving: animation silhouettes and anchors stay
identical, while each family receives an attached armour/rune treatment, a heavier
two-tone outline and a separate runtime asset. No floating crown or UI marker is used.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "assets" / "art-v2" / "sprites" / "enemies"
OUTPUT_DIR = ROOT / "assets" / "art-v3" / "sprites" / "elites"

ENEMIES = [
    "bat", "slime", "slime_big", "zombie", "skeleton", "ghost", "spider", "cultist",
    "orc", "imp", "knight_armored", "werewolf", "mummy", "gargoyle", "bloodbat", "wraith",
]

PALETTES = {
    "toxic": ((31, 18, 22), (177, 126, 36), (219, 45, 49)),
    "undead": ((25, 19, 27), (191, 159, 88), (154, 35, 49)),
    "beast": ((29, 17, 17), (185, 112, 46), (197, 38, 34)),
    "occult": ((24, 15, 32), (166, 121, 62), (129, 57, 180)),
    "iron": ((20, 21, 25), (187, 139, 56), (164, 44, 35)),
    "infernal": ((28, 13, 13), (205, 132, 44), (226, 58, 25)),
}

FAMILY = {
    "slime": "toxic", "slime_big": "toxic", "spider": "toxic",
    "zombie": "undead", "skeleton": "undead", "ghost": "occult",
    "mummy": "undead", "wraith": "occult", "cultist": "occult",
    "bat": "beast", "bloodbat": "beast", "werewolf": "beast", "orc": "beast",
    "knight_armored": "iron", "gargoyle": "iron", "imp": "infernal",
}


def mix(base: tuple[int, int, int], accent: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    return tuple(round(base[i] * (1 - amount) + accent[i] * amount) for i in range(3))


def build_variant(enemy: str) -> Image.Image:
    source = SOURCE_DIR / f"{enemy}_actions.png"
    if enemy == "slime":
        repaired = ROOT / "assets" / "art-v3" / "sprites" / "enemies" / "slime_actions.png"
        if repaired.exists():
            source = repaired
    src = Image.open(source).convert("RGBA")
    if src.size != (512, 256):
        raise SystemExit(f"unexpected sheet size for {enemy}: {src.size}")
    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    shadow, metal, rune = PALETTES[FAMILY[enemy]]

    for row in range(4):
        for col in range(8):
            box = (col * 64, row * 64, col * 64 + 64, row * 64 + 64)
            frame = src.crop(box)
            alpha = frame.getchannel("A").point(lambda value: 255 if value >= 128 else 0)
            bbox = alpha.getbbox()
            if not bbox:
                raise SystemExit(f"empty source frame for {enemy} row={row} col={col}")
            eroded = alpha.filter(ImageFilter.MinFilter(3))
            outer = alpha.filter(ImageFilter.MaxFilter(3))
            fp = frame.load()
            ap = alpha.load()
            ep = eroded.load()
            op = outer.load()
            result = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
            rp = result.load()

            # A dark attached outline makes the elite silhouette heavier without a floating marker.
            for y in range(64):
                for x in range(64):
                    if op[x, y] and not ap[x, y]:
                        rp[x, y] = (*shadow, 255)

            left, top, right, bottom = bbox
            band_top = top + max(2, (bottom - top) * 2 // 5)
            band_bottom = min(bottom, band_top + max(2, (bottom - top) // 8))
            seed = sum(ord(ch) for ch in enemy) + row * 17 + col * 31
            for y in range(64):
                for x in range(64):
                    if not ap[x, y]:
                        continue
                    r, g, b, _ = fp[x, y]
                    base = (r, g, b)
                    lum = (r * 3 + g * 5 + b * 2) / 10
                    amount = 0.12
                    if ap[x, y] and not ep[x, y]:
                        amount = 0.34
                        accent = metal if (x + y + seed) % 5 else rune
                    elif band_top <= y <= band_bottom and (x + seed) % 4 != 0:
                        amount = 0.42
                        accent = metal
                    elif lum < 55:
                        amount = 0.22
                        accent = shadow
                    else:
                        accent = rune if (x * 3 + y * 5 + seed) % 29 == 0 else metal
                    nr, ng, nb = mix(base, accent, amount)
                    rp[x, y] = (nr, ng, nb, 255)

            # Two tiny attached rune studs sit on the body, never above it like the old crown.
            width = right - left
            stud_y = min(bottom - 2, top + max(3, (bottom - top) // 3))
            for stud_x in (left + width // 3, right - width // 3 - 1):
                if 1 <= stud_x < 63 and 1 <= stud_y < 63 and ap[stud_x, stud_y]:
                    rp[stud_x, stud_y] = (*rune, 255)
                    if ap[stud_x, stud_y + 1]:
                        rp[stud_x, stud_y + 1] = (*metal, 255)

            out.alpha_composite(result, (col * 64, row * 64))

    return out


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for enemy in ENEMIES:
        target = OUTPUT_DIR / f"elite_{enemy}_actions.png"
        build_variant(enemy).save(target, optimize=True)
        print(f"wrote {target.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
