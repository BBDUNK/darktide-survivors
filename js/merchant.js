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
    // 走到商品上自动购买
    var p = run.player;
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      if (!s || s.bought) continue;
      if (E.dist2(p.x, p.y, s.x, s.y) > M.pickR * M.pickR) continue;
      if (run.gold < s.good.cost) {
        // 钱不够:每秒最多提示一次,避免刷屏
        if (!s.warnT || run.t - s.warnT > 1.5) {
          s.warnT = run.t;
          FX.dmgText(s.x, s.y - 30, '金币不足', { crit: false });
        }
        continue;
      }
      run.gold -= s.good.cost;
      buy(run, s.good);
      s.bought = true;
      FX.burst(s.x, s.y, { color: '#ffd76b', n: 14, speed: 100, life: 0.5, size: 2 });
      FX.ring(s.x, s.y, { r: 34, color: '#ffd76b', life: 0.4, width: 3 });
      AudioSys.play('upgrade_pick');
    }
  }

  function buy(run, g) {
    var p = run.player;
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
        Entities.bombBlast(run, 260);
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
  }

  // 摊位与商人:画在地面层之上、角色之下
  function draw(ctx, run) {
    var M = CFG.MERCHANT;
    // 商人本体(行商浪人专属形象)+ 摊位底座
    var mimg = SpriteGen.get('merchant');
    var bob = Math.sin(run.t * 2) * 2;
    ctx.globalAlpha = 0.4;
    ctx.drawImage(SpriteGen.get('vfx_shadow'), M.x - 14, M.y - 52, 28, 9);
    ctx.globalAlpha = 1;
    ctx.drawImage(mimg, M.x - mimg.width, M.y - 56 - mimg.height * 2 + bob,
                  mimg.width * 2, mimg.height * 2);
    // 招牌(无底色,直接描边文字)——上移到商人头顶上方,避免挡住形象
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(8,6,18,0.9)';
    ctx.strokeText('行商浪人', M.x, M.y - 108);
    ctx.fillStyle = '#ffd76b';
    ctx.fillText('行商浪人', M.x, M.y - 108);
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
      // 名称 + 价格:描边文字保证可读,不要黑底
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      var costTxt = '◈ ' + s.good.cost;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(8,6,18,0.9)';
      ctx.strokeText(s.good.name.slice(0, 8), sx, M.y + 21);
      ctx.fillStyle = '#e8e2f5';
      ctx.fillText(s.good.name.slice(0, 8), sx, M.y + 21);
      ctx.strokeText(costTxt, sx, M.y + 31);
      ctx.fillStyle = canAfford ? '#ffd76b' : '#ff8b94';
      ctx.fillText(costTxt, sx, M.y + 31);
    }
    ctx.textAlign = 'left';
  }

  // 补货倒计时小闹钟:商人头顶右侧显示下次刷新剩余时间
  function drawClock(ctx, run) {
    var M = CFG.MERCHANT;
    var remain = Math.max(0, nextRefresh - run.t);
    var mm = Math.floor(remain / 60), ss = Math.floor(remain % 60);
    var txt = (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
    var cx = M.x + 46, cy = M.y - 86;
    // 钟面
    ctx.fillStyle = 'rgba(8,6,18,0.8)';
    ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffd76b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.stroke();
    // 钟摆
    ctx.strokeStyle = '#ffd76b'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(run.t * 2) * 6, cy + 10);
    ctx.stroke();
    // 剩余时间
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(txt, cx, cy + 3);
  }

  return { reset: reset, update: update, draw: draw, roll: roll,
           slots: function () { return slots; } };
})();
