# 地图、掉落物和 UI

先附上 `00_global_style.md`。地块为无缝 64×64 母版 / 32×32 逻辑，边缘不含不明网格；地表变化以低对比噪点和稀疏地物表达。

地块：`tile_graveyard`（青灰石板与碎骨）、`tile_wilds`（干草/泥土）、`tile_abyss`（黑紫裂岩与蓝晶）。装饰：`deco_grave`, `deco_deadtree`, `deco_bone`, `deco_fence`, `deco_skullpost`, `deco_tree2`, `deco_rock`, `deco_bush`, `deco_mushroom`, `deco_pillar`, `deco_crystal`, `deco_rune`, `deco_stalag`。每个装饰交付 3 个静态变体；树木、篱笆、墓碑的大轮廓在小地图上也要可识别。

掉落：`gem1`, `gem2`, `gem3`, `gem_big`, `coin`, `chest`, `vault_chest`, `magnet`, `bomb`, `meat`, `clock`, `elite_crown`。宝石和金币 idle 6 帧闪烁，宝箱 open 8 帧，其他道具 idle 6 帧。

系统/被动：`ps_core`, `ps_power`, `ps_eagle`, `ps_pendant`, `ps_belt`, `ps_boots`, `ps_magnetstone`, `ps_clover` 以及 `icon_gold`, `icon_hp`, `icon_dmg`, `icon_armor`, `icon_speed`, `icon_magnet`, `icon_luck`, `icon_revive`, `icon_reroll`, `icon_banish`, `icon_cd`, `icon_area`, `icon_growth`, `icon_kill`, `icon_time`。统一深靛石框 + 彩色符号；静帧即可。

UI 母版：标题为清晰的哥特石刻艺术字（单独高分辨率标题源，最终可缩放），生命/经验条、技能槽、圆形小地图、暂停/商店/升级面板九宫格边框。不可把文字烘焙到通用面板素材；所有可读文字由游戏 HTML/CSS 绘制。
