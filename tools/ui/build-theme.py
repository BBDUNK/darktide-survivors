"""Extract deterministic runtime pieces from the vendored CC0 Dark Dwellers sheets."""
from pathlib import Path
import shutil

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets" / "ui" / "dark-dwellers" / "source"
OUTPUT = ROOT / "assets" / "ui" / "dark-dwellers"


def split_sheet(filename: str, prefix: str, count: int) -> None:
    with Image.open(SOURCE / filename).convert("RGBA") as sheet:
        frame_w = sheet.width // count
        if frame_w * count != sheet.width:
            raise ValueError(f"{filename} width is not divisible by {count}")
        for index in range(count):
            frame = sheet.crop((index * frame_w, 0, (index + 1) * frame_w, sheet.height))
            frame.save(OUTPUT / f"{prefix}-{index}.png", optimize=True)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    split_sheet("button-neutral-sheet.png", "button-neutral", 4)
    split_sheet("button-primary-sheet.png", "button-primary", 4)
    split_sheet("slot-sheet.png", "slot", 5)
    split_sheet("cursor-sheet.png", "cursor", 4)
    for name in ("panel-base.png", "panel-selected.png", "panel-accent.png",
                 "header.png", "bar-hp.png", "bar-boss.png"):
        shutil.copyfile(SOURCE / name, OUTPUT / name)
    print("Built Dark Dwellers runtime UI assets")


if __name__ == "__main__":
    main()
