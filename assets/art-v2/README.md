# Darktide Art V2 resource library

This is the production source for the unified battle-worn medieval art pass. Its visual anchor is the silver knight: realistic adult proportions, segmented aged metal, torn navy cloth, restrained brass and leather, visible hard pixels, and no soft antialiasing.

## Directory contract

- `sources/`: original ImageGen masters; never used at runtime.
- `work/`: chroma-key-removed intermediate RGBA files; never used at runtime.
- `sprites/`: hard-alpha, nearest-neighbour, palette-limited sprite sheets.
- `ui/`: size-specific HUD components used directly by CSS or packed into the atlas.

Runtime sprites are packed through `tools/art/art-manifest.json` into `assets/sprites/atlas.png`. The public `SpriteGen.get()` / `SpriteGen.frames()` API is unchanged.

## Playable characters

Characters: `knight`, `mage`, `ranger`, `cleric`, `berserker`, `chrono`.

Every character has four 8-frame sheets:

- `char_<id>_idle_4dir.png`
- `char_<id>_run_4dir.png`
- `char_<id>_attack_4dir.png`
- `char_<id>_reaction_4dir.png` (frames 1–3 hurt/recover; frames 4–8 death)

Rows are always `down`, `left`, `right`, `up`. Runtime names are:

- `char_<id>_idle_<direction>`
- `char_<id>_walk_<direction>`
- `char_<id>_attack_<direction>`
- `char_<id>_hurt_<direction>`
- `char_<id>_death_<direction>`

Compatibility aliases `char_<id>`, `char_<id>_walk`, and `char_<id>_attack` use the down-facing row.

## Enemies and bosses

Ordinary enemies use one 8×4 sheet per enemy. Rows are idle, move, attack, death. Runtime suffixes are empty, `_walk`, `_attack`, `_death`.

Bosses use one 8×5 sheet. Rows are idle, move, telegraph/charge, signature attack, death. Runtime suffixes are empty, `_walk`, `_charge`, `_attack`, `_death`.

## Weapons, effects and icons

- `sprites/weapons/tesla_tower_actions.png`: idle, deploy, discharge; 8 frames each.
- `sprites/weapons/orbitblade_actions.png`: antique Chinese jian orbit, fly and impact; never an axe.
- `sprites/vfx/projectiles_actions.png`: physical and magical projectiles, 8 frames each.
- `sprites/vfx/attack_effects.png`: lightning, fire pool, explosion, frost, slash, holy, shadow and spectral dragon effects.
- `sprites/icons/weapon_icons.png`: 12 base weapons in `CFG.WEAPONS` order.
- `sprites/icons/evolution_icons.png`: 12 evolutions in `CFG.EVOS` order.
- `sprites/icons/passive_icons.png`: nine distinct passives.
- `sprites/icons/pickup_icons.png`: coin, meat, chest, magnet, heal, XP, boss chest and merchant token.

## Build and quality gate

```powershell
node tools/art/register-art-v2.js
py tools/art/pixel-cleanup.py --manifest tools/art/art-manifest.json
py tools/art/validate-sprites.py --manifest tools/art/art-manifest.json
```

`process-image2-sheet.py` and `extract-ui-kit.py` enforce hard 0/255 alpha, remove green/magenta spill, resize with nearest-neighbour sampling, limit palettes, and bottom-centre anchors. `validate-sprites.py` rejects missing frames, soft alpha, invalid anchors, excessive colours, suspicious coverage, or unstable baselines.
