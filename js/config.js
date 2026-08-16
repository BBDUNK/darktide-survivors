// config.js — 全部数值/数据表(纯数据,无逻辑依赖)
window.CFG = {

  GAME: {
    RANGED_CAP: 12,          // 远程怪同时存活上限,防止满屏弹幕
    // 本命武器加成:角色用自己的开局武器时更强(不改武器基准值,只在持有者匹配时放大)
    AFFINITY: { dmg: 1.30, cd: 0.88, area: 1.15, projSpd: 1.12 },
    W: 960, H: 540,
    RUN_TIME: 1200,          // 20 分钟
    ENEMY_CAP: 400,
    GEM_CAP: 260,
    SPAWN_R: 620,            // 出生环半径
    SAFE_R: 460,             // 安全区:此半径内严禁刷怪(略大于半屏对角,保证不在视野内冒出)
    DESPAWN_R: 900,          // 超出则搬回出生环
    MAP_R: 2400,             // 地图半边长(方形边界 ±MAP_R,约 5×5 屏)
    MAX_WEAPONS: 6,
    MAX_PASSIVES: 6,
    SAVE_KEY: 'darktide_save_v2',
    // 画布适配:contain=等比适配永不裁切(默认) / fill=拉伸铺满可裁边 / native=原尺寸不缩放
    UI_SCALE: 'contain',
    VERSION: 'v0.23.3'
  },

  // 玩家基础属性(角色/被动/商店在此之上修正)
  BASE_STATS: {
    hp: 100, speed: 115, armor: 0, regen: 0,
    might: 1.0, cd: 1.0, area: 1.0, projSpd: 1.0, dur: 1.0,
    magnet: 60, luck: 1.0, growth: 1.0, greed: 1.0,
    crit: 0.05, critDmg: 1.5, revive: 0,
    shieldMax: 0, shieldCd: 12
  },

  // 经验曲线:前期平缓(升级快),后期陡峭(升级慢)。
  // 用二次增长代替原来的 1.75 次方:低等级需求更低,高等级更高。
  XP_NEED: function (lv) { return Math.floor(4 + (lv - 1) * 5 + Math.pow(lv, 2) * 0.9); },

  // ---------------- 角色 ----------------
  // 名字取职业对应著名人物(形似字);desc 一句人设 + 一句开局武器提示
  CHARS: [
    { id: 'knight', name: '骑士·蓝斯洛', sprite: 'char_knight', weapon: 'crossblade',
      desc: '亚瑟王麾下第一骑士,如今只剩他还醒着。武器:誓约圣剑', bonusText: '护甲 +2,生命 +20',
      mods: { armor: 2, hp: 20 }, unlock: null },
    { id: 'mage', name: '法师·丽莎', sprite: 'char_mage', weapon: 'arcanebolt',
      desc: '西风骑士团图书管理员,雷元素魔导师,总是一副睡不醒的样子。武器:贤者光弹', bonusText: '冷却 -12%',
      mods: { cd: -0.12 }, unlock: null },
    { id: 'ranger', name: '游侠·罗宾', sprite: 'char_ranger', weapon: 'windbow',
      desc: '绿林好汉出身,劫富济贫,如今只劫怪物。武器:侠盗神箭', bonusText: '移速 +12%,暴击率 +5%',
      mods: { speedPct: 0.12, crit: 0.05 }, unlock: { achv: 'a_kill_1000' } },
    { id: 'cleric', name: '神官·德雷莎', sprite: 'char_cleric', weapon: 'holyaura',
      desc: '悲悯的修女,光照不到的地方她亲自去。武器:圣女光环', bonusText: '生命回复 +0.6/秒,范围 +10%',
      mods: { regen: 0.6, areaPct: 0.10 }, unlock: { achv: 'a_survive_15' } },
    { id: 'berserker', name: '狂战士·项禹', sprite: 'char_berserker', weapon: 'whirlaxe',
      desc: '力拔山兮气盖世,可惜只会砸。武器:风暴战斧', bonusText: '伤害 +25%,生命 -20',
      mods: { mightPct: 0.25, hp: -20 }, unlock: { achv: 'a_kill_5000' } },
    { id: 'chrono', name: '时行者·爱因斯', sprite: 'char_chrono', weapon: 'teslacoil',
      desc: '发明了相对论,但不解释为什么他的线圈会说话。武器:特斯拉电塔', bonusText: '幸运 +20%,冷却 -8%',
      mods: { luckPct: 0.20, cd: -0.08 }, unlock: { achv: 'a_win' } }
  ],

  // ---------------- 武器 ----------------
  // lv: 2~8 级的增量;dmg/count/pierce/chains 为加法,cdM/areaM/spdM/durM 为乘法
  // 名字取有名武器/典故(形似字);desc 一句来历 + 一句幽默
  WEAPONS: {
    crossblade: { name: '誓约圣剑', icon: 'w_crossblade', evo: 'crossjudge', evoNeed: 'ps_power',
      desc: '石中拔出的王选之剑,谁拔谁负责。升级后四向齐发。',
      base: { dmg: 9, cd: 1.15, count: 1, speed: 300, pierce: 1, size: 16, knock: 90 },
      lv: [ { count: 1 }, { dmg: 6 }, { count: 1 }, { cdM: 0.85 }, { dmg: 8 }, { count: 1 }, { dmg: 10, pierce: 1, areaM: 1.25 } ] },
    arcanebolt: { name: '贤者光弹', icon: 'w_arcanebolt', evo: 'arcanestorm', evoNeed: 'ps_core',
      desc: '大法师随手搓的魔法弹,但会自动追人。',
      base: { dmg: 11, cd: 1.05, count: 2, speed: 280, pierce: 1, size: 9, knock: 48 },
      lv: [ { count: 1 }, { dmg: 5, arcaneReflect: 1 }, { count: 1 }, { cdM: 0.85, voidMark: 1 }, { dmg: 7 }, { count: 1, arcaneReflect: 1 }, { dmg: 9, cdM: 0.85 } ] },
    windbow: { name: '侠盗神箭', icon: 'w_windbow', evo: 'featherstorm', evoNeed: 'ps_eagle',
      desc: '绿林传说之弓,一箭还你一个公道。',
      base: { dmg: 6, cd: 1.0, count: 2, speed: 420, pierce: 1, size: 12, knock: 30 },
      lv: [ { count: 1 }, { dmg: 5, pierce: 2, armorBreak: 1 }, { dmg: 4 }, { count: 1 },
        { dmg: 6, cdM: 0.88, leafEcho: 1 }, { count: 1 }, { dmg: 8, pierce: 1 } ] },
    holyaura: { name: '圣女光环', icon: 'w_holyaura', evo: 'sanctuary', evoNeed: 'ps_pendant',
      desc: '贴地缓慢旋转的圣光领域；升级后会呼唤天降圣光轰击领域内的敌人。',
      base: { dmg: 5, cd: 0.5, count: 1, speed: 0, pierce: -1, size: 117, knock: 8 },
      lv: [ { areaM: 1.12 }, { dmg: 2, holyStrike: 1 }, { areaM: 1.12 }, { dmg: 3, holyStrike: 1 }, { areaM: 1.16 }, { dmg: 3 }, { dmg: 4, areaM: 1.16, holyStrike: 1 } ] },
    whirlaxe: { name: '风暴战斧', icon: 'w_whirlaxe', evo: 'worldender', evoNeed: 'ps_belt',
      desc: '狂战士将战斧化作高频远距近战；其他角色仅能借它激发杀敌血怒。',
      base: { dmg: 11, cd: 0.48, count: 1, speed: 0, pierce: -1, size: 24, range: 96, knock: 72 },
      lv: [ { dmg: 4 }, { areaM: 1.12 }, { cdM: 0.88 }, { dmg: 5 }, { areaM: 1.15 }, { cdM: 0.86 }, { dmg: 8, areaM: 1.18 } ] },
    // 控制类:伤害明显低于输出类,价值在减速/眩晕/灼烧持续
    chainlight: { name: '宙斯雷链', icon: 'w_chainlight', evo: 'thorwrath', evoNeed: 'ps_boots',
      desc: '奥林匹斯的天罚,雷会在敌群里自己找下一个。',
      base: { dmg: 11, cd: 1.9, count: 1, speed: 0, pierce: 0, size: 8, chains: 3, range: 250, stun: 0.15, knock: 0 },
      lv: [ { chains: 1 }, { stun: 0.1 }, { count: 1 }, { chains: 2, stun: 0.1 }, { cdM: 0.82 }, { dmg: 5, stun: 0.15 }, { chains: 2, dmg: 6, stun: 0.2 } ] },
    // 范围越大伤害越低:寒冰新星(半径135)与烈焰瓶(持续火池)是纯控制,单发伤害压到输出类的 1/3
    frostnova: { name: '寒霜之吻', icon: 'w_frostnova', evo: 'absolutezero', evoNeed: 'ps_clover',
      desc: '冰雪女王的告别之礼,被亲到就冻住。',
      base: { dmg: 4, cd: 3.2, count: 1, speed: 260, pierce: -1, size: 135, slow: 0.35, slowDur: 1.5, knock: 30 },
      lv: [ { slowDur: 0.3 }, { slowDur: 0.3 }, { cdM: 0.85 }, { slow: 0.05, slowDur: 0.3 }, { areaM: 1.2 }, { slowDur: 0.4 }, { dmg: 3, slow: 0.05, slowDur: 0.4 } ] },
    fireflask: { name: '祝融火瓶', icon: 'w_fireflask', evo: 'infernosea', evoNeed: 'ps_belt',
      desc: '火神的随身酒壶,砸地上就成火海。',
      base: { dmg: 4, cd: 2.3, count: 1, speed: 220, pierce: 0, size: 12, poolDmg: 3, poolR: 48, poolDur: 3, knock: 0 },
      lv: [ { count: 1 }, { poolDmg: 1, poolDur: 0.5 }, { areaM: 1.2 }, { count: 1, poolDur: 0.6 }, { poolDmg: 2, durM: 1.3 }, { cdM: 0.85 }, { count: 1, poolDmg: 2, poolDur: 0.8 } ] },
    shadowdagger: { name: '刺客袖刃', icon: 'w_shadowdagger', evo: 'thousandcuts', evoNeed: 'ps_eagle',
      desc: '无名刺客的袖中刀,没人看清它出手。',
      base: { dmg: 5, cd: 0.38, count: 1, speed: 460, pierce: 0, size: 10, knock: 20 },
      lv: [ { dmg: 3 }, { count: 1 }, { dmg: 4 }, { cdM: 0.85 }, { count: 1 }, { dmg: 5 }, { count: 1, dmg: 6 } ] },
    orbitblade: { name: '逍遥御剑', icon: 'w_orbitblade', evo: 'bladestorm', evoNeed: 'ps_boots',
      desc: '御剑门镇派之宝,绕着你飞,比你还忙。',
      base: { dmg: 11, cd: 4.2, count: 2, speed: 3.2, pierce: -1, size: 16, dur: 3.0, orbitR: 136, knock: 70 },
      lv: [ { count: 1 }, { dmg: 4 }, { count: 1 }, { durM: 1.25, areaM: 1.12 }, { dmg: 5 }, { count: 1 }, { dmg: 7, durM: 1.3 } ] },
    holytome: { name: '所罗门秘典', icon: 'w_holytome', evo: 'forbidden', evoNeed: 'ps_power',
      desc: '封印七十二魔神的古籍,砸完还能自己飞回来。',
      base: { dmg: 12, cd: 2.7, count: 1, speed: 340, pierce: 8, size: 8, knock: 60 },
      lv: [ { count: 1 }, { dmg: 5 }, { cdM: 0.85 }, { count: 1 }, { dmg: 6 }, { areaM: 1.25 }, { count: 1, dmg: 7 } ] },
    // zapCount: 每次放电同时打几个目标(升级提升,增强对群);塔与塔之间会自动连电弧
    teslacoil: { name: '特斯拉电塔', icon: 'w_teslacoil', evo: 'skynet', evoNeed: 'ps_magnetstone',
      desc: '科学怪人的发电塔。真正的电流,不用充电。',
      base: { dmg: 13, cd: 5.0, count: 1, speed: 0, pierce: 0, size: 16, dur: 6, zapCd: 0.8, range: 170, knock: 0, zapCount: 1 },
      lv: [ { dmg: 4, zapCount: 1 }, { durM: 1.25, teslaOverload: 1 }, { count: 1 }, { dmg: 5, zapCount: 1 }, { cdM: 0.85 }, { areaM: 1.3, zapCount: 1 }, { count: 1, dmg: 7, zapCount: 1 } ] }
  },

  // 进化:达到 8 级 + 持有对应被动,开 Boss 宝箱触发
  EVOS: {
    crossjudge:   { name: '圣十字审判', icon: 'we_crossjudge',   of: 'crossblade',
      desc: '金色巨型十字剑气,无限穿透且会绕场一周。', mult: { dmg: 2.2, area: 1.6 } },
    arcanestorm:  { name: '奥术风暴', icon: 'we_arcanestorm',  of: 'arcanebolt',
      desc: '飞弹成群,命中就炸,快乐加倍。', mult: { dmg: 1.8, count: 3 } },
    featherstorm: { name: '千羽风暴', icon: 'we_featherstorm', of: 'windbow',
      desc: '蓄力两秒后向指定方向释放半透明翠玉神龙，贯穿路径并造成巨量伤害。', mult: { dmg: 1.6, count: 4 } },
    sanctuary:    { name: '圣域', icon: 'we_sanctuary',    of: 'holyaura',
      desc: '领域扩大并治愈自身，七位大天使周期性降临并在领域内猎杀敌人。', mult: { dmg: 1.8, area: 1.6 } },
    worldender:   { name: '灭世回旋', icon: 'we_worldender',   of: 'whirlaxe',
      desc: '狂战士背后浮现血色半身幻像，击杀使幻像与攻击力成长，最多叠加 20 层。', mult: { dmg: 2.1 } },
    thorwrath:    { name: '雷神之怒', icon: 'we_thorwrath',    of: 'chainlight',
      desc: '连锁闪电贯穿全场,敌人都被电麻了。', mult: { dmg: 2.0, chains: 6 } },
    absolutezero: { name: '绝对零度', icon: 'we_absolutezero', of: 'frostnova',
      desc: '极寒新星,概率直接冻成冰雕。', mult: { dmg: 2.2, area: 1.5 } },
    infernosea:   { name: '地狱火海', icon: 'we_infernosea',   of: 'fireflask',
      desc: '每枚火瓶落地绽开十字火堆，燃烧更久并封锁整片地面。', mult: { dmg: 2.0, count: 2, area: 1.5 } },
    thousandcuts: { name: '影刃千杀', icon: 'we_thousandcuts', of: 'shadowdagger',
      desc: '影匕如雨,命中后还会弹射。一千刀,一刀不少。', mult: { dmg: 1.7, count: 2 } },
    bladestorm:   { name: '剑刃风暴', icon: 'we_bladestorm',   of: 'orbitblade',
      desc: '凝成一柄巨大常驻神剑，在地图中高速寻敌斩杀。', mult: { dmg: 2.0, count: 3 } },
    forbidden:    { name: '禁忌典籍', icon: 'we_forbidden',    of: 'holytome',
      desc: '召唤一只大恶魔环绕主人，主动猎杀范围内的敌人。', mult: { dmg: 2.2, count: 2 } },
    skynet:       { name: '电磁战车', icon: 'we_skynet',       of: 'teslacoil',
      desc: '角色驾驭电磁炮战车：车顶常驻特斯拉塔，每 3 秒朝前方发射巨型电磁冲击。', mult: { dmg: 2.1, count: 1 } }
  },

  // ---------------- 被动 ----------------
  PASSIVES: {
    ps_power:       { name: '力量护符', icon: 'ps_power', maxLv: 5, desc: '伤害 +8%/级,大力出奇迹。',
      apply: function (s, lv) { s.might += 0.08 * lv; } },
    ps_core:        { name: '魔力核心', icon: 'ps_core', maxLv: 5, desc: '冷却 -5%/级,技能转得比脑子快。',
      apply: function (s, lv) { s.cd -= 0.05 * lv; } },
    ps_eagle:       { name: '鹰眼镜片', icon: 'ps_eagle', maxLv: 5, desc: '暴击率 +5%/级,暴击伤害 +10%/级。',
      apply: function (s, lv) { s.crit += 0.05 * lv; s.critDmg += 0.10 * lv; } },
    ps_pendant:     { name: '生命吊坠', icon: 'ps_pendant', maxLv: 5, desc: '生命上限 +15/级,回复 +0.2/秒/级。',
      apply: function (s, lv) { s.hp += 15 * lv; s.regen += 0.2 * lv; } },
    ps_belt:        { name: '巨人腰带', icon: 'ps_belt', maxLv: 5, desc: '攻击范围 +8%/级,腰带勒得越紧,拳头越大。',
      apply: function (s, lv) { s.area += 0.08 * lv; } },
    ps_boots:       { name: '风暴之靴', icon: 'ps_boots', maxLv: 5, desc: '移速 +4%/级,弹速 +6%/级。',
      apply: function (s, lv) { s.speed *= (1 + 0.04 * lv); s.projSpd += 0.06 * lv; } },
    ps_magnetstone: { name: '磁石', icon: 'ps_magnetstone', maxLv: 5, desc: '拾取范围 +25/级,经验自动进兜。',
      apply: function (s, lv) { s.magnet += 25 * lv; } },
    ps_clover:      { name: '幸运草', icon: 'ps_clover', maxLv: 5, desc: '幸运 +12%/级,出门捡钱,回头捡命。',
      apply: function (s, lv) { s.luck += 0.12 * lv; } },
    ps_barrier:     { name: '护盾符文', icon: 'ps_barrier', maxLv: 3, desc: '每 12 秒恢复护盾,每级+5。',
      apply: function (s, lv) { s.shieldMax = (s.shieldMax || 0) + (5 + 5 * lv); s.shieldCd = 12; } }
  },

  // ---------------- 敌人 ----------------
  ENEMIES: {
    bat:            { name: '骨翼蝠', hp: 6, dmg: 6, spd: 72, r: 10, xp: 1, ai: 'chase' },
    slime:          { name: '腐液史莱姆', hp: 13, dmg: 8, spd: 40, r: 11, xp: 1, ai: 'chase' },
    slime_big:      { name: '巨腐史莱姆', hp: 60, dmg: 12, spd: 34, r: 21, xp: 4, ai: 'chase', split: 'slime' },
    zombie:         { name: '烂泥行者', hp: 26, dmg: 10, spd: 44, r: 11, xp: 2, ai: 'chase', burrow: 1.0 },
    // burrow: 从地里钻出(生成时播出土动画,期间不动作),可在安全区内破土
    skeleton:       { name: '白骨兵', hp: 36, dmg: 12, spd: 58, r: 11, xp: 2, ai: 'chase', burrow: 1.0 },
    ghost:          { name: '缚地怨灵', hp: 30, dmg: 12, spd: 55, r: 11, xp: 3, ai: 'phase' },
    // 蛛类:每 10 秒吐一次大型定帧蛛网。它不再减速/定身，只以远距离命中施压。
    spider:         { name: '暗纹蛛', hp: 22, dmg: 10, spd: 96, r: 10, xp: 2, ai: 'spitter',
                      shotDmg: 9, shotCd: 10, shotSpd: 250, keepDist: 300, slowAmt: 0, slowDur: 0,
                      spawnWeight: 0.5, shotRange: 660, ranged: true },
    cultist:        { name: '深渊信徒', hp: 48, dmg: 10, spd: 48, r: 11, xp: 4, ai: 'shoot', shotDmg: 12, shotCd: 4.0, shotSpd: 150, keepDist: 200, ranged: true },
    orc:            { name: '碎颅兽人', hp: 85, dmg: 16, spd: 54, r: 13, xp: 5, ai: 'chase' },
    imp:            { name: '狱火小鬼', hp: 32, dmg: 12, spd: 86, r: 10, xp: 3, ai: 'chase' },
    // 重骑:受击后举盾1.8秒,只触发一次(guardOnHit)。drawScale=2 放大一倍,更有压迫感
    knight_armored: { name: '堕落重骑', hp: 220, dmg: 20, spd: 38, r: 26, xp: 10, ai: 'shielder', armor: 5,
                      guardOnHit: true, guardDur: 1.8, drawScale: 2 },
    werewolf:       { name: '血月狼人', hp: 95, dmg: 20, spd: 72, r: 12, xp: 6, ai: 'charge', chargeSpd: 240, chargeCd: 3.5 },
    mummy:          { name: '尘缚木乃伊', hp: 130, dmg: 14, spd: 34, r: 12, xp: 6, ai: 'chase' },
    // 石像鬼:远程抛物线砸击,落点有红圈预警 —— 攻击间隔拉长,避免连续砸脸
    gargoyle:       { name: '石像鬼', hp: 150, dmg: 18, spd: 64, r: 13, xp: 8, ai: 'lobber', armor: 2,
                      lobDmg: 22, lobCd: 8.0, lobRange: 420, lobR: 60, lobTravel: 1.5, ranged: true },
    bloodbat:       { name: '血蝠', hp: 48, dmg: 12, spd: 112, r: 11, xp: 3, ai: 'chase' },
    wraith:         { name: '暗潮死灵', hp: 210, dmg: 22, spd: 58, r: 13, xp: 10, ai: 'phase' }
  },

  // music: 专属战斗曲;shotCol: 弹幕配色(区分各 Boss);auraR: 强化小怪的光环半径
  BOSSES: {
    // drawScale 是 Boss 画面缩放系数:原 80~144px 素材若按基础 2 倍整张上屏,
    // 会被放大到 320~576px,既糊又容易把动作裁出屏幕。这里统一压到
    // 约 190~224px(暗潮 P2 变身再略大),让像素更锐利、动作更完整。
    // drawScale:让 Boss 以 2~3 倍整数像素缩放上屏(80→240、96→288、112→336),
    // 避免 2.4 倍这类非整数缩放导致的像素粗细不均,看起来“糊”。
    boss_slimeking: { name: '腐液之王', hp: 1600, dmg: 20, spd: 46, r: 64, xp: 60,
      music: 'boss_slime', shotCol: '#7fd44f', drawScale: 0.75,
      desc: '第 5 分钟:巨型史莱姆,跳劈并分裂出小史莱姆' },
    boss_bonelord:  { name: '骸骨领主', hp: 45000, dmg: 26, spd: 50, r: 48, xp: 120,
      music: 'boss_bone', shotCol: '#e8e0c8', drawScale: 1.125,
      desc: '第 10 分钟:环形骨矢弹幕,连续蓄力冲撞' },
    boss_abysseye:  { name: '深渊之眼', hp: 100000, dmg: 30, spd: 42, r: 52, xp: 220,
      music: 'boss_abyss', shotCol: '#c46bff', drawScale: 0.75,
      desc: '第 15 分钟:螺旋弹幕,瞬移到背后并召唤怨灵' },
    boss_darklord:  { name: '暗潮魔王', hp: 225000, dmg: 36, spd: 55, r: 56, xp: 500,
      music: 'boss_dark', shotCol: '#ff4d7a', drawScale: 1.125, drawScaleP2: 0.75,
      desc: '第 18 分钟:最终决战,兼具冲撞与瞬移。20 分钟后狂暴!' }
  },

  // ---------------- 地图 ----------------
  // waves: 按时间段的刷怪配置;events: 定点事件
  MAPS: [
    { id: 'graveyard', name: '幽暗墓园', desc: '雾锁的古老墓地,亡者在此不得安息',
      unlock: null, hpMul: 1.0, rateMul: 1.0,
      palette: { ground: '#221c33', ground2: '#2b2445', decor: '#4d4270', fog: '#2b2247', vign: '#0a0714', ambient: '#b9a5ff' },
      decors: ['deco_grave', 'deco_deadtree_large1', 'deco_deadtree_large2',
               'deco_deadstump', 'deco_deadroots', 'deco_deadreeds',
               'deco_bone', 'deco_fence', 'deco_skullpost', 'deco_wither_cluster1',
               'deco_wither_cluster2', 'deco_swamp_reeds', 'deco_lilypad', 'deco_road_marker',
               'deco_burned_cottage', 'deco_broken_sword'],
      music: 'graveyard',
      waves: [
        { t: 0,    ids: ['bat', 'slime'],                          rate: 1.3 },
        { t: 60,   ids: ['bat', 'slime', 'zombie'],                rate: 1.7 },
        { t: 120,  ids: ['zombie', 'skeleton', 'bat'],             rate: 2.0 },
        { t: 180,  ids: ['skeleton', 'ghost', 'slime_big'],        rate: 2.2 },
        { t: 240,  ids: ['ghost', 'skeleton', 'spider'],           rate: 2.5 },
        { t: 300,  ids: ['spider', 'cultist', 'zombie'],           rate: 2.6 },
        { t: 360,  ids: ['cultist', 'orc', 'ghost'],               rate: 2.8 },
        { t: 420,  ids: ['orc', 'imp', 'spider'],                  rate: 3.0 },
        { t: 480,  ids: ['imp', 'werewolf', 'cultist'],            rate: 3.2 },
        { t: 540,  ids: ['werewolf', 'knight_armored', 'orc'],     rate: 3.2 },
        { t: 600,  ids: ['knight_armored', 'mummy', 'imp'],        rate: 3.4 },
        { t: 660,  ids: ['mummy', 'bloodbat', 'werewolf'],         rate: 3.6 },
        { t: 720,  ids: ['bloodbat', 'gargoyle', 'mummy'],         rate: 3.8 },
        { t: 780,  ids: ['gargoyle', 'knight_armored', 'bloodbat'],rate: 4.0 },
        { t: 840,  ids: ['gargoyle', 'wraith', 'bloodbat'],        rate: 4.2 },
        { t: 900,  ids: ['wraith', 'gargoyle', 'werewolf'],        rate: 4.4 },
        { t: 960,  ids: ['wraith', 'knight_armored', 'gargoyle'],  rate: 4.6 },
        { t: 1020, ids: ['wraith', 'gargoyle', 'bloodbat'],        rate: 5.0 },
        { t: 1080, ids: ['wraith', 'gargoyle', 'imp'],             rate: 5.4 }
      ],
      events: [
        { t: 150,  type: 'ring',  id: 'bat',      n: 40 },
        { t: 300,  type: 'boss',  id: 'boss_slimeking' },
        { t: 450,  type: 'swarm', id: 'spider',   n: 30 },
        { t: 600,  type: 'boss',  id: 'boss_bonelord' },
        { t: 750,  type: 'ring',  id: 'bloodbat', n: 50 },
        { t: 900,  type: 'boss',  id: 'boss_abysseye' },
        { t: 1000, type: 'ring',  id: 'wraith',   n: 24 },
        { t: 1080, type: 'boss',  id: 'boss_darklord' }
      ] },
    { id: 'wilds', name: '血月荒野', desc: '猩红之月照耀的猎场,兽群嗅到了你的血',
      unlock: { achv: 'a_survive_10' }, hpMul: 1.35, rateMul: 1.2,
      palette: { ground: '#2a1e16', ground2: '#35261a', decor: '#63452b', fog: '#4a201a', vign: '#120705', ambient: '#ff9d5c' },
      decors: ['deco_deadtree_large3', 'deco_deadtree_large4', 'deco_fallenlog',
               'deco_deadstump', 'deco_deadroots', 'deco_deadreeds',
               'deco_rock', 'deco_bush', 'deco_mushroom', 'deco_wither_cluster1',
               'deco_wither_cluster2', 'deco_wagon_rut', 'deco_burned_cottage',
               'deco_broken_wagon', 'deco_broken_sword'],
      music: 'wilds',
      waves: [
        { t: 0,    ids: ['spider', 'bat'],                         rate: 1.6 },
        { t: 60,   ids: ['spider', 'imp', 'slime'],                rate: 2.0 },
        { t: 120,  ids: ['imp', 'orc', 'spider'],                  rate: 2.3 },
        { t: 180,  ids: ['orc', 'werewolf', 'imp'],                rate: 2.5 },
        { t: 240,  ids: ['werewolf', 'bloodbat', 'orc'],           rate: 2.8 },
        { t: 300,  ids: ['bloodbat', 'werewolf', 'cultist'],       rate: 3.0 },
        { t: 360,  ids: ['cultist', 'orc', 'bloodbat'],            rate: 3.2 },
        { t: 420,  ids: ['werewolf', 'gargoyle', 'imp'],           rate: 3.4 },
        { t: 480,  ids: ['gargoyle', 'werewolf', 'bloodbat'],      rate: 3.6 },
        { t: 540,  ids: ['gargoyle', 'knight_armored', 'werewolf'],rate: 3.8 },
        { t: 600,  ids: ['knight_armored', 'gargoyle', 'bloodbat'],rate: 4.0 },
        { t: 720,  ids: ['wraith', 'gargoyle', 'werewolf'],        rate: 4.4 },
        { t: 840,  ids: ['wraith', 'knight_armored', 'gargoyle'],  rate: 4.8 },
        { t: 960,  ids: ['wraith', 'gargoyle', 'bloodbat'],        rate: 5.2 },
        { t: 1080, ids: ['wraith', 'gargoyle', 'werewolf'],        rate: 5.8 }
      ],
      events: [
        { t: 120,  type: 'ring',  id: 'spider',   n: 40 },
        { t: 300,  type: 'boss',  id: 'boss_slimeking' },
        { t: 420,  type: 'swarm', id: 'werewolf', n: 16 },
        { t: 600,  type: 'boss',  id: 'boss_bonelord' },
        { t: 750,  type: 'ring',  id: 'bloodbat', n: 60 },
        { t: 900,  type: 'boss',  id: 'boss_abysseye' },
        { t: 1000, type: 'swarm', id: 'wraith',   n: 20 },
        { t: 1080, type: 'boss',  id: 'boss_darklord' }
      ] },
    { id: 'abyss', name: '深渊回廊', desc: '世界裂缝的最深处,暗潮的源头',
      unlock: { achv: 'a_survive_10_wilds' }, hpMul: 1.8, rateMul: 1.4,
      palette: { ground: '#161c33', ground2: '#1e2447', decor: '#3a4480', fog: '#1e2750', vign: '#05070f', ambient: '#8ef' },
      decors: ['deco_pillar', 'deco_crystal', 'deco_rune', 'deco_stalag',
               'deco_deadtree_large2', 'deco_deadroots', 'deco_deadreeds',
               'deco_abyss_coral', 'deco_rune_cluster', 'deco_broken_sword',
               'deco_broken_wagon'],
      music: 'abyss',
      waves: [
        { t: 0,    ids: ['ghost', 'skeleton'],                     rate: 1.8 },
        { t: 60,   ids: ['ghost', 'cultist', 'skeleton'],          rate: 2.2 },
        { t: 120,  ids: ['cultist', 'imp', 'ghost'],               rate: 2.5 },
        { t: 180,  ids: ['imp', 'mummy', 'cultist'],               rate: 2.8 },
        { t: 240,  ids: ['mummy', 'knight_armored', 'ghost'],      rate: 3.0 },
        { t: 300,  ids: ['knight_armored', 'cultist', 'imp'],      rate: 3.2 },
        { t: 360,  ids: ['gargoyle', 'mummy', 'cultist'],          rate: 3.4 },
        { t: 420,  ids: ['gargoyle', 'wraith', 'imp'],             rate: 3.6 },
        { t: 480,  ids: ['wraith', 'knight_armored', 'gargoyle'],  rate: 3.8 },
        { t: 600,  ids: ['wraith', 'gargoyle', 'cultist'],         rate: 4.2 },
        { t: 720,  ids: ['wraith', 'knight_armored', 'gargoyle'],  rate: 4.6 },
        { t: 840,  ids: ['wraith', 'gargoyle', 'mummy'],           rate: 5.0 },
        { t: 960,  ids: ['wraith', 'gargoyle', 'knight_armored'],  rate: 5.6 },
        { t: 1080, ids: ['wraith', 'gargoyle', 'cultist'],         rate: 6.2 }
      ],
      events: [
        { t: 150,  type: 'ring',  id: 'ghost',    n: 40 },
        { t: 300,  type: 'boss',  id: 'boss_slimeking' },
        { t: 450,  type: 'ring',  id: 'cultist',  n: 30 },
        { t: 600,  type: 'boss',  id: 'boss_bonelord' },
        { t: 750,  type: 'swarm', id: 'wraith',   n: 16 },
        { t: 900,  type: 'boss',  id: 'boss_abysseye' },
        { t: 1020, type: 'ring',  id: 'wraith',   n: 30 },
        { t: 1080, type: 'boss',  id: 'boss_darklord' }
      ] }
  ],

  // 精英:每 90 秒(自 120s 起)从当前波挑一种,属性放大并掉宝箱
  ELITE: { firstT: 120, interval: 90, hpMul: 14, dmgMul: 1.5, xpMul: 8, scale: 1.5,
           auraR: 0, buffSpd: 1, buffDmg: 1, bossBuffSpd: 1, bossBuffDmg: 1 },

  // ---------------- 流浪商人 ----------------
  // 地图中心摆摊,走到物品上自动购买。每 refreshInt 秒全部刷新并多一个摊位。
  MERCHANT: {
    x: 0, y: 0,              // 地图中心
    drawH: 74,               // 屏幕绘制高度,与角色等高(骑士约 74px);宽度按原图比例推算
    slots: 3,                // 初始摊位数
    maxSlots: 5,
    refreshInt: 300,         // 5 分钟刷新一次并 +1 摊位
    spacing: 62,             // 摊位间距
    pickR: 26,               // 走到多近算购买
    playDeadR: 135,          // 怪物逼近到此范围时立刻趴地装死
    attackRange: 440,
    attackCd: 1.35,
    arrowSpeed: 360,
    arrowDamage: 20,
    // 商品池:武器按当前是否已持有决定是新武器还是升级;道具立即生效
    // 价格:道具统一 10,武器/被动统一 20
    goods: [
      { kind: 'heal',   name: '烤大腿肉', icon: 'meat',        cost: 10,  desc: '恢复 60 生命' },
      { kind: 'shield', name: '护盾符',   icon: 'ps_core',     cost: 10,  desc: '立刻获得 30 护盾' },
      { kind: 'bomb',   name: '炸弹',     icon: 'bomb',        cost: 10,  desc: '清场一次' },
      { kind: 'magnet', name: '吸铁石',   icon: 'magnet',      cost: 10,  desc: '吸取全场经验' },
      { kind: 'clock',  name: '凝时沙漏', icon: 'clock',       cost: 10,  desc: '冻结全场 4 秒' },
      { kind: 'reroll', name: '命运骰子', icon: 'icon_reroll', cost: 10,  desc: '本局刷新次数 +1' },
      { kind: 'banish', name: '丢弃之印', icon: 'icon_banish', cost: 10,  desc: '本局丢弃次数 +1' },
      { kind: 'weapon', name: '',         icon: '',            cost: 20,  desc: '' },  // 运行时抽武器
      { kind: 'passive', name: '',        icon: '',            cost: 20,  desc: '' }   // 运行时抽被动
    ]
  },

  // ---------------- 联机 ----------------
  // 人数越多敌人越强但不是线性叠加,避免 2 人时难度暴涨;经验按人数稀释保证升级节奏。
  COOP: {
    hpMulByPlayers:   [1.00, 1.00, 1.55, 2.05, 2.50],  // 索引=人数
    rateMulByPlayers: [1.00, 1.00, 1.35, 1.65, 1.90],
    dmgMulByPlayers:  [1.00, 1.00, 1.10, 1.18, 1.25],
    xpMulByPlayers:   [1.00, 1.00, 0.62, 0.46, 0.36],
    reviveRadius: 90,        // 站在倒地队友旁的救援半径
    reviveTime: 3.0,         // 持续站立救援所需秒数
    downedHp: 0.35,          // 被救起后恢复的生命比例
    // 牧师光环对队友的增益(圣光环武器持有者提供)
    priestAura: {
      radius: 150,
      regen: 1.2,            // 每秒回复
      statBoost: 0.10,       // 全属性 +10%
      projSpd: 0.25,         // 队友弹速 +25%
      dmgBoost: 0.08         // 队友伤害 +8%
    }
  },

  // 时间成长:敌人生命随分钟增长
  HP_GROWTH: 0.09, // 每分钟 +9%

  // ---------------- 拾取物 ----------------
  DROPS: {
    goldChance: 0.035,       // 敌人掉金币基础概率(×幸运)
    goldValue: [1, 3],
    heartChance: 0.008,      // 烤肉
    healAmount: 30,
    magnetChance: 0.0025,
    bombChance: 0.002,
    clockChance: 0.002,
    freezeDur: 5
  },

  // ---------------- 商店(永久成长,金币购买) ----------------
  META: [
    { id: 'm_hp',     name: '生命精粹', icon: 'icon_hp',     maxLv: 5, desc: '生命上限 +8/级',    cost: [80, 160, 320, 640, 1280],  apply: function (s, lv) { s.hp += 8 * lv; } },
    { id: 'm_dmg',    name: '力量烙印', icon: 'icon_dmg',    maxLv: 5, desc: '伤害 +3%/级',       cost: [100, 200, 400, 800, 1600], apply: function (s, lv) { s.might += 0.03 * lv; } },
    { id: 'm_armor',  name: '玄铁甲片', icon: 'icon_armor',  maxLv: 3, desc: '护甲 +1/级',        cost: [150, 400, 1000],           apply: function (s, lv) { s.armor += lv; } },
    { id: 'm_speed',  name: '疾风羽饰', icon: 'icon_speed',  maxLv: 3, desc: '移速 +3%/级',       cost: [120, 300, 700],            apply: function (s, lv) { s.speed *= (1 + 0.03 * lv); } },
    { id: 'm_regen',  name: '再生秘药', icon: 'icon_hp',     maxLv: 3, desc: '生命回复 +0.15/秒/级', cost: [150, 350, 800],        apply: function (s, lv) { s.regen += 0.15 * lv; } },
    { id: 'm_cd',     name: '时之沙',   icon: 'icon_cd',     maxLv: 3, desc: '冷却 -2%/级',       cost: [200, 500, 1200],           apply: function (s, lv) { s.cd -= 0.02 * lv; } },
    { id: 'm_area',   name: '扩域符文', icon: 'icon_area',   maxLv: 3, desc: '攻击范围 +4%/级',    cost: [150, 400, 900],           apply: function (s, lv) { s.area += 0.04 * lv; } },
    { id: 'm_magnet', name: '苍磁石',   icon: 'icon_magnet', maxLv: 3, desc: '拾取范围 +12/级',    cost: [100, 250, 600],           apply: function (s, lv) { s.magnet += 12 * lv; } },
    { id: 'm_luck',   name: '黑猫护符', icon: 'icon_luck',   maxLv: 3, desc: '幸运 +8%/级',       cost: [150, 400, 1000],           apply: function (s, lv) { s.luck += 0.08 * lv; } },
    { id: 'm_growth', name: '智慧之种', icon: 'icon_growth', maxLv: 3, desc: '经验获取 +4%/级',    cost: [150, 400, 1000],          apply: function (s, lv) { s.growth += 0.04 * lv; } },
    { id: 'm_greed',  name: '贪婪王冠', icon: 'icon_gold',   maxLv: 3, desc: '金币获取 +8%/级',    cost: [200, 500, 1200],          apply: function (s, lv) { s.greed += 0.08 * lv; } },
    { id: 'm_revive', name: '不灭凤羽', icon: 'icon_revive', maxLv: 1, desc: '复活次数 +1',        cost: [2000],                    apply: function (s, lv) { s.revive += 1; } },
    { id: 'm_reroll', name: '命运骰子', icon: 'icon_reroll', maxLv: 3, desc: '每局刷新次数 +1/级', cost: [300, 700, 1500],          apply: function (s, lv) { s.reroll = (s.reroll || 0) + lv; } },
    { id: 'm_banish', name: '丢弃之印', icon: 'icon_banish', maxLv: 3, desc: '每局丢弃次数 +1/级', cost: [300, 700, 1500],          apply: function (s, lv) { s.banish = (s.banish || 0) + lv; } }
  ],

  // ---------------- 成就 ----------------
  // cond: {type, n, map?} 由 Meta.check 用累计统计判断;reward 为金币
  ACHV: [
    { id: 'a_kill_100',   name: '初试锋芒', desc: '累计击杀 100 名敌人',    cond: { type: 'kills', n: 100 },    reward: 50 },
    { id: 'a_kill_1000',  name: '千人斩',   desc: '累计击杀 1,000 名敌人(解锁:游侠·薇)', cond: { type: 'kills', n: 1000 },  reward: 150 },
    { id: 'a_kill_5000',  name: '尸山血海', desc: '累计击杀 5,000 名敌人(解锁:狂战士·布罗克)', cond: { type: 'kills', n: 5000 }, reward: 400 },
    { id: 'a_kill_20000', name: '行走的天灾', desc: '累计击杀 20,000 名敌人', cond: { type: 'kills', n: 20000 }, reward: 1000 },
    { id: 'a_survive_5',  name: '五分钟热度', desc: '单局存活 5 分钟',      cond: { type: 'survive', n: 300 },  reward: 50 },
    { id: 'a_survive_10', name: '坚守者',   desc: '单局存活 10 分钟(解锁:血月荒野)', cond: { type: 'survive', n: 600 }, reward: 150 },
    { id: 'a_survive_15', name: '不动如山', desc: '单局存活 15 分钟(解锁:神官·塞拉)', cond: { type: 'survive', n: 900 }, reward: 300 },
    { id: 'a_survive_10_wilds', name: '荒野猎手', desc: '在血月荒野存活 10 分钟(解锁:深渊回廊)', cond: { type: 'survive_map', n: 600, map: 'wilds' }, reward: 300 },
    { id: 'a_win',        name: '破晓',     desc: '击败暗潮魔王,赢得一局(解锁:时行者·诺瓦)', cond: { type: 'wins', n: 1 }, reward: 500 },
    { id: 'a_win_3',      name: '暗潮终结者', desc: '赢得 3 局胜利',        cond: { type: 'wins', n: 3 },       reward: 1000 },
    { id: 'a_boss_first', name: '弑君者',   desc: '击败任意 Boss',         cond: { type: 'bossKills', n: 1 },  reward: 100 },
    { id: 'a_boss_10',    name: '猎王人',   desc: '累计击败 10 个 Boss',    cond: { type: 'bossKills', n: 10 }, reward: 500 },
    { id: 'a_evolve',     name: '进化论',   desc: '首次进化一件武器',       cond: { type: 'evolves', n: 1 },    reward: 200 },
    { id: 'a_evolve_5',   name: '军火大师', desc: '累计进化 5 件武器',      cond: { type: 'evolves', n: 5 },    reward: 500 },
    { id: 'a_level_50',   name: '登峰造极', desc: '单局等级达到 50',        cond: { type: 'bestLevel', n: 50 }, reward: 300 },
    { id: 'a_gold_2000',  name: '小有积蓄', desc: '累计获得 2,000 金币',    cond: { type: 'goldEarned', n: 2000 }, reward: 200 },
    { id: 'a_gold_10000', name: '富可敌国', desc: '累计获得 10,000 金币',   cond: { type: 'goldEarned', n: 10000 }, reward: 800 },
    { id: 'a_chest_10',   name: '开箱狂魔', desc: '累计打开 10 个宝箱',     cond: { type: 'chests', n: 10 },    reward: 200 },
    { id: 'a_weapons_6',  name: '武库全开', desc: '单局同时持有 6 件武器',  cond: { type: 'bestWeapons', n: 6 }, reward: 300 },
    { id: 'a_shop_10',    name: '常客',     desc: '在商店购买 10 次强化',   cond: { type: 'shopBuys', n: 10 },  reward: 200 },
    { id: 'a_die_1',      name: '英勇牺牲', desc: '第一次倒下(每个传说都有开端)', cond: { type: 'deaths', n: 1 }, reward: 30 },
    { id: 'a_bomb_5',     name: '爆破专家', desc: '累计使用 5 个炸弹',      cond: { type: 'bombs', n: 5 },      reward: 100 },
    { id: 'a_kill_50000', name: '尸潮收割者', desc: '累计击杀 50,000 名敌人', cond: { type: 'kills', n: 50000 }, reward: 2500 },
    { id: 'a_survive_20', name: '长夜守望', desc: '单局存活 20 分钟',       cond: { type: 'survive', n: 1200 }, reward: 800 },
    { id: 'a_win_10',     name: '破晓十次', desc: '累计赢得 10 局胜利',       cond: { type: 'wins', n: 10 }, reward: 3000 },
    { id: 'a_boss_50',    name: '王冠粉碎者', desc: '累计击败 50 个 Boss',    cond: { type: 'bossKills', n: 50 }, reward: 2200 },
    { id: 'a_evolve_20',  name: '万象军火库', desc: '累计完成 20 次武器进化',  cond: { type: 'evolves', n: 20 }, reward: 1800 },
    { id: 'a_level_80',   name: '超越极限', desc: '单局等级达到 80',         cond: { type: 'bestLevel', n: 80 }, reward: 1200 },
    { id: 'a_endless_10', name: '无尽初见', desc: '在无尽模式累计存活 10 分钟', cond: { type: 'endlessTime', n: 600 }, reward: 1000 },
    { id: 'a_endless_30', name: '永夜不灭', desc: '在无尽模式累计存活 30 分钟', cond: { type: 'endlessTime', n: 1800 }, reward: 3500 },
    { id: 'a_abyss_20',   name: '深渊常客', desc: '在深渊回廊单局存活 20 分钟', cond: { type: 'survive_map', n: 1200, map: 'abyss' }, reward: 1800 }
  ]
};
