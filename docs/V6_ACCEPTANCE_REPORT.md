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

## 阶段 1：V6 源图加工（进行中）

处理记录与 `production-manifest.json` 将随阶段进度追加。

## 阶段 2：翠玉神龙垂直切片（待开始）

## 阶段 3：四个 Boss（待开始）

## 阶段 4：普通怪、地图和掉落（待开始）

## 阶段 5：武器、虚影和 UI 验收（待开始）

## 阶段 6：联机与最终验收（待开始）
