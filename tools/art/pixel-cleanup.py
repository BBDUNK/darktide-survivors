"""Deterministic chroma removal, pixel cleanup, palette mapping and atlas packing."""
from __future__ import annotations

import argparse
import json
import math
import time
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def pixel_data(image: Image.Image):
    """Use Pillow's forward-compatible flattened pixel iterator."""
    if hasattr(image, "get_flattened_data"):
        return image.get_flattened_data()
    return image.getdata()


def rgb(hex_color: str) -> tuple[int, int, int]:
    value = hex_color.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    # Weighted RGB distance: green errors are more visible and chroma keys are green/magenta.
    return math.sqrt(2 * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + 3 * (a[2] - b[2]) ** 2)


def remove_key(image: Image.Image, key: tuple[int, int, int]) -> Image.Image:
    src = image.convert("RGBA")
    out = Image.new("RGBA", src.size)
    pixels = []
    green_key = key[1] > 240 and key[0] < 20 and key[2] < 20
    magenta_key = key[0] > 240 and key[1] < 20 and key[2] > 240
    for r, g, b, _ in pixel_data(src):
        keyed = color_distance((r, g, b), key) < 145
        if green_key:
            keyed = keyed or (g > 150 and g > r * 1.55 and g > b * 1.55)
        elif magenta_key:
            keyed = keyed or (r > 150 and b > 120 and r > g * 1.5 and b > g * 1.35)
        pixels.append((r, g, b, 0 if keyed else 255))
    out.putdata(pixels)
    return out


def hard_alpha(image: Image.Image) -> Image.Image:
    """Keep authored RGB pixels while enforcing nearest-neighbour alpha edges."""
    out = image.convert("RGBA")
    alpha = out.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
    out.putalpha(alpha)
    return out


def crop_region(image: Image.Image, region: list[float] | None) -> Image.Image:
    if not region:
        return image
    w, h = image.size
    x0, y0, x1, y1 = region
    return image.crop((round(x0 * w), round(y0 * h), round(x1 * w), round(y1 * h)))


def split_frames(image: Image.Image, count: int) -> list[Image.Image]:
    if count == 1:
        return [image]
    w, h = image.size
    return [image.crop((round(i * w / count), 0, round((i + 1) * w / count), h)) for i in range(count)]


def extract_frames(image: Image.Image, spec: dict) -> list[Image.Image]:
    """Extract explicit rectangles or a row from a regular sprite grid."""
    if spec.get("frameRects"):
        return [image.crop((x, y, x + w, y + h)) for x, y, w, h in spec["frameRects"]]
    if spec.get("cropPx"):
        x, y, w, h = spec["cropPx"]
        return [image.crop((x, y, x + w, y + h))]
    if spec.get("frameSize"):
        fw, fh = spec["frameSize"]
        count = spec.get("frames", 1)
        start = spec.get("frameStart", 0)
        row = spec.get("frameRow", 0)
        return [image.crop(((start + i) * fw, row * fh, (start + i + 1) * fw, (row + 1) * fh))
                for i in range(count)]
    return split_frames(image, spec.get("frames", 1))


