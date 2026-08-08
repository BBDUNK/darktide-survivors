# 英雄与商人

先附上 `00_global_style.md`，并把已批准的该角色 idle 母版作为“风格参考图”。每次只生成一个动作，不让模型同时设计多个动作。

## 六名英雄

`char_knight`：ash-blue plated grave warden, short sword and small kite shield, navy tabard, resolute silhouette.

`char_mage`：violet scholar-mage, angular hood, rune book and slim wand, electric cyan spell accent.

`char_ranger`：moss-green hooded ranger, compact recurved bow, pale feather trim, leather boots.

`char_cleric`：ivory-and-gold battle cleric, censer and sun sigil, restrained warm halo.

`char_berserker`：red-haired axe fighter, asymmetrical fur mantle, broad stance, ember-red cloth.

`char_chrono`：teal clockwork chronomancer, brass hourglass pack, coil staff, cyan arc sparks.

每位英雄必须完成：idle 8 帧 / run 12 帧 / primary attack 10 帧 / hurt 4 帧 / death 10 帧。跑步顺序为：contact、down、pass、up、contact（另一腿）并补足过渡；披风、头发、武器延迟 1–2 帧。攻击要有 anticipation 2 帧、出手 2 帧、命中 2 帧、follow-through 2 帧、recover 2 帧。脚底为固定 bottom-center pivot。

示例：
> Create a 12-frame horizontal run-cycle reference strip for the original `char_knight` described above. Each frame is a full 48×48 master sprite on an identical canvas, facing down-right three-quarter top-down. The planted boot stays aligned to a bottom-center pivot; the sword and tabard lag naturally. Show clear contact, down, passing, and up poses, with no pose labels or grid lines. This is a source strip to be reviewed, not a final runtime atlas.

## 商人 `merchant`

大于玩家一档（64×64 母版 / 32×32 逻辑）。友善但神秘的 travelling relic merchant，紫色旅行斗篷、铜制背包、提灯与小推车式行囊；不要姓名牌或头顶文字。完成 idle 10、walk 12、offer-item 8、wave 8、hurt 4、death 8；底部中心枢轴。
