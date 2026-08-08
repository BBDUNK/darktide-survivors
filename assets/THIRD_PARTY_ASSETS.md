# Third-party art, audio and fonts

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

## Dungeon Crawl Stone Soup Full (DCSS)

- Author/project: Dungeon Crawl Stone Soup contributors
- Source: official DCSS repository, `crawl-ref/source/rltiles`: https://github.com/crawl/crawl/tree/master/crawl-ref/source/rltiles
- License: Creative Commons Zero (CC0 1.0)
- Local license: `assets/sprites/vendor/dcss-crawl/Dungeon Crawl Stone Soup Full/LICENSE.txt`
- Used for: the majority of the 143 non-UI atlas assets (monsters, bosses, items, weapons, projectile art, effects, VFX, terrain and decorations), unified at a dark 32x32 roguelike style (a few terrain tiles are 16x16). The six playable character actions and the slash/arrow FX sprites come from Ninja Adventure.
- Import map: `tools/art/import-dcss.py` plus `tools/art/open-assets-manifest.json` and `tools/art/art-manifest.json`.
- Status: downloaded 2026-08-09 from the official DCSS repository mirror; the original archive is preserved at `assets/sprites/vendor/dcss-crawl/source.zip`.

### DCSS-derived animation strips

- Source: `assets/sprites/vendor/dcss-crawl/Dungeon Crawl Stone Soup Full/`
- Output: `assets/sprites/sources/dcss-derived/`
- License: derived from CC0 DCSS sources, so CC0.
- Integration: `tools/art/import-dcss.py` turns 40 static single-frame assets into multi-frame `breathe`/`sway` strips, derives effect-frame animations (including the eight-frame `p_web` cast), thresholds translucent effect frames, and scales terrain tiles before `tools/art/build-atlas.js` rebuilds the atlas.

## 80 CC0 RPG SFX

- Author: rubberduck
- Source: https://opengameart.org/content/80-cc0-rpg-sfx
- License: Creative Commons Zero (CC0 1.0)
- Used files: 80 OGG sound effects under `assets/audio/vendor/80-cc0-rpg-sfx/` (blade, book, chain, creature, item, lock, metal, spell, stone, wood).
- Status: downloaded and verified; not yet wired into `js/audio.js`.

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
- Used for: six playable characters with four-frame idle/walk/attack actions, plus the four-frame slash sweep FX and the projectile arrow.
- Local license: `assets/sprites/vendor/ninja-adventure/LICENSE.txt`
- Exact atlas sources: `Actor/Characters/Knight/SeparateAnim/Idle.png`, `Actor/Characters/NinjaMageBlack/SeparateAnim/Idle.png`, `Actor/Characters/Hunter/SeparateAnim/Idle.png`, `Actor/Characters/Monk2/SeparateAnim/Idle.png`, `Actor/Characters/GladiatorBlue/SeparateAnim/Idle.png`, `Actor/Characters/SorcererOrange/SeparateAnim/Idle.png`, plus the matching `Walk.png` / `Attack.png` siblings, `FX/SlashFx/SlashDoubleCurved/SpriteSheet.png`, `FX/SlashFx/CircularSlash/SpriteSheet.png` and `FX/Projectile/Arrow.png`.
- Import map: `tools/art/art-manifest.json` and `tools/art/open-assets-manifest.json`.
- Status: actively referenced by the atlas manifests as of 2026-08-09; the full original pack is retained under `assets/sprites/vendor/ninja-adventure/` for provenance.

## Flying Monster Frames 16×16

- Author: awesomeduck
- Source: https://opengameart.org/content/flying-monster-frames-16x16
- License: CC0 1.0 Universal
- Previously used for: `bat` and `bloodbat` four-frame animation sources.
- Status: no longer referenced by the atlas manifests as of 2026-08-09; superseded by DCSS-derived frames. Source files are retained under `assets/sprites/vendor/oga/` for provenance.

## Downloaded, not yet imported

- Kenney Tiny Dungeon 1.0 (CC0): archived at `assets/sprites/vendor/kenney-tinydungeon.zip`; official source https://kenney.nl/assets/tiny-dungeon, local `License.txt` confirms CC0.
- Ars Notoria hero spritesheets (CC0): archived at `assets/sprites/vendor/ars-notoria/source.zip`; author Balmer, source https://opengameart.org/content/hero-spritesheets-ars-notoria.
- Status: both packs were downloaded while evaluating replacement art, but no runtime atlas asset currently references them.

## UnifrakturCook

- Designer: Peter Wiegel; Google Fonts distribution
- Source: https://github.com/google/fonts/tree/main/ofl/unifrakturcook
- License: SIL Open Font License 1.1
- Used for: anti-aliased gothic main title lettering.
- Local license: `fonts/OFL-UnifrakturCook.txt`
