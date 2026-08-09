"""Generate the gothic dark-fantasy 9-slice frame used by the main menu."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "ui" / "gothic-frame.png"

# Dark iron base with a restrained antique-gold trim, matching the game palette.
DARK = (16, 12, 24, 255)
OUTLINE = (6, 4, 12, 255)
IRON = (52, 42, 66, 255)
IRON_HI = (92, 78, 108, 255)
IRON_DIM = (30, 24, 42, 255)
GOLD = (196, 152, 74, 255)
GOLD_HI = (244, 212, 128, 255)
GOLD_DIM = (122, 92, 48, 255)
SPARK = (255, 246, 205, 255)


def draw_corner(img: Image.Image, mode: str) -> None:
    """Draw one 24x24 corner ornament in the top-left quadrant."""
    d = ImageDraw.Draw(img)
    if mode == "tl":
        # outer dark frame with an iron plate behind the ornament
        d.rectangle((0, 0, 23, 23), outline=OUTLINE)
        d.rectangle((1, 1, 22, 22), outline=DARK)
        d.rectangle((2, 2, 21, 21), outline=IRON_DIM)
        # gothic spire: stepped peak with gold-tipped apex
        d.polygon([(3, 3), (7, 3), (5, 6)], fill=IRON)
        d.polygon([(3, 3), (7, 3), (5, 6)], outline=GOLD_DIM)
        d.point((5, 4), fill=SPARK)
        # stepped gothic shoulders
        d.rectangle((8, 3, 15, 5), fill=IRON)
        d.line((8, 3, 15, 3), fill=IRON_HI)
        d.rectangle((12, 6, 19, 8), fill=IRON)
        d.line((12, 6, 19, 6), fill=IRON_HI)
        # diamond stud on the shoulder
        d.polygon([(14, 5), (16, 7), (14, 9), (12, 7)], fill=GOLD)
        d.point((14, 6), fill=SPARK)
        # gold diagonal trim along the inner corner
        d.line((6, 21, 21, 6), fill=GOLD_DIM)
        d.line((7, 21, 21, 7), fill=GOLD)
        d.line((8, 21, 21, 8), fill=GOLD_HI)
        # small corner rosette
        d.polygon([(9, 21), (11, 19), (13, 21), (11, 23)], fill=IRON_HI)
        d.point((11, 20), fill=SPARK)
        # repeated iron rivets along both edges
        for i, (rx, ry) in enumerate([(5, 12), (8, 9), (12, 5), (14, 10)]):
            if i % 2 == 0:
                d.point((rx, ry), fill=GOLD)
            else:
                d.point((rx, ry), fill=IRON_HI)
    else:
        raise ValueError(mode)


def draw_edge_studs(d: ImageDraw.ImageDraw, size: int) -> None:
    """Repeat the gothic stud/notch motif along all four border middles."""
    for x in range(0, size - 8, 4):
        d.line((x + 2, 3, x + 3, 3), fill=GOLD)
        d.point((x + 1, 3), fill=GOLD_HI)
        d.point((x + 5, 4), fill=IRON_DIM)
        d.line((x + 2, 5, x + 3, 5), fill=GOLD_DIM)
    for y in range(0, size - 8, 4):
        d.line((3, y + 2, 3, y + 3), fill=GOLD)
        d.point((3, y + 1), fill=GOLD_HI)
        d.point((4, y + 5), fill=IRON_DIM)
        d.line((5, y + 2, 5, y + 3), fill=GOLD_DIM)
    for x in range(0, size - 8, 4):
        d.line((x + 2, size - 4, x + 3, size - 4), fill=GOLD)
        d.point((x + 1, size - 4), fill=GOLD_HI)
        d.point((x + 5, size - 5), fill=IRON_DIM)
        d.line((x + 2, size - 6, x + 3, size - 6), fill=GOLD_DIM)
    for y in range(0, size - 8, 4):
        d.line((size - 4, y + 2, size - 4, y + 3), fill=GOLD)
        d.point((size - 4, y + 1), fill=GOLD_HI)
        d.point((size - 5, y + 5), fill=IRON_DIM)
        d.line((size - 6, y + 2, size - 6, y + 3), fill=GOLD_DIM)


def main() -> None:
    size = 96
    border = 24
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Frame ring with layered iron/gold bands.
    d.rectangle((0, 0, size - 1, size - 1), outline=OUTLINE)
    d.rectangle((1, 1, size - 2, size - 2), outline=DARK)
    d.rectangle((2, 2, size - 3, size - 3), outline=IRON_DIM)
    d.rectangle((3, 3, size - 4, size - 4), outline=IRON)
    d.rectangle((4, 4, size - 5, size - 5), outline=GOLD_DIM)
    d.rectangle((5, 5, size - 6, size - 6), outline=GOLD)
    # top/bottom/left/right inner shadow
    d.rectangle((6, 6, size - 7, 7), outline=GOLD_HI)
    d.rectangle((6, size - 8, size - 7, size - 7), outline=IRON_DIM)
    d.rectangle((6, 6, 7, size - 7), outline=GOLD_HI)
    d.rectangle((size - 8, 6, size - 7, size - 7), outline=IRON_DIM)

    draw_edge_studs(d, size)

    # Corner ornaments are mirrored into the four corners.
    tl = Image.new("RGBA", (border, border), (0, 0, 0, 0))
    draw_corner(tl, "tl")
    img.paste(tl, (0, 0), tl)
    img.paste(tl.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (size - border, 0), tl)
    img.paste(tl.transpose(Image.Transpose.FLIP_TOP_BOTTOM), (0, size - border), tl)
    img.paste(tl.transpose(Image.Transpose.ROTATE_180), (size - border, size - border), tl)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT)
    print("wrote", OUT, img.size)


if __name__ == "__main__":
    main()
