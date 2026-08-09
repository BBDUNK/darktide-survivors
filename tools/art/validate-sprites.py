"""Validate atlas bounds, palette/alpha constraints, anchors and frame alignment."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


def pixel_data(image: Image.Image):
    if hasattr(image, "get_flattened_data"):
        return image.get_flattened_data()
    return image.getdata()


def validate(manifest_path: Path) -> int:
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
    meta = json.loads((out_dir / "atlas.json").read_text(encoding="utf-8"))
    atlas = Image.open(out_dir / "atlas.png").convert("RGBA")
    specs = {a["name"]: a for a in manifest["assets"]}
    errors: list[str] = []
    warnings: list[str] = []
    report_assets = {}

    for name, frames in meta["frames"].items():
        spec = specs.get(name)
        if not spec:
            errors.append(f"{name}: missing manifest entry")
            continue
        stats = []
        for index, frame in enumerate(frames):
            x, y, w, h = frame["x"], frame["y"], frame["w"], frame["h"]
            if x < 0 or y < 0 or x + w > atlas.width or y + h > atlas.height:
                errors.append(f"{name}[{index}]: outside atlas bounds")
                continue
            if [w, h] != spec["size"]:
                errors.append(f"{name}[{index}]: size {w}x{h}, expected {spec['size'][0]}x{spec['size'][1]}")
            ax, ay = frame["anchor"]["x"], frame["anchor"]["y"]
            if not (0 <= ax < w and 0 <= ay < h):
                errors.append(f"{name}[{index}]: invalid anchor {ax},{ay}")
            crop = atlas.crop((x, y, x + w, y + h))
            alphas = set(pixel_data(crop.getchannel("A")))
            if not alphas.issubset({0, 255}):
                errors.append(f"{name}[{index}]: alpha is not hard 0/255")
            opaque = [(r, g, b) for r, g, b, a in pixel_data(crop) if a]
            coverage = len(opaque) / (w * h)
            colors = len(set(opaque))
            if coverage < spec.get("minCoverage", 0.08):
                errors.append(f"{name}[{index}]: suspiciously empty ({coverage:.1%})")
            if coverage > 0.92:
                warnings.append(f"{name}[{index}]: little transparent padding ({coverage:.1%})")
            max_colors = spec.get("maxColors", len(spec.get("colors", [])) or 256)
            if colors > max_colors:
                errors.append(f"{name}[{index}]: {colors} colors exceed palette limit {max_colors}")
            alpha = crop.getchannel("A")
            bbox = alpha.getbbox()
            if bbox and (bbox[0] == 0 or bbox[1] == 0 or bbox[2] == w or bbox[3] == h):
                warnings.append(f"{name}[{index}]: silhouette touches logical frame edge")
            points = [(px, py) for py in range(h) for px in range(w) if alpha.getpixel((px, py))]
            centroid = None
            if points:
                centroid = [round(sum(px for px, _ in points) / len(points), 3),
                            round(sum(py for _, py in points) / len(points), 3)]
            stats.append({
                "index": index,
                "coverage": round(coverage, 4),
                "colors": colors,
                "bbox": bbox,
                "centroid": centroid,
                "signature": hashlib.sha256(crop.tobytes()).hexdigest()[:12],
            })
        if len(stats) > 1:
            bottoms = [s["bbox"][3] for s in stats if s["bbox"]]
            max_baseline_drift = spec.get("maxBaselineDrift", 1)
            if bottoms and max(bottoms) - min(bottoms) > max_baseline_drift:
                errors.append(f"{name}: animation baselines differ by more than {max_baseline_drift} pixels")
            signatures = [s["signature"] for s in stats]
            if not spec.get("allowDuplicateFrames") and len(set(signatures)) != len(signatures):
                errors.append(f"{name}: animation contains duplicate frames")
            centers = [s["centroid"][0] for s in stats if s["centroid"]]
            max_drift = spec.get("maxCentroidDrift", 4)
            if centers and max(centers) - min(centers) > max_drift:
                errors.append(f"{name}: horizontal centroid drifts more than {max_drift} pixels")
        report_assets[name] = stats

    missing = sorted(set(specs) - set(meta["frames"]))
    if missing:
        errors.append("missing atlas assets: " + ", ".join(missing))
    report = {
        "ok": not errors,
        "atlas": {"width": atlas.width, "height": atlas.height},
        "assets": report_assets,
        "warnings": warnings,
        "errors": errors,
    }
    (out_dir / "quality-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for warning in warnings:
        print("WARN", warning)
    for error in errors:
        print("ERROR", error)
    print(f"Validated {len(report_assets)} assets: {'PASS' if not errors else 'FAIL'}")
    return 0 if not errors else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="tools/art/art-manifest.json")
    args = parser.parse_args()
    raise SystemExit(validate(Path(args.manifest).resolve()))