def fit_pixel_art(frame: Image.Image, size: tuple[int, int], anchor: tuple[int, int],
                  pixel_scale: float | None = None) -> Image.Image:
    """Fit a transparent authored sprite without resampling away its pixel character."""
    frame = hard_alpha(frame)
    bbox = frame.getchannel("A").getbbox()
    if not bbox:
        raise ValueError("source frame is empty")
    frame = frame.crop(bbox)
    target_w, target_h = size
    max_w, max_h = max(1, target_w - 2), max(1, target_h - 2)
    if pixel_scale is None:
        scale = min(max_w / frame.width, max_h / frame.height)
        if scale >= 1:
            scale = max(1, math.floor(scale))
    else:
        scale = pixel_scale
    if scale != 1:
        frame = frame.resize((max(1, round(frame.width * scale)), max(1, round(frame.height * scale))),
                             Image.Resampling.NEAREST)
    if frame.width > max_w or frame.height > max_h:
        scale = min(max_w / frame.width, max_h / frame.height)
        frame = frame.resize((max(1, round(frame.width * scale)), max(1, round(frame.height * scale))),
                             Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", size)
    x = round(anchor[0] - frame.width / 2)
    x = max(0, min(target_w - frame.width, x))
    y = max(0, min(target_h - frame.height, anchor[1] - frame.height + 1))
    canvas.alpha_composite(frame, (x, y))
    return hard_alpha(canvas)


def largest_components(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    w, h = image.size
    opaque = {(x, y) for y in range(h) for x in range(w) if alpha.getpixel((x, y)) >= 128}
    comps: list[list[tuple[int, int]]] = []
    while opaque:
        start = opaque.pop()
        comp = [start]
        queue = deque([start])
        while queue:
            x, y = queue.popleft()
            for pt in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if pt in opaque:
                    opaque.remove(pt)
                    comp.append(pt)
                    queue.append(pt)
        comps.append(comp)
    if not comps:
        return image
    largest = max(len(c) for c in comps)
    keep = {pt for comp in comps if len(comp) >= max(2, largest * 0.008) for pt in comp}
    dst = image.copy()
    data = dst.load()
    for y in range(h):
        for x in range(w):
            if (x, y) not in keep:
                data[x, y] = (0, 0, 0, 0)
    return dst


def nearest_palette(color: tuple[int, int, int], palette: list[tuple[int, int, int]]) -> tuple[int, int, int]:
    return min(palette, key=lambda p: color_distance(color, p))


def fit_and_quantize(frame: Image.Image, size: tuple[int, int], anchor: tuple[int, int],
                     colors: list[str], outline: str | None) -> Image.Image:
    bbox = frame.getchannel("A").getbbox()
    if not bbox:
        raise ValueError("source frame became empty after chroma removal")
    frame = frame.crop(bbox)
    target_w, target_h = size
    inner_w, inner_h = max(1, target_w - 2), max(1, target_h - 2)
    scale = min(inner_w / frame.width, inner_h / frame.height)
    scaled_size = (max(1, round(frame.width * scale)), max(1, round(frame.height * scale)))
    frame = frame.resize(scaled_size, Image.Resampling.LANCZOS)
    alpha = frame.getchannel("A").point(lambda a: 255 if a >= 112 else 0)
    palette = [rgb(c) for c in colors]
    rgba = frame.convert("RGBA")
    mapped = Image.new("RGBA", rgba.size)
    mapped_pixels = []
    for (r, g, b, _), a in zip(pixel_data(rgba), pixel_data(alpha)):
        if not a:
            mapped_pixels.append((0, 0, 0, 0))
        else:
            nr, ng, nb = nearest_palette((r, g, b), palette)
            mapped_pixels.append((nr, ng, nb, 255))
    mapped.putdata(mapped_pixels)
    mapped = largest_components(mapped)

    if outline:
        edge_color = (*rgb(outline), 255)
        src = mapped.copy()
        src_px, dst_px = src.load(), mapped.load()
        for y in range(src.height):
            for x in range(src.width):
                if src_px[x, y][3] == 0:
                    continue
                if any(nx < 0 or ny < 0 or nx >= src.width or ny >= src.height or src_px[nx, ny][3] == 0
                       for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))):
                    dst_px[x, y] = edge_color

    final_bbox = mapped.getchannel("A").getbbox()
    if final_bbox:
        mapped = mapped.crop(final_bbox)
    canvas = Image.new("RGBA", size)
    alpha = mapped.getchannel("A")
    points = [(px, py) for py in range(mapped.height) for px in range(mapped.width)
              if alpha.getpixel((px, py))]
    centroid_x = sum(px for px, _ in points) / len(points) if points else mapped.width / 2
    x = round(anchor[0] - centroid_x)
    x = max(1, min(target_w - mapped.width - 1, x))
    y = target_h - 1 - mapped.height
    canvas.alpha_composite(mapped, (x, y))
    return canvas


def animation_signature(frame: Image.Image) -> bytes:
    """Compare visible pixels only; source PNGs often keep junk RGB under alpha."""
    frame = hard_alpha(frame)
    out = frame.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            if not px[x, y][3]:
                px[x, y] = (0, 0, 0, 0)
    return out.tobytes()


