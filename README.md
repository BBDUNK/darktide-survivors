# ⚔️ 暗潮幸存者 · Darktide Survivors

[![Online](https://img.shields.io/badge/Online-Cloudflare%20Pages-blue)](https://darktide-survivors.pages.dev/)
[![Zero Dependency](https://img.shields.io/badge/Zero%20Dependency-true-brightgreen)]()
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2020-yellow)]()
[![Genre](https://img.shields.io/badge/Genre-Bullet%20Heaven-orange)]()

一款纯浏览器弹幕生存 Roguelite(类《吸血鬼幸存者》)。**零依赖、零构建、零后端**;像素美术使用本地图集并保留完整程序化兜底,音乐由代码实时生成,双击 `index.html` 即可游玩。

![游戏截图](screenshot.png)

## 快速开始

- **在线试玩**:<https://darktide-survivors.pages.dev/>
- **本地运行**:直接双击 `index.html`,或在项目目录启动任意静态服务器:

```bash
python -m http.server 8000
# 浏览器打开 http://localhost:8000
```

## 怎么玩

- **移动**:WASD / 方向键(手机:屏幕虚拟摇杆)
- **攻击**:全自动,你只管走位
- **暂停**:ESC / P
- **目标**:活过 20 分钟,击败**暗潮魔王**

捡起蓝色经验晶升级,每次升级三选一构筑 Build;精英怪和 Boss 会掉落宝箱,**满级武器 + 对应被动 + 宝箱 = 进化**,进化出究极武器是后期清场的核心。

## 内容量

| 系统 | 数量 |
|---|---|
| 可解锁角色 | 6 名(骑士 / 法师 / 游侠 / 神官 / 狂战士 / 时行者) |
| 武器 | 12 种 × 8 级 + 12 种进化形态 |
| 被动道具 | 8 种 × 5 级 |
| 敌人 | 16 种小怪 + 精英化 + 4 个 Boss |
| 地图 | 3 张(幽暗墓园 / 血月荒野 / 深渊回廊,逐级解锁) |
| 永久成长 | 金币商店 14 项强化(可重置返还) |
| 成就 | 22 个(部分解锁角色 / 地图) |
| 其他 | 图鉴、无尽模式、本地存档、程序化芯片音乐 4 主题 |

## 技术实现

- `assets/sprites/atlas.png` 优先提供精修像素素材;`js/sprites.js` 保留全部程序化素材作为离线/加载失败兜底
- 当前图集含 131 项 288 帧;覆盖全部角色、16 种普通敌人、4 个 Boss、武器/进化/被动/系统图标、弹体、掉落物、地图装饰、地表纹理和 10 组精灵特效
- 图集经固定调色板、硬 Alpha、锚点对齐、重心防抖和自动质量报告生成,游戏运行时不增加第三方依赖
- 全局 UI 使用 CC0 Dark Dwellers 九宫格像素皮肤,中文排版使用本地 OFL Fusion Pixel 字体;来源与授权见 `assets/THIRD_PARTY_ASSETS.md`
- 音乐音效由 `js/audio.js` 用 WebAudio 实时合成(16 步音序器,强度分层)
- 对象池 + 空间哈希;自动化压力测试覆盖同屏 400 敌人和高密度粒子
- 存档保存在 `localStorage`(`darktide_save_v1`)
- 经典 `<script>` 全局命名空间,无 ES modules,`file://` 协议下也能直接运行
- 字体、图集、UI 和背景全部本地化,运行时无外部美术或字体请求

## 项目结构

```text
darktide-survivors/
├── index.html          # 入口,按顺序加载各模块
├── css/
│   └── style.css       # 像素风样式与响应式布局
├── js/
│   ├── config.js       # 全部数值 / 数据表 / 文案
│   ├── sprites.js      # 图集加载、缓存与程序化素材兜底
│   ├── audio.js        # WebAudio 音效与芯片音乐
│   ├── fx.js           # 粒子 / 伤害数字 / 震屏
│   ├── engine.js       # 主循环 / 输入 / 相机 / 空间哈希
│   ├── meta.js         # 存档 / 商店 / 成就
│   ├── entities.js     # 玩家 / 敌人 / Boss / 拾取物
│   ├── weapons.js      # 武器 / 弹体 / 进化
│   ├── ui.js           # 全部界面(DOM)
│   └── main.js         # 状态机与启动
├── assets/sprites/     # PNG 图集、元数据、源图与像素预览
├── assets/ui/          # CC0 九宫格面板、按钮、HUD 与槽位资源
├── assets/backgrounds/ # 本地主菜单像素背景
├── tools/art/          # 确定性像素修整、校验和图集构建
├── tools/ui/           # 第三方 UI 图表的确定性切片构建
├── test/
│   ├── headless.js     # 无头冒烟测试(模拟真实游玩)
│   └── art-probe.js    # 真浏览器图集与 400 敌人性能验收
└── SPEC.md             # 技术规范(模块接口与数据表)
```

## 开发校验

```bash
# 语法检查(PowerShell)
Get-ChildItem js -Filter *.js | ForEach-Object { node --check $_.FullName }

# 语法检查(Bash)
for f in js/*.js; do node --check "$f"; done

# 无头冒烟测试(模拟真实游玩约 160 秒)
node test/headless.js

# 重建并校验像素图集
node tools/art/build-atlas.js

# 真浏览器图集与 400 敌人压测
node test/art-probe.js
```

## 版权与免责声明

本作是个人自制的**非商业同人项目**,与 Fatshark 或 Games Workshop 无任何隶属关系;游戏不包含任何官方素材。美术由原创程序素材及 CC0/OFL 开放授权资源组成,完整作者、来源和许可证见 `assets/THIRD_PARTY_ASSETS.md`;音频由代码生成。"Darktide" 等相关名称与设定归原权利方所有。
