# 《暗黑逃跑神》V6 美术资源接力开发书

这份文件是交给下一位代码模型的唯一入口。当前阶段已经停止玩法、联机和运行时代码实现；下一模型应先阅读本文件和 `docs/ART_V6_PRODUCTION_LOG.md`，再按阶段接入本地资源。

## A. 当前交付边界

已完成：

- V6 美术资源目录和完整命名/锚点/图层规范。
- 翠玉神龙母版、8 帧飞行源图、8 帧召唤阵源图；只使用一套龙素材，运行时旋转复用，整体 Alpha 约 0.48～0.62，呈半透明翠绿灵体。
- 腐液之王、骸骨领主、深渊之眼、暗潮魔王的独立母版、阶段/技能/死亡源图；暗潮魔王含 P1→P2 变身和逃生大门。
- V5 已验收的六角色本命虚影、战斗 VFX、武器 VFX、Boss 旧版兜底、地形、NPC、掉落与 UI 已整理到 V6 `game-ready/existing-v4` 和 `game-ready/existing-v5`。
- 腐液史莱姆、蜘蛛、烂泥行者等普通怪的概念/动作参考板已归档到 `sources/ordinary`，用于后续裁帧与正式像素化。
- 精英重绘项目已经按用户要求移除：不生成、不裁切、不替换十六种精英；继续沿用当前仓库精英资源。

未完成但明确交给下一模型：

- 将 V6 Boss/普通怪源图逐格裁成最终逻辑尺寸，完成硬 Alpha、调色板量化、脚底锚点和图集登记。
- 把 Boss 技能素材接入已经存在的 Boss 状态机、可靠 VFX 事件和联机快照。
- 将 `sources/ordinary` 概念板转为正式 `game-ready`，或经审核后继续使用现有 V4 普通怪兜底。
- 完成全屏 UI 截图验收、手机布局验收、联机双浏览器验收和 Git/Cloudflare 发布。

## B. 资源目录导航

项目根目录：

`C:\Users\10254\Documents\AAA大学\大二\下\dick\fable\游戏\darktide-survivors`

| 路径 | 内容 | 是否可直接加载 |
|---|---|---|
| `assets/art-v6/sources/weapons/ranger/` | 翠玉神龙高分辨率母版、色键源图 | 否 |
| `assets/art-v6/production/weapons/ranger/` | 翠玉神龙 8 帧飞行和召唤阵源 strip | 裁帧后 |
| `assets/art-v6/sources/bosses/slimeking/` | 腐液之王母版 | 裁帧后 |
| `assets/art-v6/production/bosses/slimeking/` | 待机/移动/跳砸/护盾/酸弹/死亡/酸弹/泥浪 | 裁帧后 |
| `assets/art-v6/sources/bosses/bonelord/` | 骸骨领主母版 | 裁帧后 |
| `assets/art-v6/production/bosses/bonelord/` | 待机/巨镰/骨冠环射/复生/死亡 | 裁帧后 |
| `assets/art-v6/sources/bosses/abysseye/` | P1、远程瞳、冲撞瞳母版 | 裁帧后 |
| `assets/art-v6/production/bosses/abysseye/` | P1 待机/分裂/远程施法/冲撞 | 裁帧后 |
| `assets/art-v6/sources/bosses/darklord/` | P1/P2 母版 | 裁帧后 |
| `assets/art-v6/production/bosses/darklord/` | 待机/暗刃/变身/虚空吐息/翼冲/死亡/逃生门 | 裁帧后 |
| `assets/art-v6/sources/ordinary/` | 烂泥行者、蜘蛛、腐液史莱姆概念动作板 | 仅参考，不能直接加载 |
| `assets/art-v6/game-ready/existing-v4/` | V4 已处理角色、普通怪、地形、NPC、掉落、UI、VFX 兜底 | 是（需按旧图集清单） |
| `assets/art-v6/game-ready/existing-v5/` | 72 张角色虚影、V5 VFX/武器/Boss 兜底 | 是（需按旧图集清单） |

所有 `*_chroma.png` 只用于保留生成过程和重新去背；优先使用同目录的 `*_alpha.png`。Image2 偶尔直接输出 Alpha 的素材已在文件名中明确标识。

