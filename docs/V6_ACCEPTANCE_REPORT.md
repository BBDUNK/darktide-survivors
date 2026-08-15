# 《暗黑逃跑神》V6 验收报告（接力开发）

> 起始提交：`f4c7d9d`（`art(v6): add boss and spirit-dragon source library`）
> 起始版本：`v0.20.28`（`js/config.js` 中 `CFG.GAME.VERSION`）
> 工作区基线：`git status --short` 为空（干净）
> 本报告持续更新；每个阶段完成门槛后追加结果。

## 阶段 0：可回归基线（2026-08-15 接力当日）

### 0.1 基线快照

| 项目 | 基线值 |
|---|---|
| Git 提交 | `f4c7d9d08a0bce62c0af96ca83c8dc62b5beaeb4` |
| 版本号 | `v0.20.28` |
| 运行图集命名资源 | 539 |
| 运行图集总帧数 | 3172 |
| 质量报告 | `0 errors / 168 warnings`（均为轮廓触边等已说明警告，不视为构建失败） |
| 最近一次 Cloudflare Pages | 部署成功（接手前） |

### 0.2 基线测试矩阵

命令与结果（完整输出见 `docs/V6_BASELINE_TEST_OUTPUT.txt`）：

| 命令 | 结果 |
|---|---|
| `node test/headless.js` | ✅ 通过（R1–R13 全部 OK，含六角色终极机制） |
| `node test/art-probe.js` | ✅ 通过（539 资产 / 3172 帧 / 主题与 V5 战斗验收） |
| `node test/combat-vfx-probe.js` | ✅ 通过 |
| `node test/boss-phase-probe.js` | ✅ 通过 |
| `node test/coop-probe.js` | ✅ 通过（NET_STATE_V2 字段完整） |
| `node test/resp-probe.js` | ✅ 通过（四方向视图均 OK） |
| `node test/terrain-touch-probe.js` | ✅ 通过 |

基线结论：**没有发现需要先修复的自动测试失败项**；阶段 0 不做机制改动。

### 0.3 性能基线

- 本地 HTTP（`127.0.0.1` 临时静态服务器）1280×720 首屏加载：**733 ms**（从 `goto` 到图集加载完成 + 300ms 稳定等待；图集资源最长 51.1 ms）。
- 400 骷髅同屏压力（`art-probe.js` 实测）：平均 **52.9 FPS**，p95 帧耗时 **33.4 ms**，存活 400/400。
- 首次运行未观察到 DataChannel 快照积压（coop-probe 通过）。

### 0.4 基线截图

脚本：`test/v6-baseline-shots.js`（新增，真实浏览器 + 本地 HTTP）。
输出目录：`shots/v6-baseline/`，清单见该目录 `report.json`。

| 分辨率 | 已截图页面 |
|---|---|
| 1280×720 | 标题、主菜单、选角色、选地图、游戏 HUD、暂停、升级、Boss 战、结算、训练场 |
| 960×540 | 标题、主菜单、选角色、选地图、游戏 HUD、暂停 |
| 390×844 | 标题、主菜单、选角色、选地图、游戏 HUD、暂停 |
| 844×390 | 标题、主菜单、选角色、选地图、游戏 HUD、暂停 |

基线截图初步目视记录（后续阶段 5 逐屏细查）：

- 1280×720 主菜单、选人、暂停、升级、Boss 战、结算、训练场均正常渲染，无控制台错误。
- 390×844 主菜单在极窄宽度下仍能操作；该宽度下各屏是否全部满足“无遮挡、无裁切、点击区 ≥44px”留待阶段 5 逐项验收。
- 844×390 横屏无黑边裁切，HUD 顶部状态条可用。

### 0.5 阶段 0 提交

- `chore(v6): record acceptance baseline`

---

## 阶段 1：V6 源图加工（翠玉神龙已完成，四 Boss 进行中）