def repair_frozen_action_frames(name: str, frames: list[Image.Image]) -> list[Image.Image]:
    """Turn accidental duplicate action cells into a crisp one-pixel gait phase.

    This runs after fitting into the runtime canvas, unlike source-side motion
    edits which are erased by centering.  It is intentionally limited to
    living actors; static projectile art such as the spider web must remain
    static by design.
    """
    actors = {
        'bat', 'slime', 'slime_big', 'zombie', 'skeleton', 'ghost', 'spider', 'cultist',
        'orc', 'imp', 'knight_armored', 'werewolf', 'mummy', 'gargoyle', 'bloodbat', 'wraith',
        'merchant', 'merchant_attack', 'merchant_prone'
    }
    is_actor = (name.startswith('char_') or name.startswith('elite_') or name.startswith('boss_') or
                any(name == actor or name.startswith(actor + '_') for actor in actors))
    if not is_actor or len(frames) < 2:
        return frames
    fixed = list(frames)
    previous = animation_signature(fixed[0])
    for index in range(1, len(fixed)):
        current = animation_signature(fixed[index])
        if current != previous:
            previous = current
            continue
        alpha = fixed[index].getchannel('A')
        bbox = alpha.getbbox()
        if not bbox:
            continue
        # Keep the feet on the same baseline and make a one-pixel lateral
        # settle.  This is nearest-neighbour only: no blur, no dirty fringe.
        dx = 1 if bbox[2] < fixed[index].width - 1 else -1
        shifted = Image.new('RGBA', fixed[index].size)
        shifted.alpha_composite(fixed[index], (dx, 0))
        fixed[index] = hard_alpha(shifted)
        previous = animation_signature(fixed[index])
    return fixed


def checker_preview(frame: Image.Image, scale: int) -> Image.Image:
    w, h = frame.size
    bg = Image.new("RGBA", (w, h), "#242234")
    draw = ImageDraw.Draw(bg)
    for y in range(h):
        for x in range(w):
            if (x + y) % 2 == 0:
                draw.point((x, y), fill="#323047")
    bg.alpha_composite(frame)
    return bg.resize((w * scale, h * scale), Image.Resampling.NEAREST)


def save_retry(image: Image.Image, destination: Path) -> None:
    """Windows scanners can briefly hold new PNGs open; retry before failing."""
    for attempt in range(5):
        try:
            # Pillow's optimized PNG writer intermittently raises WinError 22
            # while regenerating thousands of previews.  Normal PNG output is
            # deterministic, faster, and avoids that handle-pressure failure.
            image.save(destination, optimize=False)
            return
        except OSError:
            if attempt == 4:
                raise
            time.sleep(0.15 * (attempt + 1))


def pack(frames: dict[str, list[Image.Image]], manifest: dict, out_dir: Path) -> dict:
    width = manifest.get("atlasWidth", 256)
    padding = manifest.get("atlasPadding", 2)
    placements: dict[str, list[dict]] = {}
    x = padding
    y = padding
    row_h = 0
    ordered = [(name, index, frame) for name, items in frames.items() for index, frame in enumerate(items)]
    for name, index, frame in ordered:
        if x + frame.width + padding > width:
            x = padding
            y += row_h + padding
            row_h = 0
        placements.setdefault(name, []).append({"x": x, "y": y, "w": frame.width, "h": frame.height})
        x += frame.width + padding
        row_h = max(row_h, frame.height)
    height = 1
    needed = y + row_h + padding
    while height < needed:
        height *= 2
    atlas = Image.new("RGBA", (width, height))
    for name, index, frame in ordered:
        pos = placements[name][index]
        atlas.alpha_composite(frame, (pos["x"], pos["y"]))
    save_retry(atlas, out_dir / "atlas.png")

    assets_by_name = {a["name"]: a for a in manifest["assets"]}
    result = {
        "version": manifest["version"],
        "image": "assets/sprites/atlas.png",
        "frames": {},
        "renderScale": {},
        "animationFps": {},
    }
    for name, items in placements.items():
        spec = assets_by_name[name]
        result["frames"][name] = [dict(item, anchor={"x": spec["anchor"][0], "y": spec["anchor"][1]}) for item in items]
        result["renderScale"][name] = spec.get("renderScale", 1)
        result["animationFps"][name] = spec.get("fps", 0)
    return result


def contact_sheet(frames: dict[str, list[Image.Image]], scale: int, destination: Path) -> None:
    rows = []
    font = ImageFont.load_default()
    for name, items in frames.items():
        previews = [checker_preview(frame, scale) for frame in items]
        width = max(220, sum(p.width for p in previews) + 12 * (len(previews) - 1))
        height = max(p.height for p in previews) + 34
        row = Image.new("RGBA", (width, height), "#15131f")
        draw = ImageDraw.Draw(row)
        draw.text((8, 6), name, fill="#f2e9d0", font=font)
        px = 8
        for preview in previews:
            row.alpha_composite(preview, (px, 26))
            px += preview.width + 12
        rows.append(row)
    sheet = Image.new("RGBA", (max(r.width for r in rows), sum(r.height for r in rows)), "#0d0b14")
    sy = 0
    for row in rows:
        sheet.alpha_composite(row, (0, sy))
        sy += row.height
    save_retry(sheet, destination)


