"""Shrink the runtime sprite atlas without touching any frame coordinate.

The packer rounds the canvas height up to a power of two (9706 -> 16384), which
leaves thousands of fully transparent rows.  This post-pass:

1. crops the trailing empty rows (frame x/y stay valid, only the image shrinks);
2. re-encodes the RGBA atlas as lossless WebP (bit-identical pixels, ~65%
   smaller than PNG on this content);
3. rewrites the image reference in atlas-data.js / atlas.json, appending a
   content-hash query so long-cache headers can never pair a fresh atlas-data
   with a stale bitmap.

Run: py tools/art/shrink-atlas.py
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SPRITES = ROOT / "assets" / "sprites"
PNG = SPRITES / "atlas.png"
WEBP = SPRITES / "atlas.webp"
DATA_JS = SPRITES / "atlas-data.js"
DATA_JSON = SPRITES / "atlas.json"
ROW_MARGIN = 8  # breathing rows below the last opaque pixel


def main() -> int:
    if not PNG.exists():
        print("atlas.png not found; run build-atlas first")
        return 1
    image = Image.open(PNG)
    image.load()
    alpha = image.getchannel("A")
    left, top, right, bottom = alpha.getbbox() or (0, 0, image.width, image.height)
    # Only ever trim the bottom: x/y coordinates in atlas-data must stay valid.
    height = min(image.height, bottom + ROW_MARGIN)
    # Keep the top-left origin untouched even if column 0 is empty.
    cropped = image.crop((0, 0, image.width, height))
    print(f"atlas {image.width}x{image.height} -> {cropped.width}x{cropped.height}")

    cropped.save(WEBP, lossless=True, quality=100, method=6, exact=True)
    verify = Image.open(WEBP)
    verify.load()
    if verify.tobytes() != cropped.tobytes():
        print("lossless verification failed; keeping atlas.png")
        return 1

    digest = hashlib.md5(WEBP.read_bytes()).hexdigest()[:10]
    versioned = f"assets/sprites/atlas.webp?v={digest}"
    png_kb = PNG.stat().st_size // 1024
    webp_kb = WEBP.stat().st_size // 1024
    print(f"lossless webp {webp_kb}KB vs png {png_kb}KB "
          f"(-{100 - webp_kb * 100 // png_kb}%), image ref: {versioned}")

    data_js = DATA_JS.read_text(encoding="utf-8")
    patched = re.sub(
        r'"image":"assets/sprites/atlas\.(?:png|webp)(?:\?v=[0-9a-f]+)?"',
        f'"image":"{versioned}"',
        data_js,
        count=1,
    )
    if patched == data_js and '"image":"assets/sprites/atlas' not in patched:
        print("atlas-data.js has no image field to patch")
        return 1
    DATA_JS.write_text(patched, encoding="utf-8", newline="")

    if DATA_JSON.exists():
        meta = json.loads(DATA_JSON.read_text(encoding="utf-8"))
        meta["image"] = versioned
        DATA_JSON.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")

    index_html = ROOT / "index.html"
    if index_html.exists():
        html = index_html.read_text(encoding="utf-8")
        patched_html = re.sub(
            r'(<link rel="preload" as="image" href=")assets/sprites/atlas\.webp(?:\?v=[0-9a-f]+)?(")',
            r"\g<1>" + versioned + r"\g<2>",
            html,
            count=1,
        )
        if patched_html != html:
            index_html.write_text(patched_html, encoding="utf-8", newline="")
    print("atlas-data.js / atlas.json / index.html preload now point at the versioned webp")
    return 0


if __name__ == "__main__":
    sys.exit(main())
