#!/usr/bin/env python3
"""Generate 8x/16x checker previews for READY/INTEGRATED V6 game-ready strips."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw


def checker_canvas(size: tuple[int, int]) -> Image.Image:
    w, h = size
    bg = Image.new("RGBA", size, "#242234")
    draw = ImageDraw.Draw(bg)
    for y in range(h):
        for x in range(w):
            if (x + y) % 2 == 0:
                draw.point((x, y), fill="#323047")
    return bg


def make_contact_sheet(name: str, strip_path: Path, frame_size: tuple[int, int],
                       frames: int, scale: int, out_dir: Path) -> Path:
    strip = Image.open(strip_path).convert("RGBA")
    fw, fh = frame_size
    cols = 4
    rows = (frames + cols - 1) // cols
    gap = 8
    sheet = Image.new("RGBA", (cols * (fw * scale + gap), 16 + rows * (fh * scale + gap)), "#15131f")
    draw = ImageDraw.Draw(sheet)
    draw.text((4, 3), f"{name}  x{scale}", fill="#f2e9d0")
    for index in range(frames):
        frame = strip.crop((index * fw, 0, (index + 1) * fw, fh))
        bg = checker_canvas((fw, fh))
        bg.alpha_composite(frame)
        bg = bg.resize((fw * scale, fh * scale), Image.Resampling.NEAREST)
        row, col = divmod(index, cols)
        sheet.alpha_composite(bg, (col * (fw * scale + gap), 16 + row * (fh * scale + gap)))
    out_path = out_dir / f"{name}_preview_{scale}x.png"
    sheet.save(out_path, optimize=False)
    return out_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="assets/art-v6/production-manifest.json")
    parser.add_argument("--only", default="", help="Comma-separated entry names")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    manifest = json.loads((root / args.manifest).read_text(encoding="utf-8-sig"))
    only = {name.strip() for name in args.only.split(",") if name.strip()}
    out_dir = root / "assets" / "art-v6" / "previews" / "v6"
    out_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for entry in manifest["entries"]:
        if entry.get("status") not in ("READY", "INTEGRATED"):
            continue
        if only and entry["name"] not in only:
            continue
        output = root / entry["output"]
        if not output.exists():
            continue
        for scale in (8, 16):
            path = make_contact_sheet(entry["name"], output, tuple(entry["frameSize"]),
                                      entry["frames"], scale, out_dir)
            print(path)
            count += 1
    print(f"Generated {count} previews")


if __name__ == "__main__":
    main()
