#!/usr/bin/env python3
"""Rebuild the V3 corrective art pass from its checked-in ImageGen masters."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
PROCESSOR = ROOT / "tools" / "art" / "process-image2-sheet.py"


def process(source: str, target: str, cols: int, rows: int, cell: int,
            padding: int, colors: int, frame_map: str = "") -> None:
    cmd = [
        sys.executable, str(PROCESSOR), "--input", str(ROOT / source), "--out", str(ROOT / target),
        "--cols", str(cols), "--rows", str(rows), "--cell", str(cell),
        "--padding", str(padding), "--colors", str(colors),
    ]
    if frame_map:
        cmd.extend(["--frame-map", frame_map])
    subprocess.run(cmd, check=True)


def crop_timer() -> None:
    source = Image.open(
        ROOT / "assets" / "art-v3" / "sources" / "ui" / "hud_timer_frame_combined_source.png"
    ).convert("RGBA")
    # The V2 extraction cell contains a square badge followed by the actual wide timer frame.
    wide = source.crop((64, 0, source.width, source.height))
    bbox = wide.getchannel("A").getbbox()
    if not bbox:
        raise SystemExit("timer frame crop is empty")
    wide = wide.crop(bbox)
    target = ROOT / "assets" / "art-v3" / "ui" / "hud_timer_frame.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    wide.save(target, optimize=True)
    print(f"wrote {target.relative_to(ROOT)} {wide.width}x{wide.height}")


def main() -> None:
    process(
        "assets/art-v3/sources/enemies/slime/slime_actions_master.png",
        "assets/art-v3/sprites/enemies/slime_actions.png",
        7, 4, 64, 5, 44, "0,1,2,3,4,5,6,6",
    )
    process(
        "assets/art-v3/sources/npcs/merchant/merchant_actions_master.png",
        "assets/art-v3/sprites/npcs/merchant_actions.png",
        8, 3, 80, 5, 56,
    )
    process(
        "assets/art-v3/sources/weapons/tesla/tesla_tower_actions_master.png",
        "assets/art-v3/sprites/weapons/tesla_tower_actions.png",
        8, 4, 112, 6, 64,
    )
    process(
        "assets/art-v3/sources/environment/deadwood_props_master.png",
        "assets/art-v3/sprites/environment/deadwood_props.png",
        4, 2, 128, 5, 64,
    )
    crop_timer()
    subprocess.run([sys.executable, str(ROOT / "tools" / "art" / "build-elite-variants.py")], check=True)


if __name__ == "__main__":
    main()