## C. 翠玉神龙接入规范

最终推荐文件名：`p_windbow_jade_spirit_dragon_fly`。

- 源图位于 `assets/art-v6/production/weapons/ranger/p_windbow_jade_spirit_dragon_fly_sheet_alpha.png`。
- 这是 4×2 排列的 8 帧源表，不是 8 个方向；按行优先读取：0、1、2、3、4、5、6、7。
- 裁成单帧后统一放入 192×96 或 224×112 的共享旋转画布，再缩到游戏逻辑分辨率；不要按每帧非透明包围盒重新裁切，否则旋转会抖动。
- 帧率 10～12 FPS，飞行循环；召唤阵使用 `vfx_windbow_jade_dragon_summon_sheet_alpha.png`，8 帧、一次性播放，不循环。
- 绘制时 `ctx.globalAlpha` 建议 0.48～0.62，使用 `lighter`/屏幕混合；不要把龙体烘成不透明绿块。
- 龙的伤害路径、方向、目标命中间隔与图片完全分离；图片只显示在 projectile 层，旋转中心固定在龙身视觉中心。
- 桌面端按蓄力结束时的鼠标方向旋转；手机端使用选定目标方向。不要生成东南/西北等八套重复素材。
- 消散帧尚未单独生成；接入前可先用召唤阵末帧的低 Alpha 退场作为临时表现，但必须在日志标记为临时。

## D. Boss 资源裁帧表

新生成的 Boss 源表大多为 4×2、3×2 或 5×2 排列，下一模型须先用确定性裁帧工具切成统一 canvas，禁止把整张源表直接交给 SpriteGen。

### 腐液之王

- `boss_slimeking_master_alpha.png`：母版参考，目标 80×80。
- `boss_slimeking_idle_6f_alpha.png`：6 帧，7 FPS，慢重呼吸。
- `boss_slimeking_move_8f_alpha.png`：8 帧，9 FPS，底部泥浪移动，冠顶不跳。
- `boss_slimeking_jump_slam_8f_alpha.png`：8 帧，一次性；压缩→起跳→落地泥浪。
- `boss_slimeking_shield_6f_alpha.png`：6 帧，一次性成盾后最后帧可冻结。
- `boss_slimeking_acid_cast_8f_alpha.png`：8 帧，一次性酸弹施法。
- `boss_slimeking_death_10f_alpha.png`：10 帧，一次性死亡，末帧为泥池。
- `p_boss_slimeking_acid_orb_8f.png`：酸弹飞行循环，单目标 projectile 层。
- `vfx_boss_slimeking_ground_wave_8f.png`：贴地泥浪，判定半径与外缘独立。

### 骸骨领主

- `boss_bonelord_master_alpha.png`：96×96 参考，六骨臂、巨镰、三枚法盘、悬浮颅骨。
- `boss_bonelord_idle_6f_alpha.png`：6 帧，漂浮王座待机。
- `boss_bonelord_scythe_sweep_8f_alpha.png`：8 帧，巨镰横扫，紫青骨刃轨迹在角色前层。
- `boss_bonelord_bone_ring_8f_alpha.png`：8 帧，骨冠环射和骨矛放射。
- `boss_bonelord_resurrection_8f_alpha.png`：8 帧，玩家附近 100～180 像素召唤六具骷髅。
- `boss_bonelord_death_10f_alpha.png`：10 帧，王座分解为骨片与魂火。
- 骷髅再生判定仍由代码负责，每具尸体只允许复生一次；源图中的小骷髅只是表现参考。

### 深渊之眼

- `boss_abysseye_p1_master.png` 和 `boss_abysseye_p1_idle_6f_alpha.png`：P1 巨眼。
- `boss_abysseye_split_8f_alpha.png`：8 帧分裂过渡；结束后切换两份独立实体。
- `boss_abysseye_remote_master_alpha.png`、`boss_abysseye_remote_cast_8f_alpha.png`：远程瞳，持续光束和三枚紫弹。
- `boss_abysseye_charge_master_alpha.png`、`boss_abysseye_charge_dash_8f_alpha.png`：冲撞瞳，长预警后高速冲撞。
- 双瞳共享一条 Boss 血条和一次掉落；一只死亡后另一只攻速提升，不重复掉宝。

