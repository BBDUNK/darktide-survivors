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


def remove_magenta(image: Image.Image) -> Image.Image:
    """Turn the ImageGen chroma key into hard alpha without soft pink fringes."""
    out = image.convert("RGBA")
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            # Cover both pure key pixels and ImageGen's dark magenta halo.
            if (r > 205 and b > 155 and g < 95) or (r > 115 and b > 80 and r > g * 1.65 and b > g * 1.35):
                px[x, y] = (0, 0, 0, 0)
    return hard_alpha(out)


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
                Image.Resampling.NEAREST,
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


def build_frost_and_enemy_projectiles() -> None:
    source = remove_magenta(Image.open(SOURCE / "vfx" / "frost_enemy_projectiles_master.png"))
    cells = grid_cells(source, 8, 2)
    # The first row is a radial frost nova.  The second row is a clean catalog
    # of hostile shots used by every enemy and boss instead of blurry circles.
    # Keep a readable residual ring in the final frame.  The generator's last
    # sparkle-only cell was below the runtime validation coverage threshold.
    cells[0][-1] = cells[0][-2].copy()
    save(fitted_sheet([cells[0]], (96, 96), 64, True), "vfx/frost_radial_actions.png")
    save(fitted_sheet([cells[1]], (64, 64), 64, False), "vfx/enemy_projectiles.png")


def build_swamp_puddles() -> None:
    # One deliberately isolated source avoids the prior grid-crossing crop bug.
    # Four hard-pixel transforms provide orientation variety without cutting a
    # silhouette at a cell boundary.
    source = remove_magenta(Image.open(SOURCE / "terrain" / "swamp_puddle_large_master.png"))
    bbox = source.getchannel("A").getbbox()
    puddle = source.crop(bbox)
    variants = [
        puddle,
        puddle.transpose(Image.Transpose.FLIP_LEFT_RIGHT),
        puddle.transpose(Image.Transpose.FLIP_TOP_BOTTOM),
        puddle.transpose(Image.Transpose.ROTATE_180),
    ]
    cells = []
    for variant in variants:
        # Keep the oversized water pool intact; nearest neighbour retains the
        # authored pixel edge and no cell can leak into its neighbour.
        cell = fitted_sheet([[variant]], (320, 224), 64, False)
        cells.append(cell)
    sheet = Image.new("RGBA", (640, 448))
    for index, cell in enumerate(cells):
        sheet.alpha_composite(cell, ((index % 2) * 320, (index // 2) * 224))
    save(sheet, "terrain/swamp_puddles.png")


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
    if "--skip-repair" not in sys.argv:
        subprocess.run([sys.executable, str(ROOT / "tools" / "art" / "repair-sprite-grids.py")],
                       cwd=ROOT, check=True)
    build_vfx()
    build_frost_and_enemy_projectiles()
    build_pickups()
    build_terrain()
    build_swamp_puddles()
    build_props()
    build_merchant()
    build_frame()


if __name__ == "__main__":
    main()
