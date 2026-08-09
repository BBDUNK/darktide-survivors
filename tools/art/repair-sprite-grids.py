"""Repair ImageGen sprite sheets whose silhouettes cross fixed grid boundaries.

The source art was authored as regular grids, but long cloaks, legs and weapons
occasionally extend into the neighbouring cell.  Cropping those cells directly
creates the familiar half-sprite / two-sprites-at-once glitch.  This tool labels
connected opaque components across each complete row, assigns every component
to the nearest intended frame centre, then recentres the recovered silhouette.
It never interpolates pixels and always writes hard 0/255 alpha.
"""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "art-v4" / "repaired"


def components(row: Image.Image) -> list[list[tuple[int, int]]]:
    alpha = row.getchannel("A")
    w, h = row.size
    remaining = {(x, y) for y in range(h) for x in range(w) if alpha.getpixel((x, y)) >= 128}
    found: list[list[tuple[int, int]]] = []
    neighbours = ((-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1))
    while remaining:
        start = remaining.pop()
        queue = deque([start])
        comp = [start]
        while queue:
            x, y = queue.popleft()
            for dx, dy in neighbours:
                point = (x + dx, y + dy)
                if point in remaining:
                    remaining.remove(point)
                    queue.append(point)
                    comp.append(point)
        found.append(comp)
    return found


def hard_alpha(image: Image.Image) -> Image.Image:
    out = image.convert("RGBA")
    out.putalpha(out.getchannel("A").point(lambda value: 255 if value >= 128 else 0))
    return out


