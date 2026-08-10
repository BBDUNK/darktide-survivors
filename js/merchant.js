// merchant.js — 地图中心的流浪商人
//
// 摊位横向排开,每个摊位放一件商品并在下方标价。玩家走到商品上若金币足够就自动买下,
// 摊位随即变成空位。每 refreshInt 秒全部重掷,并增加一个摊位(上限 maxSlots)。
window.Merchant = (function () {
  'use strict';
  var E = Engine;

  var slots = [];        // [{good, cost, bought, x, y} | null]
  var nextRefresh = 0;
  var slotCount = 0;
  var flash = 0;         // 刷新时的高亮计时
  var arrows = [];
  var combat = { prone: 0, attackAge: 9, attackCd: 0.3, face: 1, target: null };

  function reset(run) {
    var M = CFG.MERCHANT;
    slotCount = M.slots;
    nextRefresh = M.refreshInt;
    roll(run);
    flash = 0;
    arrows.length = 0;
    combat.prone = 0; combat.attackAge = 9; combat.attackCd = 0.3;
    combat.face = 1; combat.target = null;
  }

  // 抽一件商品。武器/被动这两类要在运行时决定具体是哪一个。
  function pickGood(run, used) {
    var M = CFG.MERCHANT;
    for (var tries = 0; tries < 24; tries++) {
      var g = M.goods[Math.floor(Math.random() * M.goods.length)];
      if (g.kind === 'weapon') {
        var wc = [];
        for (var wid in CFG.WEAPONS) {
          if (run.banished.has(wid)) continue;
          var have = Weapons.findWeapon(run, wid);
          if (have && (have.evolved || have.lv >= CFG.WEAPONS[wid].lv.length + 1)) continue;
          if (!have && run.weapons.length >= CFG.GAME.MAX_WEAPONS) continue;
          if (used['w_' + wid]) continue;
          wc.push(wid);
        }
        if (!wc.length) continue;
        var pickW = wc[Math.floor(Math.random() * wc.length)];
        var wdef = CFG.WEAPONS[pickW];
        var owned = Weapons.findWeapon(run, pickW);
        used['w_' + pickW] = 1;
        return {
          kind: 'weapon', id: pickW,
          name: wdef.name + (owned ? ' Lv.' + (owned.lv + 1) : ''),
          icon: wdef.icon, cost: g.cost, desc: owned ? '强化' : '新武器'
        };
      }
      if (g.kind === 'passive') {
        var pc = [];
        for (var pid in CFG.PASSIVES) {
          if (run.banished.has(pid)) continue;
          var lv = run.passives[pid] || 0;
          if (lv >= CFG.PASSIVES[pid].maxLv) continue;
          if (!lv && Object.keys(run.passives).length >= CFG.GAME.MAX_PASSIVES) continue;
          if (used['p_' + pid]) continue;
          pc.push(pid);
        }
        if (!pc.length) continue;
        var pickP = pc[Math.floor(Math.random() * pc.length)];
        var pdef = CFG.PASSIVES[pickP];
        used['p_' + pickP] = 1;
        return {
          kind: 'passive', id: pickP,
          name: pdef.name + ' Lv.' + ((run.passives[pickP] || 0) + 1),
          icon: pdef.icon, cost: g.cost, desc: pdef.desc
        };
      }
      if (used[g.kind]) continue;
      used[g.kind] = 1;
      return { kind: g.kind, name: g.name, icon: g.icon, cost: g.cost, desc: g.desc };
    }
    return null;
  }

  function roll(run) {
    var M = CFG.MERCHANT;
    slots.length = 0;
    var used = {};
    var half = (slotCount - 1) / 2;
    for (var i = 0; i < slotCount; i++) {
      var g = pickGood(run, used);
      slots.push(g ? {
        good: g, bought: false,
        x: M.x + (i - half) * M.spacing,
        y: M.y
      } : null);
    }
    flash = 1.2;
  }

  function update(run, dt) {
    var M = CFG.MERCHANT;
    if (flash > 0) flash -= dt;
    // 定时刷新:全部重掷并加一个摊位
    if (run.t >= nextRefresh) {
      nextRefresh = run.t + M.refreshInt;
      if (slotCount < M.maxSlots) slotCount++;
      roll(run);
      if (run.cb && run.cb.onWarn) run.cb.onWarn('🛒 商人补货了!');
    }
    updateCombat(run, dt);
    // 走到商品上自动购买(任意参战玩家都可购买)
    var ents = run.coopPlayers || [{ player: run.player, downed: false }];
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      if (!s || s.bought) continue;
      var owner = null;
      for (var ei = 0; ei < ents.length; ei++) {
        var ew = ents[ei];
        if (ew.downed || ew.player.hp <= 0) continue;
        if (E.dist2(ew.player.x, ew.player.y, s.x, s.y) <= M.pickR * M.pickR) {
          owner = ew; break;
        }
      }
      if (!owner) continue;
      if (run.gold < s.good.cost) {
        // 钱不够:每秒最多提示一次,避免刷屏
        if (!s.warnT || run.t - s.warnT > 1.5) {
          s.warnT = run.t;
          FX.dmgText(owner.player.x, owner.player.y - 30, '金币不足', { crit: false });
        }
        continue;
      }
      run.gold -= s.good.cost;
      buy(run, s.good, owner);
      s.bought = true;
      FX.burst(owner.player.x, owner.player.y, { color: '#ffd76b', n: 14, speed: 100, life: 0.5, size: 2 });
      FX.ring(owner.player.x, owner.player.y, { r: 34, color: '#ffd76b', life: 0.4, width: 3 });
      AudioSys.play('upgrade_pick');
    }
  }

  function nearestEnemy(x, y, range) {
    var pool = Entities.pool, best = null, bestD = range * range;
    for (var i = 0; i < pool.length; i++) {
      var e = pool[i];
      if (!e.alive) continue;
      var d = E.dist2(x, y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  // 老商人只在安全距离外逞强。怪物一旦贴近,他会立刻趴地装死并停止射击。
  function updateCombat(run, dt) {
    var M = CFG.MERCHANT;
    var close = nearestEnemy(M.x, M.y - 36, M.playDeadR || 135);
    if (close) {
      combat.prone = Math.min(1, combat.prone + dt * 3.6);
      combat.target = close;
      combat.attackAge = 9;
    } else {
      combat.prone = Math.max(0, combat.prone - dt * 2.0);
      combat.attackCd -= dt;
      combat.attackAge += dt;
      var target = nearestEnemy(M.x, M.y - 42, M.attackRange || 440);
      combat.target = target;
      if (target) {
        combat.face = target.x >= M.x ? 1 : -1;
        if (combat.prone <= 0.02 && combat.attackCd <= 0) {
          combat.attackCd = M.attackCd || 1.35;
          combat.attackAge = 0;
          fireArrow(run, target);
        }
      }
    }
    updateArrows(run, dt);
  }

  function fireArrow(run, target) {
    var M = CFG.MERCHANT;
    // 出箭点跟着绘制高度走:弓大致在身高一半略上的位置
    var sx = M.x + combat.face * (M.drawH * 0.22), sy = M.y - 56 - M.drawH * 0.5;
    var tx = target.x, ty = target.y - 5;
    var dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy) || 1;
    var speed = M.arrowSpeed || 360;
    arrows.push({
      alive: true, x: sx, y: sy, vx: dx / d * speed, vy: dy / d * speed,
      ttl: 1.5, dmg: (M.arrowDamage || 20) + run.t * 0.025
    });
    AudioSys.play('shoot_arrow');
  }

  function updateArrows(run, dt) {
    var pool = Entities.pool;
    for (var i = arrows.length - 1; i >= 0; i--) {
      var a = arrows[i];
      a.ttl -= dt;
      a.x += a.vx * dt; a.y += a.vy * dt;
      if (a.ttl <= 0) { arrows.splice(i, 1); continue; }
      var hit = null;
      for (var j = 0; j < pool.length; j++) {
        var e = pool[j];
        if (!e.alive) continue;
        var rr = e.r + 5;
        if (E.dist2(a.x, a.y, e.x, e.y) <= rr * rr) { hit = e; break; }
      }
      if (!hit) continue;
      Entities.damageEnemy(run, hit, a.dmg, {
        noCrit: true, kx: a.vx * 0.08, ky: a.vy * 0.08
      });
      FX.burst(a.x, a.y, { color: '#d8b46b', n: 4, speed: 55, life: 0.22, size: 1.5 });
      arrows.splice(i, 1);
    }
  }

  function buy(run, g, w) {
    var savedP = run.player, savedW = run.weapons, savedPs = run.passives;
    run.player = w ? w.player : run.player;
    run.weapons = w ? w.weapons : run.weapons;
    run.passives = w ? w.passives : run.passives;
    var p = run.player;
    try {
      switch (g.kind) {
        case 'heal':
          p.hp = Math.min(p.stats.hp, p.hp + 60);
          FX.heal(p.x, p.y);
          break;
        case 'shield':
          p.shield = (p.shield || 0) + 30;
          FX.ring(p.x, p.y, { r: 30, color: '#7af', life: 0.4, width: 3 });
          break;
        case 'bomb':
          Entities.bombBlast(run, 260, p.x, p.y);
          break;
        case 'magnet':
          var gems = Entities.getGems();
          for (var i = 0; i < gems.length; i++) if (gems[i].alive) gems[i].pull = true;
          break;
        case 'clock':
          run.freezeT = Math.max(run.freezeT, 4);
          break;
        case 'reroll':
          run.rerolls++;
          break;
        case 'banish':
          run.banishes++;
          break;
        case 'weapon':
          var have = Weapons.findWeapon(run, g.id);
          if (have) have.lv++;
          else Weapons.addWeapon(run, g.id);
          break;
        case 'passive':
          Weapons.addPassive(run, g.id);
          break;
      }
    } finally {
      run.player = savedP; run.weapons = savedW; run.passives = savedPs;
    }
  }

  // 摊位与商人:画在地面层之上、角色之下
  function draw(ctx, run) {
    var M = CFG.MERCHANT;
    // 三态动作:警戒待机 / 拉弓射击 / 趴地装死。最后一帧可持续保持趴伏。
    var actionName = 'merchant';
    var frameIndex = 0;
    var merchantFrames;
    if (combat.prone > 0.02) {
      // 趴地是"站→躺"的单向过程,后半段本就该越来越扁,不能按覆盖率筛帧,
      // 否则会把真正躺平的那几帧当成坏帧丢掉。这里按进度取帧、末帧保持。
      actionName = 'merchant_prone';
      merchantFrames = SpriteGen.frames(actionName);
      frameIndex = Math.min(merchantFrames.length - 1, Math.floor(combat.prone * merchantFrames.length));
    } else {
      if (combat.attackAge < 0.68) {
        actionName = 'merchant_attack';
        frameIndex = Math.floor(combat.attackAge * SpriteGen.animationFps(actionName, 12));
      } else {
        actionName = 'merchant';
        frameIndex = Math.floor(run.t * SpriteGen.animationFps(actionName, 7));
      }
      merchantFrames = SpriteGen.stableFrames(actionName);
    }
    var mimg = merchantFrames[frameIndex % merchantFrames.length];
    var bob = Math.sin(run.t * 2) * 1;
    // 等比缩放到与角色等高。之前 mw 在装死时 40→45 而 mh 恒为 40,把商人横向拉扁;
    // 按原图宽高比推宽度就不会再变形,各动作之间体型也一致。
    var mh = M.drawH;
    var mw = mh * (mimg.width / mimg.height);
    var groundY = M.y - 56;              // 站位在摊位后方,脚底落在这条线上
    var shadowW = mw * 0.6;
    ctx.globalAlpha = 0.4;
    ctx.drawImage(SpriteGen.get('vfx_shadow'), M.x - shadowW / 2, groundY - 6, shadowW, 12);
    ctx.globalAlpha = 1;
    var mTop = groundY - mh + bob;
    if (combat.face < 0 && combat.prone < 0.65) {
      ctx.save(); ctx.translate(M.x, 0); ctx.scale(-1, 1);
      ctx.drawImage(mimg, -mw / 2, mTop, mw, mh);
      ctx.restore();
    } else {
      ctx.drawImage(mimg, M.x - mw / 2, mTop, mw, mh);
    }
    // 补货倒计时小闹钟
    drawClock(ctx, run);

    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      var sx = M.x + (i - (slotCount - 1) / 2) * M.spacing;
      // 摊位底座
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#3a2f22';
      ctx.beginPath();
      ctx.ellipse(sx, M.y + 6, 22, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (!s || s.bought) {
        // 空位
        ctx.strokeStyle = 'rgba(140,130,160,0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.arc(sx, M.y, 15, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }
      var canAfford = run.gold >= s.good.cost;
      var pulse = 0.5 + Math.sin(run.t * 4 + i) * 0.5;
      // 可购买时脚下泛光(缓存贴图)
      var gc = canAfford ? '#ffd76b' : '#78788c';
      ctx.globalAlpha = 0.5 + pulse * 0.3;
      ctx.drawImage(SpriteGen.glow(gc), sx - 26, M.y - 26, 52, 52);
      ctx.globalAlpha = 1;
      // 商品图标
      var img = SpriteGen.get(s.good.icon);
      var iw = img.width * 1.6, ih = img.height * 1.6;
      ctx.globalAlpha = canAfford ? 1 : 0.5;
      ctx.drawImage(img, sx - iw / 2, M.y - ih / 2 - 6 + Math.sin(run.t * 3 + i) * 2, iw, ih);
      ctx.globalAlpha = 1;
      // 刷新闪光
      if (flash > 0) {
        ctx.globalAlpha = E.clamp(flash, 0, 1) * 0.5;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(sx, M.y, 20, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // 名称 + 价格:加大描边文字保证可读,不要黑底
      ctx.font = 'bold 13px "Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      var costTxt = '◈ ' + s.good.cost;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(8,6,18,0.9)';
      ctx.strokeText(s.good.name.slice(0, 8), sx, M.y + 21);
      ctx.fillStyle = '#e8e2f5';
      ctx.fillText(s.good.name.slice(0, 8), sx, M.y + 21);
      ctx.strokeText(costTxt, sx, M.y + 37);
      ctx.fillStyle = canAfford ? '#ffd76b' : '#ff8b94';
      ctx.fillText(costTxt, sx, M.y + 37);
    }
    ctx.textAlign = 'left';
  }

  // 箭矢位于角色/怪物层之上,由 main.js 在实体之后绘制。
  function drawProjectiles(ctx, run) {
    var frames = SpriteGen.frames('p_arrow');
    var img = frames[Math.floor(run.t * SpriteGen.animationFps('p_arrow', 14)) % frames.length];
    for (var i = 0; i < arrows.length; i++) {
      var a = arrows[i];
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(Math.atan2(a.vy, a.vx));
      ctx.drawImage(img, -17, -5, 34, 10);
      ctx.restore();
    }
  }

  // 补货倒计时单针钟:一根指针表示剩余比例,转过区域红、未转区域蓝
  function drawClock(ctx, run) {
    var M = CFG.MERCHANT;
    var remain = Math.max(0, nextRefresh - run.t);
    var total = M.refreshInt || 300;
    var frac = Math.max(0, Math.min(1, remain / total));   // 剩余比例 1→0
    var cx = M.x + 46, cy = M.y - 86;
    var R = 12;
    // 蓝:未转过的剩余区域(从指针当前位置顺时针回到 12 点)
    ctx.fillStyle = 'rgba(80,150,255,0.75)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, (1 - frac) * Math.PI * 2, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    // 红:已转过的区域(从 12 点顺时针到指针当前位置)
    ctx.fillStyle = 'rgba(230,60,70,0.85)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, 0, (1 - frac) * Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    // 表盘描边
    ctx.strokeStyle = 'rgba(255,220,150,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    // 指针:指向剩余区域的边界(已转过的末端)
    var ang = (1 - frac) * Math.PI * 2 - Math.PI / 2;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * (R - 1), cy + Math.sin(ang) * (R - 1));
    ctx.stroke();
    // 中心点
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx, cy, 1.6, 0, Math.PI * 2); ctx.fill();
  }

  return { reset: reset, update: update, draw: draw, drawProjectiles: drawProjectiles, roll: roll,
           slots: function () { return slots; },
           combatState: function () { return { prone: combat.prone, arrows: arrows.length, target: !!combat.target }; } };
})();