- 建立 `assets/art-v6/production-manifest.json`：龙 3 项、腐液之王 12 项、骸骨领主 8 项、深渊之眼 7 项、暗潮魔王 12 项；每项固定记录 `name/source/cols/rows/frameMap/frameSize/frames/fps/loop/anchor/renderScale/layer/status` 与补充字段（`fit/minCoverage/maxCentroidDrift/maxBaselineDrift` 白名单）。
- 扩展 `tools/art/process-image2-sheet.py`：支持 `WxH` 矩形画布、`--flatten`、`--shared-fit union|baseline|center`，保持旧调用兼容。
- 新增 `tools/art/process-v6-production.py`（按 manifest 逐项处理并校验后晋升 `READY`）、`tools/art/make-jade-dragon-dissipate.py`（确定性消散派生）、`tools/art/merge-v6-ready.js`（仅并入 READY 条目）、`tools/art/make-v6-previews.py`（8×/16× 预览）。
- `tools/art/pixel-cleanup.py` 增加 `asIs` 通道：图集构建时对已定稿的 V6 条带原样通过，不重新裁剪/重采样，保证画布与锚点不被二次改动。

已处理为 `READY` 的翠玉神龙条目：

| 运行时名 | 帧 | 画布 | FPS | 锚点 | 备注 |
|---|---|---|---|---|---|
| `p_dragon` | 8 | 224×112 | 10 | [112,56] | 单套侧向飞行循环，运行时旋转复用 |
| `vfx_jade_dragon_summon` | 8 | 224×112 | 10 | [112,56] | 召唤阵一次性，不循环 |
| `vfx_jade_dragon_dissipate` | 6 | 224×112 | 10 | [112,56] | 由末帧确定性侵蚀+溶解+翠色灵粒派生 |

- 三条素材均为硬 Alpha、40 色调色板、共享画布/锚点、无逐帧紧裁；帧 bbox 距画布边 ≥3px，无裁头尾。
- 8× 与 16× 动作预览位于 `assets/art-v6/previews/v6/`。

## 阶段 2：翠玉神龙垂直切片 ✅

- 运行时保持兼容：飞行继续注册为 `p_dragon`；新增 `vfx_jade_dragon_summon`、`vfx_jade_dragon_dissipate`。
- 图集重建：`541 assets / 3186 frames`，质量报告 `0 errors / 161 warnings`；相较基线减少 7 条旧 `p_dragon` 触边警告，新素材 0 新增警告。
- 表现规则落地：
  - 仅一套侧向动画，`ctx.rotate()` 对准攻击方向，无八方向副本、无镜像；
  - `lighter` 混合 + `globalAlpha = 0.56`（计划 0.48～0.62 范围内）；
  - 旋转中心 = 龙身视觉中心（图集锚点 [112,56]），所有帧共享；
  - 桌面端蓄力最后 0.25s 锁定鼠标方向；移动端锁定最高血量目标（沿用 `rangerAim`）；
  - `FX.sprite` 对非正方形条带按原始宽高比绘制，龙/召唤阵/消散不再被压成正方形；
  - 伤害路径与图片分离：`dragonLance` 沿用 600px/s、900px 航程与独立重复命中冷却，图片只负责表现。
- 实机验收（`test/v6-dragon-probe.js`，真实 Chromium）：
  - `DRAGON ATLAS OK`：8×224×112 飞行、8 帧召唤、6 帧消散，FPS 10；
  - `DRAGON FLIGHT OK`：`p_dragon`、速度 600、对角角度下正常旋转飞行；
  - 截图：蓄力 `01-charge`、旋转飞行 `02-flight`、干净画面 `02b-flight-clean`、消散 `03-dissipate`（`shots/v6-dragon/`），无控制台错误。
- 回归测试同时通过：`headless.js`（含 R13）、`art-probe.js`、`combat-vfx-probe.js` 全绿；400 怪 57.4 FPS、p95 16.8ms。
- 提交：`art(v6): process jade dragon game-ready assets`、`feat(v6): integrate jade spirit dragon`。

