// encyclopedia.js — 游戏百科全书:武器成长表 / 被动 / 敌人档案 / 机制说明
// 纯数据整理与文本生成,不含 DOM;由 ui.js 渲染。
window.Encyclopedia = (function () {
  'use strict';

  // 把武器某一级的增量翻译成可读文本
  var DELTA = {
    dmg: function (v) { return '伤害 +' + v; },
    count: function (v) { return '投射物 +' + v; },
    pierce: function (v) { return '穿透 +' + v; },
    chains: function (v) { return '连锁 +' + v; },
    poolDmg: function (v) { return '灼烧 +' + v; },
    cdM: function (v) { return '冷却 -' + Math.round((1 - v) * 100) + '%'; },
    areaM: function (v) { return '范围 +' + Math.round((v - 1) * 100) + '%'; },
    durM: function (v) { return '持续 +' + Math.round((v - 1) * 100) + '%'; },
    spdM: function (v) { return '弹速 +' + Math.round((v - 1) * 100) + '%'; }
  };
  function deltaText(delta) {
    var parts = [];
    for (var k in delta) if (DELTA[k]) parts.push(DELTA[k](delta[k]));
    return parts.join(' · ') || '威力提升';
  }

  // 武器基础数值摘要
  function baseText(b) {
    var out = ['伤害 ' + b.dmg, '冷却 ' + b.cd + 's'];
    if (b.count > 1) out.push('投射物 ' + b.count);
    if (b.speed) out.push('弹速 ' + b.speed);
    if (b.pierce > 0) out.push('穿透 ' + b.pierce);
    else if (b.pierce === -1) out.push('无限穿透');
    if (b.chains) out.push('连锁 ' + b.chains);
    if (b.range) out.push('射程 ' + b.range);
    if (b.slow) out.push('减速 ' + Math.round(b.slow * 100) + '%');
    if (b.poolDmg) out.push('地面灼烧 ' + b.poolDmg);
    if (b.dur) out.push('持续 ' + b.dur + 's');
    if (b.orbitR) out.push('环绕半径 ' + b.orbitR);
    return out.join(' · ');
  }

  // 全部武器条目:含 8 级成长表与进化条件
  function weapons() {
    var out = [];
    for (var id in CFG.WEAPONS) {
      var w = CFG.WEAPONS[id];
      var evo = CFG.EVOS[w.evo];
      var need = CFG.PASSIVES[w.evoNeed];
      var levels = [];
      for (var i = 0; i < w.lv.length; i++) {
        levels.push({ lv: i + 2, text: deltaText(w.lv[i]) });
      }
      var mult = [];
      if (evo.mult.dmg) mult.push('伤害 ×' + evo.mult.dmg);
      if (evo.mult.count) mult.push('投射物 +' + evo.mult.count);
      if (evo.mult.area) mult.push('范围 ×' + evo.mult.area);
      if (evo.mult.chains) mult.push('连锁 +' + evo.mult.chains);
      out.push({
        id: id, name: w.name, icon: w.icon, desc: w.desc,
        base: baseText(w.base),
        maxLv: w.lv.length + 1,
        levels: levels,
        evo: {
          name: evo.name, icon: evo.icon, desc: evo.desc,
          need: need.name, needIcon: need.icon,
          mult: mult.join(' · '),
          how: '满级(Lv.' + (w.lv.length + 1) + ') + 持有【' + need.name + '】+ 开启宝箱'
        }
      });
    }
    return out;
  }

  function passives() {
    var out = [];
    for (var id in CFG.PASSIVES) {
      var p = CFG.PASSIVES[id];
      // 逐级累计效果:用一个干净的属性对象试算
      var rows = [];
      for (var lv = 1; lv <= p.maxLv; lv++) {
        var probe = { might: 0, cd: 0, crit: 0, critDmg: 0, hp: 0, regen: 0, area: 0, speed: 100, projSpd: 0, magnet: 0, luck: 0, shieldMax: 0, shieldCd: 0 };
        p.apply(probe, lv);
        var eff = [];
        if (probe.might) eff.push('伤害 +' + Math.round(probe.might * 100) + '%');
        if (probe.cd) eff.push('冷却 ' + Math.round(probe.cd * 100) + '%');
        if (probe.crit) eff.push('暴击 +' + Math.round(probe.crit * 100) + '%');
        if (probe.critDmg) eff.push('暴伤 +' + Math.round(probe.critDmg * 100) + '%');
        if (probe.hp) eff.push('生命 +' + probe.hp);
        if (probe.regen) eff.push('回复 +' + probe.regen.toFixed(1) + '/s');
        if (probe.area) eff.push('范围 +' + Math.round(probe.area * 100) + '%');
        if (probe.speed !== 100) eff.push('移速 +' + Math.round(probe.speed - 100) + '%');
        if (probe.projSpd) eff.push('弹速 +' + Math.round(probe.projSpd * 100) + '%');
        if (probe.magnet) eff.push('拾取 +' + probe.magnet);
        if (probe.luck) eff.push('幸运 +' + Math.round(probe.luck * 100) + '%');
        if (probe.shieldMax) eff.push('护盾 ' + probe.shieldMax + '(每 ' + probe.shieldCd + 's 恢复)');
        rows.push({ lv: lv, text: eff.join(' · ') });
      }
      // 该被动能触发哪些进化
      var unlocks = [];
      for (var wid in CFG.WEAPONS) {
        if (CFG.WEAPONS[wid].evoNeed === id) unlocks.push(CFG.EVOS[CFG.WEAPONS[wid].evo].name);
      }
      out.push({ id: id, name: p.name, icon: p.icon, desc: p.desc, maxLv: p.maxLv, rows: rows, unlocks: unlocks });
    }
    return out;
  }

  var AI_TEXT = {
    chase: '直线追击玩家',
    phase: '幽灵漂移,穿过其他敌人,半透明难以察觉',
    shoot: '保持距离并远程射击',
    charge: '蓄力后高速冲锋',
    boss: 'Boss 专属招式'
  };

  var BOSS_MOVES = {
    boss_slimeking: ['跳劈:蓄力后猛冲并砸出冲击环', '落地分裂出两只小史莱姆', '被击杀时同样会分裂'],
    boss_bonelord: ['环形骨矢:一次射出 14 发放射弹幕', '每轮弹幕角度递增,需要走位穿缝'],
    boss_abysseye: ['螺旋弹幕:双向旋转吐弹,持续压制', '定期召唤 3 只缚地怨灵'],
    boss_darklord: ['径向弹幕:12 发环形齐射', '狂暴(20 分钟后):移速 ×1.6,伤害 ×2,弹幕增至 20 发', '击败即通关']
  };

  function enemies() {
    var out = [];
    for (var id in CFG.ENEMIES) {
      var d = CFG.ENEMIES[id];
      var traits = [];
      if (d.armor) traits.push('护甲 ' + d.armor + '(减免固定伤害)');
      if (d.split) traits.push('死亡时分裂为' + (CFG.ENEMIES[d.split] ? CFG.ENEMIES[d.split].name : d.split));
      if (d.ai === 'shoot') traits.push('远程 ' + d.shotDmg + ' 伤害,间隔 ' + d.shotCd + 's');
      if (d.ai === 'charge') traits.push('冲锋速度 ' + d.chargeSpd + ',冷却 ' + d.chargeCd + 's');
      if (d.spd >= 90) traits.push('高速,容易贴身');
      out.push({
        id: id, name: d.name, boss: false,
        hp: d.hp, dmg: d.dmg, spd: d.spd, xp: d.xp,
        ai: AI_TEXT[d.ai] || d.ai,
        traits: traits
      });
    }
    for (var bid in CFG.BOSSES) {
      var b = CFG.BOSSES[bid];
      out.push({
        id: bid, name: b.name, boss: true,
        hp: b.hp, dmg: b.dmg, spd: b.spd, xp: b.xp,
        ai: b.desc,
        traits: BOSS_MOVES[bid] || []
      });
    }
    return out;
  }

  // 游戏机制说明
  function mechanics() {
    var G = CFG.GAME, E2 = CFG.ELITE, D = CFG.DROPS;
    return [
      { title: '经验与升级',
        lines: [
          '击杀敌人掉落经验宝石,靠近自动吸取(拾取范围由【磁石】与【苍磁石】提升)。',
          '升级公式:每级所需经验随等级递增,升级时从 3~4 个选项中挑一个。',
          '幸运越高,出现 4 选项的概率越大。',
          '同时最多持有 ' + G.MAX_WEAPONS + ' 件武器与 ' + G.MAX_PASSIVES + ' 件被动,满了之后只会出现升级选项。'
        ] },
      { title: '武器进化',
        lines: [
          '条件:武器升到满级 + 持有它指定的被动 + 开启一个宝箱。',
          '进化会大幅强化武器并改变行为(如无限穿透、爆炸、永久环绕)。',
          '每个宝箱最多触发一次进化,优先于普通升级结算。',
          '具体进化条件见【武器】页每把武器的说明。'
        ] },
      { title: '宝箱',
        lines: [
          '来源:击杀精英怪或 Boss。',
          '开箱先判定进化,随后随机升级 1 件(小概率 3 件或 5 件)已有武器/被动。',
          '幸运提升多重奖励的概率,并额外附赠金币。',
          '若所有武器被动都已满级,则改为掉落金币。'
        ] },
      { title: '精英与 Boss',
        lines: [
          '精英:第 ' + E2.firstT + ' 秒开始,每 ' + E2.interval + ' 秒出现一只,生命 ×' + E2.hpMul + ',伤害 ×' + E2.dmgMul + ',经验 ×' + E2.xpMul + ',必掉宝箱。',
          'Boss:在固定时间点出现(5/10/15/18 分钟),血条显示在屏幕下方,必掉宝箱。',
          '击败暗潮魔王即通关;20 分钟后它会狂暴。',
          '击退对精英只有 25% 效果,对 Boss 几乎无效。'
        ] },
      { title: '掉落物',
        lines: [
          '金币:概率 ' + (D.goldChance * 100).toFixed(1) + '%,受幸运与【贪婪王冠】影响。',
          '烤肉:恢复 ' + D.healAmount + ' 点生命。',
          '磁石:立即吸取全场经验宝石。',
          '炸弹:对周围造成大量伤害并清场。',
          '怀表:全场冻结 ' + D.freezeDur + ' 秒。'
        ] },
      { title: '生存与复活',
        lines: [
          '受击后有 0.5 秒无敌帧,护甲按固定值减免每次伤害(至少受到 1 点)。',
          '持有复活次数时,倒下会原地复活并回复一半生命,附带 2.5 秒无敌与一次清场冲击波。',
          '复活次数在【强化圣坛】购买(不灭凤羽)。'
        ] },
      { title: '地图边界',
        lines: [
          '地图为 ' + (G.MAP_R * 2) + ' × ' + (G.MAP_R * 2) + ' 的有界区域,四周被暗潮结界封锁。',
          '靠近边界时屏幕外缘会泛红警示,无法再前进。',
          '点击右上角小地图(或按 M)可切换为全图模式,用于寻找远处的宝箱与道具。'
        ] },
      { title: '操作',
        lines: [
          'WASD 或方向键移动(触屏为虚拟摇杆),武器全自动攻击。',
          'ESC / P 暂停,暂停时可查阅本百科。',
          '鼠标点击右上角小地图,或按 M 键,切换小地图模式(周围 / 全图)。',
          '升级界面可用刷新(重抽选项)与丢弃(本局永久移除某选项,升级与宝箱都不再出现),次数在商店购买。'
        ] },
      { title: '无尽模式',
        lines: [
          '通关或阵亡后可进入无尽模式,敌人强度随时间持续攀升。',
          '每 180 秒随机刷一个 Boss,血量随时间放大。',
          '用于冲刷最高击杀与存活记录。'
        ] }
    ];
  }

  // 操作指南:分桌面端与移动端
  function guide() {
    return [
      { title: '🖥 桌面端',
        lines: [
          '移动:WASD 或方向键。',
          '暂停:ESC 或 P。',
          '小地图:点击右上角小地图,或按 M,切换 周围/全图 模式。',
          '索敌方式:鼠标滚轮循环切换(最近 / 最低生命 / 最高生命)。',
          '升级界面:直接点击卡片选择;可用 刷新 重抽、丢弃 永久移除某选项。',
          '角色与武器全部自动攻击,你只管走位。'
        ] },
      { title: '📱 移动端',
        lines: [
          '移动:屏幕左半区虚拟摇杆(按下并拖拽,任意方向)。',
          '暂停:右上角暂停按钮。',
          '小地图:点击右上角小地图切换 周围/全图 模式。',
          '索敌方式:小地图下方的 🎯 按钮循环切换。',
          '升级界面:点卡片选择;刷新/丢弃按钮已加大以便触控。',
          '建议横屏游玩,画面与 HUD 按比例适配,不会遮挡。'
        ] },
      { title: '🎯 索敌模式',
        lines: [
          '最近:优先攻击距离最近的敌人(默认)。',
          '最低生命:优先攻击血量最低的敌人,快速清掉残血。',
          '最高生命:优先攻击血量最高的敌人(如精英与 Boss)。',
          '当前模式显示在小地图下方,桌面滚轮 / 移动 🎯 按钮切换。'
        ] },
      { title: '🕹 通用提示',
        lines: [
          '武器全自动攻击,重点在于走位与道具规划。',
          '宝物(十字架/磁石/炸弹/怀表)拾取即生效,金币可到强化圣坛永久提升属性。',
          '联机模式:房主建房分享房间号,队友输入房号加入,共享经验与进度。'
        ] }
    ];
  }

  // 故事背景:幽默风趣,图文并茂(每章配一张精灵插图)
  function story() {
    return [
      { icon: 'char_knight', title: '序章 · 有人把灯关了',
        paras: [
          '很久很久以前,这片大陆还是太平盛世——大家按时上班,怪物按时下班,谁也没想过要加班打亡灵。',
          '直到有一天,天突然黑了。不是普通的黑,是那种"路灯全灭还飘着味"的黑。学者们管这叫"暗潮",老百姓管这叫"有人把灯关了"。',
          '于是,六位(自以为)身怀绝技的英雄站了出来。他们装备齐整、动机存疑,但至少——愿意加班。'
        ] },
      { icon: 'boss_bonelord', title: '第一章 · 亡灵的职场',
        paras: [
          '暗潮里的亡灵,其实是一群很守规矩的打工人。',
          '史莱姆负责在地上躺着,骷髅兵负责举着盾走来走去,怨灵负责飘着吓人。它们唯一的升职路径,就是往你脸上冲。',
          '至于那些精英怪和 Boss——那是管理层,管理层的工资,就是你掉落的金币。'
        ] },
      { icon: 'merchant', title: '第二章 · 生意人永远不打烊',
        paras: [
          '战场中央有个商人。他随军摆摊,风雨无阻,从不问你要不要,只问你有没有钱。',
          '有人说他其实是亡灵伪装——毕竟没有活人会冒着被砸的风险,在怪物堆里卖烤肉。但他坚持:烤肉,是拿命烤的,贵一点怎么了?',
          '他的摊子每五分钟换一次货。谁也不知道他的货从哪来。你最好也别问。'
        ] },
      { icon: 'boss_darklord', title: '第三章 · 幕后大老板',
        paras: [
          '亡灵们的幕后老板,是一个自称"暗潮之王"的家伙。他从不露面,只派手下来送死。',
          '有一种说法是,他其实是个社恐,开不了全员大会,只好每天派几个倒霉蛋来现场办公。',
          '但你只要坚持二十分钟,就能逼他亲自下场。毕竟——KPI 达不成,他也是要加班的。'
        ] },
      { icon: 'vault_chest', title: '终章 · 天亮之后',
        paras: [
          '当你终于清理完最后一批亡灵,天边泛起破晓。你会想:这一切值得吗?',
          '然后你数了数捡到的金币,觉得——值了。',
          '这,就是《破晓镇魂》。一个关于加班、金币,以及"明天还能再打一遍"的故事。'
        ] }
    ];
  }

  return {
    weapons: weapons, passives: passives, enemies: enemies, mechanics: mechanics, guide: guide, story: story
  };
})();
