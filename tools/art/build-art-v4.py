"""Build hard-pixel V4 runtime assets from ImageGen chroma-key masters."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets" / "art-v4" / "sources"
SPRITES = ROOT / "assets" / "art-v4" / "sprites"


def hard_alpha(image: Image.Image) -> Image.Image:
    out = image.convert("RGBA")
    out.putalpha(out.getchannel("A").point(lambda value: 255 if value >= 128 else 0))
    return out


def quantize(image: Image.Image, colors: int) -> Image.Image:
    image = hard_alpha(image)
    alpha = image.getchannel("A")
    indexed = image.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    out = indexed.convert("RGBA")
    out.putalpha(alpha)
    return hard_alpha(out)


def grid_cells(image: Image.Image, columns: int, rows: int) -> list[list[Image.Image]]:
    image = image.convert("RGBA")
    result: list[list[Image.Image]] = []
    for row in range(rows):
        line = []
        y0, y1 = round(row * image.height / rows), round((row + 1) * image.height / rows)
        for column in range(columns):
            x0, x1 = round(column * image.width / columns), round((column + 1) * image.width / columns)
            cell = hard_alpha(image.crop((x0, y0, x1, y1)))
            bbox = cell.getchannel("A").getbbox()
            if not bbox:
                raise ValueError(f"empty generated cell row={row} col={column}")
            line.append(cell.crop(bbox))
        result.append(line)
    return result


def fitted_sheet(rows: list[list[Image.Image]], cell_size: tuple[int, int], colors: int,
                 shared_scale: bool, ground_anchor: bool = False) -> Image.Image:
    cell_w, cell_h = cell_size
    sheet = Image.new("RGBA", (cell_w * len(rows[0]), cell_h * len(rows)))
    for row_index, frames in enumerate(rows):
        max_w = max(frame.width for frame in frames)
        max_h = max(frame.height for frame in frames)
        shared = min((cell_w - 4) / max_w, (cell_h - 4) / max_h) if shared_scale else None
        for column, frame in enumerate(frames):
            scale = shared if shared is not None else min((cell_w - 4) / frame.width, (cell_h - 4) / frame.height)
            resized = frame.resize(
                (max(1, round(frame.width * scale)), max(1, round(frame.height * scale))),
                Image.Resampling.LANCZOS,
            )
            resized = quantize(resized, colors)
            x = column * cell_w + (cell_w - resized.width) // 2
            y = row_index * cell_h + ((cell_h - resized.height - 2) if ground_anchor
                                      else (cell_h - resized.height) // 2)
            sheet.alpha_composite(resized, (x, max(row_index * cell_h + 1, y)))
    return hard_alpha(sheet)


def save(image: Image.Image, relative: str) -> None:
    destination = SPRITES / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, optimize=True)
    print(f"built {destination.relative_to(ROOT)} {image.size}")


def build_vfx() -> None:
    source = Image.open(SOURCE / "vfx" / "holy_frost_transparent.png")
    save(fitted_sheet(grid_cells(source, 8, 2), (96, 96), 72, True), "vfx/holy_frost_actions.png")


def build_pickups() -> None:
    source = Image.open(SOURCE / "pickups" / "pickup_gems_transparent.png")
    save(fitted_sheet(grid_cells(source, 5, 2), (64, 64), 64, False, True),
         "pickups/pickup_gems.png")


def build_terrain() -> None:
    source = Image.open(SOURCE / "terrain" / "terrain_tiles_transparent.png")
    cells = grid_cells(source, 3, 3)
    sheet = Image.new("RGBA", (384, 384))
    for row, frames in enumerate(cells):
        for column, frame in enumerate(frames):
            # Terrain must cover every texel; the magenta gutter has already
            # been removed by the alpha bounding box.
            tile = frame.resize((128, 128), Image.Resampling.LANCZOS)
            tile = quantize(tile, 64)
            tile.putalpha(Image.new("L", tile.size, 255))
            sheet.alpha_composite(tile, (column * 128, row * 128))
    save(sheet, "terrain/terrain_tiles.png")


def build_props() -> None:
    source = Image.open(SOURCE / "environment" / "terrain_props_transparent.png")
    save(fitted_sheet(grid_cells(source, 4, 2), (96, 96), 64, False, True),
         "environment/terrain_props.png")


def build_merchant() -> None:
    source = Image.open(SOURCE / "npcs" / "merchant_transparent.png")
    save(fitted_sheet(grid_cells(source, 8, 3), (96, 96), 72, True, True),
         "npcs/merchant_actions.png")


def build_frame() -> None:
    source = Image.open(SOURCE / "ui" / "baroque_frame_transparent.png").convert("RGBA")
    source = source.resize((705, 573), Image.Resampling.LANCZOS)
    save(quantize(source, 96), "ui/baroque_menu_frame.png")


def main() -> None:
    subprocess.run([sys.executable, str(ROOT / "tools" / "art" / "repair-sprite-grids.py")],
                   cwd=ROOT, check=True)
    build_vfx()
    build_pickups()
    build_terrain()
    build_props()
    build_merchant()
    build_frame()


if __name__ == "__main__":
    main()
