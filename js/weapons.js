// weapons.js — 武器行为 / 子弹 / 进化 / 升级选项 / 宝箱
window.Weapons = (function () {
  'use strict';
  var E = Engine;

  // ================= 子弹池 =================
  var BMAX = 320;
  var bullets = [];
  function initPool() {
    bullets.length = 0;
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
        if (!b.hitCd) { b.hitCd = new Map(); b.hitSet = new Set(); }
        b.hitCd.clear(); b.hitSet.clear();
        return b;
      }
      if (b.born < ot) { ot = b.born; oldest = b; }
    }
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
      zapCount: b.zapCount || 1,
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
    b.poolDmg = 0; b.poolR = 0; b.poolDur = 0; b.poolBurn = 0; b.poolBurnDur = 0;
    b.blessed = !!st.blessed;     // 受队友光环加持:绘制时加一层金光
    return b;
  }

  // 延迟发射队列:连射武器用时间差拉开箭矢间距
  var QMAX = 24;
  var queue = [];
  function initQueue() {
    queue.length = 0;
    for (var i = 0; i < QMAX; i++) {
      queue.push({ alive: false, t: 0, wid: '', angle: 0, dmg: 0, speed: 0, size: 0,
                   pierce: 0, knock: 0, owner: null, blessed: false });
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
    switch (w.id) {
      case 'crossblade': {
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
          b = spawn(run, w, st, 'homing', 'p_bolt', p.x, p.y,
            Math.cos(a) * st.speed, Math.sin(a) * st.speed, 3.5);
          b.aux = st.speed;
        }
        AudioSys.play('shoot_bolt');
        break;
      }
      case 'windbow': {
        e = nearestEnemy(p.x, p.y, 300);
        var wbBase = e ? Math.atan2(e.y - p.y, e.x - p.x) : Math.atan2(E.lastDir.y, E.lastDir.x);
        if (w.evolved) {
          // 千羽风暴:凝聚成一条绿龙,沿单一方向贯穿路径上所有敌人
          b = spawn(run, w, st, 'dragon', 'p_dragon', p.x, p.y,
            Math.cos(wbBase) * st.speed * 0.75, Math.sin(wbBase) * st.speed * 0.75, 2.2);
          b.dmg = st.dmg * 3.2;      // 单体高额伤害
          b.pierce = 9999;           // 贯穿一切
          b.size = st.size * 2.4;
          b.aux = wbBase;            // 朝向,绘制龙身用
          AudioSys.play('shoot_arrow');
          AudioSys.play('evolve');
          break;
        }
        // 未进化:同向连射。第一支立即发出,其余排入延迟队列,
        // 靠时间差拉开间距(同帧生成再做空间偏移会同步飞行,看起来仍是叠在一起)。
        spawn(run, w, st, 'straight', 'p_arrow', p.x, p.y,
          Math.cos(wbBase) * st.speed, Math.sin(wbBase) * st.speed, 1.5);
        for (i = 1; i < st.count; i++) {
          queueShot(run, w.id, i * 0.11, wbBase, st);
        }
        AudioSys.play('shoot_arrow');
        break;
      }
      case 'holyaura': return; // 光环在 update 里持续处理
      case 'whirlaxe': {
        for (i = 0; i < st.count; i++) {
          var vx = (Math.random() - 0.5) * 220 + (E.lastDir.x * 60);
          b = spawn(run, w, st, 'axe', 'p_axe', p.x, p.y, vx, -st.speed, 2.6);
          b.spin = 9;
          b.pierce = 9999;
        }
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
        for (i = 0; i < st.count; i++) {
          b = spawn(run, w, st, 'orbit', 'p_orbitblade', p.x, p.y, 0, 0,
            w.evolved ? 1e9 : st.dur);
          b.phase = (Math.PI * 2 / st.count) * i;
          b.orbitR = st.orbitR; b.orbitSpd = 3.2 * (w.evolved ? 1.4 : 1);
          b.pierce = 9999;
        }
        AudioSys.play('shoot_slash');
        break;
      }
      case 'holytome': {
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
        for (i = 0; i < st.count; i++) {
          a = Math.random() * Math.PI * 2;
          b = spawn(run, w, st, 'turret', 'p_turret',
            p.x + Math.cos(a) * 50, p.y + Math.sin(a) * 50, 0, 0, st.dur);
          b.aux = st.zapCd * run.player.stats.cd; // 电击间隔
          b.aux2 = 0;
          b.orbitR = st.range;
          b.zapN = st.zapCount + (w.evolved ? 2 : 0);   // 多道闪电数量
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
    Entities.damageEnemy(_hitRun, e, b.dmg, _hitOpts);
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
        b.alive = false;
        continue;
      }
      switch (b.kind) {
        case 'straight':
        case 'ricochet':
        case 'dragon':
          b.x += b.vx * dt; b.y += b.vy * dt;
          b.angle = Math.atan2(b.vy, b.vx);
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
              }
            }
          } else {
            hitEnemiesAlong(run, b, b.size * 0.5, 0);
          }
          break;
        case 'homing': {
          var tgt = nearestEnemy(b.x, b.y, 420);
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
        case 'axe':
          b.vy += 620 * dt;
          b.x += b.vx * dt; b.y += b.vy * dt;
          b.angle += b.spin * dt;
          hitEnemiesAlong(run, b, b.size * 0.62, 0.3);
          break;
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
        case 'turret': {
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
              FX.lightning(b.x, b.y - 10, te.x, te.y, '#8ef');
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
            if (zapped) AudioSys.play('zap');
            // 塔间电弧:与射程内的另一座塔连线,对连线附近敌人造成伤害
            for (var tj = 0; tj < BMAX; tj++) {
              var ob = bullets[tj];
              if (ob === b || !ob.alive || ob.kind !== 'turret') continue;
              var ad = Math.hypot(ob.x - b.x, ob.y - b.y);
              if (ad > 260 || ad < 1) continue;
              FX.lightning(b.x, b.y - 10, ob.x, ob.y - 10, '#bdf');
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
    // 燃烧地面
    var pool = getBullet();
    pool.alive = true; pool.kind = 'pool'; pool.spr = 'p_firepool'; pool.wid = b.wid;
    pool.x = b.x; pool.y = b.y; pool.vx = 0; pool.vy = 0;
    pool.born = run.t;
    pool.owner = b.owner; pool.ownerX = b.ownerX; pool.ownerY = b.ownerY;
    // 发射时已把所属玩家的火池数值固化进弹体,落地时不再误读房主 Build。
    pool.dmg = b.poolDmg || b.dmg * 0.8;
    pool.size = b.poolR || 90;
    pool.ttl = b.poolDur || 3;
    pool.pierce = 9999; pool.knock = 0; pool.slow = 0; pool.stun = 0;
    pool.evolved = b.evolved;
    // 灼烧:初始 5 秒,随武器等级成长到 10 秒(每次命中重置,持续伤害)
    pool.poolBurn = b.poolBurn || b.dmg * 0.3;
    pool.poolBurnDur = b.poolBurnDur || 5;
  }

  function findWeapon(run, wid) {
    if (!run) return null;
    for (var i = 0; i < run.weapons.length; i++) if (run.weapons[i].id === wid) return run.weapons[i];
    return null;
  }

  var runRef = null;

  // 联机:房主代跑某个队友的武器。共用同一子弹池,弹幕归属只影响视觉光环。
  // owner 是队友的 player 对象,list 是他的武器数组。
  function updateFor(run, owner, list, dt) {
    runRef = run;
    var saved = run.player;
    run.player = owner;                 // 临时把武器计算的"玩家"切到队友
    try {
      for (var i = 0; i < list.length; i++) {
        var w = list[i];
        if (w.id === 'holyaura') { updateAura(run, w, dt); continue; }
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
    for (var i = 0; i < run.weapons.length; i++) {
      var w = run.weapons[i];
      if (w.id === 'holyaura') { updateAura(run, w, dt); continue; }
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
    }
    var wA = findWeapon(run, 'holyaura');
    if (wA && run.player && run.player.stats) wA.curR = wStats(run, wA).size;
  }

  function updateVisual(run, dt) {
    if (!run._netVisual) return;
    updateBullets(run, dt);
  }

  function getBullets() { return bullets; }

  function updateAura(run, w, dt) {
    var p = run.player;
    w.cdT -= dt;
    if (w.cdT > 0) return;
    var st = wStats(run, w);
    w.cdT = st.cd;
    w.curR = st.size; // 供绘制
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
    // 圣光环
    var wAura = findWeapon(run, 'holyaura');
    if (wAura) {
      var r = wAura.curR || wStats(run, wAura).size;
      var g = ctx.createRadialGradient(p.x, p.y, r * 0.3, p.x, p.y, r);
      var col = wAura.evolved ? '255,240,150' : '255,235,170';
      g.addColorStop(0, 'rgba(' + col + ',0.02)');
      g.addColorStop(0.8, 'rgba(' + col + ',0.10)');
      g.addColorStop(0.95, 'rgba(' + col + ',0.28)');
      g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    }
    // 火焰池
    for (var i = 0; i < BMAX; i++) {
      var b = bullets[i];
      if (!b.alive || b.kind !== 'pool') continue;
      ctx.globalAlpha = 0.55 + Math.sin(run.t * 8 + i) * 0.2;
      var fr0 = SpriteGen.frames(b.spr);
      var img0 = fr0[Math.floor(run.t * 8) % fr0.length];
      ctx.drawImage(img0, b.x - b.size / 2, b.y - b.size / 2, b.size, b.size);
      ctx.globalAlpha = 1;
    }
  }

  function draw(ctx, run) {
    // 普通弹幕与飞行物(火焰池已移到 drawGround)
    for (var i = 0; i < BMAX; i++) {
      var b = bullets[i];
      if (!b.alive || b.kind === 'pool') continue;
      if (b.kind === 'nova') {
        var rr = Math.min(b.phase, b.aux2);
        if (rr < 1) continue;
        ctx.strokeStyle = b.evolved ? 'rgba(190,255,255,0.9)' : 'rgba(140,220,255,0.8)';
        ctx.lineWidth = 8;
        ctx.globalAlpha = E.clamp(b.ttl * 3, 0, 1);
        ctx.beginPath(); ctx.arc(b.x, b.y, rr, 0, Math.PI * 2); ctx.stroke();
        if (rr > 6) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath(); ctx.arc(b.x, b.y, rr - 5, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        continue;
      }
      var img = SpriteGen.get(b.spr);
      var sc = 2 * (b.size / 16);
      if (b.kind === 'turret') {
        var frT = SpriteGen.frames(b.spr);
        img = frT[Math.floor(run.t * 6) % frT.length];
        ctx.drawImage(img, b.x - 16, b.y - 16, 32, 32);
        if (b.ttl < 1) ctx.globalAlpha = 1; // 淡出可省
        continue;
      }
      // 受队友光环加持的弹幕:先铺一层金色光晕
      if (b.blessed) {
        var bg = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.size * 0.9);
        bg.addColorStop(0, 'rgba(255,233,168,0.45)');
        bg.addColorStop(1, 'rgba(255,233,168,0)');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.size * 0.9, 0, Math.PI * 2); ctx.fill();
      }
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      var w2 = img.width * 2 * (b.size / 16) / 2;
      var h2 = img.height * 2 * (b.size / 16) / 2;
      ctx.drawImage(img, -w2, -h2, w2 * 2, h2 * 2);
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
    w.evoId = def.evo;
    Meta.track('evolve');
    Meta.seeCodex('e_' + def.evo);
    AudioSys.play('evolve');
    return CFG.EVOS[def.evo];
  }

  function canEvolve(run, w) {
    var def = CFG.WEAPONS[w.id];
    if (!def || w.evolved) return false;
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
    spdM: function (v) { return '弹速 +' + Math.round((v - 1) * 100) + '%'; }
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
        { type: 'heal', id: 'heal', name: '烤肉', icon: 'meat', desc: '恢复 50 点生命', isNew: false, curLv: 0, maxLv: 0 }
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
    chestLoot: chestLoot, canEvolve: canEvolve, findWeapon: findWeapon,
    wStats: wStats
  };
})();
