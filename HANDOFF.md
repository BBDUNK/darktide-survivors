# 项目交接文档 (HANDOFF)

> 本文件用于把《暗黑逃跑神》(Darktide Survivors) 项目完整交接给任何后续开发工具/会话。
> 生成时间:2026-08-08,当前版本 **v0.14.0**。
> 若你在新会话接手,请先读本文件,再读 `DEVLOG.md`(完整迭代历史)与 `SPEC.md`(原始设计)。

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
- Gitee 私有备份:`ZTY20060226/darktide-survivors` (remote 名 `gitee`)
- Cloudflare token/accountID 存在 GitHub Secrets(`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`),无需手动处理
- ⚠ **用户要求:任何改动(无论大小)改完即自动提交推送,不用问。**
- 每个大版本要更新两处:`js/config.js` 的 `CFG.GAME.VERSION`,以及 `DEVLOG.md` 顶部新条目
- Vercel 已下架,不要碰 `.vercel` 目录

## 三、技术栈与文件结构

| 文件 | 职责 |
|---|---|
| `js/config.js` | **全部游戏数据**(角色/武器/被动/敌人/Boss/商店/数值)。改文案和平衡都在这 |
| `js/engine.js` | 主循环(固定步长60Hz)、输入、相机、空间哈希、**画布适配**(fitCanvas) |
| `js/main.js` | 状态机(intro/menu/run/pause/result)、渲染、联机快照、主菜单背景 |
| `js/entities.js` | 玩家/敌人/Boss AI、对象池(敌人520)、伤害、光环 |
| `js/weapons.js` | 武器行为、索敌模式(最近/低血/高血)、升级/进化逻辑 |
| `js/sprites.js` | **程序化像素美术**(Pix DSL,16×16,2~3帧)。不要引入外部素材 |
| `js/minimap.js` | 小地图(局部/全图,点击或按M切换) |
| `js/merchant.js` | 行走商人(单针钟倒计时,道具10金/武器20金) |
| `js/encyclopedia.js` | 百科全书:武器表/被动/敌人/机制/操作指南/**修仙文笔故事**(主线+人物传记) |
| `js/ui.js` | 全部 DOM 界面(HUD/菜单/升级/宝箱/暂停/结算/联机),MC 风格,Minecraft 主题 |
| `js/i18n.js` | 中/英多语言字典(设置可切换) |
| `js/meta.js` | 存档/成就/商店/统计。**测试期全解锁配置在 TEST_UNLOCK_ALL** |
| `js/net.js` | 房主权威 P2P 联机(PeerJS/WebRTC),客户端只上报输入+渲染快照 |
| `js/audio.js` | WebAudio 程序化音序器音乐 |
| `js/fx.js` | 粒子/伤害数字/震屏(渐变已改缓存贴图优化) |
| `test/headless.js` | 无头冒烟测试(桩 canvas 抓负半径/NaN),`node test/headless.js` |
| `test/resp-probe.js` | 多分辨率适配探针(Playwright),验证 HUD 不裁切 |
| `DEVLOG.md` | 版本迭代日志(每次大版本必更新) |

## 四、UI 风格与设计约定

- **Minecraft 风格**:直角石砖按钮、背包深色面板、像素大字标题(硬色块阴影)、木牌公告栏
- 标题:`暗黑逃跑神`(主菜单 92px,带血色辉光+撕裂条+灰烬粒子动画)
- 主菜单布局:flex 三列(左圣坛大理石框 / 中按钮列 / 右木牌战报),左下角版本号
- 主按钮 300×50、成就/百科小按钮 142×34(与主列左右对齐)、按钮文字用下padding上移
- 移动端 HUD:暂停键⏸+索敌键🎯 在小地图左侧(44×44),**必须显式 pointer-events:auto**否则点不到

## 五、当前存档与测试配置

`js/meta.js` 的 `TEST_UNLOCK_ALL = true`(测试期):
- 圣坛点数为 **0**(新手难度,不提供永久加成)
- 金币 **500**
- 成就/图鉴 **全解锁**(方便试玩全部角色/地图)
- 玩家旧存档:`SAVE_KEY = 'darktide_save_v2'`

正式发布前:把 `TEST_UNLOCK_ALL` 改为 `false` 即恢复从零开始。

## 六、角色与命名(最新)

角色名取职业对应著名人物(形似字),武器名取有名典故:

| 角色 | 名 | 原型 | 武器 | 原型 |
|---|---|---|---|---|
| 骑士 | 蓝斯洛 | 兰斯洛特 | 誓约圣剑 | 亚瑟王 |
| 法师 | **丽莎** | 原神·西风图书馆管理员 | 贤者光弹 | 梅林 |
| 游侠 | 罗宾 | 罗宾汉 | 侠盗神箭 | 罗宾汉 |
| 神官 | 德雷莎 | 特蕾莎修女 | 圣女光环 | 贞德 |
| 狂战士 | 项禹 | 项羽 | 风暴战斧 | 雷神 |
| 时行者 | 爱因斯 | 爱因斯坦 | 特斯拉电塔 | 特斯拉 |

## 七、历史 bug 经验(改代码前先想)

- **寒冰新星卡死**:`ctx.arc` 负半径抛 IndexSizeError。渲染问题必须真浏览器验证
- **HUD 点击被吞/点不到**:`#ui > .hud` 是 pointer-events:none,需要点击的按钮必须显式 `pointer-events:auto`
- **测试桩要复现真实约束**:桩 canvas 的 arc 若是空函数,负半径 bug 会静默通过
- **渲染类问题必须看真实浏览器截图**(`test/shots.js` + playwright,临时装 /tmp/pwshot)
- **暂停双窗口**:暂停按钮列误用 `.menu-col`(absolute)导致脱出弹窗,用独立 `.pause-menu`
- **每帧 createRadialGradient 很贵**:已用 `SpriteGen.glow(color)` 缓存贴图替代

## 八、常用命令

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

## 九、后续可能的方向(未做)

- 数据文案(武器/角色/敌人描述)的完整英文化
- 更多角色/武器/进化
- 移动端触控优化细节
- 新地图/新 Boss
