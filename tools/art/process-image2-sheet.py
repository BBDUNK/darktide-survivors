#!/usr/bin/env python3
"""Convert an ImageGen chroma-key sprite sheet into a deterministic game sheet.

The input is divided into an exact grid. Each cell is cropped to visible pixels,
nearest-neighbour scaled into a fixed logical canvas, bottom/centre aligned and
palette-quantized without dithering. The output always has hard 0/255 alpha.
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--cols", type=int, default=8)
    parser.add_argument("--rows", type=int, default=4)
    parser.add_argument("--cell", default="64",
                        help="Square logical canvas side, or WxH for a rectangular canvas (e.g. 224x112)")
    parser.add_argument("--flatten", action="store_true",
                        help="Pack every processed frame into a single horizontal output row")
    parser.add_argument("--shared-fit", nargs="?", const="union",
                        choices=("union", "baseline", "center"),
                        help="Fit all frames with one union bbox scale: union=preserve authored offsets, "
                             "baseline=shared bottom contact, center=shared vertical center")
    parser.add_argument("--padding", type=int, default=3)
    parser.add_argument("--colors", type=int, default=40)
    parser.add_argument("--alpha-threshold", type=int, default=96)
    parser.add_argument("--no-color-key", action="store_true",
                        help="Trust the source alpha channel and preserve saturated green/magenta subject colors")
    parser.add_argument("--overlap", type=int, default=0,
                        help="Expand each source cell before isolating its largest connected subject")
    parser.add_argument("--primary-only", action="store_true",
                        help="Keep only the largest connected opaque component in each expanded cell")
    parser.add_argument(
        "--frame-map",
        default="",
        help="Optional comma-separated source columns used for each output column, e.g. 0,1,2,3,4,5,6,6",
    )
    parser.add_argument(
        "--row-map",
        default="",
        help="Optional source rows used for each output row, e.g. 0,1,2,2,3",
    )
    parser.add_argument(
        "--frame-map-by-row",
        default="",
        help="Semicolon-separated frame maps for output rows; each row must have the same length",
    )
    return parser.parse_args()


def harden_alpha(image: Image.Image, threshold: int, use_color_key: bool = True) -> Image.Image:
    image = image.convert("RGBA")
    px = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = px[x, y]
            green = g >= 145 and g >= r * 1.34 and g >= b * 1.34 and (g - max(r, b)) >= 42
            magenta = r >= 145 and b >= 115 and g <= 145 and r >= g * 1.35 and b >= g * 1.22
            keyed = use_color_key and (green or magenta)
            px[x, y] = (0, 0, 0, 0) if keyed else (r, g, b, 255 if a >= threshold else 0)
    return image


def quantize_rgba(image: Image.Image, colors: int) -> Image.Image:
    alpha = image.getchannel("A")
    rgb = Image.new("RGB", image.size, (0, 0, 0))
    rgb.paste(image.convert("RGB"), mask=alpha)
    quantized = rgb.quantize(colors=max(2, colors), method=Image.Quantize.MEDIANCUT,
                             dither=Image.Dither.NONE).convert("RGBA")
    quantized.putalpha(alpha)
    return quantized


def largest_component(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    w, h = image.size
    opaque = {(x, y) for y in range(h) for x in range(w) if alpha.getpixel((x, y)) >= 128}
    largest: list[tuple[int, int]] = []
    while opaque:
        start = opaque.pop(); comp = [start]; queue = deque([start])
        while queue:
            x, y = queue.popleft()
            for point in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if point in opaque:
                    opaque.remove(point); comp.append(point); queue.append(point)
        if len(comp) > len(largest): largest = comp
    out = Image.new("RGBA", image.size)
    src, dst = image.load(), out.load()
    for x, y in largest: dst[x, y] = src[x, y]
    return out


def main() -> None:
    args = parse_args()
    if isinstance(args.cell, str) and "x" in args.cell.lower():
        cell_w, cell_h = (int(part.strip()) for part in args.cell.lower().split("x", 1))
        if cell_w < 1 or cell_h < 1:
            raise SystemExit("--cell WxH must contain positive integers")
    else:
        cell_w = cell_h = int(args.cell)
    src = harden_alpha(Image.open(args.input), args.alpha_threshold, not args.no_color_key)
    source_cell_w = src.width / args.cols
    source_cell_h = src.height / args.rows
    frame_map = list(range(args.cols))
    if args.frame_map:
        frame_map = [int(value.strip()) for value in args.frame_map.split(",") if value.strip()]
        if not frame_map or any(value < 0 or value >= args.cols for value in frame_map):
            raise SystemExit("--frame-map contains an invalid source column")
    out_cols = len(frame_map)
    row_map = list(range(args.rows))
    if args.row_map:
        row_map = [int(value.strip()) for value in args.row_map.split(",") if value.strip()]
        if not row_map or any(value < 0 or value >= args.rows for value in row_map):
            raise SystemExit("--row-map contains an invalid source row")
    row_frame_maps = [frame_map for _ in row_map]
    if args.frame_map_by_row:
        row_frame_maps = []
        for chunk in args.frame_map_by_row.split(";"):
            mapping = [int(value.strip()) for value in chunk.split(",") if value.strip()]
            if not mapping or any(value < 0 or value >= args.cols for value in mapping):
                raise SystemExit("--frame-map-by-row contains an invalid source column")
            row_frame_maps.append(mapping)
        if len(row_frame_maps) != len(row_map):
            raise SystemExit("--frame-map-by-row count must match output row count")
        if len({len(mapping) for mapping in row_frame_maps}) != 1:
            raise SystemExit("all --frame-map-by-row mappings must have the same length")
        out_cols = len(row_frame_maps[0])
    total_frames = sum(len(mapping) for mapping in row_frame_maps)
    if args.flatten:
        out = Image.new("RGBA", (total_frames * cell_w, cell_h), (0, 0, 0, 0))
    else:
        out = Image.new("RGBA", (out_cols * cell_w, len(row_map) * cell_h), (0, 0, 0, 0))
    max_w = max(1, cell_w - args.padding * 2)
    max_h = max(1, cell_h - args.padding * 2)
    frame_index = 0

    if args.shared_fit:
        prepared = []
        for out_row, row in enumerate(row_map):
            for out_col, source_col in enumerate(row_frame_maps[out_row]):
                left = max(0, round(source_col * source_cell_w) - args.overlap)
                top = max(0, round(row * source_cell_h) - args.overlap)
                right = min(src.width, round((source_col + 1) * source_cell_w) + args.overlap)
                bottom = min(src.height, round((row + 1) * source_cell_h) + args.overlap)
                frame = src.crop((left, top, right, bottom))
                if args.primary_only: frame = largest_component(frame)
                bbox = frame.getchannel("A").getbbox()
                if not bbox:
                    raise SystemExit(f"empty cell at row={row} col={source_col}")
                prepared.append((out_row, out_col, frame, bbox))
        union = (
            min(bbox[0] for _, _, _, bbox in prepared),
            min(bbox[1] for _, _, _, bbox in prepared),
            max(bbox[2] for _, _, _, bbox in prepared),
            max(bbox[3] for _, _, _, bbox in prepared),
        )
        union_w = union[2] - union[0]
        union_h = union[3] - union[1]
        scale = min(max_w / union_w, max_h / union_h)
        max_subject_w = max(bbox[2] - bbox[0] for _, _, _, bbox in prepared)
        max_subject_h = max(bbox[3] - bbox[1] for _, _, _, bbox in prepared)
        contact_scale = min(max_w / max_subject_w, max_h / max_subject_h)
        scaled_union_w = union_w * scale
        scaled_union_h = union_h * scale
        contact_union_w = union_w * contact_scale
        offset_x = (cell_w - scaled_union_w) / 2
        contact_offset_x = (cell_w - contact_union_w) / 2
        offset_y = cell_h - args.padding - scaled_union_h
        for out_row, out_col, frame, bbox in prepared:
            subject = frame.crop(bbox)
            if args.shared_fit == "center":
                size = (max(1, round(subject.width * contact_scale)),
                        max(1, round(subject.height * contact_scale)))
                subject = subject.resize(size, Image.Resampling.NEAREST)
                if args.flatten:
                    cell_x = frame_index * cell_w
                    cell_y = 0
                    frame_index += 1
                else:
                    cell_x = out_col * cell_w
                    cell_y = out_row * cell_h
                x = cell_x + (cell_w - subject.width) // 2
                y = cell_y + (cell_h - subject.height) // 2
                out.alpha_composite(subject, (x, y))
                continue
            if args.shared_fit == "baseline":
                size = (max(1, round(subject.width * contact_scale)),
                        max(1, round(subject.height * contact_scale)))
                subject = subject.resize(size, Image.Resampling.NEAREST)
                if args.flatten:
                    cell_x = frame_index * cell_w
                    cell_y = 0
                    frame_index += 1
                else:
                    cell_x = out_col * cell_w
                    cell_y = out_row * cell_h
                x = round(cell_x + contact_offset_x + (bbox[0] - union[0]) * contact_scale)
                y = cell_y + cell_h - args.padding - subject.height
                out.alpha_composite(subject, (x, y))
                continue
            size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
            subject = subject.resize(size, Image.Resampling.NEAREST)
            if args.flatten:
                cell_x = frame_index * cell_w
                cell_y = 0
                frame_index += 1
            else:
                cell_x = out_col * cell_w
                cell_y = out_row * cell_h
            x = round(cell_x + offset_x + (bbox[0] - union[0]) * scale)
            y = round(cell_y + offset_y + (bbox[1] - union[1]) * scale)
            out.alpha_composite(subject, (x, y))
    else:
        for out_row, row in enumerate(row_map):
            for out_col, source_col in enumerate(row_frame_maps[out_row]):
                left = max(0, round(source_col * source_cell_w) - args.overlap)
                top = max(0, round(row * source_cell_h) - args.overlap)
                right = min(src.width, round((source_col + 1) * source_cell_w) + args.overlap)
                bottom = min(src.height, round((row + 1) * source_cell_h) + args.overlap)
                frame = src.crop((left, top, right, bottom))
                if args.primary_only: frame = largest_component(frame)
                bbox = frame.getchannel("A").getbbox()
                if not bbox:
                    raise SystemExit(f"empty cell at row={row} col={source_col}")
                subject = frame.crop(bbox)
                scale = min(max_w / subject.width, max_h / subject.height)
                size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
                subject = subject.resize(size, Image.Resampling.NEAREST)
                if args.flatten:
                    x = frame_index * cell_w + (cell_w - subject.width) // 2
                    y = cell_h - args.padding - subject.height
                    frame_index += 1
                else:
                    x = out_col * cell_w + (cell_w - subject.width) // 2
                    y = out_row * cell_h + cell_h - args.padding - subject.height
                out.alpha_composite(subject, (x, y))

    out = quantize_rgba(harden_alpha(out, args.alpha_threshold, not args.no_color_key), args.colors)
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