### 暗潮魔王

- `boss_darklord_p1_master.png`：112×112 P1 黑甲魔王。
- `boss_darklord_p2_master_alpha.png`：144×144 二阶段黑暗恶魔。
- `boss_darklord_p1_idle_6f_alpha.png`、`boss_darklord_p1_blade_sweep_8f_alpha.png`：P1 待机/暗刃横扫。
- `boss_darklord_transform_8f_alpha.png`：8 帧 P1→P2 变身，不能循环。
- `boss_darklord_p2_void_breath_8f_alpha.png`：虚空吐息。
- `boss_darklord_p2_wing_rush_8f_alpha.png`：翼冲和半透明影分身。
- `boss_darklord_p2_death_10f_alpha.png`：二阶段最终死亡。
- `vfx_darklord_escape_gate_4f_alpha.png`：关闭→符文唤醒→半开→完全开启的逃生门。
- 黑焰雨源图当前未入库：最近一次生成带渐变背景，被判为 `REJECTED`，不得使用；后续需要纯色键版本再补。

## E. 接入顺序（下一模型照做）

1. 先运行现有 `test/headless.js`、`test/art-probe.js` 和图集质量检查，记录基线；不要先改机制。
2. 给每张源表建立裁帧记录：源文件、列数、行数、帧序、逻辑尺寸、锚点、FPS、是否循环。
3. 优先接入腐液之王垂直切片：待机、跳砸、酸弹、死亡和泥浪；实机确认脚底、碰撞、摄像机和 Boss 血条。
4. 接入骸骨领主，再接深渊双瞳，最后接暗潮魔王和逃生门。
5. 将 `sources/ordinary` 只作为美术参考；若没有完成正式去背和图集报告，继续使用 `game-ready/existing-v4` 的普通怪。
6. 每个 Boss 接入后单独提交 Git，并进行单机、400 怪压力、双浏览器联机和移动端截图。
7. 所有离散技能通过可靠 `fxEvent` 触发；快照只同步动作名、方向和开始 Tick；不要按快照到达次数切帧。

## F. 资源质量门槛

- Alpha：主体边缘无洋红/黑色键残留；普通素材 Alpha 仅 0/255，光效允许分级 Alpha。
- 尺寸：逻辑帧尺寸固定，锚点不随动作变化；同一动作每帧主体面积波动不超过 8%。
- 动作：无空帧、半张角色、裁头、裁脚、重复死亡、循环一次性特效。
- 图层：地面特效/地板/道路在角色下；Boss 技能预警可在地面层；弹幕和武器在前；角色虚影在角色身体后。
- 联机：远端只插值位置并按服务器动作纪元播放；Boss 阶段和离散 VFX 事件必须一致。
- 视野：地面、装饰、角色、敌人、弹幕和 UI 统一受视野缩放影响；缩放不能只缩小角色。

## G. Git、部署和交接纪律

- 当前项目只推送 GitHub `main`，不再同步 Gitee。
- 资源阶段结束后，下一模型应先检查 `git status --short` 和 `git diff`，不要重置或覆盖本轮已有改动。
- 资源提交建议：`art(v6): add boss and spirit-dragon source library`；代码接入另开提交。
- 每个阶段绿灯后推送 Git；最终才部署 Cloudflare Pages。部署使用工作流生成的 `dist`，不要把大型 `assets/art-v6/sources` 和预览图上传到 Pages。
- 提交前必须留下：图集质量报告、动作预览、测试输出、资源索引和本文件更新。

## H. 明确禁止事项

- 不要把 `sources` 母版直接塞进运行时。
- 不要恢复已移除的精英重绘项目。
- 不要为翠玉神龙制作八方向重复素材；只复用一套动画并旋转。
- 不要把半透明灵体画成不透明绿色贴纸。
- 不要用一张被拉伸的大图替代龙身、Boss、战车等需要动画的素材。
- 不要在本轮继续扩展玩法范围；先完成资源接入和验收。

