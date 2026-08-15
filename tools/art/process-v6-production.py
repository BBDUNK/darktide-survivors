#!/usr/bin/env python3
"""Process V6 production-manifest FRAMES entries into validated game-ready strips.

Each sheet is converted with tools/art/process-image2-sheet.py using the exact
recorded grid (cols/rows/frameMap) and shared logical frameSize. The driver then
verifies hard alpha, colour count, duplicate frames, coverage, baseline and
centroid drift before promoting an entry to READY.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image


def run_processor(entry: dict, root: Path) -> None:
    size = entry["frameSize"]
    cols = entry["cols"]
    rows = entry["rows"]
    frame_map = entry.get("frameMap") or list(range(cols * rows))
    # process-image2-sheet applies one column mapping to every source row.
    row_map = frame_map[:cols]
    args = [
        sys.executable,
        str(root / "tools" / "art" / "process-image2-sheet.py"),
        "--input", str(root / entry["source"]),
        "--out", str(root / entry["output"]),
        "--cols", str(cols),
        "--rows", str(rows),
        "--frame-map", ",".join(str(value) for value in row_map),
        "--cell", f"{size[0]}x{size[1]}",
        "--flatten",
        "--shared-fit", str(entry.get("fit", "union")),
        "--no-color-key",
        "--colors", "40",
        "--padding", "3",
    ]
    result = subprocess.run(args, cwd=root, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        raise SystemExit(f"process-image2-sheet failed for {entry['name']}:\n{result.stdout}\n{result.stderr}")
    print((result.stdout or "").strip())


def verify_entry(entry: dict, root: Path) -> tuple[bool, str]:
    name = entry["name"]
    out_path = root / entry["output"]
    if not out_path.exists():
        return False, f"{name}: output missing"
    strip = Image.open(out_path).convert("RGBA")
    fw, fh = entry["frameSize"]
    frames = entry["frames"]
    if strip.width != fw * frames or strip.height != fh:
        return False, f"{name}: strip {strip.width}x{strip.height}, expected {fw*frames}x{fh}"
    alpha = strip.getchannel("A")
    alphas = set(alpha.get_flattened_data() if hasattr(alpha, "get_flattened_data") else alpha.getdata())
    if not alphas.issubset({0, 255}):
        return False, f"{name}: soft alpha values present"
    signatures = []
    bboxes = []
    centroids = []
    for index in range(frames):
        frame = strip.crop((index * fw, 0, (index + 1) * fw, fh))
        a = frame.getchannel("A")
        points = [(x, y) for y in range(fh) for x in range(fw) if a.getpixel((x, y))]
        if not points:
            return False, f"{name}[{index}]: empty frame"
        opaque = [px[:3] for px in frame.getdata() if px[3]]
        coverage = len(opaque) / (fw * fh)
        min_coverage = entry.get("minCoverage", 0.02)
        if coverage < min_coverage:
            return False, f"{name}[{index}]: coverage {coverage:.1%} below {min_coverage:.1%}"
        colors = len(set(opaque))
        if colors > 40:
            return False, f"{name}[{index}]: {colors} colours exceed 40"
        signatures.append(frame.tobytes())
        bboxes.append(a.getbbox())
        centroids.append((sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points)))
    if len(signatures) > 1 and not entry.get("loop", True):
        if len(set(signatures)) != len(signatures):
            return False, f"{name}: one-shot action contains duplicate frames"
    if bboxes and entry.get("frameSize")[1] <= 112:
        fit = entry.get("fit", "union")
        allowed_bottom = entry.get("maxBaselineDrift", 2 if fit == "baseline" else 32)
        bottoms = [bbox[3] for bbox in bboxes]
        if max(bottoms) - min(bottoms) > allowed_bottom:
            return False, f"{name}: baseline drift {max(bottoms) - min(bottoms)}px"
    xs = [point[0] for point in centroids]
    allowed_centroid = entry.get("maxCentroidDrift", 8)
    if max(xs) - min(xs) > allowed_centroid:
        return False, f"{name}: centroid drift {max(xs) - min(xs):.2f}px"
    coverage_values = ", ".join(f"{round(len([px for px in strip.crop((i*fw,0,(i+1)*fw,fh)).getdata() if px[3]])/(fw*fh), 2):.2f}" for i in range(frames))
    return True, f"{name}: {frames}f {fw}x{fh} hard-alpha coverage=[{coverage_values}]"


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="assets/art-v6/production-manifest.json")
    parser.add_argument("--only", default="", help="Comma-separated entry names to process")
    parser.add_argument("--force", action="store_true", help="Reprocess READY entries too")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    manifest_path = (root / args.manifest).resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    only = {name.strip() for name in args.only.split(",") if name.strip()}

    processed = 0
    for entry in manifest["entries"]:
        name = entry["name"]
        if only and name not in only:
            continue
        status = entry.get("status")
        if (status != "FRAMES" and not (args.force and status in ("READY", "INTEGRATED"))) or not entry.get("source"):
            continue
        run_processor(entry, root)
        ok, detail = verify_entry(entry, root)
        if ok:
            entry["status"] = "READY"
            print("READY " + detail)
            processed += 1
        else:
            print("REJECT " + detail)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Processed {processed} entries; manifest saved")


if __name__ == "__main__":
    main()
