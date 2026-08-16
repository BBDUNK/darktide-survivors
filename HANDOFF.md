# 项目交接文档 (HANDOFF)

> 本文件用于把《暗黑逃跑神》(Darktide Survivors) 项目完整交接给任何后续开发工具/会话。
> 生成时间:2026-08-16,当前版本 **v0.23.2**(商业化精品化改革第一轮 + HUD 避让 + 字体统一 + 恶魔放大)。
> 若你在新会话接手,请先读本文件,再读 `DEVLOG.md`(完整迭代历史)、`docs/V6_ACCEPTANCE_REPORT.md`(V6 验收报告)与 `SPEC.md`(原始设计)。

---

## 一、这是什么

一款**纯前端 HTML5 俯视角 roguelite 生存弹幕游戏**,零后端、零构建、零依赖(除了联机时 CDN 加载 PeerJS)。
- 游戏目录:`fable\游戏\darktide-survivors`
- 直接打开 `index.html` 即可运行(需本地 HTTP 服务,file:// 下 localStorage 可用但个别 API 受限)
- 线上地址:**https://darktide-survivors.pages.dev** (Cloudflare Pages)

## 二、部署链路(重要,已自动化)

**改完代码会自动提交并推送 GitHub → GitHub Actions → Cloudflare Pages。**

流程:`git add + git commit + git push origin main` → `.github/workflows/deploy.yml` 自动部署。

- GitHub 仓库:`BBDUNK/darktide-survivors` (origin)
- **不再同步 Gitee**;不要向任何 Gitee remote 推送。
- Cloudflare token/accountID 存在 GitHub Secrets(`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`),无需手动处理
- ⚠ **用户要求:任何改动(无论大小)改完即自动提交推送,不用问。**
- 每个大版本要更新两处:`js/config.js` 的 `CFG.GAME.VERSION`,以及 `DEVLOG.md` 顶部新条目
- Vercel 已下架,不要碰 `.vercel` 目录
- `assets/art-v6/**` 通过 `.assetsignore` 排除在 Cloudflare Pages 运行目录之外;运行时图集只来自 `assets/sprites/atlas.webp|atlas-data.js`(v0.22 起 webp,URL 带内容版本号;重建图集后跑 `py tools/art/shrink-atlas.py` 同步三处引用)
- 站点根有 `_headers`(Cloudflare Pages 缓存策略):版本化图集 immutable 长缓存,js/css/atlas-data.js 短缓存,改缓存策略时注意"帧坐标必须与新图集成对"

## 三、技术栈与文件结构

| 文件 | 职责 |
|---|---|
| `js/config.js` | **全部游戏数据**(角色/武器/被动/敌人/Boss/商店/数值)。改文案和平衡都在这 |
| `js/engine.js` | 主循环(固定步长60Hz)、输入、相机、空间哈希、**画布适配**(fitCanvas) |
| `js/main.js` | 状态机(intro/menu/run/pause/result)、渲染、联机快照、主菜单背景 |
| `js/entities.js` | 玩家/敌人/Boss AI、对象池(敌人520)、伤害、光环 |
| `js/weapons.js` | 武器行为、索敌模式(最近/低血/高血)、升级/进化逻辑 |
| `js/sprites.js` | **本地图集优先 + 程序化像素美术兜底**。`get()`/`frames()` 公开接口保持不变 |
| `assets/sprites/` | 143 项 336 帧精修 PNG 图集、角色动作、开放素材源图、预览与质量报告 |
| `tools/art/` | 开放素材导入、像素化、调色板量化、锚点对齐、图集构建和自动校验 |
| `js/minimap.js` | 小地图(局部/全图,点击或按M切换) |
| `js/merchant.js` | 大型四帧待机商人(无头顶名字,单针钟倒计时,道具10金/武器20金) |
| `js/encyclopedia.js` | 百科全书:武器表/被动/敌人/机制/操作指南/**修仙文笔故事**(主线+人物传记) |
| `js/ui.js` | 全部 DOM 界面(HUD/菜单/升级/宝箱/暂停/结算/联机),MC 风格,Minecraft 主题 |
| `js/i18n.js` | 中/英多语言字典(设置可切换) |
| `js/meta.js` | 存档/成就/商店/统计。**测试期全解锁配置在 TEST_UNLOCK_ALL** |
| `js/net.js` | 房主权威 P2P 联机(PeerJS/WebRTC),客户端只上报输入+渲染快照 |
| `js/audio.js` | WebAudio 程序化音序器音乐 |
| `js/fx.js` | 粒子/伤害数字/震屏(渐变已改缓存贴图优化) |
| `test/headless.js` | 无头冒烟测试(桩 canvas 抓负半径/NaN),`node test/headless.js` |
| `test/resp-probe.js` | 多分辨率适配探针(Playwright),验证 HUD 不裁切 |
| `test/art-probe.js` | 真浏览器图集加载与 400 敌人 180 帧性能验收 |
| `DEVLOG.md` | 版本迭代日志(每次大版本必更新) |

## 四、V6 当前状态（2026-08-15）

- 图集：`584 assets / 3408 frames`，`quality-report.json` = `0 errors / 153 warnings`。
- 联机：`NET_STATE_V2` 协议未升级；快照 `ac/ae/ap/cp/ph/er` 继续承载 Boss 动作/动作纪元/阶段/双瞳角色。
- Boss：腐液之王、骸骨领主、深渊之眼、暗潮魔王均已接入统一 `bossAction` 状态机与角色专属 V6 素材；死亡条结束才结算掉落。
- 翠玉神龙：`p_dragon` 8×224×112 侧向飞行 + `vfx_jade_dragon_summon/dissipate`，运行时旋转复用，无八方向副本。
- 普通怪：腐液/巨腐史莱姆、蜘蛛已换 V6 概念板五动作；烂泥行者有 `zombie_emerge` 出土条；其余沿用 V4。
- 美术加工入口：`assets/art-v6/production-manifest.json` + `tools/art/process-v6-production.py` + `merge-v6-ready.js`；只有 `READY` 条目能进运行时清单。
- 后续模型不得恢复精英重绘、不得为龙做八方向素材、不得直接加载 `sources/production` 高分辨率源图。
- v0.21.1/v0.21.2 已合入：Boss 一次性动画相位修复、后期 Boss 血量砍半、训练场收放/角色切换/键盘修复、骑士与法师终极、选人页去内部金框、图鉴缩小、训练场面板扁平化；`art-probe` 断言已随 v0.21.2 选人页样式更新。
- v0.21.2 最终验收矩阵 10 项全绿：`docs/V6_FINAL_MATRIX_V0212_LOG.txt`。
- v0.21.3 已合入：Boss 蓄力/受击取消白色闪白；双 Boss 同场时只有最后一只死亡才切回地图曲；特斯拉战车电磁炮撞敌爆炸（3 倍范围/特效）；特斯拉战车伤害 4.2×→9×、游侠翠玉神龙伤害 4.5×→10×；本命虚影加大加清晰并兜底初始化。
- v0.21.4 已合入：Boss 动作尺寸统一（`BOSS_VISUAL_BASE` + `bossActionVisualScale`），四 Boss 增加 `drawScale` 降低放大倍率（190~224px），P2 放大 1.28→1.1，像素更锐利且动作不再裁切。
- v0.21.5 已合入：Boss 尺寸回调到约 240~336px（`drawScale=0.75`），并改为整数倍像素缩放（80→240、96→288、112→336），消除非整数缩放导致的“糊/像素粗细不均”；P2 放大系数改为 1.0。
- v0.21.6 已合入：深渊之眼改用 V4 素材、史莱姆王改用 V2 素材（96×96 行切取）；攻击/缺失动作改为重复 idle/charge 素材；`BOSS_VISUAL_BASE` 对应调为 96；新增 `tools/art/legacy-boss-swap.js`。
- v0.21.7 已合入：选人背景半透明透出主菜单；狂战士卡片右上角红色动画“版本之子！”；骸骨领主放大 1.5 倍；深渊之眼 P1=V4、P2=V6；暗潮魔王 P1=V4 且放大 1.5 倍、P2=V6（`drawScaleP2` 分开控制）；新增 `tools/art/apply-mixed-boss-art.js`。
- v0.21.8 已合入：暗潮魔王 `boss_darklord_charge` 恢复 V6（P2 翼冲专用）、新增 `boss_darklord_phase2_death` 独立死亡条；深渊之眼 P1 attack/charge 不再串到 V6 远程施法；选人界面六卡单行、头像 72px、边框 8px。
- v0.21.9 已合入：暂停界面恢复主菜单同款巴洛克金框与按钮贴图，面积放大，窄屏无溢出。
- v0.21.10 已合入：暂停边框重做为干净暗金面板（金铜双描边 + 深色渐变 + 标题分隔线）；移除“百科全书”和“放弃这局”左侧 emoji。
- v0.21.11 已合入：全站字体统一为正楷（DOM + Canvas）；暂停边框改为紧贴的金色边框，无透明空隙。
- v0.21.12 已合入：顶部倒计时框去掉左侧皇冠并合并下一事件倒计时；ESC 支持返回上一级界面；暂停界面缩小精修。
- v0.21.13 已合入：主菜单大标题恢复 `Darktide Gothic` 艺术字，不再被全站正楷覆盖。
- v0.21.14 已合入：地图地面纹理去除方格缝隙；主菜单 Logo 右上角新增红色动画 Beta 角标。（地面去缝随后在 v0.21.15 取消）
- v0.21.15 已合入：Beta 角标调亮并下移/左移；顶部倒计时框改为主菜单按钮同款金色边框；地面恢复原样。
- v0.21.16 已合入：计时框加宽并调整文字不越界；地面仅清理外圈描边，边缘完美重合且内部纹理保持不变。（地面处理随后在 v0.21.17 还原）
- v0.21.17 已合入：Beta 角标改苹果绿；倒计时框竖向加高、两行文字在框内；地面恢复原始拼接效果。
- v0.21.18 已合入：倒计时框整体缩小不挡视野；Beta 角标改纯绿色 `#00e05a`，与狂战士红色角标区分。
- v0.21.19 已合入：主菜单 Beta 角标从头重做，改为深绿底 + 亮绿描边徽章，位置更自然。
- v0.22.0 已合入：加载/运行流畅度专项——图集无损 WebP 化 7.7MB→2.73MB(解码内存 128→80MB,URL 带内容哈希)、关键资源预加载(图集低优先级)、移除无用的 Fusion Pixel 648KB 强制下载、Cloudflare `_headers` 缓存策略、图集切片空闲分批 + `createImageBitmap` 离线程解码 + 位图确定性释放;加载期最长掉帧 566.7ms→50.1ms。`test/jank-probe.js` 为加载期掉帧 A/B 探针。
- v0.23.0 已合入：商业化精品化第一轮——**禁忌典籍召唤恶魔**换 Gothicvania CC0 飞行恶魔(`summon_demon`,6 帧,完整图集流水线接入,新增 `test/demon-summon-probe.js`);**音效换血**为 Kenney CC0 录音(37 个 WAV,`tools/audio/build-sfx.py` 从 `assets/audio/vendor` 转码,`AudioSys` 新增 AudioBuffer 文件通道+合成兜底,新增 `test/sfx-file-probe.js`);**主菜单精修**(新最终层 `css/commercial-v23.css`:战报点线表格/按钮微交互/面板光效统一);**HUD 三段光效 + hit-stop 顿帧**(`Engine.hitStop`,精英 70ms/Boss 150ms/变阶段 120ms)。
- v0.22.1 已合入：移除小地图周边黑色阴影，右上角更干净。
- v0.22.2 已合入：主菜单 Beta 角标去掉背景/边框/光晕，改为高辨识度亮苹果绿 `#a8ff00`。
- v0.22.3 已合入：移除深色描边/阴影，改用清晰无衬线字体并提亮为 `#b6ff00`，解决颜色发暗不均。
- v0.22.4 已合入：左下角金币/击杀框统一尺寸并完整排版；Canvas 文字改用无衬线字体，缩小视野时自动补偿字号保持清晰。
- v0.23.1 已合入：腐泥行者（烂泥行者）形象/动作切回新版 `mudwalker_actions_rework`，图集已重建。
- v0.23.2 已合入：左下角金币/击杀贴边避让 Boss 条；商人/右上/左下文字统一主菜单字体；所罗门秘典恶魔放大两倍。

## 五、UI 风格与设计约定

- **Minecraft 风格**:直角石砖按钮、背包深色面板、像素大字标题(硬色块阴影)、木牌公告栏
- 标题:`暗黑逃跑神`(主菜单 92px,带血色辉光+撕裂条+灰烬粒子动画)
- 主菜单布局:flex 三列(左圣坛大理石框 / 中按钮列 / 右木牌战报),左下角版本号
- 主按钮 300×50、成就/百科小按钮 142×34(与主列左右对齐)、按钮文字用下padding上移
- 移动端 HUD:暂停键⏸+索敌键🎯 在小地图左侧(44×44),**必须显式 pointer-events:auto**否则点不到

## 六、当前存档与测试配置

`js/meta.js` 的 `TEST_UNLOCK_ALL = true`(测试期):
- 圣坛点数为 **0**(新手难度,不提供永久加成)
- 金币 **500**
- 成就/图鉴 **全解锁**(方便试玩全部角色/地图)
- 玩家旧存档:`SAVE_KEY = 'darktide_save_v2'`

正式发布前:把 `TEST_UNLOCK_ALL` 改为 `false` 即恢复从零开始。

## 七、角色与命名(最新)

角色名取职业对应著名人物(形似字),武器名取有名典故:

| 角色 | 名 | 原型 | 武器 | 原型 |
|---|---|---|---|---|
| 骑士 | 蓝斯洛 | 兰斯洛特 | 誓约圣剑 | 亚瑟王 |
| 法师 | **丽莎** | 原神·西风图书馆管理员 | 贤者光弹 | 梅林 |
| 游侠 | 罗宾 | 罗宾汉 | 侠盗神箭 | 罗宾汉 |
| 神官 | 德雷莎 | 特蕾莎修女 | 圣女光环 | 贞德 |
| 狂战士 | 项禹 | 项羽 | 风暴战斧 | 雷神 |
| 时行者 | 爱因斯 | 爱因斯坦 | 特斯拉电塔 | 特斯拉 |

## 八、历史 bug 经验(改代码前先想)

- **寒冰新星卡死**:`ctx.arc` 负半径抛 IndexSizeError。渲染问题必须真浏览器验证
- **HUD 点击被吞/点不到**:`#ui > .hud` 是 pointer-events:none,需要点击的按钮必须显式 `pointer-events:auto`
- **测试桩要复现真实约束**:桩 canvas 的 arc 若是空函数,负半径 bug 会静默通过
- **渲染类问题必须看真实浏览器截图**(`test/shots.js` + playwright,临时装 /tmp/pwshot)
- **暂停双窗口**:暂停按钮列误用 `.menu-col`(absolute)导致脱出弹窗,用独立 `.pause-menu`
- **每帧 createRadialGradient 很贵**:已用 `SpriteGen.glow(color)` 缓存贴图替代

## 九、常用命令

```bash
# 冒烟测试(改完代码必跑)
node test/headless.js

# 多分辨率适配探针(需要 playwright)
node test/resp-probe.js

# 提交并推送(自动部署到 Cloudflare)
git add -A && git commit -m "..." && git push origin main

# 查看部署状态
gh run list --limit 1
```

## 十、后续可能的方向(未做)

- 继续逐项手工修整个别开放素材的轮廓与调色板;图集已覆盖 143 个运行时命名,动作图集缺失时自动退回角色基础帧
- 美术改造前稳定回退标签:`pre-art-overhaul-v0.15.0`(提交 `b9f102e`,已推送 GitHub/Gitee)
- 数据文案(武器/角色/敌人描述)的完整英文化
- 更多角色/武器/进化
- 移动端触控优化细节
- 新地图/新 Boss
