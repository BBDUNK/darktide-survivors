# 《暗潮幸存者 Darktide Survivors》技术规范 v1

弹幕生存 Roguelite(类吸血鬼幸存者)。纯浏览器,零依赖,双击 index.html 即玩(file:// 协议)。

## 硬性约束(所有模块必须遵守)

1. **禁止 ES modules**(file:// 下 CORS 会失败)。全部用经典 `<script>` 全局命名空间:`window.XXX = {...}`。
2. **禁止外部网络资源加载**。允许加载仓库内 `assets/` 的本地图集,不许 fetch/XHR/远程 Image src。
3. 美术 = 本地 PNG 图集优先 + 程序化离屏 canvas 兜底;所有音频 = WebAudio 合成。
4. 目标 60fps,同屏 400 敌人 + 1500 粒子。凡是高频对象一律**对象池**,禁止每帧 new 大量对象/数组。
5. 像素风:旧程序素材原生 16×16(Boss 32×32);精修图集角色/敌人可为 32×32、Boss 48×48,通过 `renderScale` 保持显示尺寸;全局 `imageSmoothingEnabled=false`。
6. 代码风格:ES2020,分号,单引号,2 空格缩进。文件头一行注释说明模块职责。
7. 每个模块文件**自包含**,只依赖已声明的全局(CFG / Engine 等),不得依赖未在本规范声明的接口。
8. 第三方美术只允许 CC0、MIT、OFL 等可再分发授权;必须在 `assets/THIRD_PARTY_ASSETS.md` 记录作者、来源、版本和许可证,运行时仍须完全本地化。

## 文件与加载顺序(index.html 按此顺序引入)

```
js/config.js                 → window.CFG        全部数值/文案/数据表(已完成,可直接读)
assets/sprites/atlas-data.js → window.SPRITE_ATLAS 本地图集元数据
js/sprites.js                → window.SpriteGen  图集优先 + 程序化兜底 【模块A·委托】
js/audio.js     → window.AudioSys   WebAudio 音效+音乐    【模块B·委托】
js/fx.js        → window.FX         粒子/伤害数字/震屏    【模块C·委托】
js/engine.js    → window.Engine     循环/输入/相机/空间哈希
js/meta.js      → window.Meta       存档/商店/成就
js/entities.js  → window.Entities   玩家/敌人/Boss/拾取物
js/weapons.js   → window.Weapons    武器行为/子弹/进化
js/ui.js        → window.UI         全部界面(DOM)
js/main.js      → 状态机+启动
```

画布:`<canvas id="game">` 内部分辨率 960×540,CSS 等比缩放充满窗口,`image-rendering: pixelated`。
世界坐标 = 画布像素(16px 素材画成 32px)。

---

## 模块A:js/sprites.js → window.SpriteGen 【委托开发】

程序化生成全部像素画作为可靠兜底;启动时若本地图集可用,同名素材会被精修帧原子覆盖。要求:风格统一(1px 深色描边、2~3 级明暗、可爱但狠的暗黑奇幻)、剪影差异明显、确定性。

### 接口(严格)

```js
SpriteGen.init();                 // 同步,构建全部;启动时调用一次
SpriteGen.loadAtlas();            // → Promise|null;加载本地图集,失败时保留程序素材
SpriteGen.get(name);              // → HTMLCanvasElement;未知名字返回 8×8 洋红占位并 console.warn(每名一次)
SpriteGen.frames(name);           // → [canvas,...] 动画帧数组(≥1);单帧素材返回 [同一 canvas]
SpriteGen.renderScale(name);       // → number;图集素材的显示缩放,程序素材为 1
SpriteGen.animationFps(name, n);   // → number;图集逐素材帧率,缺失时使用回退值 n
SpriteGen.atlasStatus();           // → {loaded,count,image,error};测试与诊断
```

v0.16.1 精修覆盖:六名 `char_*` 可玩角色、`skeleton`、`boss_slimeking`、`p_slash_big`、`w_crossblade`、`ps_core`、`deco_grave`、`deco_deadtree`,共 13 项 37 帧。六名角色与两类敌人均为四帧循环并使用逐素材帧率;其余命名继续使用原程序素材。图集由 `node tools/art/build-atlas.js` 构建并通过 `quality-report.json` 门禁。

建议内部用调色板 + 小型绘图 DSL(plot/rect/outline/mirror)批量生产。**必须实现下表全部名字**:

### 角色(程序素材 16×16;精修覆盖为 32×32 四帧,未覆盖项可用 2 帧兜底)
`char_knight`(银甲蓝披风) `char_mage`(紫袍尖帽) `char_ranger`(绿兜帽) `char_cleric`(白金袍) `char_berserker`(红发裸上身双斧) `char_chrono`(青蓝长袍怀表)

### 敌人(程序素材 16×16;精修覆盖可为 32×32;骷髅为四帧,未覆盖项各 2 帧)
`bat`(小蝙蝠) `slime`(绿史莱姆) `slime_big`(深绿大史莱姆) `zombie`(烂绿僵尸) `skeleton`(白骨) `ghost`(半透明幽灵,自带 alpha) `spider`(黑紫蜘蛛) `cultist`(暗红兜帽邪教徒) `orc`(墨绿兽人) `imp`(橙红小恶魔) `knight_armored`(黑甲骑士) `werewolf`(灰狼人) `mummy`(米色木乃伊) `gargoyle`(石像鬼) `bloodbat`(红大蝙蝠) `wraith`(暗影死灵)

### Boss(程序素材 32×32;精修可为 48×48;史莱姆王为四帧,未覆盖项各 2 帧)
`boss_slimeking`(戴王冠巨型史莱姆) `boss_bonelord`(持杖骸骨领主) `boss_abysseye`(触手巨眼) `boss_darklord`(双角暗潮魔王)

### 弹体
`p_slash`(16×16 弯月剑气,白青) `p_slash_big`(24×24 金色) `p_bolt`(8×8 紫色魔弹) `p_arrow`(16×8 箭) `p_axe`(16×16 斧) `p_dagger`(12×6 匕首) `p_orbitblade`(16×16 环绕刀) `p_book`(16×16 圣书) `p_fireflask`(12×12 火瓶) `p_firepool`(32×32 火焰地面,2帧) `p_spark`(8×8 电火花) `p_shadow`(10×10 暗影弹) `p_turret`(16×16 特斯拉塔,2帧) `p_enemy_bolt`(8×8 红色敌弹) `p_holy`(12×12 圣光球)

### 拾取物
`gem1`(蓝小晶) `gem2`(绿中晶) `gem3`(红大晶) `gem_big`(紫聚合晶) `coin`(金币,2帧闪) `chest`(宝箱,帧1关帧2开) `magnet`(磁铁) `bomb`(炸弹) `meat`(烤肉) `clock`(冰冻怀表)

### 图标(16×16,UI 用,底色深、主体亮)
武器:`w_crossblade w_arcanebolt w_windbow w_holyaura w_whirlaxe w_chainlight w_frostnova w_fireflask w_shadowdagger w_orbitblade w_holytome w_teslacoil`
进化(对应武器的强化版,更华丽/金边):`we_crossjudge we_arcanestorm we_featherstorm we_sanctuary we_worldender we_thorwrath we_absolutezero we_infernosea we_thousandcuts we_bladestorm we_forbidden we_skynet`
被动:`ps_power ps_core ps_eagle ps_pendant ps_belt ps_boots ps_magnetstone ps_clover`
杂项:`icon_gold icon_hp icon_dmg icon_armor icon_speed icon_magnet icon_luck icon_revive icon_reroll icon_banish icon_cd icon_area icon_growth icon_kill icon_time elite_crown`(小金冠,叠加在精英头上)

### 地图装饰(16×16 或 16×24,单帧)
墓园:`deco_grave deco_deadtree deco_bone deco_fence deco_skullpost`
荒野:`deco_tree2 deco_rock deco_bush deco_mushroom`
深渊:`deco_pillar deco_crystal deco_rune deco_stalag`
通用:`vfx_shadow`(16×6 半透明椭圆脚底影)

---

## 模块B:js/audio.js → window.AudioSys 【委托开发】

WebAudio 全合成。芯片音乐感 + 打击感。**惰性初始化**(首次用户手势后才建 AudioContext)。

### 接口(严格)

```js
AudioSys.unlock();                    // 首次点击时调用;可重复调用无副作用
AudioSys.play(name);                  // 播放音效;未 unlock 或未知名静默(未知名 console.warn 每名一次)
AudioSys.playMusic(theme);            // 'menu'|'graveyard'|'wilds'|'abyss';循环;自动淡出上一首
AudioSys.setIntensity(n);             // 0..3 音乐强度分层(0 仅底鼓/贝斯 → 3 全奏+副旋律);Boss 战调 3
AudioSys.stopMusic();
AudioSys.setVolumes(music01, sfx01);  // 0..1
```

### 音效名(全部实现;同类可参数微变防听觉疲劳,如 hit 随机音高)

`ui_click ui_hover ui_back run_start`
`shoot_slash shoot_bolt shoot_arrow shoot_axe shoot_dagger shoot_book shoot_flask zap nova turret_place`
`hit1 hit2 crit enemy_die splat player_hurt`
`gem coin meat magnet bomb freeze chest_open levelup upgrade_pick evolve`
`boss_spawn boss_die elite_spawn achievement gameover victory`

要求:hit/gem 这类每秒可能触发 20+ 次,必须限流(同名音效 ≥40ms 间隔)+ 轻量(短包络振荡器,不建长节点链)。主音量经 DynamicsCompressor 防爆音。

### 音乐

程序化循环编曲(16 步进音序器思路):menu(平静小调琶音)、graveyard(阴郁 e 小调)、wilds(紧张 d 多利亚)、abyss(压迫低音半音阶)。各主题至少 2 段和弦进行交替。强度分层:0=鼓+贝斯,1=+和弦垫,2=+主旋律,3=+高八度副旋律与更密集鼓点。

---

## 模块C:js/fx.js → window.FX 【委托开发】

粒子、伤害数字、震屏、屏幕闪光。全对象池,粒子上限 1500(满了复用最旧)。

### 接口(严格)

```js
FX.reset();                                  // 开局清空
FX.update(dt);                               // 秒
FX.draw(ctx);                                // 世界空间(main 已 translate 相机,直接画世界坐标)
FX.drawUI(ctx);                              // 屏幕空间(闪光/暗角脉冲),在 UI 层调用
FX.shake(power, dur);                        // 震屏(叠加取最大)
FX.getOffset();                              // → {x,y} 当前震屏偏移,main 加到相机上
FX.setCfg({shake:bool, dmgText:bool});       // 设置开关
// 生成器:
FX.dmgText(x, y, amount, opts);              // opts:{crit:bool,color:'#fff',heal:bool} 上飘数字,crit 更大更黄
FX.burst(x, y, opts);                        // 粒子爆发 {color,n,speed,life,size,gravity,glow}
FX.blood(x, y, color);                       // 敌人受击溅射(默认暗红,可传怪物主题色)
FX.explosion(x, y, r);                       // 爆炸:闪光+火粒子+冲击环
FX.ring(x, y, opts);                         // 扩散圆环 {r,color,life,width}
FX.lightning(x1,y1,x2,y2,color);             // 折线闪电,存活 ~0.15s
FX.heal(x, y);                               // 绿色十字上升粒子
FX.levelBeam(x, y);                          // 升级金色光柱
FX.pickup(x, y, color);                      // 拾取小星星
FX.flash(color, alpha, dur);                 // 全屏闪光(drawUI 里画)
FX.trail(x, y, color, size);                 // 单个拖尾粒子(高频调用,必须极轻)
```

伤害数字:等宽微字体直接 fillText 即可(自带 1px 黑描边),crit 字号 ×1.5 金色。dmgText 关闭时静默忽略。数字池上限 80。

---

## 供委托模块参考的既有全局

- `CFG`:全部数据表(读 js/config.js)。调色板在 `CFG.MAPS[i].palette`。
- 委托模块**不得**调用 Engine/Entities/UI/Meta(保持单向依赖);FX 可读 `CFG` 常量。
- RNG:各模块内置自己的种子 RNG(mulberry32),不要用 Math.random 生成素材(音频运行时抖动可用 Math.random)。

## 验收清单(每个委托模块完成前自查)

1. `node --check js/xxx.js` 通过。
2. 文件内实现了本规范列出的**全部**名字/接口,无遗漏(写一个内部 registry,init 后 console.assert 覆盖率)。
3. 无 ES module 语法、无网络请求、无未声明全局泄漏(除规定的 window.XXX)。
4. 高频路径无每帧分配大对象。
