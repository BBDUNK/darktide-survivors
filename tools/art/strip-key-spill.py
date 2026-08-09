"""Remove neon green/magenta chroma spill from already pixel-cleaned RGBA assets."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def pixels(image: Image.Image):
    return image.get_flattened_data() if hasattr(image, "get_flattened_data") else image.getdata()


def is_key(r: int, g: int, b: int) -> bool:
    green = g >= 145 and g >= r * 1.34 and g >= b * 1.34 and (g - max(r, b)) >= 42
    magenta = r >= 145 and b >= 115 and g <= 145 and r >= g * 1.35 and b >= g * 1.22
    return green or magenta


def clean(path: Path) -> tuple[int, int]:
    image = Image.open(path).convert("RGBA")
    data = []
    removed = 0
    for r, g, b, a in pixels(image):
        if is_key(r, g, b):
            data.append((0, 0, 0, 0))
            removed += int(a > 0)
        else:
            data.append((r, g, b, 255 if a >= 96 else 0))
    image.putdata(data)
    image.save(path, optimize=True)
    return removed, image.width * image.height


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+")
    args = parser.parse_args()
    total = 0
    for raw in args.paths:
        root = Path(raw)
        paths = sorted(root.rglob("*.png")) if root.is_dir() else [root]
        for path in paths:
            removed, count = clean(path)
            total += removed
            if removed:
                print(f"cleaned {path}: {removed}/{count} keyed opaque pixels")
    print(f"removed {total} keyed opaque pixels total")


if __name__ == "__main__":
    main()
