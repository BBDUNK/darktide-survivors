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

  function reset(run) {
    var M = CFG.MERCHANT;
    slotCount = M.slots;
    nextRefresh = M.refreshInt;
    roll(run);
    flash = 0;
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
    // 新商人使用四帧待机动画；脚底锚定在摊位后方，不再用名字遮挡形象。
    var merchantFrames = SpriteGen.frames('merchant');
    var merchantFps = SpriteGen.animationFps('merchant', 6);
    var mimg = merchantFrames[Math.floor(run.t * merchantFps) % merchantFrames.length];
    var bob = Math.sin(run.t * 2) * 1;
    var mw = 72, mh = 72;
    ctx.globalAlpha = 0.4;
    ctx.drawImage(SpriteGen.get('vfx_shadow'), M.x - 22, M.y - 60, 44, 12);
    ctx.globalAlpha = 1;
    ctx.drawImage(mimg, M.x - mw / 2, M.y - 58 - mh + bob, mw, mh);
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

  return { reset: reset, update: update, draw: draw, roll: roll,
           slots: function () { return slots; } };
})();
