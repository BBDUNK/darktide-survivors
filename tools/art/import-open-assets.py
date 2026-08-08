"""Import the pinned CC0 source sprites used by the production atlas."""
from __future__ import annotations

import json
import os
import shutil
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "tools" / "art" / "open-assets-manifest.json"
VENDOR_PREFIX = "assets/sprites/vendor/ninja-adventure/"
PINNED_REV = "0476a561d5e6da477d5d2de2e738f0595754adbb"
RAW_ROOT = f"https://raw.githubusercontent.com/MarioLDD/Kuroshiro-adventure/{PINNED_REV}/Assets/NinjaAdventure/"
OGA_FILES = {
    "assets/sprites/vendor/oga/Bat16x16.png":
        "https://opengameart.org/sites/default/files/Bat16x16.png",
    "assets/sprites/vendor/oga/Stalkette16x16.png":
        "https://opengameart.org/sites/default/files/Stalkette16x16.png",
}


def local_pack_root() -> Path | None:
    configured = os.environ.get("NINJA_ADVENTURE_ROOT")
    candidates = [
        Path(configured) if configured else None,
        Path(os.environ.get("LOCALAPPDATA", "")) / "Temp" / "ninja-adventure-full-20260808"
        / "Assets" / "NinjaAdventure",
    ]
    return next((path for path in candidates if path and path.is_dir()), None)


def fetch(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "darktide-survivors-art-builder/1.0"})
    with urllib.request.urlopen(request, timeout=45) as response, destination.open("wb") as output:
        shutil.copyfileobj(response, output)


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    pack_root = local_pack_root()
    sources = sorted({asset["source"] for asset in manifest["assets"]})
    copied = downloaded = 0
    for source in sources:
        destination = ROOT / source
        if source in OGA_FILES:
            fetch(OGA_FILES[source], destination)
            downloaded += 1
            continue
        if not source.startswith(VENDOR_PREFIX):
            continue
        relative = source.removeprefix(VENDOR_PREFIX)
        destination.parent.mkdir(parents=True, exist_ok=True)
        local = pack_root / Path(relative) if pack_root else None
        if local and local.is_file():
            shutil.copy2(local, destination)
            copied += 1
        else:
            fetch(RAW_ROOT + urllib.parse.quote(relative.replace("\\", "/"), safe="/"), destination)
            downloaded += 1

    license_destination = ROOT / "assets" / "sprites" / "vendor" / "ninja-adventure" / "LICENSE.txt"
    if pack_root and (pack_root / "LICENSE.txt").is_file():
        shutil.copy2(pack_root / "LICENSE.txt", license_destination)
    else:
        fetch(RAW_ROOT + "LICENSE.txt", license_destination)
    print(f"Imported {len(sources)} unique sources ({copied} local, {downloaded} downloaded)")


if __name__ == "__main__":
    main()
