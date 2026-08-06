// config.js — 全部数值/数据表(纯数据,无逻辑依赖)
window.CFG = {

  GAME: {
    W: 960, H: 540,
    RUN_TIME: 1200,          // 20 分钟
    ENEMY_CAP: 400,
    GEM_CAP: 260,
    SPAWN_R: 620,            // 出生环半径
    DESPAWN_R: 900,          // 超出则搬回出生环
    MAX_WEAPONS: 6,
    MAX_PASSIVES: 6,
    SAVE_KEY: 'darktide_save_v1'
  },

  // 玩家基础属性(角色/被动/商店在此之上修正)
  BASE_STATS: {
    hp: 100, speed: 115, armor: 0, regen: 0,
    might: 1.0, cd: 1.0, area: 1.0, projSpd: 1.0, dur: 1.0,
    magnet: 60, luck: 1.0, growth: 1.0, greed: 1.0,
    crit: 0.05, critDmg: 1.5, revive: 0
  },

  XP_NEED: function (lv) { return Math.floor(6 + (lv - 1) * 7 + Math.pow(lv, 1.75)); },

  // ---------------- 角色 ----------------
  CHARS: [
    { id: 'knight', name: '骑士·阿德里安', sprite: 'char_knight', weapon: 'crossblade',
      desc: '边境骑士团最后的旗手。开局武器:十字剑气', bonusText: '护甲 +2,生命 +20',
      mods: { armor: 2, hp: 20 }, unlock: null },
    { id: 'mage', name: '法师·莉拉', sprite: 'char_mage', weapon: 'arcanebolt',
      desc: '被学院除名的天才。开局武器:奥术飞弹', bonusText: '冷却 -12%',
      mods: { cd: -0.12 }, unlock: null },
    { id: 'ranger', name: '游侠·薇', sprite: 'char_ranger', weapon: 'windbow',
      desc: '风之森的独行猎手。开局武器:猎风弩', bonusText: '移速 +12%,暴击率 +5%',
      mods: { speedPct: 0.12, crit: 0.05 }, unlock: { achv: 'a_kill_1000' } },
    { id: 'cleric', name: '神官·塞拉', sprite: 'char_cleric', weapon: 'holyaura',
      desc: '守望黎明的最后祭司。开局武器:圣光环', bonusText: '生命回复 +0.6/秒,范围 +10%',
      mods: { regen: 0.6, areaPct: 0.10 }, unlock: { achv: 'a_survive_15' } },
    { id: 'berserker', name: '狂战士·布罗克', sprite: 'char_berserker', weapon: 'whirlaxe',
      desc: '以战养战的北地蛮王。开局武器:回旋斧', bonusText: '伤害 +25%,生命 -20',
      mods: { mightPct: 0.25, hp: -20 }, unlock: { achv: 'a_kill_5000' } },
    { id: 'chrono', name: '时行者·诺瓦', sprite: 'char_chrono', weapon: 'teslacoil',
      desc: '来自终局之后的旅人。开局武器:磁暴线圈', bonusText: '幸运 +20%,冷却 -8%',
      mods: { luckPct: 0.20, cd: -0.08 }, unlock: { achv: 'a_win' } }
  ],

  // ---------------- 武器 ----------------
  // lv: 2~8 级的增量;dmg/count/pierce/chains 为加法,cdM/areaM/spdM/durM 为乘法
  WEAPONS: {
    crossblade: { name: '十字剑气', icon: 'w_crossblade', evo: 'crossjudge', evoNeed: 'ps_power',
      desc: '向面朝方向斩出剑气,升级后四向齐发',
      base: { dmg: 12, cd: 1.15, count: 1, speed: 300, pierce: 3, size: 16, knock: 90 },
      lv: [ { count: 1 }, { dmg: 6 }, { count: 1 }, { cdM: 0.85 }, { dmg: 8, pierce: 2 }, { count: 1 }, { dmg: 12, areaM: 1.25 } ] },
    arcanebolt: { name: '奥术飞弹', icon: 'w_arcanebolt', evo: 'arcanestorm', evoNeed: 'ps_core',
      desc: '自动追踪最近敌人的魔力飞弹',
      base: { dmg: 10, cd: 1.30, count: 1, speed: 240, pierce: 0, size: 8, knock: 40 },
      lv: [ { count: 1 }, { dmg: 5 }, { count: 1 }, { cdM: 0.85 }, { dmg: 7 }, { count: 1 }, { dmg: 10, cdM: 0.85 } ] },
    windbow: { name: '猎风弩', icon: 'w_windbow', evo: 'featherstorm', evoNeed: 'ps_eagle',
      desc: '向移动方向连射风矢,可穿透',
      base: { dmg: 8, cd: 1.0, count: 2, speed: 420, pierce: 1, size: 12, knock: 30 },
      lv: [ { count: 1 }, { dmg: 4 }, { pierce: 1 }, { count: 1 }, { dmg: 6, cdM: 0.88 }, { count: 1 }, { dmg: 8, pierce: 2 } ] },
    holyaura: { name: '圣光环', icon: 'w_holyaura', evo: 'sanctuary', evoNeed: 'ps_pendant',
      desc: '环绕自身的圣光领域,持续灼烧敌人',
      base: { dmg: 7, cd: 0.5, count: 1, speed: 0, pierce: -1, size: 78, knock: 8 },
      lv: [ { areaM: 1.15 }, { dmg: 3 }, { areaM: 1.15 }, { dmg: 4 }, { areaM: 1.2 }, { dmg: 5 }, { dmg: 6, areaM: 1.2 } ] },
    whirlaxe: { name: '回旋斧', icon: 'w_whirlaxe', evo: 'worldender', evoNeed: 'ps_belt',
      desc: '抛出沿弧线下坠的巨斧,穿透一切',
      base: { dmg: 20, cd: 1.5, count: 1, speed: 300, pierce: 99, size: 16, knock: 110 },
      lv: [ { count: 1 }, { dmg: 8 }, { count: 1 }, { cdM: 0.85 }, { dmg: 12 }, { count: 1 }, { dmg: 15, areaM: 1.3 } ] },
    chainlight: { name: '闪电链', icon: 'w_chainlight', evo: 'thorwrath', evoNeed: 'ps_boots',
      desc: '雷击随机敌人并在敌群间跳跃',
      base: { dmg: 22, cd: 1.9, count: 1, speed: 0, pierce: 0, size: 8, chains: 3, range: 250, knock: 0 },
      lv: [ { chains: 1 }, { dmg: 8 }, { count: 1 }, { chains: 2 }, { cdM: 0.82 }, { dmg: 12 }, { chains: 2, dmg: 12 } ] },
    frostnova: { name: '寒冰新星', icon: 'w_frostnova', evo: 'absolutezero', evoNeed: 'ps_clover',
      desc: '周期性冻结冲击波,减速敌人',
      base: { dmg: 14, cd: 3.2, count: 1, speed: 260, pierce: -1, size: 135, slow: 0.4, slowDur: 2, knock: 30 },
      lv: [ { dmg: 6 }, { areaM: 1.2 }, { cdM: 0.85 }, { dmg: 8 }, { areaM: 1.2 }, { cdM: 0.85 }, { dmg: 12, areaM: 1.2 } ] },
    fireflask: { name: '烈焰瓶', icon: 'w_fireflask', evo: 'infernosea', evoNeed: 'ps_belt',
      desc: '投掷火瓶,留下燃烧地面',
      base: { dmg: 10, cd: 2.3, count: 1, speed: 220, pierce: 0, size: 12, poolDmg: 9, poolR: 48, poolDur: 3, knock: 0 },
      lv: [ { count: 1 }, { dmg: 5, poolDmg: 3 }, { areaM: 1.2 }, { count: 1 }, { poolDmg: 4, durM: 1.3 }, { cdM: 0.85 }, { count: 1, poolDmg: 5 } ] },
    shadowdagger: { name: '暗影匕首', icon: 'w_shadowdagger', evo: 'thousandcuts', evoNeed: 'ps_eagle',
      desc: '高频掷出追命匕首,射向附近敌人',
      base: { dmg: 7, cd: 0.38, count: 1, speed: 460, pierce: 0, size: 10, knock: 20 },
      lv: [ { dmg: 3 }, { count: 1 }, { dmg: 3 }, { cdM: 0.85 }, { count: 1 }, { dmg: 5 }, { count: 1, dmg: 5 } ] },
    orbitblade: { name: '守护飞剑', icon: 'w_orbitblade', evo: 'bladestorm', evoNeed: 'ps_boots',
      desc: '飞剑环绕自身旋转,撞开敌潮',
      base: { dmg: 15, cd: 4.2, count: 2, speed: 3.2, pierce: -1, size: 16, dur: 3.0, orbitR: 68, knock: 70 },
      lv: [ { count: 1 }, { dmg: 6 }, { count: 1 }, { durM: 1.25, areaM: 1.12 }, { dmg: 8 }, { count: 1 }, { dmg: 10, durM: 1.3 } ] },
    holytome: { name: '圣典', icon: 'w_holytome', evo: 'forbidden', evoNeed: 'ps_power',
      desc: '掷出回旋圣书,去而复返',
      base: { dmg: 16, cd: 2.7, count: 1, speed: 340, pierce: 99, size: 16, knock: 60 },
      lv: [ { count: 1 }, { dmg: 7 }, { cdM: 0.85 }, { count: 1 }, { dmg: 9 }, { areaM: 1.25 }, { count: 1, dmg: 10 } ] },
    teslacoil: { name: '磁暴线圈', icon: 'w_teslacoil', evo: 'skynet', evoNeed: 'ps_magnetstone',
      desc: '布设自动电击的特斯拉塔',
      base: { dmg: 18, cd: 5.0, count: 1, speed: 0, pierce: 0, size: 16, dur: 6, zapCd: 0.5, range: 170, knock: 0 },
      lv: [ { dmg: 6 }, { durM: 1.25 }, { count: 1 }, { dmg: 8 }, { cdM: 0.85 }, { areaM: 1.3 }, { count: 1, dmg: 10 } ] }
  },

  // 进化:达到 8 级 + 持有对应被动,开 Boss 宝箱触发
  EVOS: {
    crossjudge:   { name: '圣十字审判', icon: 'we_crossjudge',   of: 'crossblade',
      desc: '金色巨型十字剑气,无限穿透并回旋归来', mult: { dmg: 2.2, area: 1.6 } },
    arcanestorm:  { name: '奥术风暴', icon: 'we_arcanestorm',  of: 'arcanebolt',
      desc: '飞弹成群,命中时引发奥术爆炸', mult: { dmg: 1.8, count: 3 } },
    featherstorm: { name: '千羽风暴', icon: 'we_featherstorm', of: 'windbow',
      desc: '八向风矢齐射,暴击率大幅提升', mult: { dmg: 1.6, count: 4 } },
    sanctuary:    { name: '圣域', icon: 'we_sanctuary',    of: 'holyaura',
      desc: '领域扩大并治愈自身,减速其中敌人', mult: { dmg: 1.8, area: 1.6 } },
    worldender:   { name: '灭世回旋', icon: 'we_worldender',   of: 'whirlaxe',
      desc: '毁天灭地的巨斧风暴', mult: { dmg: 2.5, count: 2 } },
    thorwrath:    { name: '雷神之怒', icon: 'we_thorwrath',    of: 'chainlight',
      desc: '连锁闪电贯穿全场并眩晕敌人', mult: { dmg: 2.0, chains: 6 } },
    absolutezero: { name: '绝对零度', icon: 'we_absolutezero', of: 'frostnova',
      desc: '极寒新星,概率直接冻碎敌人', mult: { dmg: 2.2, area: 1.5 } },
    infernosea:   { name: '地狱火海', icon: 'we_infernosea',   of: 'fireflask',
      desc: '火瓶三连投,烈焰吞噬大地', mult: { dmg: 2.0, count: 2, area: 1.5 } },
    thousandcuts: { name: '影刃千杀', icon: 'we_thousandcuts', of: 'shadowdagger',
      desc: '影匕如雨,命中后弹射', mult: { dmg: 1.7, count: 2 } },
    bladestorm:   { name: '剑刃风暴', icon: 'we_bladestorm',   of: 'orbitblade',
      desc: '六剑永久环绕,永不消散', mult: { dmg: 2.0, count: 3 } },
    forbidden:    { name: '禁忌典籍', icon: 'we_forbidden',    of: 'holytome',
      desc: '禁书螺旋环卫,撕裂靠近的一切', mult: { dmg: 2.2, count: 2 } },
    skynet:       { name: '天网机阵', icon: 'we_skynet',       of: 'teslacoil',
      desc: '多塔联动,电弧交织成网', mult: { dmg: 1.8, count: 2 } }
  },

  // ---------------- 被动 ----------------
  PASSIVES: {
    ps_power:       { name: '力量护符', icon: 'ps_power', maxLv: 5, desc: '伤害 +8%/级',
      apply: function (s, lv) { s.might += 0.08 * lv; } },
    ps_core:        { name: '魔力核心', icon: 'ps_core', maxLv: 5, desc: '冷却 -5%/级',
      apply: function (s, lv) { s.cd -= 0.05 * lv; } },
    ps_eagle:       { name: '鹰眼镜片', icon: 'ps_eagle', maxLv: 5, desc: '暴击率 +5%/级,暴击伤害 +10%/级',
      apply: function (s, lv) { s.crit += 0.05 * lv; s.critDmg += 0.10 * lv; } },
    ps_pendant:     { name: '生命吊坠', icon: 'ps_pendant', maxLv: 5, desc: '生命上限 +15/级,回复 +0.2/秒/级',
      apply: function (s, lv) { s.hp += 15 * lv; s.regen += 0.2 * lv; } },
    ps_belt:        { name: '巨人腰带', icon: 'ps_belt', maxLv: 5, desc: '攻击范围 +8%/级',
      apply: function (s, lv) { s.area += 0.08 * lv; } },
    ps_boots:       { name: '风暴之靴', icon: 'ps_boots', maxLv: 5, desc: '移速 +4%/级,弹速 +6%/级',
      apply: function (s, lv) { s.speed *= (1 + 0.04 * lv); s.projSpd += 0.06 * lv; } },
    ps_magnetstone: { name: '磁石', icon: 'ps_magnetstone', maxLv: 5, desc: '拾取范围 +25/级',
      apply: function (s, lv) { s.magnet += 25 * lv; } },
    ps_clover:      { name: '幸运草', icon: 'ps_clover', maxLv: 5, desc: '幸运 +12%/级',
      apply: function (s, lv) { s.luck += 0.12 * lv; } }
  },

  // ---------------- 敌人 ----------------
  ENEMIES: {
    bat:            { name: '骨翼蝠', hp: 6, dmg: 6, spd: 72, r: 10, xp: 1, ai: 'chase' },
    slime:          { name: '腐液史莱姆', hp: 13, dmg: 8, spd: 40, r: 11, xp: 1, ai: 'chase' },
    slime_big:      { name: '巨腐史莱姆', hp: 60, dmg: 12, spd: 34, r: 15, xp: 4, ai: 'chase', split: 'slime' },
    zombie:         { name: '烂泥行者', hp: 26, dmg: 10, spd: 44, r: 11, xp: 2, ai: 'chase' },
    skeleton:       { name: '白骨兵', hp: 36, dmg: 12, spd: 58, r: 11, xp: 2, ai: 'chase' },
    ghost:          { name: '缚地怨灵', hp: 30, dmg: 12, spd: 55, r: 11, xp: 3, ai: 'phase' },
    spider:         { name: '暗纹蛛', hp: 22, dmg: 10, spd: 96, r: 10, xp: 2, ai: 'chase' },
    cultist:        { name: '深渊信徒', hp: 48, dmg: 10, spd: 48, r: 11, xp: 4, ai: 'shoot', shotDmg: 12, shotCd: 2.6, shotSpd: 150, keepDist: 200 },
    orc:            { name: '碎颅兽人', hp: 85, dmg: 16, spd: 54, r: 13, xp: 5, ai: 'chase' },
    imp:            { name: '狱火小鬼', hp: 32, dmg: 12, spd: 86, r: 10, xp: 3, ai: 'chase' },
    knight_armored: { name: '堕落重骑', hp: 170, dmg: 18, spd: 40, r: 13, xp: 8, ai: 'chase', armor: 4 },
    werewolf:       { name: '血月狼人', hp: 95, dmg: 20, spd: 72, r: 12, xp: 6, ai: 'charge', chargeSpd: 240, chargeCd: 3.5 },
    mummy:          { name: '尘缚木乃伊', hp: 130, dmg: 14, spd: 34, r: 12, xp: 6, ai: 'chase' },
    gargoyle:       { name: '石像鬼', hp: 150, dmg: 18, spd: 64, r: 13, xp: 8, ai: 'chase', armor: 2 },
    bloodbat:       { name: '血蝠', hp: 48, dmg: 12, spd: 112, r: 11, xp: 3, ai: 'chase' },
    wraith:         { name: '暗潮死灵', hp: 210, dmg: 22, spd: 58, r: 13, xp: 10, ai: 'phase' }
  },

  BOSSES: {
    boss_slimeking: { name: '腐液之王', hp: 3200, dmg: 20, spd: 46, r: 26, xp: 60,
      desc: '第 5 分钟:巨型史莱姆,跳劈并分裂出小史莱姆' },
    boss_bonelord:  { name: '骸骨领主', hp: 10000, dmg: 26, spd: 50, r: 26, xp: 120,
      desc: '第 10 分钟:环形骨矢弹幕' },
    boss_abysseye:  { name: '深渊之眼', hp: 24000, dmg: 30, spd: 42, r: 28, xp: 220,
      desc: '第 15 分钟:螺旋弹幕并召唤怨灵' },
    boss_darklord:  { name: '暗潮魔王', hp: 52000, dmg: 36, spd: 55, r: 30, xp: 500,
      desc: '第 18 分钟:最终决战。20 分钟后狂暴!' }
  },

  // ---------------- 地图 ----------------
  // waves: 按时间段的刷怪配置;events: 定点事件
  MAPS: [
    { id: 'graveyard', name: '幽暗墓园', desc: '雾锁的古老墓地,亡者在此不得安息',
      unlock: null, hpMul: 1.0, rateMul: 1.0,
      palette: { ground: '#181423', ground2: '#1d1830', decor: '#3a3153', fog: '#241d3d', vign: '#0a0714' },
      decors: ['deco_grave', 'deco_deadtree', 'deco_bone', 'deco_fence', 'deco_skullpost'],
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
      palette: { ground: '#1c1410', ground2: '#241a12', decor: '#4a3320', fog: '#3d1a14', vign: '#120705' },
      decors: ['deco_tree2', 'deco_rock', 'deco_bush', 'deco_mushroom'],
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
      palette: { ground: '#0d1020', ground2: '#121530', decor: '#2a3060', fog: '#141a3d', vign: '#05070f' },
      decors: ['deco_pillar', 'deco_crystal', 'deco_rune', 'deco_stalag'],
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
  ELITE: { firstT: 120, interval: 90, hpMul: 14, dmgMul: 1.5, xpMul: 8, scale: 1.5 },

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
    { id: 'm_hp',     name: '生命精粹', icon: 'icon_hp',     maxLv: 5, desc: '生命上限 +10/级',   cost: [80, 160, 320, 640, 1280],  apply: function (s, lv) { s.hp += 10 * lv; } },
    { id: 'm_dmg',    name: '力量烙印', icon: 'icon_dmg',    maxLv: 5, desc: '伤害 +5%/级',       cost: [100, 200, 400, 800, 1600], apply: function (s, lv) { s.might += 0.05 * lv; } },
    { id: 'm_armor',  name: '玄铁甲片', icon: 'icon_armor',  maxLv: 3, desc: '护甲 +1/级',        cost: [150, 400, 1000],           apply: function (s, lv) { s.armor += lv; } },
    { id: 'm_speed',  name: '疾风羽饰', icon: 'icon_speed',  maxLv: 3, desc: '移速 +4%/级',       cost: [120, 300, 700],            apply: function (s, lv) { s.speed *= (1 + 0.04 * lv); } },
    { id: 'm_regen',  name: '再生秘药', icon: 'icon_hp',     maxLv: 3, desc: '生命回复 +0.2/秒/级', cost: [150, 350, 800],          apply: function (s, lv) { s.regen += 0.2 * lv; } },
    { id: 'm_cd',     name: '时之沙',   icon: 'icon_cd',     maxLv: 3, desc: '冷却 -3%/级',       cost: [200, 500, 1200],           apply: function (s, lv) { s.cd -= 0.03 * lv; } },
    { id: 'm_area',   name: '扩域符文', icon: 'icon_area',   maxLv: 3, desc: '攻击范围 +5%/级',    cost: [150, 400, 900],           apply: function (s, lv) { s.area += 0.05 * lv; } },
    { id: 'm_magnet', name: '苍磁石',   icon: 'icon_magnet', maxLv: 3, desc: '拾取范围 +15/级',    cost: [100, 250, 600],           apply: function (s, lv) { s.magnet += 15 * lv; } },
    { id: 'm_luck',   name: '黑猫护符', icon: 'icon_luck',   maxLv: 3, desc: '幸运 +10%/级',      cost: [150, 400, 1000],           apply: function (s, lv) { s.luck += 0.10 * lv; } },
    { id: 'm_growth', name: '智慧之种', icon: 'icon_growth', maxLv: 3, desc: '经验获取 +5%/级',    cost: [150, 400, 1000],          apply: function (s, lv) { s.growth += 0.05 * lv; } },
    { id: 'm_greed',  name: '贪婪王冠', icon: 'icon_gold',   maxLv: 3, desc: '金币获取 +10%/级',   cost: [200, 500, 1200],          apply: function (s, lv) { s.greed += 0.10 * lv; } },
    { id: 'm_revive', name: '不灭凤羽', icon: 'icon_revive', maxLv: 2, desc: '复活次数 +1/级',     cost: [1500, 4000],              apply: function (s, lv) { s.revive += lv; } },
    { id: 'm_reroll', name: '命运骰子', icon: 'icon_reroll', maxLv: 3, desc: '每局刷新次数 +1/级', cost: [300, 700, 1500],          apply: function (s, lv) { s.reroll = (s.reroll || 0) + lv; } },
    { id: 'm_banish', name: '放逐之印', icon: 'icon_banish', maxLv: 3, desc: '每局放逐次数 +1/级', cost: [300, 700, 1500],          apply: function (s, lv) { s.banish = (s.banish || 0) + lv; } }
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
    { id: 'a_bomb_5',     name: '爆破专家', desc: '累计使用 5 个炸弹',      cond: { type: 'bombs', n: 5 },      reward: 100 }
  ]
};