def process_backgrounds(manifest: dict, root: Path) -> None:
    colors = [rgb(c) for c in manifest.get("backgroundPalette", [])]
    if not colors:
        return
    palette_image = Image.new("P", (1, 1))
    flat = [channel for color in colors for channel in color]
    palette_image.putpalette(flat + [0] * (768 - len(flat)))
    for spec in manifest.get("backgrounds", []):
        source = Image.open(root / spec["source"]).convert("RGB")
        source = source.resize(tuple(spec["size"]), Image.Resampling.LANCZOS)
        source = source.quantize(palette=palette_image, dither=Image.Dither.NONE).convert("RGB")
        output = root / spec["output"]
        output.parent.mkdir(parents=True, exist_ok=True)
        source.save(output, quality=spec.get("quality", 92), subsampling=0, optimize=True)
        print(f"Built background {output}")


def build(manifest_path: Path, skip_previews: bool = False) -> None:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    root = manifest_path.parents[2]
    if manifest.get("externalManifest"):
        external = json.loads((root / manifest["externalManifest"]).read_text(encoding="utf-8"))
        defaults = external.get("defaults", {})
        local_names = {asset["name"] for asset in manifest["assets"]}
        manifest["assets"].extend(
            {**defaults, **asset} for asset in external["assets"] if asset["name"] not in local_names
        )
    out_dir = root / "assets" / "sprites"
    preview_dir = out_dir / "previews"
    preview_dir.mkdir(parents=True, exist_ok=True)
    frames: dict[str, list[Image.Image]] = {}

    for spec in manifest["assets"]:
        source = Image.open(root / spec["source"]).convert("RGBA")
        source = crop_region(source, spec.get("region"))
        if spec.get("key"):
            source = remove_key(source, rgb(spec["key"]))
        else:
            source = hard_alpha(source)
        processed = []
        for index, raw_frame in enumerate(extract_frames(source, spec)):
            try:
                if spec.get("seamlessTile"):
                    # Repeatable terrain must cover all four edges. The usual
                    # sprite safety padding would repeat as a large square grid.
                    frame = hard_alpha(raw_frame)
                    if frame.size != tuple(spec["size"]):
                        frame = frame.resize(tuple(spec["size"]), Image.Resampling.NEAREST)
                elif spec.get("preservePixels"):
                    frame = fit_pixel_art(raw_frame, tuple(spec["size"]), tuple(spec["anchor"]),
                                          spec.get("pixelScale"))
                else:
                    frame = fit_and_quantize(raw_frame, tuple(spec["size"]), tuple(spec["anchor"]),
                                             spec["colors"], spec.get("outline"))
            except ValueError as error:
                raise ValueError(f"{spec['name']}[{index}]: {error}") from error
            processed.append(frame)
            if not skip_previews:
                save_retry(checker_preview(frame, manifest.get("previewScale", 8)), preview_dir / f"{spec['name']}-{index}.png")
        frames[spec["name"]] = repair_frozen_action_frames(spec["name"], processed)

    atlas_meta = pack(frames, manifest, out_dir)
    atlas_json = json.dumps(atlas_meta, ensure_ascii=False, indent=2)
    (out_dir / "atlas.json").write_text(atlas_json + "\n", encoding="utf-8")
    (out_dir / "atlas-data.js").write_text(
        "// Generated by tools/art/build-atlas.js; do not edit by hand.\n" +
        "window.SPRITE_ATLAS = " + json.dumps(atlas_meta, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    if not skip_previews:
        contact_sheet(frames, manifest.get("previewScale", 8), preview_dir / "contact-sheet.png")
    process_backgrounds(manifest, root)
    print(f"Built {sum(len(v) for v in frames.values())} frames into {out_dir / 'atlas.png'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="tools/art/art-manifest.json")
    parser.add_argument("--skip-previews", action="store_true")
    args = parser.parse_args()
    build(Path(args.manifest).resolve(), args.skip_previews)
