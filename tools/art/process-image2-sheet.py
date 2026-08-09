#!/usr/bin/env python3
"""Convert an ImageGen chroma-key sprite sheet into a deterministic game sheet.

The input is divided into an exact grid. Each cell is cropped to visible pixels,
nearest-neighbour scaled into a fixed logical canvas, bottom/centre aligned and
palette-quantized without dithering. The output always has hard 0/255 alpha.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--cols", type=int, default=8)
    parser.add_argument("--rows", type=int, default=4)
    parser.add_argument("--cell", type=int, default=64)
    parser.add_argument("--padding", type=int, default=3)
    parser.add_argument("--colors", type=int, default=40)
    parser.add_argument("--alpha-threshold", type=int, default=96)
    parser.add_argument(
        "--frame-map",
        default="",
        help="Optional comma-separated source columns used for each output column, e.g. 0,1,2,3,4,5,6,6",
    )
    return parser.parse_args()


def harden_alpha(image: Image.Image, threshold: int) -> Image.Image:
    image = image.convert("RGBA")
    px = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = px[x, y]
            green = g >= 145 and g >= r * 1.34 and g >= b * 1.34 and (g - max(r, b)) >= 42
            magenta = r >= 145 and b >= 115 and g <= 145 and r >= g * 1.35 and b >= g * 1.22
            px[x, y] = (0, 0, 0, 0) if green or magenta else (r, g, b, 255 if a >= threshold else 0)
    return image


def quantize_rgba(image: Image.Image, colors: int) -> Image.Image:
    alpha = image.getchannel("A")
    rgb = Image.new("RGB", image.size, (0, 0, 0))
    rgb.paste(image.convert("RGB"), mask=alpha)
    quantized = rgb.quantize(colors=max(2, colors), method=Image.Quantize.MEDIANCUT,
                             dither=Image.Dither.NONE).convert("RGBA")
    quantized.putalpha(alpha)
    return quantized


def main() -> None:
    args = parse_args()
    src = harden_alpha(Image.open(args.input), args.alpha_threshold)
    cell_w = src.width / args.cols
    cell_h = src.height / args.rows
    frame_map = list(range(args.cols))
    if args.frame_map:
        frame_map = [int(value.strip()) for value in args.frame_map.split(",") if value.strip()]
        if not frame_map or any(value < 0 or value >= args.cols for value in frame_map):
            raise SystemExit("--frame-map contains an invalid source column")
    out_cols = len(frame_map)
    out = Image.new("RGBA", (out_cols * args.cell, args.rows * args.cell), (0, 0, 0, 0))

    for row in range(args.rows):
        for out_col, source_col in enumerate(frame_map):
            left = round(source_col * cell_w)
            top = round(row * cell_h)
            right = round((source_col + 1) * cell_w)
            bottom = round((row + 1) * cell_h)
            frame = src.crop((left, top, right, bottom))
            bbox = frame.getchannel("A").getbbox()
            if not bbox:
                raise SystemExit(f"empty cell at row={row} col={source_col}")
            subject = frame.crop(bbox)
            max_dim = args.cell - args.padding * 2
            scale = min(max_dim / subject.width, max_dim / subject.height)
            size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
            subject = subject.resize(size, Image.Resampling.NEAREST)
            x = out_col * args.cell + (args.cell - subject.width) // 2
            y = row * args.cell + args.cell - args.padding - subject.height
            out.alpha_composite(subject, (x, y))

    out = quantize_rgba(harden_alpha(out, args.alpha_threshold), args.colors)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    out.save(args.out, optimize=True)

    alpha = out.getchannel("A")
    alpha_data = alpha.get_flattened_data() if hasattr(alpha, "get_flattened_data") else alpha.getdata()
    out_data = out.get_flattened_data() if hasattr(out, "get_flattened_data") else out.getdata()
    hard = set(alpha_data) <= {0, 255}
    opaque_colors = {pixel[:3] for pixel in out_data if pixel[3]}
    print(f"wrote {args.out} {out.width}x{out.height} colors={len(opaque_colors)} hardAlpha={hard}")


if __name__ == "__main__":
    main()
