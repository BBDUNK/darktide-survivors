"""Extract the CC0 Tesla coil master into the 128x128 game atlas source.

Source: assets/art-library/generated/05_tesla_coil_master.png (chroma-keyed
OpenGameArt-style pixel master chosen by the player). Keeps the tower
bottom-aligned and centered so the atlas anchor [64, 127] stays correct.
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / "assets" / "art-library" / "generated" / "05_tesla_coil_master.png"
OUT = ROOT / "assets" / "sprites" / "sources" / "tesla_tower_128.png"
TARGET = 128


def green_keyed(src: Image.Image) -> Image.Image:
    rgba = src.convert("RGBA")
    out = Image.new("RGBA", rgba.size)
    data = []
    for r, g, b, _ in rgba.getdata():
        keyed = g > 150 and g > r * 1.55 and g > b * 1.55
        data.append((r, g, b, 0 if keyed else 255))
    out.putdata(data)
    return out


def main() -> None:
    keyed = green_keyed(Image.open(MASTER))
    bbox = keyed.getchannel("A").getbbox()
    if not bbox:
        raise SystemExit("master image has no opaque content after keying")
    subject = keyed.crop(bbox)
    scale = min((TARGET - 4) / subject.width, (TARGET - 2) / subject.height)
    if scale > 1:
        scale = max(1, math.floor(scale))
    subject = subject.resize(
        (max(1, round(subject.width * scale)), max(1, round(subject.height * scale))),
        Image.Resampling.NEAREST,
    )
    canvas = Image.new("RGBA", (TARGET, TARGET), (0, 0, 0, 0))
    canvas.alpha_composite(subject, (round((TARGET - subject.width) / 2), TARGET - subject.height))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT, optimize=True)
    print(f"Wrote {OUT} ({canvas.size}, opaque {subject.size})")


if __name__ == "__main__":
    main()
