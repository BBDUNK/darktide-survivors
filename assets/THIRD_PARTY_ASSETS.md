# Third-party art and fonts

Only assets with redistribution-friendly licenses are included. Runtime copies are stored locally; the game makes no external asset requests.

## Tiny RPG — Dark Dwellers GUI

- Author: tiopalada
- Source: https://opengameart.org/content/tiny-rpg-dark-dwellers-gui
- License: Creative Commons Zero (CC0 1.0)
- Used files: 9-slice panels, four-state buttons, headers, HUD bars, item slots and mouse cursor.
- Integration: original sheets are preserved under `assets/ui/dark-dwellers/source/`; deterministic crops are built by `tools/ui/build-theme.py`.

## Monolith with backdrop

- Author: knekko
- Source: https://opengameart.org/content/monolith-with-backdrop
- License: Creative Commons Zero (CC0 1.0)
- Used file: `assets/backgrounds/menu-monolith.png`, displayed as the main-menu backdrop.

## Fusion Pixel Font

- Author/project: TakWolf / Fusion Pixel Font
- Source: https://github.com/TakWolf/fusion-pixel-font
- Version: 2026.07.20, 12 px proportional Simplified Chinese WOFF2 build
- License: SIL Open Font License 1.1
- License copy: `fonts/OFL-Fusion-Pixel.txt`

The original user-provided Jade Emperor opening image remains `assets/intro.jpg` and is not replaced by third-party art.

## Project-authored image-generation sources

- `assets/sprites/sources/v19-key-art-concepts.png`: original v0.19 Tesla coil, incendiary flask, zombie and merchant design reference sheet.
- `assets/sprites/sources/v19-zombie-walk-source.png`: original four-frame zombie walk source derived from that reference.
- These are project-authored source assets rather than third-party downloads; the deterministic atlas pipeline performs chroma removal, palette quantization, hard alpha, scaling and anchor alignment.

## Ninja Adventure Asset Pack

- Authors: Pixel-Boy and AAA
- Official source: https://pixel-boy.itch.io/ninja-adventure-asset-pack
- Pinned source mirror revision: `0476a561d5e6da477d5d2de2e738f0595754adbb`
- License: CC0 1.0 Universal
- Used for: six playable characters with idle/walk/attack actions, the animated merchant, enemies and bosses, projectiles, weapon/passive/system icons, drops, terrain details, decorations and sprite VFX.
- Local license: `assets/sprites/vendor/ninja-adventure/LICENSE.txt`
- Import map: `tools/art/open-assets-manifest.json`

## Flying Monster Frames 16×16

- Author: awesomeduck
- Source: https://opengameart.org/content/flying-monster-frames-16x16
- License: CC0 1.0 Universal
- Used for: `bat` and `bloodbat` four-frame animation sources.

## UnifrakturCook

- Designer: Peter Wiegel; Google Fonts distribution
- Source: https://github.com/google/fonts/tree/main/ofl/unifrakturcook
- License: SIL Open Font License 1.1
- Used for: anti-aliased gothic main title lettering.
- Local license: `fonts/OFL-UnifrakturCook.txt`