## 阶段 3：四个 Boss

### 3.1 腐液之王 ✅（Boss 垂直切片）

**素材（13 条 `READY → INTEGRATED`，全部 40 色、硬 Alpha、共享画布/锚点）：**

| 运行时名 | 帧 | 画布 | FPS | 说明 |
|---|---|---|---|---|
| `boss_slimeking` | 6 | 80×80 | 7 | 待机慢呼吸 |
| `boss_slimeking_walk` | 8 | 80×80 | 9 | 底部泥浪移动，共享脚底基线 |
| `boss_slimeking_charge` | 8 | 80×80 | 10 | 压缩→起跳→落地，一次性 |
| `boss_slimeking_attack` | 8 | 80×80 | 10 | 扇形酸弹施法 |
| `boss_slimeking_shield` | 6 | 80×80 | 9 | 成盾后冻结末帧 |
| `boss_slimeking_death` | 10 | 80×80 | 10 | 末帧泥池，死亡不可被覆盖 |
| `boss_slimeking_hurt` | 4 | 80×80 | 10 | 由待机确定性派生 |
| `p_boss_slimeking_acid_orb` | 8 | 48×48 | 10 | 酸弹飞行循环 |
| `vfx_boss_slimeking_ground_wave` | 8 | 112×112 | 10 | 贴地环形泥浪 |
| `vfx_boss_slimeking_fan_telegraph` | 4 | 112×112 | 10 | 扇形预警，运行时旋转对准玩家 |
| `vfx_boss_slimeking_summon_gel` | 6 | 96×96 | 10 | 凝胶池 + 小史莱姆冒出 |
| `vfx_boss_slimeking_bounce_afterimage` | 6 | 80×80 | 12 | 低血量连跳残影 |
| `vfx_boss_slimeking_wave_dissipate` | 4 | 112×112 | 10 | 泥浪结束消散 |

**统一 Boss 动作接口（不升级联机协议）：**

- 实体新增 `bossAction / bossActionTick / bossActionPhase / bossSkill / dying / dyingT / hurtT`；`Entities.setBossAction(run, e, action)` 切换动作。
- 快照继续用 `ac/ae/ap/cp/ph/er` 承载动作、动作纪元、阶段、双瞳角色；客户端按 `ae` 服务器纪元播放，不按快照到达次数切帧。
- 绘制优先 `boss_<id>_<action>`：`idle/walk/attack/charge/shield/hurt/death`；`telegraph` 回退本体，一次性动作播放到末帧后冻结。
- 受击动作只抢 `idle/walk`，死亡动作不可被移动/技能覆盖。
- 所有离散技能经可靠 `bossEvent/audioEvent` 触发；客户端在 `onBossEvent` 重放扇面预警、泥浪、召唤、落地和死亡表现。

**六技能状态机（`idle → telegraph → cast/charge → recover`）：**

跳砸、扇形酸弹（3 波 × 5 发 `p_boss_slimeking_acid_orb`，独立减速）、环形泥浪（16 发限程减速弹 + 地面波 VFX）、召唤 4 小史莱姆、凝胶护盾（`guard` 免伤）、低血量连续弹跳（残影 + 2～3 连跳）。

**验收：**

- `test/v6-slimeking-probe.js` 真实浏览器全绿：六技能逐一进入正确动作/阶段、酸弹 sprite、护盾 guard、召唤数量、低血量连跳、10 帧死亡条完成后再结算；截图 `shots/v6-slimeking/`。
- 图集：`549 assets / 3232 frames`，`quality-report.json` = `0 errors / 161 warnings`，腐液之王新素材 0 新增警告。
- 回归：`headless.js`（R1–R13）、`art-probe.js`（已同步 V6 尺寸断言）、`boss-phase-probe.js`（已适配死亡条结算）、`coop-probe.js`（双浏览器全链路）全部通过；400 怪 59.0 FPS、p95 16.8ms。
- 主体 80×80 明显大于 32×32 巨腐史莱姆，王冠/凝胶主体/底部接地点稳定，无透明洞、缺块；未发现脏像素。
- 提交：`art(v6): process slime king game-ready assets`、`feat(v6): integrate slime king six-skill boss`。

