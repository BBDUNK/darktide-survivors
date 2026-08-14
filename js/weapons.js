// weapons.js — 武器行为 / 子弹 / 进化 / 升级选项 / 宝箱
window.Weapons = (function () {
  'use strict';
  var E = Engine;

  // 精灵帧/帧率缓存:绘制路径不再每帧重复解析动作图集
  var _framesCache = {};
  var _fpsCache = {};
  function cachedFrames(name) {
    var c = _framesCache[name];
    if (!c) { c = SpriteGen.frames(name); _framesCache[name] = c; }
    return c;
  }
  function cachedFps(name, fallback) {
    var key = name + '|' + fallback;
    var f = _fpsCache[key];
    if (f === undefined) { f = SpriteGen.animationFps(name, fallback); _fpsCache[key] = f; }
    return f;
  }

  // ================= 子弹池 =================
  var BMAX = 320;
  var bullets = [];
  var turretList = [];
  function removeTurret(b) {
    for (var i = 0; i < turretList.length; i++) {
      if (turretList[i] === b) { turretList.splice(i, 1); return; }
    }
  }
  function initPool() {
    bullets.length = 0;
    turretList.length = 0;
    for (var i = 0; i < BMAX; i++) {
      bullets.push({
        alive: false, kind: '', spr: '', wid: '',
        x: 0, y: 0, vx: 0, vy: 0, ttl: 0, born: 0,
        dmg: 0, pierce: 0, size: 16, knock: 0,
        angle: 0, spin: 0, phase: 0,
        ox: 0, oy: 0, orbitR: 0, orbitSpd: 0,
        owner: null, ownerX: 0, ownerY: 0,
        slow: 0, slowDur: 0, stun: 0,
        aux: 0, aux2: 0, evolved: false,
        hitCd: null, // Map uid -> nextHitTime(run.t)
        hitSet: null // Set uid(一次性穿透)
      });
    }
  }

  function getBullet() {
    var oldest = null, ot = 1e18;
    for (var i = 0; i < BMAX; i++) {
      var b = bullets[i];
      if (!b.alive) {
        if (b.kind === 'turret') removeTurret(b);
        if (!b.hitCd) { b.hitCd = new Map(); b.hitSet = new Set(); }
        b.hitCd.clear(); b.hitSet.clear();
        return b;
      }
      if (b.born < ot) { ot = b.born; oldest = b; }
    }
    if (oldest.kind === 'turret') removeTurret(oldest);
    oldest.hitCd.clear(); oldest.hitSet.clear();
    return oldest;
  }

  // ================= 武器数值 =================
  function wStats(run, w) {
    var def = w.evolved ? CFG.WEAPONS[CFG.EVOS[w.evoId].of] : CFG.WEAPONS[w.id];
    var b = def.base, s = run.player.stats;
    var st = {
      dmg: b.dmg, cd: b.cd, count: b.count, speed: b.speed || 0,
      pierce: b.pierce || 0, size: b.size || 16, knock: b.knock || 0,
      chains: b.chains || 0, range: b.range || 0,
      slow: b.slow || 0, slowDur: b.slowDur || 0, stun: b.stun || 0,
      zapCount: b.zapCount || 1, holyStrike: b.holyStrike || 0,
      armorBreak: b.armorBreak || 0, leafEcho: b.leafEcho || 0,
      poolDmg: b.poolDmg || 0, poolR: b.poolR || 0, poolDur: b.poolDur || 0,
      dur: b.dur || 0, orbitR: b.orbitR || 0, zapCd: b.zapCd || 0,
      areaMul: 1, durMul: 1
    };
    for (var i = 0; i < w.lv - 1 && i < def.lv.length; i++) {
      var d = def.lv[i];
      if (d.dmg) st.dmg += d.dmg;
      if (d.count) st.count += d.count;
      if (d.pierce) st.pierce += d.pierce;
      if (d.chains) st.chains += d.chains;
      if (d.poolDmg) st.poolDmg += d.poolDmg;
      if (d.cdM) st.cd *= d.cdM;
      if (d.areaM) st.areaMul *= d.areaM;
      if (d.durM) st.durMul *= d.durM;
      if (d.spdM) st.speed *= d.spdM;
      // 控制类成长
      if (d.slow) st.slow += d.slow;
      if (d.slowDur) st.slowDur += d.slowDur;
      if (d.stun) st.stun += d.stun;
      if (d.poolDur) st.poolDur += d.poolDur;
      if (d.zapCount) st.zapCount += d.zapCount;
      if (d.holyStrike) st.holyStrike += d.holyStrike;
      if (d.armorBreak) st.armorBreak += d.armorBreak;
      if (d.leafEcho) st.leafEcho += d.leafEcho;
    }
    if (w.evolved) {
      var m = CFG.EVOS[w.evoId].mult;
      if (m.dmg) st.dmg *= m.dmg;
      if (m.count) st.count += m.count;
      if (m.area) st.areaMul *= m.area;
      if (m.chains) st.chains += m.chains;
    }
    // 本命武器加成:角色使用自己的开局武器时数值更高,
    // 保证「法师用飞弹」强于「骑士用飞弹」,但不削弱武器本身的基准值。
    var chr = run.player.char;
    if (chr && chr.weapon === w.id) {
      var AF = CFG.GAME.AFFINITY;
      st.dmg *= AF.dmg;
      st.cd *= AF.cd;
      st.areaMul *= AF.area;
      if (st.speed) st.speed *= AF.projSpd;
      st.affinity = true;
    }
    // 玩家全局属性
    st.dmg *= s.might;
    st.cd = Math.max(0.12, st.cd * s.cd);
    st.speed *= s.projSpd;
    // 联机队友光环:给弹幕加弹速与少量伤害(视觉上还会带一层金色描边)
    var p0 = run.player;
    if (p0.auraProjSpd) st.speed *= (1 + p0.auraProjSpd);
    if (p0.auraDmg) st.dmg *= (1 + p0.auraDmg);
    if (p0._bloodRageMul) st.dmg *= p0._bloodRageMul;
    if (p0._holyJudgment) { st.dmg *= 2; st.holyBossBonus = 2.5; }
    st.blessed = !!p0.auraProjSpd;
    st.areaMul *= s.area;
    st.size *= st.areaMul;
    st.orbitR *= st.areaMul;
    st.poolR *= st.areaMul;
    st.range *= st.areaMul;
    st.dur *= st.durMul;
    st.poolDur *= st.durMul;
    return st;
  }

  // ================= 开火 =================
  function spawn(run, w, st, kind, spr, x, y, vx, vy, ttl) {
    var b = getBullet();
    b.alive = true; b.kind = kind; b.spr = spr; b.wid = w.id;
    b.x = x; b.y = y; b.vx = vx; b.vy = vy;
    b.ttl = ttl; b.born = run.t;
    b.dmg = st.dmg; b.pierce = st.pierce; b.size = st.size; b.knock = st.knock;
    b.angle = Math.atan2(vy, vx); b.spin = 0; b.phase = 0;
    b.owner = run.player; b.ownerX = run.player.x; b.ownerY = run.player.y;
    b.slow = st.slow; b.slowDur = st.slowDur; b.stun = 0;
    b.aux = 0; b.aux2 = 0; b.evolved = w.evolved;
    b.arcaneMark = false; b.tankAction = ''; b.tankActionAge = 0;
    b.armorBreak = st.armorBreak || 0; b.leafEcho = st.leafEcho || 0;
    b.leafSplit = false; b.leafChild = false; b.holyBossBonus = st.holyBossBonus || 1;
    b.tankDir = 'down'; b.chargeProgress = 0;
    b.poolDmg = 0; b.poolR = 0; b.poolDur = 0; b.poolBurn = 0; b.poolBurnDur = 0;
    b.blessed = !!st.blessed;     // 受队友光环加持:绘制时加一层金光
    if (kind === 'turret') turretList.push(b);
    return b;
  }

  // 延迟发射队列:连射武器用时间差拉开箭矢间距
  var QMAX = 24;
  var queue = [];
  function initQueue() {
    queue.length = 0;
    for (var i = 0; i < QMAX; i++) {
      queue.push({ alive: false, t: 0, wid: '', angle: 0, dmg: 0, speed: 0, size: 0,
                   pierce: 0, knock: 0, owner: null, blessed: false, armorBreak: 0, leafEcho: 0,
                   holyBossBonus: 1 });
    }
  }
  function queueShot(run, wid, delay, angle, st) {
    for (var i = 0; i < QMAX; i++) {
      var q = queue[i];
      if (q.alive) continue;
      q.alive = true; q.t = delay; q.wid = wid; q.angle = angle;
      q.dmg = st.dmg; q.speed = st.speed; q.size = st.size;
      q.pierce = st.pierce; q.knock = st.knock;
      q.owner = run.player; q.blessed = !!st.blessed;
      q.armorBreak = st.armorBreak || 0; q.leafEcho = st.leafEcho || 0;
      q.holyBossBonus = st.holyBossBonus || 1;
      return;
    }
  }
  function updateQueue(run, dt) {
    for (var i = 0; i < QMAX; i++) {
      var q = queue[i];
      if (!q.alive) continue;
      q.t -= dt;
      if (q.t > 0) continue;
      q.alive = false;
      var p = q.owner || run.player;
      var b = getBullet();
      b.alive = true; b.kind = 'straight'; b.spr = 'p_arrow'; b.wid = q.wid;
      b.x = p.x; b.y = p.y;
      b.vx = Math.cos(q.angle) * q.speed; b.vy = Math.sin(q.angle) * q.speed;
      b.ttl = 1.5; b.born = run.t;
      b.dmg = q.dmg; b.pierce = q.pierce; b.size = q.size; b.knock = q.knock;
      b.angle = q.angle; b.spin = 0; b.phase = 0;
      b.slow = 0; b.slowDur = 0; b.stun = 0;
      b.aux = 0; b.aux2 = 0; b.evolved = false;
      b.armorBreak = q.armorBreak; b.leafEcho = q.leafEcho; b.leafSplit = false; b.leafChild = false;
      b.holyBossBonus = q.holyBossBonus;
      b.blessed = q.blessed; b.owner = p; b.ownerX = p.x; b.ownerY = p.y;
      AudioSys.play('shoot_arrow');
    }
  }

  var scratch = []; // 复用的候选数组

  // ================= 索敌模式 =================
  // 0 最近敌人 / 1 最低血量 / 2 最高血量;滚轮或触屏按钮循环切换
  var TARGET_MODES = [
    { key: 'nearest', name: '最近敌人' },
    { key: 'lowhp', name: '最低血量' },
    { key: 'highhp', name: '最高血量' }
  ];
  var targetMode = 0;
  function cycleTargetMode() {
    targetMode = (targetMode + 1) % TARGET_MODES.length;
    return TARGET_MODES[targetMode];
  }
  function getTargetModeName() { return TARGET_MODES[targetMode].name; }

  function nearestEnemy(x, y, r, excludeSet) {
    // 按当前索敌模式挑选目标
    var mode = TARGET_MODES[targetMode].key;
    if (mode === 'nearest') return E.gridNearest(x, y, r, excludeSet || null);
    var best = null, bestVal = mode === 'lowhp' ? 1e18 : -1;
    E.gridQuery(x, y, r, function (e) {
      if (excludeSet && excludeSet.has(e.uid)) return false;
      var v = e.hp;
      if ((mode === 'lowhp' && v < bestVal) || (mode === 'highhp' && v > bestVal)) {
        bestVal = v; best = e;
      }
      return false;
    });
    return best;
  }

  function collectInRange(x, y, r) {
    scratch.length = 0;
    E.gridQuery(x, y, r, function (e) { scratch.push(e); return false; });
    return scratch;
  }

  function fire(run, w) {
    var st = wStats(run, w);
    var p = run.player;
    var i, a, e, b;
    if (w.id !== 'holyaura') {
      p.attackAnimT = 0.31;
      p.attackAnimAge = 0;
    }
    switch (w.id) {
      case 'crossblade': {
        // Knight's sword wave is paired with a deliberate close slash: lower
        // damage than Berserker, longer cadence, and a gentle knockback.
        if (p.char && p.char.id === 'knight') {
          e = nearestEnemy(p.x, p.y, 58);
          if (e) {
            a = Math.atan2(e.y - p.y, e.x - p.x);
            b = spawn(run, w, st, 'melee', 'p_slash', p.x, p.y, 0, 0, 0.16);
            b.angle = a; b.aux = 54; b.size = st.size * 0.85;
            b.dmg = st.dmg * 0.5; b.knock = st.knock * 0.38; b.pierce = 4;
          }
          if (w.evolved) {
            e = nearestEnemy(p.x, p.y, 230);
            a = e ? Math.atan2(e.y - p.y, e.x - p.x) : Math.atan2(E.lastDir.y, E.lastDir.x);
            b = spawn(run, w, st, 'melee', 'p_slash_big', p.x, p.y, 0, 0, 0.28);
            b.angle = a; b.aux = 142; b.size = st.size * 1.45;
            b.dmg = st.dmg * 1.25; b.knock = 135; b.pierce = 9999;
            FX.ring(p.x + Math.cos(a) * 70, p.y + Math.sin(a) * 70,
              { r: 96, color: '#ffe79a', life: 0.25, width: 4 });
          }
        }
        for (i = 0; i < st.count; i++) {
          e = nearestEnemy(p.x, p.y, 300);
          a = e ? Math.atan2(e.y - p.y, e.x - p.x) + (i - (st.count - 1) / 2) * 0.2
                : Math.atan2(E.lastDir.y, E.lastDir.x) + (i - (st.count - 1) / 2) * 0.2;
          b = spawn(run, w, st, w.evolved ? 'boomerang' : 'straight',
            w.evolved ? 'p_slash_big' : 'p_slash',
            p.x, p.y, Math.cos(a) * st.speed, Math.sin(a) * st.speed, w.evolved ? 1.6 : 2.0);
          if (w.evolved) { b.pierce = 15; b.ox = p.x; b.oy = p.y; b.aux = st.speed; }
          // 未进化时穿透数量由武器等级决定(基础3,满级5),不是无限穿透
          b.spin = 0;
        }
        AudioSys.play('shoot_slash');
        break;
      }
      case 'arcanebolt': {
        for (i = 0; i < st.count; i++) {
          e = nearestEnemy(p.x, p.y, 350);
          a = e ? Math.atan2(e.y - p.y, e.x - p.x) + (Math.random() - 0.5) * 0.8
                : Math.random() * Math.PI * 2;
          b = spawn(run, w, st, 'homing', 'p_arcane_orb', p.x, p.y,
            Math.cos(a) * st.speed, Math.sin(a) * st.speed, 3.5);
          b.aux = st.speed;
          // Lv3 unlocks Arcane Refraction; Lv5 adds the three-second Void
          // Brand.  Evolved orbs gain one further jump without allowing the
          // same orb to bounce between two already-hit targets forever.
          b.pierce = (w.lv >= 3 ? 1 : 0) + (w.lv >= 6 ? 1 : 0) + (w.evolved ? 1 : 0);
          b.arcaneMark = w.lv >= 5 || w.evolved;
        }
        AudioSys.play('shoot_bolt');
        break;
      }
      case 'windbow': {
        e = nearestEnemy(p.x, p.y, 300);
        var wbBase = e ? Math.atan2(e.y - p.y, e.x - p.x) : Math.atan2(E.lastDir.y, E.lastDir.x);
        if (w.evolved) return; // updateRangerUltimate owns charge and release.
        // 未进化:同向连射。第一支立即发出,其余排入延迟队列,
        // 靠时间差拉开间距(同帧生成再做空间偏移会同步飞行,看起来仍是叠在一起)。
        spawn(run, w, st, 'straight', 'p_arrow', p.x, p.y,
          Math.cos(wbBase) * st.speed, Math.sin(wbBase) * st.speed, 1.5);
        for (i = 1; i < st.count; i++) {
          queueShot(run, w.id, i * 0.26, wbBase, st);
        }
        AudioSys.play('shoot_arrow');
        break;
      }
      case 'holyaura': return; // 光环在 update 里持续处理
      case 'whirlaxe': {
        if (!p.char || p.char.id !== 'berserker') return;
        e = nearestEnemy(p.x, p.y, st.range * 1.7);
        // A reach weapon should never swing at empty air: both the visual and
        // hit volume begin only when a target enters its real attack range.
        if (!e) return;
        a = Math.atan2(e.y - p.y, e.x - p.x);
        b = spawn(run, w, st, 'melee', 'p_slash_big', p.x, p.y, 0, 0, 0.24);
        b.angle = a; b.aux = st.range; b.size = st.size * 1.35; b.pierce = 9999;
        AudioSys.play('shoot_axe');
        break;
      }
      case 'chainlight': {
        for (i = 0; i < st.count; i++) chainZap(run, w, st, p.x, p.y);
        break;
      }
      case 'frostnova': {
        b = spawn(run, w, st, 'nova', '', p.x, p.y, 0, 0, 0.8);
        b.aux = st.speed;  // 扩张速度
        b.aux2 = st.size;  // 最大半径
        b.pierce = 9999;
        AudioSys.play('nova');
        break;
      }
      case 'fireflask': {
        for (i = 0; i < st.count; i++) {
          e = nearestEnemy(p.x, p.y, 280, null);
          var tx, ty;
          if (e && Math.random() < 0.8) { tx = e.x + (Math.random() * 60 - 30); ty = e.y + (Math.random() * 60 - 30); }
          else { a = Math.random() * Math.PI * 2; var d = 90 + Math.random() * 180; tx = p.x + Math.cos(a) * d; ty = p.y + Math.sin(a) * d; }
          b = spawn(run, w, st, 'lob', 'p_fireflask', p.x, p.y, 0, 0, 0.7);
          b.ox = p.x; b.oy = p.y; b.aux = tx; b.aux2 = ty;
          b.spin = 6;
          b.poolDmg = st.poolDmg * (w.evolved ? 1.6 : 1);
          b.poolR = st.poolR * 2;
          b.poolDur = st.poolDur;
          b.poolBurn = st.dmg * 0.35;
          b.poolBurnDur = 5 + Math.min(5, w.lv - 1);
        }
        AudioSys.play('shoot_flask');
        break;
      }
      case 'shadowdagger': {
        for (i = 0; i < st.count; i++) {
          e = nearestEnemy(p.x + (Math.random() * 120 - 60), p.y + (Math.random() * 120 - 60), 300);
          a = e ? Math.atan2(e.y - p.y, e.x - p.x)
                : Math.atan2(E.lastDir.y, E.lastDir.x) + (Math.random() - 0.5) * 0.4;
          b = spawn(run, w, st, 'straight', 'p_shadow', p.x, p.y,
            Math.cos(a) * st.speed, Math.sin(a) * st.speed, 1.1);
          if (w.evolved) { b.kind = 'ricochet'; b.pierce += 2; }
        }
        AudioSys.play('shoot_dagger');
        break;
      }
      case 'orbitblade': {
        // 已有存活刀片则不重复生成
        if (countKind(w.id, p) > 0) return;
        if (w.evolved) {
          b = spawn(run, w, st, 'divineSword', 'p_orbitblade_fly', p.x, p.y, 0, 0, 1e9);
          b.size = 44; b.dmg = st.dmg * 1.7; b.pierce = 9999; b.aux = 560;
          AudioSys.play('evolve');
          break;
        }
        for (i = 0; i < st.count; i++) {
          b = spawn(run, w, st, 'orbit', 'p_orbitblade', p.x, p.y, 0, 0,
            st.dur);
          b.phase = (Math.PI * 2 / st.count) * i;
          b.orbitR = st.orbitR; b.orbitSpd = 3.2;
          b.pierce = 9999;
        }
        AudioSys.play('shoot_slash');
        break;
      }
      case 'holytome': {
        // 进化后的秘典不再是两本小书打转，而是维持一只独立的大恶魔。
        // 其轨道会主动朝附近目标偏移，由 update 的 demon 分支负责追猎。
        if (w.evolved) {
          if (countKind(w.id, p) > 0) return;
          b = spawn(run, w, st, 'demon', 'vfx_spirit', p.x, p.y, 0, 0, 1e9);
          b.phase = run.t * 1.4;
          b.orbitR = 82 * (w.area || 1); b.orbitSpd = 1.8;
          b.pierce = 9999; b.dmg = st.dmg * 2.5; b.size = 18;
          b.huntX = p.x; b.huntY = p.y;
          AudioSys.play('evolve');
          break;
        }
        for (i = 0; i < st.count; i++) {
          a = (Math.PI * 2 / st.count) * i + run.t * 0.7;
          b = spawn(run, w, st, 'boomerang', 'p_book', p.x, p.y,
            Math.cos(a) * st.speed, Math.sin(a) * st.speed, 3.0);
          b.ox = p.x; b.oy = p.y; b.aux = st.speed;
          b.pierce = 9999; b.spin = 7;
        }
        AudioSys.play('shoot_book');
        break;
      }
      case 'teslacoil': {
        if (w.evolved) {
          if (countKind(w.id, p) > 0) return;
          b = spawn(run, w, st, 'tank', 'tesla_battle_tank', p.x, p.y, 0, 0, 1e9);
          b.fireT = 3; b.pierce = 9999; b.dmg = st.dmg * 4.2; b.size = 76;
          b.zapN = st.zapCount + 2; b.orbitR = st.range * 1.15;
          b.tankDir = p.dir || 'down'; b.tankAction = 'idle'; b.tankActionAge = 0;
          AudioSys.play('evolve');
          break;
        }
        // Stable, collision-aware sites keep an entire late-game volley apart
        // instead of stacking all towers on a single point near the hero.
        var firstSite = w.deploySite || 0;
        w.deploySite = firstSite + st.count;
        for (i = 0; i < st.count; i++) {
          var site = findTeslaSite(run.player, firstSite + i);
          b = spawn(run, w, st, 'turret', 'p_turret',
            site.x, site.y, 0, 0, st.dur);
          b.aux = st.zapCd * run.player.stats.cd; // 电击间隔
          b.aux2 = 0;
          b.orbitR = st.range;
          b.zapN = st.zapCount + (w.evolved ? 2 : 0);   // 多道闪电数量
          b.overload = w.lv >= 3 || w.evolved;
          b.overloadDmg = st.dmg * (0.85 + w.lv * 0.12);
          b.overloadR = st.range * (0.78 + w.lv * 0.035);
        }
        AudioSys.play('turret_place');
        break;
      }
    }
  }

  function countKind(wid, owner) {
    var n = 0;
    for (var i = 0; i < BMAX; i++) {
      if (bullets[i].alive && bullets[i].wid === wid && (!owner || bullets[i].owner === owner)) n++;
    }
    return n;
  }

  // Choose a fixed constellation slot around the current owner, but reject
  // any candidate that would visually overlap a live tower.  The candidate
  // order rotates between casts, retaining a natural ring distribution while
  // preserving a clear path through the player's immediate surroundings.
  function findTeslaSite(owner, seed) {
    var best = null, bestClear = -1;
    for (var i = 0; i < 48; i++) {
      var slot = seed + i;
      var a = (slot % 16) * Math.PI / 8;
      var ring = [210, 270, 330][Math.floor(slot / 16) % 3];
      var x = owner.x + Math.cos(a) * ring;
      var y = owner.y + Math.sin(a) * ring;
      var nearest = 1e18;
      for (var bi = 0; bi < BMAX; bi++) {
        var other = bullets[bi];
        if (!other.alive || other.kind !== 'turret' || other.wid !== 'teslacoil' || other.owner !== owner) continue;
        nearest = Math.min(nearest, E.dist2(x, y, other.x, other.y));
      }
      // 128 px leaves a real visual gutter around the 112 px tower art.
      if (nearest >= 128 * 128) return { x: x, y: y };
      if (nearest > bestClear) { bestClear = nearest; best = { x: x, y: y }; }
    }
    return best || { x: owner.x + 210, y: owner.y };
  }

  function chainZap(run, w, st, sx, sy) {
    var cands = collectInRange(sx, sy, st.range || 260);
    if (!cands.length) return;
    var cur = cands[Math.floor(Math.random() * cands.length)];
    var hit = new Set();
    var px = sx, py = sy;
    var n = st.chains + 1;
    for (var i = 0; i < n && cur; i++) {
      FX.lightning(px, py, cur.x, cur.y, w.evolved ? '#aef' : '#ffe97a');
      Entities.damageEnemy(run, cur, st.dmg, { stun: st.stun + (w.evolved ? 0.5 : 0) });
      hit.add(cur.uid);
      px = cur.x; py = cur.y;
      cur = nearestEnemy(px, py, 180, hit);
    }
    AudioSys.play('zap');
    FX.shake(1.5, 0.1);
  }

  // ================= 子弹更新 =================
  // 命中检测:一次性(hitSet)或周期性(hitCd);复用回调避免每帧闭包分配
  var _hitB = null, _hitRun = null, _hitCdSec = 0, _hitAny = false, _hitOpts = { kx: 0, ky: 0, slow: 0, slowDur: 0, stun: 0 };
  var _hitBurn = 0, _hitBurnDur = 0;
  function hitCb(e) {
    var b = _hitB;
    // 客户端纯视觉模式:只做运动与命中闪烁,不结算任何伤害
    if (_hitRun._netVisual) return false;
    if (_hitCdSec > 0) {
      var next = b.hitCd.get(e.uid) || 0;
      if (_hitRun.t < next) return false;
      b.hitCd.set(e.uid, _hitRun.t + _hitCdSec);
    } else {
      if (b.hitSet.has(e.uid)) return false;
      b.hitSet.add(e.uid);
    }
    var kb = b.knock || 0;
    var d = Math.hypot(b.vx, b.vy) || 1;
    _hitOpts.kx = kb * (b.vx / d); _hitOpts.ky = kb * (b.vy / d);
    _hitOpts.slow = b.slow; _hitOpts.slowDur = b.slowDur; _hitOpts.stun = b.stun;
    var holyTarget = e.boss || e.id === 'ghost' || e.id === 'skeleton' ||
      e.id === 'wraith' || e.id === 'zombie' || e.id === 'mummy';
    var dealt = b.dmg * (holyTarget ? (b.holyBossBonus || 1) : 1);
    Entities.damageEnemy(_hitRun, e, dealt, _hitOpts);
    if (b.armorBreak) {
      e.armorBreakValue = Math.max(e.armorBreakValue || 0, 2 + b.armorBreak * 2);
      e.armorBreakUntil = Math.max(e.armorBreakUntil || 0, _hitRun.t + 3);
    }
    if (b.leafEcho && !b.leafChild && !b.leafSplit) {
      b.leafSplit = true;
      var leafExclude = new Set(b.hitSet);
      for (var leafIndex = -1; leafIndex <= 1; leafIndex += 2) {
        var leafTarget = nearestEnemy(e.x, e.y, 230, leafExclude);
        if (leafTarget) leafExclude.add(leafTarget.uid);
        var leafAngle = leafTarget ? Math.atan2(leafTarget.y - e.y, leafTarget.x - e.x)
          : b.angle + leafIndex * 0.48;
        var leaf = getBullet();
        if (leaf === b) break;
        leaf.alive = true; leaf.kind = 'homing'; leaf.spr = 'p_arrow'; leaf.wid = b.wid;
        leaf.x = e.x; leaf.y = e.y; leaf.vx = Math.cos(leafAngle) * 390; leaf.vy = Math.sin(leafAngle) * 390;
        leaf.ttl = 1.2; leaf.born = _hitRun.t; leaf.dmg = b.dmg * 0.45; leaf.pierce = 0;
        leaf.size = b.size * 0.72; leaf.knock = b.knock * 0.4; leaf.angle = leafAngle;
        leaf.aux = 390; leaf.owner = b.owner; leaf.ownerX = b.ownerX; leaf.ownerY = b.ownerY;
        leaf.slow = 0; leaf.slowDur = 0; leaf.stun = 0; leaf.evolved = false;
        leaf.armorBreak = 0; leaf.leafEcho = 0; leaf.leafChild = true; leaf.leafSplit = false;
        leaf.holyBossBonus = b.holyBossBonus || 1; leaf.blessed = b.blessed;
      }
    }
    if (b.arcaneMark) {
      // A second orb detonates the existing brand, then refreshes it.  The
      // area query is authoritative only and never feeds back into this orb's
      // hit set, so it cannot create recursive bounce chains.
      if (e.arcaneMarkUntil && e.arcaneMarkUntil > _hitRun.t) {
        var markRun = _hitRun, markDmg = b.dmg * 0.6, markTarget = e;
        E.gridQuery(e.x, e.y, 58, function (near) {
          if (near !== markTarget) Entities.damageEnemy(markRun, near, markDmg, { noCrit: true });
          return false;
        });
        FX.sprite(e.x, e.y, 'vfx_explosion', 0.38, 62, true);
      }
      e.arcaneMarkUntil = _hitRun.t + 3;
    }
    AudioSys.play(Math.random() < 0.5 ? 'hit1' : 'hit2');
    FX.trail(e.x, e.y, '#fff', 2);
    // 命中火花(低配:四分之一概率,避免高频武器把粒子池打满)
    if ((_hitRun.frame & 3) === 0) FX.burst(e.x, e.y, { color: '#ffe9a3', n: 2, speed: 40, life: 0.2, size: 1.5 });
    if (_hitCdSec === 0) {
      b.pierce--;
      if (b.pierce < 0) { b.alive = false; return true; }
    }
    _hitAny = true;
    return false;
  }
  function hitEnemiesAlong(run, b, radius, cdSec) {
    _hitB = b; _hitRun = run; _hitCdSec = cdSec; _hitAny = false;
    E.gridQuery(b.x, b.y, radius + 14, hitCb);
    return _hitAny;
  }

  // 火池命中:解除冰霜减速 + 施加持续灼烧(与普通弹幕的 hitCb 分开,逻辑不同)
  var _poolHitCb = function (e) {
    var b = _hitB;
    if (_hitRun._netVisual) return false;
    var next = b.hitCd.get(e.uid) || 0;
    if (_hitRun.t < next) return false;
    b.hitCd.set(e.uid, _hitRun.t + _hitCdSec);
    // 火焰解除冰霜减速:清掉减速状态
    Entities.clearSlow(e);
    // 灼烧:持续伤害
    Entities.damageEnemy(_hitRun, e, b.dmg, { burn: _hitBurn, burnDur: _hitBurnDur, fire: true });
    if ((_hitRun.frame & 3) === 0) FX.trail(e.x, e.y, '#ff8844', 2);
    return false;
  };

  function releaseTeslaOverload(run, b) {
    if (!b.overload) return;
    var damage = b.overloadDmg || b.dmg;
    var radius = b.overloadR || b.orbitR * 0.8;
    if (!run._netVisual) E.gridQuery(b.x, b.y, radius, function (e) {
      Entities.damageEnemy(run, e, damage, { stun: 0.45, kx: (e.x - b.x) * 0.75, ky: (e.y - b.y) * 0.75 });
      return false;
    });
    FX.sprite(b.x, b.y, 'vfx_tesla_overload', 0.68, radius * 2.12, true);
    FX.burst(b.x, b.y, { color: '#b9f8ff', n: 18, speed: 210, life: 0.5, size: 3, glow: true });
    AudioSys.play('zap');
  }

  function updateBullets(run, dt) {
    var p = run.player;
    for (var i = 0; i < BMAX; i++) {
      var b = bullets[i];
      if (!b.alive) continue;
      var ownerX = run._netVisual ? b.ownerX : (b.owner ? b.owner.x : p.x);
      var ownerY = run._netVisual ? b.ownerY : (b.owner ? b.owner.y : p.y);
      b.ttl -= dt;
      if (b.ttl <= 0) {
        if (b.kind === 'lob') landFlask(run, b);
        if (b.kind === 'turret') { releaseTeslaOverload(run, b); removeTurret(b); }
        if (b.kind === 'teslaCannon') {
          FX.sprite(b.x, b.y, 'vfx_tesla_cannon_impact', 0.56, 128, true);
          FX.shake(8, 0.28);
        }
        b.alive = false;
        continue;
      }
      switch (b.kind) {
        case 'straight':
        case 'ricochet':
        case 'dragon':
          b.x += b.vx * dt; b.y += b.vy * dt;
          // 剑气和箭矢保持发射朝向,不再逐帧跟随速度旋转
          if (b.spr !== 'p_slash' && b.spr !== 'p_slash_big' && b.spr !== 'p_arrow') {
            b.angle = Math.atan2(b.vy, b.vx);
          }
          if (b.kind === 'dragon') {
            // 绿龙:全路径粒子尾迹 + 大范围命中
            if ((run.frame & 1) === 0) FX.trail(b.x, b.y, '#44ff88', 4);
            hitEnemiesAlong(run, b, b.size * 0.7, 0.25);
          } else if (b.kind === 'ricochet') {
            if (hitEnemiesAlong(run, b, b.size * 0.5, 0) && b.alive) {
              var nx = nearestEnemy(b.x, b.y, 260, b.hitSet);
              if (nx) {
                var d = Math.hypot(b.vx, b.vy);
                var a = Math.atan2(nx.y - b.x, nx.x - b.x);
                b.vx = Math.cos(a) * d; b.vy = Math.sin(a) * d;
                if (b.spr !== 'p_slash' && b.spr !== 'p_slash_big' && b.spr !== 'p_arrow') b.angle = a;
              }
            }
          } else {
            hitEnemiesAlong(run, b, b.size * 0.5, 0);
          }
          break;
        case 'homing': {
          var tgt = nearestEnemy(b.x, b.y, 420, b.hitSet);
          if (tgt) {
            var ta = Math.atan2(tgt.y - b.y, tgt.x - b.x);
            var ca = Math.atan2(b.vy, b.vx);
            var da = ta - ca;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            ca += E.clamp(da, -4.5 * dt, 4.5 * dt);
            b.vx = Math.cos(ca) * b.aux; b.vy = Math.sin(ca) * b.aux;
          }
          b.x += b.vx * dt; b.y += b.vy * dt;
          b.angle = Math.atan2(b.vy, b.vx);
          if ((run.frame & 3) === 0) FX.trail(b.x, b.y, b.evolved ? '#c9f' : '#96f', 2);
          var before = b.alive;
          hitEnemiesAlong(run, b, b.size * 0.6, 0);
          if (before && !b.alive && b.evolved) { // 奥术爆炸
            FX.explosion(b.x, b.y, 40);
            var bb = b;
            if (!run._netVisual) {
              E.gridQuery(b.x, b.y, 52, function (e) {
                Entities.damageEnemy(run, e, bb.dmg * 0.6, { noCrit: true });
                return false;
              });
            }
          }
          break;
        }
        case 'teslaCannon':
          b.x += b.vx * dt; b.y += b.vy * dt;
          b.angle = Math.atan2(b.vy, b.vx);
          hitEnemiesAlong(run, b, b.size * 0.42, 0.16);
          if ((run.frame & 1) === 0) FX.trail(b.x, b.y, '#9ff4ff', 7);
          break;
        case 'axe':
          b.vy += 620 * dt;
          b.x += b.vx * dt; b.y += b.vy * dt;
          b.angle += b.spin * dt;
          hitEnemiesAlong(run, b, b.size * 0.62, 0.3);
          break;
        case 'melee': {
          b.x = ownerX + Math.cos(b.angle) * b.aux * 0.56;
          b.y = ownerY + Math.sin(b.angle) * b.aux * 0.56;
          b.phase += dt * 13;
          hitEnemiesAlong(run, b, Math.max(b.size, b.aux * 0.42), 0.16);
          break;
        }
        case 'tank': {
          // The authored chassis follows the player but keeps its own action
          // clock.  A visible 0.85 s charge precedes every slow, readable
          // electromagnetic shell; the roof coil remains independently live.
          b.x = ownerX; b.y = ownerY + 8;
          var tankOwner = b.owner || p;
          var nextDir = tankOwner.dir || b.tankDir || 'down';
          b.tankDir = nextDir;
          b.fireT -= dt;
          var tankAction = b.fireT <= 0.85 ? 'attack' : (tankOwner.moving ? 'walk' : 'idle');
          if (tankAction !== b.tankAction) { b.tankAction = tankAction; b.tankActionAge = 0; }
          else b.tankActionAge += dt;
          b.chargeProgress = tankAction === 'attack' ? E.clamp((0.85 - b.fireT) / 0.85, 0, 1) : 0;
          if (b.fireT <= 0) {
            b.fireT = 3;
            var dirVec = b.tankDir === 'left' ? { x: -1, y: 0 }
              : b.tankDir === 'right' ? { x: 1, y: 0 }
              : b.tankDir === 'up' ? { x: 0, y: -1 } : { x: 0, y: 1 };
            var tankA = Math.atan2(dirVec.y, dirVec.x);
            var tankWeapon = { id: b.wid, evolved: true };
            var blast = spawn(run, tankWeapon, { dmg: b.dmg, size: 76, pierce: 9999, knock: 200 }, 'teslaCannon', 'p_tesla_cannon',
              b.x + dirVec.x * 48, b.y + dirVec.y * 48, dirVec.x * 270, dirVec.y * 270, 2.15);
            blast.size = 76; blast.pierce = 9999; blast.dmg = b.dmg; blast.knock = 230;
            FX.sprite(b.x + dirVec.x * 44, b.y + dirVec.y * 44, 'vfx_tesla_cannon_impact', 0.24, 76, true);
            AudioSys.play('zap');
          }
          if ((run.frame % 20) === 0) chainZap(run, { id: b.wid, evolved: true }, { dmg: b.dmg * 0.25, chains: b.zapN, range: b.orbitR, stun: 0.18 }, b.x, b.y - 24);
          break;
        }
        case 'boomerang': {
          b.phase += dt;
          var out = b.phase < (b.ttl + b.phase) * 0.42; // 前 42% 时间外飞
          if (b.kind === 'boomerang') {
            if (out) { b.x += b.vx * dt; b.y += b.vy * dt; }
            else { // 折返回玩家
              var dxp = ownerX - b.x, dyp = ownerY - b.y;
              var dd = Math.hypot(dxp, dyp) || 1;
              var sp = b.aux * 1.25;
              b.x += dxp / dd * sp * dt; b.y += dyp / dd * sp * dt;
              if (dd < 24 && b.phase > 0.5) { b.alive = false; continue; }
            }
          }
          b.angle += (b.spin || 5) * dt;
          hitEnemiesAlong(run, b, b.size * 0.62, 0.35);
          break;
        }
        case 'nova': {
          b.phase += b.aux * dt; // 当前半径
          var r = Math.min(b.phase, b.aux2);
          var bn = b;
          E.gridQuery(b.x, b.y, r + 10, function (e) {
            if (bn.hitSet.has(e.uid)) return false;
            var dd2 = E.dist2(e.x, e.y, bn.x, bn.y);
            if (dd2 < (r + 8) * (r + 8) && dd2 > (r - 26) * (r - 26)) {
              bn.hitSet.add(e.uid);
              var kills = bn.evolved && Math.random() < 0.12 && !e.boss && !e.elite;
              if (!run._netVisual) {
                Entities.damageEnemy(run, e, kills ? e.hp + 999 : bn.dmg, {
                  slow: bn.slow, slowDur: bn.slowDur,
                  kx: (e.x - bn.x) * 0.8, ky: (e.y - bn.y) * 0.8
                });
              }
              if (kills) FX.burst(e.x, e.y, { color: '#bff', n: 10, speed: 120, life: 0.4, size: 2 });
            }
            return false;
          });
          break;
        }
        case 'lob': {
          var tt = 1 - b.ttl / 0.7;
          b.x = E.lerp(b.ox, b.aux, tt);
          b.y = E.lerp(b.oy, b.aux2, tt) - Math.sin(tt * Math.PI) * 80;
          b.angle += b.spin * dt;
          break;
        }
        case 'pool': {
          // 火池持续净化范围内的蛛网弹与角色缠身
          if ((run.frame % 20) === 0) Entities.cleanseWebs(run, b.x, b.y, b.size * 0.6);
          if ((run.frame & 3) === 0) FX.trail(b.x + (Math.random() - 0.5) * b.size, b.y + (Math.random() - 0.5) * b.size * 0.7, '#f96', 3);
          // 火池命中:解除冰霜减速,并施加持续灼烧(burnDur 随武器等级成长 5→10 秒)
          _hitB = b; _hitRun = run; _hitCdSec = 0.45; _hitAny = false;
          _hitBurn = b.poolBurn; _hitBurnDur = b.poolBurnDur;
          E.gridQuery(b.x, b.y, b.size * 0.55 + 14, _poolHitCb);
          break;
        }
        case 'orbit': {
          b.phase += b.orbitSpd * dt;
          b.x = ownerX + Math.cos(b.phase) * b.orbitR;
          b.y = ownerY + Math.sin(b.phase) * b.orbitR;
          b.angle = b.phase + Math.PI / 2;
          hitEnemiesAlong(run, b, b.size * 0.62, 0.4);
          break;
        }
        case 'demon': {
          // 环绕主人，但会主动向最近敌人游猎；没有目标时平稳回到轨道。
          b.phase += b.orbitSpd * dt;
          var prey = nearestEnemy(b.x, b.y, 280);
          var homeX = ownerX + Math.cos(b.phase) * b.orbitR;
          var homeY = ownerY + Math.sin(b.phase) * b.orbitR;
          var tx = prey ? prey.x : homeX, ty = prey ? prey.y : homeY;
          var follow = prey ? 4.6 : 2.8;
          b.x += (tx - b.x) * Math.min(1, dt * follow);
          b.y += (ty - b.y) * Math.min(1, dt * follow);
          b.angle = Math.atan2(ty - b.y, tx - b.x);
          hitEnemiesAlong(run, b, b.size * 0.72, 0.28);
          break;
        }
        case 'guideDragon': {
          var pointer = E.pointerState;
          var isDesktopPointer = pointer && pointer.active && pointer.type !== 'touch';
          var dragonTarget = isDesktopPointer ? {
            x: E.cam.x + pointer.x - CFG.GAME.W / 2,
            y: E.cam.y + pointer.y - CFG.GAME.H / 2
          } : nearestEnemy(b.x, b.y, 620);
          var dgx = dragonTarget ? dragonTarget.x : ownerX + E.lastDir.x * 160;
          var dgy = dragonTarget ? dragonTarget.y : ownerY + E.lastDir.y * 160;
          dgx = E.clamp(dgx, ownerX - CFG.GAME.W / 2 + 42, ownerX + CFG.GAME.W / 2 - 42);
          dgy = E.clamp(dgy, ownerY - CFG.GAME.H / 2 + 42, ownerY + CFG.GAME.H / 2 - 42);
          var dgdx = dgx - b.x, dgdy = dgy - b.y, dgdist = Math.hypot(dgdx, dgdy) || 1;
          var dgstep = Math.min(dgdist, b.aux * dt);
          b.vx = dgdx / dgdist * b.aux; b.vy = dgdy / dgdist * b.aux;
          b.x += dgdx / dgdist * dgstep; b.y += dgdy / dgdist * dgstep;
          b.angle = Math.atan2(dgdy, dgdx);
          if ((run.frame & 1) === 0) FX.trail(b.x, b.y, '#55e88a', 4);
          hitEnemiesAlong(run, b, b.size * 0.78, 0.16);
          break;
        }
        case 'dragonLance': {
          b.x += b.vx * dt; b.y += b.vy * dt;
          b.angle = Math.atan2(b.vy, b.vx);
          if ((run.frame & 1) === 0) FX.trail(b.x, b.y, '#63efa8', 5);
          // A finite 900px flight, with a per-target cadence rather than
          // accidental per-frame damage stacking.
          hitEnemiesAlong(run, b, b.size * 0.68, 0.18);
          break;
        }
        case 'divineSword': {
          var swordTarget = nearestEnemy(b.x, b.y, 1400) || nearestEnemy(ownerX, ownerY, 1800);
          var swx = swordTarget ? swordTarget.x : ownerX + Math.cos(run.t * 1.8) * 240;
          var swy = swordTarget ? swordTarget.y : ownerY + Math.sin(run.t * 1.8) * 180;
          var swdx = swx - b.x, swdy = swy - b.y, swdist = Math.hypot(swdx, swdy) || 1;
          b.vx = swdx / swdist * b.aux; b.vy = swdy / swdist * b.aux;
          b.x += b.vx * dt; b.y += b.vy * dt; b.angle = Math.atan2(b.vy, b.vx);
          if ((run.frame & 1) === 0) FX.trail(b.x, b.y, '#ffe596', 5);
          hitEnemiesAlong(run, b, b.size * 0.82, 0.13);
          break;
        }
        case 'angel': {
          b.phase += dt * 1.35;
          var angelTarget = nearestEnemy(b.x, b.y, b.orbitR);
          var agx = angelTarget ? angelTarget.x : ownerX + Math.cos(b.phase) * b.orbitR * 0.62;
          var agy = angelTarget ? angelTarget.y : ownerY + Math.sin(b.phase) * b.orbitR * 0.46;
          b.x += (agx - b.x) * Math.min(1, dt * 5.2);
          b.y += (agy - b.y) * Math.min(1, dt * 5.2);
          b.angle = 0;
          hitEnemiesAlong(run, b, b.size * 0.52, 0.22);
          break;
        }
        case 'turret': {
          b.zapFlash = Math.max(0, (b.zapFlash || 0) - dt);
          b.aux2 -= dt;
          if (b.aux2 <= 0) {
            b.aux2 = b.aux;
            // 多道闪电:一次放电同时打 zapCount 个不同目标
            var nZap = Math.max(1, b.zapN || 1);
            _zapHit.clear();
            var zapped = 0;
            for (var zi = 0; zi < nZap; zi++) {
              var te = nearestEnemy(b.x, b.y, b.orbitR, _zapHit);
              if (!te) break;
              _zapHit.add(te.uid);
              FX.lightning(b.x, b.y - 92, te.x, te.y, '#8ef');
              if (!run._netVisual) Entities.damageEnemy(run, te, b.dmg, {});
              zapped++;
              if (b.evolved) { // 天网:每道再链一跳
                var t2 = nearestEnemy(te.x, te.y, 150, _zapHit);
                if (t2) {
                  _zapHit.add(t2.uid);
                  FX.lightning(te.x, te.y, t2.x, t2.y, '#8ef');
                  if (!run._netVisual) Entities.damageEnemy(run, t2, b.dmg * 0.7, {});
                }
              }
            }
            if (zapped) {
              b.zapFlash = 0.46;
              AudioSys.play('zap');
              FX.burst(b.x, b.y - 94, { color: '#8ef', n: 7, speed: 120, life: 0.28, size: 2.2, glow: true });
              FX.ring(b.x, b.y - 92, { r: 22, color: '#8ef', life: 0.22, width: 2 });
            }
            // 塔间电弧:与射程内的另一座塔连线,对连线附近敌人造成伤害
            for (var tj = 0; tj < turretList.length; tj++) {
              var ob = turretList[tj];
              if (ob === b || !ob.alive) continue;
              var ad = Math.hypot(ob.x - b.x, ob.y - b.y);
              if (ad > 260 || ad < 1) continue;
              FX.lightning(b.x, b.y - 92, ob.x, ob.y - 92, '#bdf');
              // 沿电弧采样几个点做范围伤害
              var steps = Math.max(2, Math.round(ad / 40));
              for (var sk = 1; sk < steps; sk++) {
                var ax = E.lerp(b.x, ob.x, sk / steps), ay = E.lerp(b.y, ob.y, sk / steps);
                E.gridQuery(ax, ay, 26, function (en) {
                  if (_zapHit.has(en.uid)) return false;
                  _zapHit.add(en.uid);
                  if (!run._netVisual) Entities.damageEnemy(run, en, b.dmg * 0.5, { stun: 0.1 });
                  return false;
                });
              }
              break;   // 每次只连一条,避免多塔时伤害爆炸
            }
          }
          break;
        }
      }
    }
  }

  var _zapHit = new Set();   // 一次放电内已命中的目标,避免多道闪电打同一个
  var _tmpSet = new Set();
  function tmpSet(uid) { _tmpSet.clear(); _tmpSet.add(uid); return _tmpSet; }

  function landFlask(run, b) {
    FX.explosion(b.x, b.y, 30);
    AudioSys.play('bomb');
    // 命中直伤(fire 标记:对蛛类双倍)
    var bb = b;
    if (!run._netVisual) {
      E.gridQuery(b.x, b.y, 40, function (e) {
        Entities.damageEnemy(run, e, bb.dmg, { fire: true });
        return false;
      });
    }
    // 火焰净化:烧掉角色身上的蛛网,并清掉爆点附近飞行中的蛛网弹
    Entities.cleanseWebs(run, b.x, b.y, 120);
    // Ground fire is a static post-impact effect: never replay the bottle
    // shatter frames.  The evolved flask lays five persistent pools in a real
    // cross, so the additional area is readable and has matching hit volumes.
    function layPool(px, py, radiusMul, durationMul) {
      var pool = getBullet();
      pool.alive = true; pool.kind = 'pool'; pool.spr = 'p_firepool'; pool.wid = b.wid;
      pool.x = px; pool.y = py; pool.vx = 0; pool.vy = 0;
      pool.born = run.t;
      pool.owner = b.owner; pool.ownerX = b.ownerX; pool.ownerY = b.ownerY;
      // The launch snapshot owns every numeric value; in co-op, another
      // player's build can therefore never change a landed fire field.
      pool.dmg = (b.poolDmg || b.dmg * 0.8) * (radiusMul < 1 ? 0.76 : 1);
      pool.size = (b.poolR || 90) * radiusMul;
      pool.ttl = (b.poolDur || 3) * durationMul;
      pool.pierce = 9999; pool.knock = 0; pool.slow = 0; pool.stun = 0;
      pool.evolved = b.evolved;
      pool.poolBurn = b.poolBurn || b.dmg * 0.3;
      pool.poolBurnDur = (b.poolBurnDur || 5) * durationMul;
    }
    if (b.evolved) {
      var step = (b.poolR || 90) * 0.76;
      layPool(b.x, b.y, 1, 1.82);
      layPool(b.x - step, b.y, 0.78, 1.62);
      layPool(b.x + step, b.y, 0.78, 1.62);
      layPool(b.x, b.y - step, 0.78, 1.62);
      layPool(b.x, b.y + step, 0.78, 1.62);
      FX.ring(b.x, b.y, { r: step * 1.42, color: '#ff9a45', life: 0.28, width: 3 });
    } else layPool(b.x, b.y, 1, 1);
  }

  function findWeapon(run, wid) {
    if (!run) return null;
    for (var i = 0; i < run.weapons.length; i++) if (run.weapons[i].id === wid) return run.weapons[i];
    return null;
  }

  var runRef = null;

  function updateRage(run, w, dt) {
    var p = run.player;
    if (w.rageKills === undefined) w.rageKills = run.kills || 0;
    var gained = Math.max(0, (run.kills || 0) - w.rageKills);
    w.rageKills = run.kills || 0;
    if (gained > 0) {
      w.rageT = 2.2 + w.lv * 0.18;
      if (p.char && p.char.id === 'berserker') {
        p.hp = Math.min(p.stats.hp, p.hp + gained * (2 + w.lv * 0.75));
        FX.heal(p.x, p.y);
      }
      if (w.evolved && p.char && p.char.id === 'berserker') {
        w.phantomStacks = Math.min(20, (w.phantomStacks || 0) + gained);
      }
    }
    w.rageT = Math.max(0, (w.rageT || 0) - dt);
    var rageBonus = w.rageT > 0 ? 0.10 + w.lv * 0.022 : 0;
    if (w.evolved) rageBonus += (w.phantomStacks || 0) * 0.025;
    p._bloodRageMul = Math.max(p._bloodRageMul || 1, 1 + rageBonus);
    if (w.rageT > 0) p._rageSpeedMul = Math.max(p._rageSpeedMul || 1, 1.12);

    if (!p.char || p.char.id !== 'berserker' || w.lv < 4) return;
    w.stormCd = (w.stormCd === undefined ? 10 : w.stormCd) - dt;
    if (w.stormCd <= 0) { w.stormCd = 10; w.stormT = 1.35; w.stormTick = 0; AudioSys.play('evolve'); }
    w.stormT = Math.max(0, (w.stormT || 0) - dt);
    if (w.stormT <= 0) return;
    p._stormSpeedMul = Math.max(p._stormSpeedMul || 1, 1.82);
    w.stormTick -= dt;
    if (w.stormTick <= 0 && nearestEnemy(p.x, p.y, wStats(run, w).range * 1.45)) {
      w.stormTick = 0.11;
      var st = wStats(run, w);
      var a = run.t * 12.5;
      var b = spawn(run, w, st, 'melee', 'p_slash_big', p.x, p.y, 0, 0, 0.2);
      b.angle = a; b.aux = st.range * 1.18; b.size = st.size * 1.5; b.pierce = 9999;
      FX.ring(p.x, p.y, { r: st.range * 0.72, color: '#b72832', life: 0.18, width: 3 });
    }
  }

  function updateNativeAvatar(run, w) {
    var p = run.player;
    if (!w.evolved || !p.char || p.char.weapon !== w.id) return false;
    if (w.phantomBaseKills === undefined) w.phantomBaseKills = run.kills || 0;
    w.phantomKills = E.clamp((run.kills || 0) - w.phantomBaseKills, 0, 300);
    return true;
  }

  function updateKnightOaths(run, w, dt) {
    var p = run.player;
    if (!p.char || p.char.id !== 'knight') return;
    p.knightImmuneT = Math.max(0, (p.knightImmuneT || 0) - dt);
    w.oathGuardCd = (w.oathGuardCd === undefined ? 20 : w.oathGuardCd) - dt;
    if (w.lv >= 3 && w.oathGuardCd <= 0) {
      w.oathGuardCd = 20; p.knightImmuneT = 2;
      FX.sprite(p.x, p.y - 12, 'vfx_shield', 0.72, 82, true);
      AudioSys.play('evolve');
    }
    w.holyJudgmentT = Math.max(0, (w.holyJudgmentT || 0) - dt);
    w.holyJudgmentCd = (w.holyJudgmentCd === undefined ? 10 : w.holyJudgmentCd) - dt;
    if (w.lv >= 6 && w.holyJudgmentCd <= 0) {
      w.holyJudgmentCd = 10; w.holyJudgmentT = 3;
      FX.flash('#fff0a6', 0.18, 0.3);
    }
    if (w.holyJudgmentT > 0) p._holyJudgment = true;
  }

  function updateArcaneAvatar(run, w, dt) {
    var p = run.player;
    if (!w.evolved || !p.char || p.char.id !== 'mage') { w.arcaneLocks = []; return; }
    w.arcaneBeamTick = (w.arcaneBeamTick || 0) - dt;
    if (w.arcaneBeamTick > 0) return;
    w.arcaneBeamTick = 0.12;
    var candidates = collectInRange(p.x, p.y, 540).slice();
    candidates.sort(function (a, b) {
      var ap = a.boss ? 2000000000 : (a.elite ? 1000000000 : a.hp);
      var bp = b.boss ? 2000000000 : (b.elite ? 1000000000 : b.hp);
      return bp - ap || E.dist2(p.x, p.y, a.x, a.y) - E.dist2(p.x, p.y, b.x, b.y);
    });
    var previous = w.arcaneLocks || [], next = [];
    var st = wStats(run, w);
    for (var i = 0; i < Math.min(4, candidates.length); i++) {
      var target = candidates[i], since = run.t;
      for (var j = 0; j < previous.length; j++) if (previous[j].uid === target.uid) { since = previous[j].since; break; }
      var ramp = 1 + E.clamp((run.t - since) / 2, 0, 1) * 3;
      next.push({ uid: target.uid, target: target, since: since, ramp: ramp });
      if (!run._netVisual) Entities.damageEnemy(run, target, st.dmg * 0.24 * ramp, { noCrit: true });
    }
    w.arcaneLocks = next;
  }

  function rangerAim(run, p) {
    var pointer = E.pointerState;
    if (pointer && pointer.active && pointer.type !== 'touch') {
      return Math.atan2(E.cam.y + pointer.y - CFG.GAME.H / 2 - p.y,
        E.cam.x + pointer.x - CFG.GAME.W / 2 - p.x);
    }
    var candidates = collectInRange(p.x, p.y, 620), target = null;
    for (var i = 0; i < candidates.length; i++) if (!target || candidates[i].hp > target.hp) target = candidates[i];
    return target ? Math.atan2(target.y - p.y, target.x - p.x) : Math.atan2(E.lastDir.y, E.lastDir.x);
  }

  function updateRangerUltimate(run, w, dt) {
    var p = run.player, st = wStats(run, w);
    if ((w.dragonChargeT || 0) > 0) {
      if (w.dragonChargeT > 0.25) w.dragonAngle = rangerAim(run, p);
      w.dragonChargeT = Math.max(0, w.dragonChargeT - dt);
      w.dragonChargeProgress = 1 - w.dragonChargeT / 2;
      p.attackAnimT = Math.max(p.attackAnimT, 0.14);
      p.dir = Math.abs(Math.cos(w.dragonAngle)) > Math.abs(Math.sin(w.dragonAngle))
        ? (Math.cos(w.dragonAngle) >= 0 ? 'right' : 'left')
        : (Math.sin(w.dragonAngle) >= 0 ? 'down' : 'up');
      if (w.dragonChargeT <= 0) {
        var speed = 600;
        var dragon = spawn(run, w, st, 'dragonLance', 'p_dragon', p.x, p.y - 10,
          Math.cos(w.dragonAngle) * speed, Math.sin(w.dragonAngle) * speed, 1.5);
        dragon.dmg = st.dmg * 4.5; dragon.pierce = 9999; dragon.size = 58;
        dragon.aux = speed; dragon.angle = w.dragonAngle;
        w.cdT = st.cd; w.dragonChargeProgress = 0;
        AudioSys.play('evolve'); FX.shake(7, 0.28);
      }
      return;
    }
    w.cdT -= dt;
    if (w.cdT <= 0 && countKind('windbow', p) === 0) {
      w.dragonChargeT = 2; w.dragonChargeProgress = 0;
      w.dragonAngle = rangerAim(run, p); w.cdT = 0;
      FX.ring(p.x, p.y, { r: 48, color: '#69eda7', life: 0.45, width: 3 });
    }
  }

  // 联机:房主代跑某个队友的武器。共用同一子弹池,弹幕归属只影响视觉光环。
  // owner 是队友的 player 对象,list 是他的武器数组。
  function updateFor(run, owner, list, dt) {
    runRef = run;
    var saved = run.player;
    run.player = owner;                 // 临时把武器计算的"玩家"切到队友
    try {
      owner._bloodRageMul = 1; owner._rageSpeedMul = 1; owner._stormSpeedMul = 1; owner._holyJudgment = false;
      for (var i = 0; i < list.length; i++) {
        var w = list[i];
        updateNativeAvatar(run, w);
        if (w.id === 'crossblade') updateKnightOaths(run, w, dt);
        if (w.id === 'arcanebolt') updateArcaneAvatar(run, w, dt);
        if (w.id === 'whirlaxe') updateRage(run, w, dt);
        if (w.id === 'holyaura') { updateAura(run, w, dt); continue; }
        if (w.id === 'windbow' && w.evolved) { updateRangerUltimate(run, w, dt); continue; }
        w.cdT -= dt;
        if (w.cdT <= 0) {
          var st = wStats(run, w);
          w.cdT = st.cd;
          if (w.id === 'orbitblade') {
            if (countKind('orbitblade', owner) === 0) fire(run, w);
            else w.cdT = 0.5;
          } else fire(run, w);
        }
      }
    } finally {
      run.player = saved;               // 无论如何都要还回去
    }
  }

  // ================= 每帧主更新 =================
  function update(run, dt) {
    runRef = run;
    var p = run.player;
    p._bloodRageMul = 1; p._rageSpeedMul = 1; p._stormSpeedMul = 1; p._holyJudgment = false;
    for (var i = 0; i < run.weapons.length; i++) {
      var w = run.weapons[i];
      updateNativeAvatar(run, w);
      if (w.id === 'crossblade') updateKnightOaths(run, w, dt);
      if (w.id === 'arcanebolt') updateArcaneAvatar(run, w, dt);
      if (w.id === 'whirlaxe') updateRage(run, w, dt);
      if (w.id === 'holyaura') { updateAura(run, w, dt); continue; }
      if (w.id === 'windbow' && w.evolved) { updateRangerUltimate(run, w, dt); continue; }
      w.cdT -= dt;
      if (w.cdT <= 0) {
        var st = wStats(run, w);
        w.cdT = st.cd;
        if (w.id === 'orbitblade') {
          if (countKind('orbitblade', p) === 0) fire(run, w);
          else w.cdT = 0.5;
        } else fire(run, w);
      }
    }
    updateQueue(run, dt);
    updateBullets(run, dt);
  }

  // 联机客户端:用房主快照重建本地弹幕池(纯视觉,不产生伤害)
  function applyVisual(run, arr) {
    run._netVisual = true;
    for (var i = 0; i < BMAX; i++) bullets[i].alive = false;
    turretList.length = 0;
    if (!arr) return;
    for (var j = 0; j < arr.length && j < BMAX; j++) {
      var s = arr[j], b = bullets[j];
      b.alive = true;
      b.kind = s.k || 'straight';
      b.spr = s.s || 'p_slash';
      b.x = s.x || 0; b.y = s.y || 0;
      b.vx = s.vx || 0; b.vy = s.vy || 0;
      b.angle = s.a || 0; b.spin = s.sp || 0; b.phase = s.ph || 0;
      b.ttl = s.tt !== undefined ? s.tt : 1;
      b.born = run.t;
      b.dmg = 0; b.pierce = 9999; b.size = s.z || 16;
      b.evolved = !!s.ev; b.blessed = !!s.bf;
      b.aux = s.o1 || 0; b.aux2 = s.o2 || 0;
      b.ox = s.ox || 0; b.oy = s.oy || 0;
      b.orbitR = s.or || 0; b.orbitSpd = s.os || 0;
      b.owner = null; b.ownerX = s.cx !== undefined ? s.cx : b.x; b.ownerY = s.cy !== undefined ? s.cy : b.y;
      b.slow = 0; b.slowDur = 0; b.stun = 0; b.zapN = 1;
      if (!b.hitCd) { b.hitCd = new Map(); b.hitSet = new Set(); }
      b.hitCd.clear(); b.hitSet.clear();
      if (b.kind === 'turret') turretList.push(b);
    }
    var wA = findWeapon(run, 'holyaura');
    if (wA && run.player && run.player.stats) wA.curR = wStats(run, wA).size;
  }

  function updateVisual(run, dt) {
    if (!run._netVisual) return;
    updateBullets(run, dt);
  }

  function getBullets() { return bullets; }

  function summonArchangels(run, w, st) {
    var p = run.player;
    for (var i = 0; i < 7; i++) {
      var a = Math.PI * 2 * i / 7;
      var b = spawn(run, w, st, 'angel', 'vfx_archangel',
        p.x + Math.cos(a) * st.size * 0.72, p.y + Math.sin(a) * st.size * 0.42, 0, 0, 4.8);
      b.phase = a; b.orbitR = st.size; b.size = 30;
      b.dmg = st.dmg * 2.1; b.pierce = 9999;
    }
    FX.ring(p.x, p.y, { r: st.size, color: '#ffe9a0', life: 0.7, width: 4 });
    AudioSys.play('evolve');
  }

  function updateAura(run, w, dt) {
    var p = run.player;
    var st = wStats(run, w);
    w.curR = st.size;
    if (w.evolved) {
      w.angelCd = (w.angelCd === undefined ? 0.3 : w.angelCd) - dt;
      if (w.angelCd <= 0) { w.angelCd = 8.5; summonArchangels(run, w, st); }
    }
    w.cdT -= dt;
    if (w.cdT > 0) return;
    w.cdT = st.cd;
    if (!w.holyNext) w.holyNext = new Map();
    // 圣光:亡灵类额外减速 50%(鬼魂/骷髅/死灵),普通敌人维持原有减速
    var slowAmt = w.evolved ? 0.3 : 0;
    E.gridQuery(p.x, p.y, st.size, function (e) {
      var undead = e.id === 'ghost' || e.id === 'skeleton' || e.id === 'wraith' || e.id === 'zombie';
      Entities.damageEnemy(run, e, st.dmg, {
        noCrit: false,
        slow: undead ? Math.max(slowAmt, 0.5) : slowAmt,
        slowDur: undead ? 1.0 : 0.6,
        kx: (e.x - p.x) * 0.3, ky: (e.y - p.y) * 0.3
      });
      var nextBeam = w.holyNext.get(e.uid) || 0;
      if (st.holyStrike && run.t >= nextBeam && Math.random() < 0.5) {
        w.holyNext.set(e.uid, run.t + 2.0);
        FX.lightning(e.x, e.y - 210, e.x, e.y, '#fff1a6');
        FX.burst(e.x, e.y, { color: '#fff0a3', n: 8, speed: 90, life: 0.34, size: 2.5, glow: true });
        if (!run._netVisual) Entities.damageEnemy(run, e, st.dmg * (1.7 + 0.12 * w.lv), { stun: 0.18 });
      }
      return false;
    });
    // 圣光:范围内敌方弹幕减速 20%(存储标记,子弹更新时按比例衰减)
    if (w.evolved || true) {
      run.holySlow = run.holySlow || 1.0;
      // 通过 run 传递光环半径给 entities 的敌弹更新
      run.holyAuraR = st.size;
    }
    if (w.evolved) p.hp = Math.min(p.stats.hp, p.hp + 0.5);
  }

  // ================= 绘制 =================
  // 地面火焰池/圣光环:画在地面层之上,角色与装饰物之下,避免遮挡
  function drawGround(ctx, run) {
    var p = run.player;
    // 圣女光环是固定贴地的领域，不做逐帧旋转。过去在八帧之间切换会让
    // 纹样像弹跳、边缘像被截断；现在只让透明度轻微呼吸。
    var wAura = findWeapon(run, 'holyaura');
    if (wAura) {
      var r = wAura.curR || wStats(run, wAura).size;
      var auraT = run.t;
      var auraFrames = cachedFrames('vfx_holy_aura');
      var auraImg = auraFrames[0];
      // Keep the authored round seal round: it lives on the floor, not as a
      // flattened halo at the character's chest height.
      var auraW = r * (wAura.evolved ? 2.42 : 2.26), auraH = auraW;
      // 光环素材的几何圆心不在画面中心:实测内容包围盒中心在帧内 (47.5, 43.5),
      // 距帧中心 (48,48) 偏左 0.5、偏上 4.5。直接画会让角色看起来不在光环正中。
      // 按比例补偿,把光环几何圆心精确移到角色位置。
      var auraXOff = auraW * (48 - 47.5) / 96;   // +0.005×宽
      var auraYOff = auraH * (48 - 43.5) / 96;   // +0.047×高
      // 光环本来只是"脚下有领域"的提示,别让它糊住半屏视野。降到低可见度。
      ctx.globalAlpha = (wAura.evolved ? 0.38 : 0.30) + Math.sin(auraT * 1.2) * 0.02;
      ctx.drawImage(auraImg, p.x - auraW / 2 + auraXOff, p.y - auraH / 2 + auraYOff, auraW, auraH);
      ctx.globalAlpha = 1;
    }
    var nativeW = p.char ? findWeapon(run, p.char.weapon) : null;
    if (nativeW && nativeW.evolved && p.char) {
      var action = p.attackAnimT > 0 ? 'attack' : (p.moving ? 'walk' : 'idle');
      var spriteId = 'avatar_' + p.char.id + '_' + action + '_' + (p.dir || 'down');
      var phantomFrames = cachedFrames(spriteId);
      var phantom = phantomFrames[Math.floor((action === 'attack' ? p.attackAnimAge : p.animT) * cachedFps(spriteId, 10)) % phantomFrames.length];
      var grow = 1 + E.clamp((nativeW.phantomKills || 0) / 300, 0, 1) * 1.5;
      var pw = Math.round(64 * grow), ph = pw;
      ctx.save();
      ctx.globalAlpha = 0.42 + E.clamp((nativeW.phantomKills || 0) / 300, 0, 1) * 0.16;
      // Shared [32,54] body pivot: exact same x/base as the hero, no offset.
      ctx.drawImage(phantom, p.x - pw / 2, p.y + 8 - Math.round(54 * grow), pw, ph);
      ctx.restore();
    }
    var arcaneW = findWeapon(run, 'arcanebolt');
    if (arcaneW && arcaneW.evolved && p.char && p.char.id === 'mage' && arcaneW.arcaneLocks) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (var ai = 0; ai < arcaneW.arcaneLocks.length; ai++) {
        var lock = arcaneW.arcaneLocks[ai], target = lock.target;
        if (!target || !target.alive) continue;
        ctx.globalAlpha = 0.34 + 0.12 * Math.sin(run.t * 18 + ai);
        ctx.strokeStyle = lock.ramp >= 3.6 ? '#f4c8ff' : '#9f66e8';
        ctx.lineWidth = 1 + lock.ramp * 0.7;
        ctx.beginPath(); ctx.moveTo(p.x, p.y - 42); ctx.lineTo(target.x, target.y); ctx.stroke();
      }
      ctx.restore();
    }
    var rangerW = findWeapon(run, 'windbow');
    if (rangerW && rangerW.evolved && rangerW.dragonChargeT > 0) {
      var chargeR = 28 + (rangerW.dragonChargeProgress || 0) * 36;
      ctx.globalAlpha = 0.3 + (rangerW.dragonChargeProgress || 0) * 0.45;
      ctx.drawImage(SpriteGen.get('vfx_circle'), p.x - chargeR, p.y - chargeR, chargeR * 2, chargeR * 2);
      ctx.globalAlpha = 1;
    }
    if (p.knightImmuneT > 0) {
      var shieldPulse = 62 + Math.sin(run.t * 8) * 3;
      ctx.globalAlpha = 0.48;
      ctx.drawImage(SpriteGen.get('vfx_shield'), p.x - shieldPulse / 2, p.y - shieldPulse * 0.72,
        shieldPulse, shieldPulse);
      ctx.globalAlpha = 1;
    }
    // 火焰池
    for (var i = 0; i < BMAX; i++) {
      var b = bullets[i];
      if (!b.alive || b.kind !== 'pool') continue;
      ctx.globalAlpha = 0.72 + Math.sin(run.t * 2.2 + i) * 0.07;
      var fr0 = cachedFrames(b.spr);
      // 落地碎裂只在 projectile 的终点结算一次；火池循环纯火焰帧（3～6），
      // 保持火焰活性，却绝不把碎瓶帧重新播放出来。
      var fireStart = Math.min(3, fr0.length - 1);
      var fireCount = Math.max(1, Math.min(4, fr0.length - fireStart));
      var img0 = fr0[fireStart + (Math.floor(run.t * 6 + i) % fireCount)];
      ctx.drawImage(img0, b.x - b.size / 2, b.y - b.size / 2, b.size, b.size);
      ctx.globalAlpha = 1;
    }
  }

  // 经典特斯拉电塔:复古像素塔身 + 顶部脉冲电球与放电叉
  function drawTeslaCoil(ctx, b, run) {
    var bx = b.x, baseY = b.y + 12;
    var pulse = 0.5 + 0.5 * Math.sin(run.t * 5.2 + bx * 0.17);
    ctx.globalAlpha = b.ttl < 1 ? E.clamp(b.ttl * 2, 0, 1) : 1;

    var age = Math.max(0, run.t - (b.born || run.t));
    // 部署结束后塔身固定在同一帧；放电只叠加顶部闪电，彻底消除命中时
    // 塔身来回换帧造成的“抽搐”。
    var towerFrames = cachedFrames('tesla_tower');
    var towerImg = towerFrames[0];
    // 正方形等比绘制并按底座锚定,不再把塔体横向拉扁或裁掉顶部。
    var towerSize = 128;
    ctx.globalAlpha *= 0.34;
    ctx.drawImage(SpriteGen.get('vfx_shadow'), bx - 42, baseY - 10, 84, 18);
    ctx.globalAlpha = b.ttl < 1 ? E.clamp(b.ttl * 2, 0, 1) : 1;
    // 单一塔身自地下上升。没有换帧，因此生成时也不会出现抽搐。
    var rise = age < 0.42 ? (1 - age / 0.42) * 54 : 0;
    ctx.drawImage(towerImg, bx - towerSize / 2, baseY - towerSize + rise, towerSize, towerSize);

    // 顶部能量只保留轻薄辉光；分叉电弧来自逐帧美术,避免随机粗线抖动。
    // 用缓存辉光贴图替代每帧 createRadialGradient。
    var orbY = baseY - towerSize + 20;
    var glowR = 12 + pulse * 4;
    ctx.globalAlpha *= (0.24 + pulse * 0.12);
    ctx.drawImage(SpriteGen.glow('#bee8ff'), bx - glowR, orbY - glowR, glowR * 2, glowR * 2);
    ctx.globalAlpha = 1;
    if (b.zapFlash > 0) {
      var zapFrames = cachedFrames('vfx_lightning');
      var zapAge = Math.max(0, 0.46 - b.zapFlash);
      var zapImg = zapFrames[Math.floor(zapAge * cachedFps('vfx_lightning', 18)) % zapFrames.length];
      var zapSize = 68 + pulse * 10;
      ctx.globalAlpha = E.clamp(b.zapFlash * 3.4, 0.45, 1);
      ctx.drawImage(zapImg, bx - zapSize / 2, orbY - zapSize / 2, zapSize, zapSize);
    }
    ctx.globalAlpha = 1;
  }

  function drawTeslaTank(ctx, b, run) {
    var x = b.x, y = b.y;
    var action = b.tankAction || 'idle';
    var direction = b.tankDir || 'down';
    var name = 'tesla_battle_tank_' + action + '_' + direction;
    var frames = cachedFrames(name);
    var index = action === 'attack'
      ? Math.min(frames.length - 1, Math.floor((b.chargeProgress || 0) * frames.length))
      : Math.floor((b.tankActionAge || 0) * cachedFps(name, action === 'walk' ? 11 : 7)) % frames.length;
    ctx.globalAlpha = 0.34;
    ctx.drawImage(SpriteGen.get('vfx_shadow'), x - 46, y - 9, 92, 22);
    ctx.globalAlpha = 1;
    // 96x96 authored frame at its [48,91] ground pivot: no stretched body,
    // no procedural replacement, and identical collision size in every pose.
    ctx.drawImage(frames[index], x - 48, y - 91, 96, 96);
  }

  function draw(ctx, run) {
    // 普通弹幕与飞行物(火焰池已移到 drawGround)
    for (var i = 0; i < BMAX; i++) {
      var b = bullets[i];
      if (!b.alive || b.kind === 'pool') continue;
      if (b.kind === 'nova') {
        var rr = Math.min(b.phase, b.aux2);
        if (rr < 1) continue;
        var novaAlpha = E.clamp(b.ttl * 3, 0, 1);
        ctx.globalAlpha = novaAlpha;
        var frostFrames = cachedFrames('vfx_frost_kiss_radial');
        var frostProgress = E.clamp(rr / Math.max(1, b.aux2), 0, 0.999);
        var frostImg = frostFrames[Math.min(frostFrames.length - 1, Math.floor(frostProgress * frostFrames.length))];
        // The authored sheet already grows its circular ring from the centre.
        // Scaling the whole image by rr again made the outer edge leap between
        // frames.  Keep one fixed ground footprint and advance only the ring
        // frame: visually continuous, mechanically still expanding outward.
        var frostSize = Math.max(72, b.aux2 * (b.evolved ? 2.34 : 2.14));
        ctx.drawImage(frostImg, b.x - frostSize / 2, b.y - frostSize / 2, frostSize, frostSize);
        ctx.globalAlpha = 1;
        continue;
      }
      var projectileFrames = cachedFrames(b.spr);
      var projectileFps = cachedFps(b.spr, 10);
      var projectileAge = Math.max(0, run.t - (b.born || 0));
      // 贤者光弹与秘典使用单帧稳定本体:旧动作条里混着空白帧和"合书/散页"帧,
      // 一边靠 b.angle 自转一边换帧,本体就会忽大忽小,正是飞行闪烁的来源。
      var img = (b.spr === 'p_bolt' || b.spr === 'p_book') ? projectileFrames[0]
        : projectileFrames[Math.floor(projectileAge * projectileFps) % projectileFrames.length];
      var sc = 2 * (b.size / 16);
      if (b.spr === 'p_arrow') {
        // 箭矢固定朝发射方向,飞行途中不再随速度旋转
        var aw = img.width * 2 * (b.size / 16);
        var ah = img.height * 2 * (b.size / 16);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.angle);
        ctx.drawImage(img, -aw / 2, -ah / 2, aw, ah);
        ctx.restore();
        continue;
      }
      if (b.kind === 'turret') {
        drawTeslaCoil(ctx, b, run);
        continue;
      }
      if (b.kind === 'tank') {
        drawTeslaTank(ctx, b, run);
        continue;
      }
      // 受队友光环加持的弹幕:先铺一层金色光晕(缓存辉光贴图,不再每帧建渐变)
      if (b.blessed) {
        var bgR = b.size * 0.9;
        ctx.globalAlpha = 0.45;
        ctx.drawImage(SpriteGen.glow('#ffe9a8'), b.x - bgR, b.y - bgR, bgR * 2, bgR * 2);
        ctx.globalAlpha = 1;
      }
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      var dw = img.width * 2 * (b.size / 16);
      if (b.spr === 'p_arcane_orb') dw = b.evolved ? 42 : 34;
      if (b.spr === 'p_tesla_cannon') dw = 112;
      if (b.kind === 'demon') dw = img.width * 1.7 * (b.size / 16);
      // The dedicated dragon sheet has a larger logical cell for crisp detail.
      // Keep its on-screen silhouette long and lean instead of inflating it
      // into an opaque screen-filling block.
      if (b.kind === 'guideDragon') dw = img.width * 2.9;
      if (b.kind === 'dragonLance') {
        dw = img.width * 3.15;
        ctx.globalAlpha = 0.56;
        ctx.globalCompositeOperation = 'lighter';
      }
      if (b.kind === 'divineSword') dw = img.width * 3.35;
      if (b.kind === 'angel') dw = img.width * 1.65;
      if (b.spr === 'p_slash' || b.spr === 'p_slash_big') {
        dw = Math.min(img.width * (b.spr === 'p_slash_big' ? 3 : 2.4) * (b.size / 16), 132);
      }
      var w2 = dw / 2;
      var h2 = img.height * dw / img.width / 2;
      ctx.drawImage(img, -w2, -h2, dw, h2 * 2);
      ctx.restore();
    }
  }

  // ================= 获得 / 升级 / 进化 =================
  function addWeapon(run, id) {
    run.weapons.push({ id: id, lv: 1, cdT: 0.2, evolved: false, evoId: null, curR: 0 });
    Meta.seeCodex('w_' + id);
    Meta.trackBest('weapons', run.weapons.length);
  }
  function addPassive(run, id) {
    run.passives[id] = (run.passives[id] || 0) + 1;
    Entities.recomputeStats(run);
  }
  function upgradeWeapon(run, w) { w.lv++; }

  function evolveWeapon(run, w) {
    var def = CFG.WEAPONS[w.id];
    w.evolved = true;
    if (window.Entities && Entities.recomputeStats) Entities.recomputeStats(run);
    w.evoId = def.evo;
    if (run.player.char && run.player.char.weapon === w.id) {
      w.phantomBaseKills = run.kills || 0;
      w.phantomKills = 0;
    }
    Meta.track('evolve');
    Meta.seeCodex('e_' + def.evo);
    AudioSys.play('evolve');
    return CFG.EVOS[def.evo];
  }

  function canEvolve(run, w) {
    var def = CFG.WEAPONS[w.id];
    if (!def || w.evolved) return false;
    if (w.id === 'whirlaxe' && (!run.player.char || run.player.char.id !== 'berserker')) return false;
    if (w.lv < def.lv.length + 1) return false;
    return (run.passives[def.evoNeed] || 0) > 0;
  }

  // ================= 升级选项 =================
  var DELTA_TXT = {
    dmg: function (v) { return '伤害 +' + v; },
    count: function (v) { return '投射物 +' + v; },
    pierce: function (v) { return '穿透 +' + v; },
    chains: function (v) { return '连锁 +' + v; },
    poolDmg: function (v) { return '灼烧伤害 +' + v; },
    cdM: function (v) { return '冷却 -' + Math.round((1 - v) * 100) + '%'; },
    areaM: function (v) { return '范围 +' + Math.round((v - 1) * 100) + '%'; },
    durM: function (v) { return '持续 +' + Math.round((v - 1) * 100) + '%'; },
    spdM: function (v) { return '弹速 +' + Math.round((v - 1) * 100) + '%'; },
    holyStrike: function () { return '解锁/强化天降圣光（50%）'; },
    arcaneReflect: function () { return '解锁/强化奥术折射：命中后追踪弹射'; },
    voidMark: function () { return '解锁虚空烙印：再次命中会范围爆炸'; },
    teslaOverload: function () { return '解锁电塔过载：消失时释放强力扩散电流'; },
    armorBreak: function () { return '解锁穿云劲：额外穿透并削弱护甲'; },
    leafEcho: function () { return '解锁翠影回响：命中分裂两枚追踪叶箭'; }
  };
  function deltaDesc(delta) {
    var parts = [];
    for (var k in delta) if (DELTA_TXT[k]) parts.push(DELTA_TXT[k](delta[k]));
    return parts.join(',') || '威力提升';
  }

  // 武器的进化提示:告诉玩家还缺什么。用于升级卡片上的小图标。
  function evoHint(run, wid) {
    var def = CFG.WEAPONS[wid];
    if (!def) return null;
    var w = findWeapon(run, wid);
    var need = CFG.PASSIVES[def.evoNeed];
    var evo = CFG.EVOS[def.evo];
    if (!need || !evo) return null;
    var maxLv = def.lv.length + 1;
    return {
      evoName: evo.name, evoIcon: evo.icon,
      needId: def.evoNeed, needName: need.name, needIcon: need.icon,
      hasNeed: (run.passives[def.evoNeed] || 0) > 0,
      atMax: !!w && w.lv >= maxLv,
      evolved: !!w && w.evolved
    };
  }

  // 某个被动能触发哪些武器的进化(只列玩家已持有的武器)
  function passiveEvoHint(run, pid) {
    var out = [];
    for (var wid in CFG.WEAPONS) {
      var def = CFG.WEAPONS[wid];
      if (def.evoNeed !== pid) continue;
      if (!findWeapon(run, wid)) continue;      // 没这把武器就没意义
      out.push({ evoName: CFG.EVOS[def.evo].name, evoIcon: CFG.EVOS[def.evo].icon, wIcon: def.icon });
    }
    return out.length ? out : null;
  }

  function getLevelUpChoices(run) {
    var pool = [];
    var i, w, def;
    // 已有武器升级
    for (i = 0; i < run.weapons.length; i++) {
      w = run.weapons[i];
      def = CFG.WEAPONS[w.id];
      if (w.evolved || w.lv >= def.lv.length + 1) continue;
      if (run.banished.has(w.id)) continue;
      pool.push({ type: 'weapon', id: w.id, isNew: false, weight: 10,
        name: def.name + ' Lv.' + (w.lv + 1), icon: def.icon,
        desc: deltaDesc(def.lv[w.lv - 1]), curLv: w.lv, maxLv: def.lv.length + 1,
        evo: evoHint(run, w.id) });
    }
    // 已有被动升级
    for (var pid in run.passives) {
      var pdef = CFG.PASSIVES[pid];
      var plv = run.passives[pid];
      if (plv >= pdef.maxLv || run.banished.has(pid)) continue;
      pool.push({ type: 'passive', id: pid, isNew: false, weight: 8,
        name: pdef.name + ' Lv.' + (plv + 1), icon: pdef.icon,
        desc: pdef.desc, curLv: plv, maxLv: pdef.maxLv,
        pEvo: passiveEvoHint(run, pid) });
    }
    // 新武器
    if (run.weapons.length < CFG.GAME.MAX_WEAPONS) {
      for (var wid in CFG.WEAPONS) {
        if (findWeapon(run, wid) || run.banished.has(wid)) continue;
        def = CFG.WEAPONS[wid];
        pool.push({ type: 'weapon', id: wid, isNew: true, weight: 6,
          name: def.name, icon: def.icon, desc: def.desc, curLv: 0, maxLv: def.lv.length + 1,
          evo: evoHint(run, wid) });
      }
    }
    // 新被动
    var pCount = 0;
    for (var k in run.passives) pCount++;
    if (pCount < CFG.GAME.MAX_PASSIVES) {
      for (var pid2 in CFG.PASSIVES) {
        if (run.passives[pid2] !== undefined || run.banished.has(pid2)) continue;
        pool.push({ type: 'passive', id: pid2, isNew: true, weight: 5,
          name: CFG.PASSIVES[pid2].name, icon: CFG.PASSIVES[pid2].icon,
          desc: CFG.PASSIVES[pid2].desc, curLv: 0, maxLv: CFG.PASSIVES[pid2].maxLv,
          pEvo: passiveEvoHint(run, pid2) });
      }
    }
    // 全满:保底选项
    if (!pool.length) {
      return [
        { type: 'gold', id: 'gold', name: '金币 ×30', icon: 'icon_gold', desc: '立即获得 30 金币', isNew: false, curLv: 0, maxLv: 0 },
        { type: 'heal', id: 'heal', name: '烤大腿肉', icon: 'meat', desc: '恢复 50 点生命', isNew: false, curLv: 0, maxLv: 0 }
      ];
    }
    // 加权抽取 3~4 个
    var n = 3;
    var luck = run.player.stats.luck;
    if (Math.random() < E.clamp((luck - 1) * 0.5 + 0.08, 0, 0.6)) n = 4;
    var picks = [];
    var cand = pool.slice();
    while (picks.length < n && cand.length) {
      var total = 0;
      for (i = 0; i < cand.length; i++) total += cand[i].weight;
      var r = Math.random() * total;
      for (i = 0; i < cand.length; i++) {
        r -= cand[i].weight;
        if (r <= 0) { picks.push(cand[i]); cand.splice(i, 1); break; }
      }
    }
    return picks;
  }

  function applyChoice(run, opt) {
    switch (opt.type) {
      case 'weapon':
        if (opt.isNew) addWeapon(run, opt.id);
        else upgradeWeapon(run, findWeapon(run, opt.id));
        break;
      case 'passive':
        addPassive(run, opt.id);
        break;
      case 'gold':
        run.gold += 30; Meta.track('gold', 30);
        break;
      case 'heal':
        run.player.hp = Math.min(run.player.stats.hp, run.player.hp + 50);
        break;
    }
    AudioSys.play('upgrade_pick');
  }

  // ================= 宝箱 =================
  function chestLoot(run) {
    Meta.track('chest');
    var luck = run.player.stats.luck;
    var results = [];
    // 进化优先
    for (var i = 0; i < run.weapons.length; i++) {
      var w = run.weapons[i];
      if (canEvolve(run, w)) {
        var evo = evolveWeapon(run, w);
        results.push({ name: evo.name, icon: evo.icon, desc: evo.desc, evolved: true });
        break;
      }
    }
    var roll = Math.random();
    var count = roll < 0.04 * luck ? 5 : (roll < 0.18 * luck ? 3 : 1);
    for (var j = 0; j < count; j++) {
      // 随机升一件未满的武器/被动
      // 宝箱同样要尊重「丢弃」名单,否则丢掉的东西还会从宝箱刷回来
      var ups = [];
      for (i = 0; i < run.weapons.length; i++) {
        var w2 = run.weapons[i];
        if (run.banished.has(w2.id)) continue;
        if (!w2.evolved && w2.lv < CFG.WEAPONS[w2.id].lv.length + 1) ups.push({ t: 'w', o: w2 });
      }
      for (var pid in run.passives) {
        if (run.banished.has(pid)) continue;
        if (run.passives[pid] < CFG.PASSIVES[pid].maxLv) ups.push({ t: 'p', o: pid });
      }
      if (ups.length) {
        var u = ups[Math.floor(Math.random() * ups.length)];
        if (u.t === 'w') {
          var oldLv = u.o.lv;
          upgradeWeapon(run, u.o);
          var d = CFG.WEAPONS[u.o.id];
          results.push({ name: d.name + ' Lv.' + u.o.lv, icon: d.icon, desc: deltaDesc(d.lv[oldLv - 1]) });
        } else {
          var oldPLv = run.passives[u.o];
          addPassive(run, u.o);
          var pd = CFG.PASSIVES[u.o];
          results.push({ name: pd.name + ' Lv.' + run.passives[u.o], icon: pd.icon, desc: pd.desc });
        }
      } else {
        var g = 25 + Math.floor(Math.random() * 50);
        run.gold += g; Meta.track('gold', g);
        results.push({ name: '金币 ×' + g, icon: 'icon_gold', desc: '入账!' });
      }
    }
    // 附赠金币
    var bonus = 10 + Math.floor(Math.random() * 30 * luck);
    run.gold += bonus; Meta.track('gold', bonus);
    results.push({ name: '金币 ×' + bonus, icon: 'icon_gold', desc: '宝箱附赠' });
    return results;
  }

  function reset() { initPool(); initQueue(); runRef = null; }

  return {
    update: update, updateFor: updateFor, updateVisual: updateVisual, applyVisual: applyVisual,
    getBullets: getBullets, draw: draw, drawGround: drawGround, reset: reset,
    cycleTargetMode: cycleTargetMode, getTargetModeName: getTargetModeName,
    addWeapon: addWeapon, addPassive: addPassive,
    getLevelUpChoices: getLevelUpChoices, applyChoice: applyChoice,
    chestLoot: chestLoot, canEvolve: canEvolve, evolveWeapon: evolveWeapon, findWeapon: findWeapon,
    wStats: wStats
  };
})();
