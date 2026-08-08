# 武器、投射物与特效

先附上 `00_global_style.md`。所有投射物用中心枢轴，独立于角色；效果图不含背景。每种武器图标提供 48×48 母版 / 24×24 逻辑静帧，读取优先于细节。

武器：`w_crossblade`, `w_arcanebolt`, `w_windbow`, `w_holyaura`, `w_whirlaxe`, `w_chainlight`, `w_frostnova`, `w_fireflask`, `w_shadowdagger`, `w_orbitblade`, `w_holytome`, `w_teslacoil`；进化：`we_crossjudge`, `we_arcanestorm`, `we_featherstorm`, `we_sanctuary`, `we_worldender`, `we_thorwrath`, `we_absolutezero`, `we_infernosea`, `we_thousandcuts`, `we_bladestorm`, `we_forbidden`, `we_skynet`。

关键重绘：`w_teslacoil` 是铜线圈、瓷绝缘环、三叉放电针的可部署电塔，而不是泛用魔法柱；`w_fireflask` 是封蜡玻璃燃烧瓶，有清晰瓶颈、火布和琥珀液体；`p_fireflask` 在飞行中转 8 帧，`p_firepool` 12 帧燃烧扩散；`zombie` 明确保留墓园园丁/不死者特征。

投射物：`p_slash`, `p_slash_big`, `p_bolt`, `p_arrow`, `p_dragon`, `p_axe`, `p_dagger`, `p_orbitblade`, `p_book`, `p_fireflask`, `p_firepool`, `p_spark`, `p_shadow`, `p_turret`, `p_enemy_bolt`, `p_holy`, `p_web`。旋转物 8 帧，飞行残影 4 帧，爆炸/命中 10–12 帧。

VFX：`vfx_glow`, `vfx_shadow`, `vfx_explosion`, `vfx_spirit`, `vfx_heal`, `vfx_spark`, `vfx_smoke`, `vfx_lightning`, `vfx_slash`, `vfx_ice`, `vfx_shield`, `vfx_circle`。完成 12 帧以内的清晰 loop/one-shot；特效要从外侧淡入/扩散，中心预留，避免遮住玩家。
