"""Extract a keyed 4x3 ImageGen HUD kit into crisp, size-specific UI parts."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


PARTS = [
    ("hud_hp_frame", 0, 0, (384, 72)),
    ("hud_xp_frame", 1, 0, (384, 72)),
    ("hud_boss_frame", 2, 0, (384, 72)),
    ("hud_timer_frame", 3, 0, (192, 72)),
    ("hud_minimap_frame", 0, 1, (256, 256)),
    ("hud_level_frame", 1, 1, (128, 128)),
    ("hud_coin_frame", 2, 1, (192, 72)),
    ("hud_kill_frame", 3, 1, (192, 72)),
    ("hud_weapon_slot", 0, 2, (128, 128)),
    ("hud_passive_slot", 1, 2, (128, 128)),
    ("hud_elite_frame", 2, 2, (256, 96)),
    ("hud_status_frame", 3, 2, (192, 96)),
]


def trim(image: Image.Image) -> Image.Image:
    box = image.getchannel("A").getbbox()
    if not box:
        raise ValueError("empty HUD component")
    return image.crop(box)


def fit(image: Image.Image, size: tuple[int, int], padding: int = 3) -> Image.Image:
    max_w, max_h = size[0] - padding * 2, size[1] - padding * 2
    scale = min(max_w / image.width, max_h / image.height)
    scaled = image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
        Image.Resampling.NEAREST,
    )
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(scaled, ((size[0] - scaled.width) // 2, (size[1] - scaled.height) // 2))
    px = canvas.load()
    for y in range(canvas.height):
        for x in range(canvas.width):
            r, g, b, a = px[x, y]
            green = g >= 145 and g >= r * 1.34 and g >= b * 1.34 and (g - max(r, b)) >= 42
            magenta = r >= 145 and b >= 115 and g <= 145 and r >= g * 1.35 and b >= g * 1.22
            px[x, y] = (0, 0, 0, 0) if green or magenta else (r, g, b, 255 if a >= 96 else 0)
    alpha = canvas.getchannel("A")
    rgb = Image.new("RGB", size, (0, 0, 0))
    rgb.paste(canvas.convert("RGB"), mask=alpha)
    rgb = rgb.quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out-dir", required=True)
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    cell_w = source.width // 4
    cell_h = source.height // 3
    for name, col, row, size in PARTS:
        cell = source.crop((col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h))
        result = fit(trim(cell), size)
        path = out_dir / f"{name}.png"
        result.save(path, optimize=True)
        print(f"wrote {path} {result.width}x{result.height}")


if __name__ == "__main__":
    main()
