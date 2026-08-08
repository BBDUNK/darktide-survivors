# 敌人与 Boss

先附上 `00_global_style.md`。普通近战怪为 48×48 母版 / 24×24 逻辑；飞行怪与幽灵仍固定中心枢轴；Boss 为 96×96 母版 / 48×48 逻辑。每种敌人先锁定 idle 母版，再逐条生成动作。

普通敌人：`skeleton`, `bat`, `slime`, `slime_big`, `zombie`, `ghost`, `spider`, `cultist`, `orc`, `imp`, `knight_armored`, `werewolf`, `mummy`, `gargoyle`, `bloodbat`, `wraith`。

保持特征：skeleton=盾牌/骨刀；zombie=破旧园丁夹克、灰绿而不血腥；slime=半透明紫绿胶团但硬像素边；spider=墓园石甲蛛；cultist=蜡烛与禁书；gargoyle=石头翅膀；wraith=青紫灵火。每个普通敌人：idle 6、move 10、attack 8、hurt 4、death 8；蝙蝠/幽灵等飞行类改为 flap 8、lunge 8、death 8。

Boss：`boss_slimeking`（戴断裂王冠的巨型黏液王）、`boss_bonelord`（骨王/墓碑权杖）、`boss_abysseye`（浮空深渊巨眼与触须）、`boss_darklord`（披斗篷的末日骑士）。每个完成 idle 10、move 12、telegraph 8、attack 12、hurt 6、death 14；攻击必须区分前摇和技能警示，不能把发光警示混在本体图里。