def bbox_distance(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    dx = max(a[0] - b[2], b[0] - a[2], 0)
    dy = max(a[1] - b[3], b[1] - a[3], 0)
    return (dx * dx + dy * dy) ** 0.5


def component_bbox(comp: list[tuple[int, int]]) -> tuple[int, int, int, int]:
    return (min(x for x, _ in comp), min(y for _, y in comp),
            max(x for x, _ in comp) + 1, max(y for _, y in comp) + 1)


def recover_row(row: Image.Image, frame_w: int, frame_h: int, columns: int,
                normalize_motion: bool, fragment_radius: int,
                area_ratio: float, width_ratio: float) -> Image.Image:
    row = hard_alpha(row)
    groups: list[list[list[tuple[int, int]]]] = [[] for _ in range(columns)]
    for comp in components(row):
        if len(comp) < 2:
            continue
        centroid_x = sum(point[0] for point in comp) / len(comp)
        owner = min(columns - 1, max(0, round((centroid_x - frame_w / 2) / frame_w)))
        groups[owner].append(comp)

    repaired = Image.new("RGBA", (frame_w * columns, frame_h))
    source_pixels = row.load()
    recovered_frames: list[Image.Image | None] = []
    metrics: list[tuple[int, int, bool]] = []
    for index, comps in enumerate(groups):
        if not comps:
            # Rare fully-empty cells retain their original crop so validation
            # reports the real source issue instead of silently deleting a frame.
            recovered_frames.append(None)
            metrics.append((0, 0, True))
            continue
        primary = max(comps, key=len)
        primary_bbox = component_bbox(primary)
        # Detached highlights and weapon tips belonging to the same pose sit
        # close to the main silhouette.  Distant fragments usually belong to
        # the neighbouring pose and caused the dirty double-image artefact.
        kept = [comp for comp in comps
                if comp is primary or bbox_distance(component_bbox(comp), primary_bbox) <= fragment_radius]
        points = [point for comp in kept for point in comp]
        x0 = min(x for x, _ in points)
        y0 = min(y for _, y in points)
        x1 = max(x for x, _ in points) + 1
        y1 = max(y for _, y in points) + 1
        recovered = Image.new("RGBA", (x1 - x0, y1 - y0))
        recovered_pixels = recovered.load()
        for x, y in points:
            recovered_pixels[x - x0, y - y0] = source_pixels[x, y]

        # Keep two transparent pixels around the silhouette.  Only nearest-
        # neighbour downscaling is allowed, so authored pixels remain crisp.
        max_w, max_h = frame_w - 4, frame_h - 3
        if recovered.width > max_w or recovered.height > max_h:
            scale = min(max_w / recovered.width, max_h / recovered.height)
            recovered = recovered.resize(
                (max(1, round(recovered.width * scale)), max(1, round(recovered.height * scale))),
                Image.Resampling.NEAREST,
            )
        clipped = x0 == 0 or x1 == row.width
        recovered_frames.append(recovered)
        metrics.append((len(points), recovered.width, clipped))

    if normalize_motion:
        valid_areas = [area for area, _, clipped in metrics if area and not clipped]
        valid_widths = [width for area, width, clipped in metrics if area and not clipped]
        reference_area = max(valid_areas) if valid_areas else 0
        reference_width = max(valid_widths) if valid_widths else 0
        bad = {
            index for index, (area, width, clipped) in enumerate(metrics)
            if clipped or not area or area < reference_area * area_ratio or width < reference_width * width_ratio
        }
        good = [index for index in range(columns) if index not in bad and recovered_frames[index] is not None]
        for index in bad:
            if good:
                nearest = min(good, key=lambda candidate: abs(candidate - index))
                source = recovered_frames[nearest]
                # 用相邻完整姿势修复残帧时保留 1–2 像素的横向运动相位，避免
                # 连续帧完全相同；仅作整数平移，不引入插值或模糊。
                shift_x = max(-2, min(2, index - nearest))
                shifted = Image.new("RGBA", source.size)
                shifted.alpha_composite(source, (shift_x, 0))
                recovered_frames[index] = shifted

    for index, recovered in enumerate(recovered_frames):
        if recovered is None:
            recovered = row.crop((index * frame_w, 0, (index + 1) * frame_w, frame_h))
        px = index * frame_w + (frame_w - recovered.width) // 2
        py = frame_h - 2 - recovered.height
        repaired.alpha_composite(recovered, (px, max(1, py)))
    return hard_alpha(repaired)


def repair(source: Path, destination: Path, frame_w: int, frame_h: int,
           normalize_rows: set[int] | None = None, fragment_radius: int = 9,
           area_ratio: float = 0.60, width_ratio: float = 0.50) -> None:
    image = hard_alpha(Image.open(source))
    if image.width % frame_w or image.height % frame_h:
        raise ValueError(f"{source}: {image.size} is not divisible by {(frame_w, frame_h)}")
    columns, rows = image.width // frame_w, image.height // frame_h
    output = Image.new("RGBA", image.size)
    for row_index in range(rows):
        row = image.crop((0, row_index * frame_h, image.width, (row_index + 1) * frame_h))
        normalize = normalize_rows is not None and row_index in normalize_rows
        output.alpha_composite(recover_row(row, frame_w, frame_h, columns, normalize, fragment_radius,
                                           area_ratio, width_ratio),
                               (0, row_index * frame_h))
    destination.parent.mkdir(parents=True, exist_ok=True)
    hard_alpha(output).save(destination, optimize=True)
    print(f"repaired {source.relative_to(ROOT)} -> {destination.relative_to(ROOT)}")


def main() -> None:
    characters = ("knight", "mage", "ranger", "cleric", "berserker", "chrono")
    for character in characters:
        for action in ("idle", "run", "attack", "reaction"):
            name = f"char_{character}_{action}_4dir.png"
            repair(
                ROOT / "assets" / "art-v2" / "sprites" / "characters" / name,
                OUT / "characters" / name,
                64,
                64,
                set(range(4)) if action != "reaction" else set(),
            )

    enemies = (
        "bat", "slime_big", "zombie", "skeleton", "ghost", "spider", "cultist", "orc",
        "imp", "knight_armored", "werewolf", "mummy", "gargoyle", "bloodbat", "wraith",
    )
    for enemy in enemies:
        name = f"{enemy}_actions.png"
        repair(
            ROOT / "assets" / "art-v2" / "sprites" / "enemies" / name,
            OUT / "enemies" / name,
            64,
            64,
            {0, 1, 2},
            5 if enemy in ("spider", "slime_big") else 7,
            0.76 if enemy in ("spider", "slime_big") else 0.64,
            0.64 if enemy in ("spider", "slime_big") else 0.52,
        )
    repair(
        ROOT / "assets" / "art-v3" / "sprites" / "enemies" / "slime_actions.png",
        OUT / "enemies" / "slime_actions.png",
        64,
        64,
        {0, 1, 2},
        6,
        0.74,
        0.62,
    )

    for boss in ("boss_slimeking", "boss_bonelord", "boss_abysseye", "boss_darklord"):
        name = f"{boss}_actions.png"
        repair(
            ROOT / "assets" / "art-v2" / "sprites" / "bosses" / name,
            OUT / "bosses" / name,
            96,
            96,
            {0, 1, 2, 3},
        )


if __name__ == "__main__":
    main()
