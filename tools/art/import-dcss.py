"""Switch the non-UI atlas manifests to the CC0 DCSS tile set.

The DCSS "Dungeon Crawl Stone Soup Full" pack ships single 32x32 PNGs, so
multi-frame entries either repeat one frame or use a derived strip built from
the pack's effect frames.  Run this before tools/art/build-atlas.js whenever
the DCSS source needs to be re-imported.
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DCSS = ROOT / "assets" / "sprites" / "vendor" / "dcss-crawl" / "Dungeon Crawl Stone Soup Full"
DERIVED = ROOT / "assets" / "sprites" / "sources" / "dcss-derived"

# Each entry overrides the source and keeps the existing atlas contract
# (name/size/anchor/renderScale/fps/category) from the manifests.
MAPPING = {
    # Characters and player actions
    "merchant": {"src": "monster/human.png", "frames": 4},
    "char_knight": {"src": "player/base/human_male.png", "frames": 4},
    "char_mage": {"src": "player/base/deep_elf_male.png", "frames": 4},
    "char_ranger": {"src": "player/base/elf_male.png", "frames": 4},
    "char_cleric": {"src": "player/base/human_female.png", "frames": 4},
    "char_berserker": {"src": "player/base/orc_male.png", "frames": 4},
    "char_chrono": {"src": "player/base/tengu_wingless_brown_male.png", "frames": 4},
    "char_knight_walk": {"src": "player/base/human_male.png", "frames": 4},
    "char_knight_attack": {"src": "player/base/human_male.png", "frames": 4},
    "char_mage_walk": {"src": "player/base/deep_elf_male.png", "frames": 4},
    "char_mage_attack": {"src": "player/base/deep_elf_male.png", "frames": 4},
    "char_ranger_walk": {"src": "player/base/elf_male.png", "frames": 4},
    "char_ranger_attack": {"src": "player/base/elf_male.png", "frames": 4},
    "char_cleric_walk": {"src": "player/base/human_female.png", "frames": 4},
    "char_cleric_attack": {"src": "player/base/human_female.png", "frames": 4},
    "char_berserker_walk": {"src": "player/base/orc_male.png", "frames": 4},
    "char_berserker_attack": {"src": "player/base/orc_male.png", "frames": 4},
    "char_chrono_walk": {"src": "player/base/tengu_wingless_brown_male.png", "frames": 4},
    "char_chrono_attack": {"src": "player/base/tengu_wingless_brown_male.png", "frames": 4},

    # Enemies
    "bat": {"src": "monster/animals/bat.png", "frames": 4},
    "slime": {"src": "monster/amorphous/ooze_new.png", "frames": 4},
    "slime_big": {"src": "monster/amorphous/azure_jelly_new.png", "frames": 4},
    "zombie": {"src": "monster/undead/zombies/zombie_small.png", "frames": 4},
    "ghost": {"src": "monster/undead/spectrals/spectral_thing.png", "frames": 4},
    "spider": {"src": "monster/animals/spider.png", "frames": 4},
    "cultist": {"src": "monster/necromancer_new.png", "frames": 4},
    "orc": {"src": "monster/orc_warrior_new.png", "frames": 4},
    "imp": {"src": "monster/demons/imp.png", "frames": 4},
    "knight_armored": {"src": "monster/hell_knight_new.png", "frames": 4},
    "werewolf": {"src": "monster/animals/wolf.png", "frames": 4},
    "mummy": {"src": "monster/undead/mummy.png", "frames": 4},
    "gargoyle": {"src": "monster/nonliving/gargoyle.png", "frames": 4},
    "bloodbat": {"src": "monster/animals/fire_bat.png", "frames": 4},
    "wraith": {"src": "monster/undead/wraith.png", "frames": 4},
    "skeleton": {"src": "monster/undead/skeletons/skeleton_humanoid_small_new.png", "frames": 4},

    # Bosses
    "boss_bonelord": {"src": "monster/anubis_guard.png", "frames": 5, "pixelScale": 2},
    "boss_abysseye": {"src": "monster/orb_guardian_new.png", "frames": 5, "pixelScale": 2},
    "boss_darklord": {"src": "monster/juggernaut.png", "frames": 6, "pixelScale": 3},
    "boss_slimeking": {"src": "monster/amorphous/azure_jelly_new.png", "frames": 4, "pixelScale": 2},

    # Projectiles and VFX
    "p_slash": {"strip": ["effect/zap_0.png", "effect/zap_1.png", "effect/zap_2.png", "effect/zap_3.png"], "maxCentroidDrift": 20, "maxBaselineDrift": 18},
    "p_slash_big": {"src": "effect/zap_0.png"},
    "p_bolt": {"strip": ["effect/magic_bolt_1.png", "effect/magic_bolt_2.png", "effect/magic_bolt_3.png", "effect/magic_bolt_4.png"], "maxCentroidDrift": 20, "maxBaselineDrift": 18},
    "p_arrow": {"strip": ["effect/arrow_0.png", "effect/arrow_1.png", "effect/arrow_2.png", "effect/arrow_3.png"], "fps": 12, "maxCentroidDrift": 20, "maxBaselineDrift": 18},
    "p_dragon": {"src": "monster/dragons/dragon.png", "frames": 4},
    "p_axe": {"src": "item/weapon/hand_axe_1_new.png"},
    "p_dagger": {"src": "item/weapon/dagger_new.png"},
    "p_orbitblade": {"strip": ["effect/tomahawk_0.png", "effect/tomahawk_2.png"], "maxCentroidDrift": 20, "maxBaselineDrift": 18},
    "p_book": {"src": "item/book/book_gray.png"},
    "p_fireflask": {"src": "item/potion/ruby_new.png"},
    "p_firepool": {"strip": ["effect/cloud_fire_0.png", "effect/cloud_fire_1.png", "effect/cloud_fire_2.png", "effect/flame_2.png", "effect/flame_1.png"], "maxCentroidDrift": 20, "maxBaselineDrift": 18},
    "p_spark": {"strip": ["effect/zap_0.png", "effect/zap_1.png"], "maxCentroidDrift": 20, "maxBaselineDrift": 18},
    "p_shadow": {"strip": ["effect/cloud_gloom_new.png", "effect/cloud_gloom_old.png", "effect/cloud_black_smoke.png", "effect/cloud_chaos_3.png"], "threshold": 40, "maxColors": 340, "maxCentroidDrift": 20, "maxBaselineDrift": 18},
    "p_turret": {"src": "monster/nonliving/iron_golem.png"},
    "p_enemy_bolt": {"strip": ["effect/magic_bolt_5.png", "effect/magic_bolt_6.png", "effect/magic_bolt_7.png", "effect/magic_bolt_8.png"], "maxCentroidDrift": 20, "maxBaselineDrift": 18},
    "p_holy": {"strip": ["effect/gold_sparkles_1.png", "effect/gold_sparkles_2.png", "effect/gold_sparkles_3.png", "effect/sanctuary.png", "effect/gold_sparkles_1.png"], "maxCentroidDrift": 20, "maxBaselineDrift": 18},
    "p_web": {"strip": [f"effect/throwing_net_{i}.png" for i in range(8)],
              "maxCentroidDrift": 20, "maxBaselineDrift": 6},

    # Drops and pickups
    "gem1": {"src": "item/ring/ruby.png"},
    "gem2": {"src": "item/ring/emerald.png"},
    "gem3": {"src": "item/ring/tourmaline.png"},
    "gem_big": {"src": "item/misc/misc_crystal_new.png"},
    "coin": {"src": "item/gold/gold_pile_1.png"},
    "chest": {"strip": ["dungeon/chest_2_closed.png", "dungeon/chest.png"], "maxColors": 420},
    "vault_chest": {"strip": ["dungeon/chest.png", "dungeon/chest_2_open.png"], "maxColors": 460},
    "magnet": {"src": "item/misc/misc_orb.png"},
    "bomb": {"src": "effect/iron_shot_0.png"},
    "meat": {"src": "item/food/chunk.png"},
    "clock": {"src": "item/misc/misc_horn.png"},
    "vfx_glow": {"src": "item/misc/misc_orb.png"},

    # Weapon and evolution icons
    "w_arcanebolt": {"src": "gui/spells/conjuration/magic_dart.png"},
    "w_windbow": {"src": "item/weapon/ranged/bow_1.png"},
    "w_holyaura": {"src": "gui/spells/necromancy/regeneration_new.png"},
    "w_whirlaxe": {"src": "item/weapon/battle_axe_1.png"},
    "w_chainlight": {"src": "gui/spells/air/chain_lightning_new.png"},
    "w_frostnova": {"src": "gui/spells/ice/freeze_new.png"},
    "w_fireflask": {"src": "item/potion/ruby_new.png"},
    "w_shadowdagger": {"src": "item/weapon/dagger_new.png"},
    "w_orbitblade": {"src": "item/weapon/katana.png"},
    "w_holytome": {"src": "item/book/book_gray.png"},
    "w_teslacoil": {"src": "gui/spells/air/lightning_bolt_new.png"},
    "w_crossblade": {"src": "item/weapon/greatsword_1_new.png"},
    "we_crossjudge": {"src": "item/weapon/greatsword_1_new.png"},
    "we_arcanestorm": {"src": "gui/spells/conjuration/orb_of_destruction_big.png", "maxColors": 650},
    "we_featherstorm": {"src": "item/weapon/ranged/longbow.png"},
    "we_sanctuary": {"src": "effect/sanctuary.png"},
    "we_worldender": {"src": "item/weapon/hammer_1_new.png"},
    "we_thorwrath": {"src": "gui/spells/air/lightning_bolt_new.png"},
    "we_absolutezero": {"src": "gui/spells/ice/ice_storm_new.png", "maxColors": 360},
    "we_infernosea": {"src": "gui/spells/fire/fire_storm_new.png", "maxColors": 480},
    "we_thousandcuts": {"src": "item/weapon/dagger_new.png"},
    "we_bladestorm": {"src": "item/weapon/katana.png"},
    "we_forbidden": {"src": "item/book/book_of_the_dead_new.png"},
    "we_skynet": {"src": "effect/cloud_storm_1.png"},

    # Passive and system icons
    "ps_power": {"src": "item/food/meat_ration_new.png"},
    "ps_eagle": {"src": "gui/spells/components/bird.png"},
    "ps_pendant": {"src": "item/amulet/crystal_red.png"},
    "ps_belt": {"src": "item/weapon/bullwhip_new.png"},
    "ps_boots": {"src": "item/armor/feet/boots_2_jackboots.png"},
    "ps_magnetstone": {"src": "item/misc/misc_crystal_new.png"},
    "ps_clover": {"src": "monster/fungi_plants/bush_2.png", "maxColors": 420},
    "ps_core": {"src": "item/misc/misc_orb.png"},
    "icon_gold": {"src": "item/gold/gold_pile.png"},
    "icon_hp": {"src": "item/potion/ruby_new.png"},
    "icon_dmg": {"src": "item/weapon/long_sword_1_new.png"},
    "icon_armor": {"src": "item/armor/shields/shield_1.png"},
    "icon_speed": {"src": "gui/spells/components/arrow.png"},
    "icon_magnet": {"src": "item/misc/misc_crystal_new.png"},
    "icon_luck": {"src": "monster/fungi_plants/bush_3.png", "maxColors": 390},
    "icon_revive": {"src": "item/potion/brilliant_blue_new.png"},
    "icon_reroll": {"src": "item/misc/misc_disc_new.png"},
    "icon_banish": {"src": "item/misc/misc_orb.png"},
    "icon_cd": {"src": "effect/gold_sparkles_2.png"},
    "icon_area": {"src": "effect/sanctuary.png"},
    "icon_growth": {"src": "monster/fungi_plants/bush_4.png", "maxColors": 390},
    "icon_kill": {"src": "gui/spells/components/skull.png"},
    "icon_time": {"src": "item/misc/misc_horn.png"},
    "elite_crown": {"src": "item/armor/headgear/crested_helmet.png"},

    # Decor and terrain
    "deco_bone": {"src": "item/food/bone.png"},
    "deco_fence": {"src": "dungeon/statues/crumbled_column.png", "cropPx": [8, 0, 16, 32]},
    "deco_skullpost": {"src": "gui/spells/components/skull.png"},
    "deco_tree2": {"src": "dungeon/trees/tree_2_lightred.png"},
    "deco_rock": {"src": "dungeon/boulder.png"},
    "deco_bush": {"src": "monster/fungi_plants/bush_2.png", "maxColors": 420},
    "deco_mushroom": {"src": "monster/fungi_plants/deathcap.png"},
    "deco_pillar": {"src": "dungeon/statues/crumbled_column_1.png", "cropPx": [8, 0, 16, 32]},
    "deco_crystal": {"src": "item/misc/misc_crystal_new.png"},
    "deco_rune": {"src": "item/misc/misc_rune.png"},
    "deco_stalag": {"src": "dungeon/zot_pillar.png", "maxColors": 900},
    "deco_grave": {"src": "dungeon/statues/granite_statue.png", "cropPx": [8, 0, 16, 32]},
    "deco_deadtree": {"src": "dungeon/trees/tree_1_lightred.png", "cropPx": [4, 0, 24, 32]},
    "vfx_shadow": {"src": "player/base/shadow.png"},

    # Terrain tiles (16x16 derived from the 32x32 DCSS tiles)
    "tile_graveyard": {"tile": "dungeon/floor/tomb_0_new.png"},
    "tile_wilds": {"tile": "dungeon/floor/grass/grass_full_new.png"},
    "tile_abyss": {"tile": "dungeon/floor/black_cobalt_1.png"},

    # Animated effect stacks
    "vfx_explosion": {"strip": ["effect/cloud_fire_0.png", "effect/cloud_fire_1.png", "effect/cloud_fire_2.png", "effect/flame_2.png", "effect/flame_1.png"], "maxCentroidDrift": 20, "maxBaselineDrift": 18},
    "vfx_spirit": {"strip": ["effect/cloud_gloom_new.png", "effect/cloud_gloom_old.png", "effect/cloud_black_smoke.png", "effect/cloud_chaos_5.png", "effect/cloud_chaos_3.png"], "threshold": 40, "maxColors": 340, "maxCentroidDrift": 20, "maxBaselineDrift": 18},
    "vfx_heal": {"strip": ["effect/gold_sparkles_1.png", "effect/gold_sparkles_2.png", "effect/gold_sparkles_3.png", "effect/sanctuary.png"], "maxCentroidDrift": 20, "maxBaselineDrift": 18},
    "vfx_spark": {"strip": ["effect/zap_0.png", "effect/zap_1.png", "effect/zap_2.png", "effect/zap_3.png", "effect/zap_1.png"], "maxCentroidDrift": 20, "maxBaselineDrift": 18},
    "vfx_smoke": {"strip": ["effect/cloud_grey_smoke.png", "effect/cloud_black_smoke.png", "effect/cloud_blue_smoke.png", "effect/cloud_grey_smoke.png", "effect/cloud_black_smoke.png", "effect/cloud_blue_smoke.png"], "maxCentroidDrift": 20, "maxBaselineDrift": 18},
    "vfx_lightning": {"strip": ["effect/zap_0.png", "effect/zap_1.png", "effect/zap_2.png", "effect/zap_3.png", "effect/zap_2.png"], "maxCentroidDrift": 20, "maxBaselineDrift": 18},
    "vfx_slash": {"strip": ["effect/iron_shot_0.png", "effect/iron_shot_1.png", "effect/iron_shot_2.png", "effect/iron_shot_3.png"], "maxCentroidDrift": 20, "maxBaselineDrift": 18},
    "vfx_ice": {"strip": ["effect/frost_0.png", "effect/frost_1.png", "effect/icicle_0.png", "effect/icicle_1.png", "effect/icicle_2.png", "effect/icicle_3.png", "effect/icicle_4.png", "effect/icicle_5.png", "effect/icicle_6.png"], "maxCentroidDrift": 20, "maxBaselineDrift": 18},
    "vfx_shield": {"strip": ["effect/gold_sparkles_1.png", "effect/gold_sparkles_2.png", "effect/gold_sparkles_3.png", "effect/sanctuary.png", "effect/cloud_gloom_new.png", "effect/cloud_gloom_old.png"], "maxCentroidDrift": 20, "maxBaselineDrift": 18},
    "vfx_circle": {"strip": ["effect/cloud_magic_trail_0.png", "effect/cloud_magic_trail_1.png", "effect/cloud_magic_trail_2.png"], "maxCentroidDrift": 20, "maxBaselineDrift": 18},
}

# DCSS ships one static pose per creature, so these assets get a derived
# 32x32 animation strip.  Asymmetric monsters sway (mirror + bob); the
# symmetric player bases pulse (breathe/stretch) instead.
ANIMATED_STYLE = {
    "merchant": "sway",
    "char_knight": "breathe",
    "char_mage": "breathe",
    "char_ranger": "breathe",
    "char_cleric": "breathe",
    "char_berserker": "breathe",
    "char_chrono": "breathe",
    "char_knight_walk": "breathe",
    "char_knight_attack": "breathe",
    "char_mage_walk": "breathe",
    "char_mage_attack": "breathe",
    "char_ranger_walk": "breathe",
    "char_ranger_attack": "breathe",
    "char_cleric_walk": "breathe",
    "char_cleric_attack": "breathe",
    "char_berserker_walk": "breathe",
    "char_berserker_attack": "breathe",
    "char_chrono_walk": "breathe",
    "char_chrono_attack": "breathe",
    "bat": "sway",
    "slime": "sway",
    "slime_big": "sway",
    "zombie": "sway",
    "ghost": "sway",
    "spider": "sway",
    "cultist": "sway",
    "orc": "sway",
    "imp": "sway",
    "knight_armored": "sway",
    "werewolf": "sway",
    "mummy": "sway",
    "gargoyle": "sway",
    "bloodbat": "sway",
    "wraith": "sway",
    "skeleton": "sway",
    "boss_bonelord": "sway",
    "boss_abysseye": "sway",
    "boss_darklord": "sway",
    "boss_slimeking": "sway",
    "p_dragon": "sway",
}


def image_size(path: Path) -> tuple[int, int]:
    with Image.open(path) as im:
        return im.size


def ensure_strip(name: str, sources: list[str], threshold: int = 128) -> Path:
    DERIVED.mkdir(parents=True, exist_ok=True)
    destination = DERIVED / f"{name}.png"
    frames = []
    for src in sources:
        frame = Image.open(DCSS / src).convert("RGBA")
        # DCSS ships several translucent effect frames; threshold them so the
        # atlas pipeline sees visible pixels instead of empty frames.
        frame.putalpha(frame.getchannel("A").point(lambda a: 255 if a >= threshold else 0))
        frames.append(frame)
    width = sum(frame.width for frame in frames)
    height = max(frame.height for frame in frames)
    strip = Image.new("RGBA", (width, height))
    x = 0
    for frame in frames:
        strip.alpha_composite(frame, (x, 0))
        x += frame.width
    strip.save(destination, optimize=True)
    return destination


def ensure_tile(name: str, source: str) -> Path:
    DERIVED.mkdir(parents=True, exist_ok=True)
    destination = DERIVED / f"{name}.png"
    with Image.open(DCSS / source) as im:
        im.convert("RGBA").resize((16, 16), Image.Resampling.NEAREST).save(destination, optimize=True)
    return destination


def ensure_animated_strip(name: str, source: str, frames: int, style: str) -> Path:
    DERIVED.mkdir(parents=True, exist_ok=True)
    destination = DERIVED / f"{name}.png"
    base = Image.open(DCSS / source).convert("RGBA")
    base.putalpha(base.getchannel("A").point(lambda a: 255 if a >= 128 else 0))
    if base.size != (32, 32):
        base = base.resize((32, 32), Image.Resampling.NEAREST)

    def variant(width: int, height: int, mirror: bool) -> Image.Image:
        frame = base.resize((width, height), Image.Resampling.NEAREST)
        if mirror:
            frame = frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        canvas = Image.new("RGBA", (32, 32))
        canvas.alpha_composite(frame, (0, 0))
        return canvas

    if style == "breathe":
        sequence = [variant(32, 32, False), variant(32, 31, False),
                    variant(33, 32, False), variant(33, 31, False)]
    elif frames >= 6:
        sequence = [variant(32, 32, False), variant(32, 31, False),
                    variant(32, 32, True), variant(32, 31, True),
                    variant(32, 30, False), variant(32, 30, True)]
    elif frames == 5:
        sequence = [variant(32, 32, False), variant(32, 31, False),
                    variant(32, 32, True), variant(32, 31, True),
                    variant(32, 32, False)]
    else:
        sequence = [variant(32, 32, False), variant(32, 31, False),
                    variant(32, 32, True), variant(32, 31, True)]
    sequence = sequence[:frames]
    strip = Image.new("RGBA", (32 * len(sequence), 32))
    for index, frame in enumerate(sequence):
        strip.alpha_composite(frame, (index * 32, 0))
    strip.save(destination, optimize=True)
    return destination


def apply_mapping(spec: dict, cfg: dict) -> None:
    name = spec["name"]
    for key in ("key", "region", "colors", "outline", "cropPx", "frameStart", "frameRow", "pixelScale"):
        spec.pop(key, None)
    if "strip" in cfg:
        strip = ensure_strip(name, cfg["strip"], cfg.get("threshold", 128))
        spec["source"] = str(strip.relative_to(ROOT)).replace("\\", "/")
        spec["frameSize"] = [32, 32]
        spec["frames"] = len(cfg["strip"])
        spec.pop("frameRects", None)
    elif "tile" in cfg:
        tile = ensure_tile(name, cfg["tile"])
        spec["source"] = str(tile.relative_to(ROOT)).replace("\\", "/")
        spec["frameSize"] = [16, 16]
        spec["frames"] = 1
        spec.pop("frameRects", None)
    elif name in ANIMATED_STYLE:
        count = cfg.get("frames", 4)
        strip = ensure_animated_strip(name, cfg["src"], count, ANIMATED_STYLE[name])
        spec["source"] = str(strip.relative_to(ROOT)).replace("\\", "/")
        spec["frameSize"] = [32, 32]
        spec["frames"] = count
        spec.pop("frameRects", None)
        spec["maxCentroidDrift"] = max(spec.get("maxCentroidDrift", 4), 20)
    else:
        spec["source"] = str((DCSS / cfg["src"]).relative_to(ROOT)).replace("\\", "/")
        frames = cfg.get("frames", spec.get("frames", 1))
        spec["frames"] = frames
        if frames > 1:
            width, height = image_size(DCSS / cfg["src"])
            rect = [0, 0, width, height]
            spec["frameRects"] = [list(rect) for _ in range(frames)]
        else:
            spec.pop("frameRects", None)
    if "cropPx" in cfg:
        spec["cropPx"] = cfg["cropPx"]
    if "pixelScale" in cfg:
        spec["pixelScale"] = cfg["pixelScale"]
    if "fps" in cfg:
        spec["fps"] = cfg["fps"]
    spec["preservePixels"] = True
    spec["allowDuplicateFrames"] = True
    spec["minCoverage"] = cfg.get("minCoverage", 0.015)
    if "maxCentroidDrift" in cfg:
        spec["maxCentroidDrift"] = cfg["maxCentroidDrift"]
    if "maxBaselineDrift" in cfg:
        spec["maxBaselineDrift"] = cfg["maxBaselineDrift"]
    if "maxColors" in cfg:
        spec["maxColors"] = cfg["maxColors"]


def write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    open_manifest = json.loads((ROOT / "tools" / "art" / "open-assets-manifest.json").read_text(encoding="utf-8"))
    art_manifest = json.loads((ROOT / "tools" / "art" / "art-manifest.json").read_text(encoding="utf-8"))
    touched = 0
    for manifest in (open_manifest, art_manifest):
        for spec in manifest["assets"]:
            cfg = MAPPING.get(spec["name"])
            if cfg:
                apply_mapping(spec, cfg)
                touched += 1
    open_manifest["sourcePack"] = "Dungeon Crawl Stone Soup Full (CC0)"
    open_manifest["sourceRevision"] = "downloaded 2026-08-09 from the official DCSS repository mirror"
    write_json(ROOT / "tools" / "art" / "open-assets-manifest.json", open_manifest)
    write_json(ROOT / "tools" / "art" / "art-manifest.json", art_manifest)
    print(f"Re-mapped {touched} atlas assets to DCSS sources")
    stale = [spec["name"] for manifest in (open_manifest, art_manifest)
             for spec in manifest["assets"]
             if "ninja-adventure" in spec.get("source", "")
             or ("sources/" in spec.get("source", "") and "dcss-derived/" not in spec.get("source", ""))]
    if stale:
        raise SystemExit("assets still reference old sources: " + ", ".join(stale))


if __name__ == "__main__":
    main()