### 3.2 骸骨领主 ✅

**素材（11 条 `READY → INTEGRATED`，96×96 主体 + 64×64 地面 VFX，40 色、硬 Alpha）：**

| 运行时名 | 帧 | 画布 | FPS | 说明 |
|---|---|---|---|---|
| `boss_bonelord` | 6 | 96×96 | 7 | 漂浮王座待机 |
| `boss_bonelord_walk` | 8 | 96×96 | 9 | 由待机确定性派生，共享脚底基线 |
| `boss_bonelord_attack` | 8 | 96×96 | 10 | 巨镰横扫 |
| `boss_bonelord_charge` | 8 | 96×96 | 10 | 骨冠环射 |
| `boss_bonelord_resurrect` | 8 | 96×96 | 10 | 亡者再生施法 |
| `boss_bonelord_death` | 10 | 96×96 | 10 | 王座分解为骨片与魂火 |
| `boss_bonelord_hurt` | 4 | 96×96 | 10 | 受击闪白派生 |
| `vfx_bonelord_bone_prison` | 8 | 96×96 | 10 | 骨牢生成→破碎 |
| `vfx_bonelord_spear_rain` | 8 | 96×96 | 10 | 骨矛雨预警→落矛→命中 |
| `vfx_bonelord_grave_mark` | 6 | 64×64 | 8 | 坟墓标记 + 魂光升起 |
| `vfx_bonelord_soul_return` | 6 | 64×64 | 8 | 亡者灵魂回流 |

**技能接入（六技能状态机 `idle → telegraph → cast/charge → recover`）：**

- 巨镰横扫：118px 近身范围伤害 + 骨色爆发；
- 骨冠环射：20 发骨矢，限程 420；
- 骨牢：玩家位置生成骨牢 VFX，0.4s 后破碎并对 66px 内玩家造成伤害 + 8 发向外骨片；
- 骨矛雨：玩家周围 3 个 80～190px 落点，坟墓标记预警 0.6s → 落矛 lob 伤害 36px 半径；
- 近身召唤：玩家周围 100～180px 生成 6 具破土骷髅（沿用 `skeleton` burrow 出土）；
- 亡者再生：`run.corpsePool` 记录普通怪尸体（Boss/精英永不入池），每次最多复活 6 具、每具只消耗一次，复活体为原生命 50% 并标记 `resurrected`（不可再入池）；无尸体则只播放施法不生成。
- 绘制新增 `boss_bonelord_resurrect` 动作；客户端 `onBossEvent` 重放全部骨系离散表现；快照与协议版本不变。

**验收：**

- `test/v6-bonelord-probe.js` 真实浏览器全绿：六技能动作/弹幕/骨牢/骨矛雨/召唤数量/尸体一次性规则（3 具尸体→3 只 50% 血复活→尸体池清空）/死亡条；截图 `shots/v6-bonelord/`。
- 图集：`555 assets / 3272 frames`，`0 errors / 161 warnings`（骸骨领主新素材 0 新增警告）。
- 回归：`headless.js`、`art-probe.js`、`boss-phase-probe.js`、`coop-probe.js` 全部通过；400 怪 57.4 FPS、p95 16.8ms。
- 提交：`art(v6): process bone lord game-ready assets`、`feat(v6): integrate bone lord six-skill boss`。

### 3.3 深渊之眼（进行中）

## 阶段 4：普通怪、地图和掉落（待开始）

## 阶段 5：武器、虚影和 UI 验收（待开始）

## 阶段 6：联机与最终验收（待开始）
