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
  var stockGeneration = 0;
  var flash = 0;         // 刷新时的高亮计时
  var arrows = [];
  var combat = { prone: 0, attackAge: 9, attackCd: 0.3, face: 1, target: null };
  var dialogue = { text: '', until: 0, nextAt: 3, wasNear: false };   // 每 20 秒一句,一句 10 秒;点击可提前换话

  // 动画帧的"身体水平中心"。AI 母版每帧内容位置并不一致(质心在 43~47.5 漂移),
  // 直接按帧中心画会让商人身体在攻击时左右跳 —— 那就是用户看到的"攻击闪烁"。
  // 这里按不透明像素质心重锚定,让身体钉在原地,弓臂动画照常播放。
  var anchorCache = {};
  function frameCenters(name, frames) {
    var key = name + '|' + frames.length;
    if (anchorCache[key]) return anchorCache[key];
    var out = [];
    try {
      var cv = document.createElement('canvas');
      var g = cv.getContext('2d', { willReadFrequently: true });
      for (var i = 0; i < frames.length; i++) {
        var im = frames[i];
        cv.width = im.width; cv.height = im.height;
        g.clearRect(0, 0, cv.width, cv.height);
        g.drawImage(im, 0, 0);
        var d = g.getImageData(0, 0, cv.width, cv.height).data;
        var n = 0, sx = 0, k;
        for (k = 3; k < d.length; k += 4) if (d[k] > 16) { n++; sx += (k / 4) % cv.width; }
        out.push(n ? sx / n : im.width / 2);
      }
    } catch (e) {
      // file:// 下画布被污染读不了像素,退回帧中心(不重锚定,可能仍有轻微抖动)
      out = frames.map(function (im) { return im.width / 2; });
    }
    anchorCache[key] = out;
    return out;
  }

  function reset(run) {
    var M = CFG.MERCHANT;
    slotCount = M.slots;
    nextRefresh = M.refreshInt;
    stockGeneration = 0;
    roll(run);
    flash = 0;
    arrows.length = 0;
    combat.prone = 0; combat.attackAge = 9; combat.attackCd = 0.3;
    combat.face = 1; combat.target = null;
    dialogue.text = ''; dialogue.until = 0; dialogue.nextAt = 3;
  }

  // ================= 闲聊 =================
  // 商人的台词池:量大、口语化、贴合"走江湖的老摊贩"人设。
  // 高频话题:游戏背景史、夸 DeepSeek V4F、吐槽 Codex 额度少、夸玉皇大帝长得帅。
  // 每句控制在 18 字以内,保证不超出聊天框(绘制侧再截断一次兜底)。
  var DIALOGUE = [
    // ---- 游戏背景史 ----
    '这墓园曾是一座王城,如今只剩我摆摊。',
    '暗潮吞了半个大陆,圣骑士全没了音信。',
    '你脚下埋着三个王朝,挖出来都能卖钱。',
    '深渊之眼盯这儿三百年,没见它眨过眼。',
    '腐液之王原是屠夫,被诅咒泡成了烂泥。',
    '骸骨领主生前守财奴,金币烂在骨头里了。',
    '当年那场大洪水,把王朝账本都冲走了。',
    '圣坛底下镇着什么,连我都不敢多望。',
    '商路断了三百年,我算最后一段尾巴。',
    '战报上的字,我一个大字不识。',
    // ---- 夸 DeepSeek V4F ----
    '进货前问一句 V4F,亏本买卖它先摇头。',
    'V4F 算价,比我蹲三天集市都准。',
    'V4F 帮我压货,连天气都算进成本了。',
    '自从有了 V4F,砍价这手艺都快忘了。',
    'V4F 说我今日宜卖不宜买,我信了。',
    'V4F 是真的好用,算得比我还精。',
    '进货带上 V4F,路上遇几波怪都有数。',
    // ---- 吐槽 Codex 额度少 ----
    'Codex 画图是好手,就是额度总见底。',
    '让 Codex 重画史莱姆,它说额度不够。',
    'Codex 一高兴烧光额度,图纸剩半张。',
    '隔壁 Codex 的额度,比货架还容易空。',
    'Codex 改了三遍图,又改回第一遍。',
    '别催 Codex,额度就那么点,催了白催。',
    // ---- 夸玉皇大帝帅 ----
    '要说天下第一好看,非玉皇大帝莫属。',
    '玉皇大帝巡天那趟,连眼珠子都看直了。',
    '玉皇大帝往那一站,暗潮都得绕道走。',
    '那位玉皇大帝,端的是帅得没边。',
    '都说玉皇大帝帅,我拿货换他画像,值了。',
    '玉皇大帝三个字,比我的招牌还招人。',
    // ---- 摊贩日常 ----
    '今日货全,明日货全,钱包总不见全。',
    '这年头怪物比顾客多,生意难做啊。',
    '别把泥带进摊位,我刚擦的货架。',
    '想要好东西,先掏真金白银来。',
    '我只认钱,也认命——它俩都靠不住。',
    '武器趁手,命才趁手,都一个理。',
    '那边打得欢,这边数钱忙。',
    '童叟无欺,就是价格童叟都疼。'
  ];
  function pickDialogue(avoid) {
    if (DIALOGUE.length <= 1) return DIALOGUE[0];
    var i = Math.floor(Math.random() * DIALOGUE.length);
    // 尽量避免连续说同一句,也优先高频话题(前两类占比本就高)
    for (var guard = 0; guard < 8 && DIALOGUE[i] === avoid; guard++) {
      i = Math.floor(Math.random() * DIALOGUE.length);
    }
    return DIALOGUE[i];
  }
  // 玩家点击/点击商人时换一句(由 main.js 调用)
  function poke(run) {
    dialogue.text = pickDialogue(dialogue.text);
    dialogue.until = run.t + 10;
    dialogue.nextAt = run.t + 20;   // 被手动打断后,自动循环从下个 20 秒重新计时
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
    stockGeneration++;
    var used = {};
    var half = (slotCount - 1) / 2;
    for (var i = 0; i < slotCount; i++) {
      var g = pickGood(run, used);
      slots.push(g ? {
        uid: 'shop-' + stockGeneration + '-' + i,
        good: g, bought: false,
        x: M.x + (i - half) * M.spacing,
        y: M.y
      } : null);
    }
    flash = 1.2;
  }

  // 联机表现快照：商品由房主生成，客户端只显示，绝不在本地结算购买。
  function snapshot() {
    return {
      next: +nextRefresh.toFixed(2), count: slotCount, generation: stockGeneration,
      slots: slots.map(function (s, index) {
        if (!s) return null;
        return {
          uid: s.uid || ('shop-' + stockGeneration + '-' + index),
          bought: !!s.bought, x: Math.round(s.x), y: Math.round(s.y),
          good: s.good ? {
            kind: s.good.kind, id: s.good.id || '', name: s.good.name,
            icon: s.good.icon, cost: s.good.cost, desc: s.good.desc || ''
          } : null
        };
      })
    };
  }

  function applySnapshot(snap) {
    if (!snap || !Array.isArray(snap.slots)) return;
    nextRefresh = snap.next || nextRefresh;
    stockGeneration = snap.generation || stockGeneration;
    slotCount = snap.count || snap.slots.length;
    slots.length = 0;
    for (var i = 0; i < snap.slots.length; i++) {
      var s = snap.slots[i];
      slots.push(s ? { uid: s.uid, bought: !!s.bought, x: s.x, y: s.y, good: s.good } : null);
    }
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
    // 闲聊:每 20 秒说一句,一句持续 10 秒;走近时补一句"招呼"。
    // 光靠"在附近"触发会让玩家站桩时每 10 秒被打断一次,所以只在"刚走近"时触发,
    // 之后的节奏交给 20 秒定时。
    var nearMerchant = E.dist2(run.player.x, run.player.y, M.x, M.y - 42) < 340 * 340;
    if (dialogue.until <= run.t) {
      if (run.t >= dialogue.nextAt || (nearMerchant && !dialogue.wasNear)) {
        dialogue.nextAt = run.t + 20;
        dialogue.until = run.t + 10;
        dialogue.text = pickDialogue(dialogue.text);
      }
    }
    dialogue.wasNear = nearMerchant;
    // 走到商品上自动购买(任意参战玩家都可购买)
    var ents = run.coopPlayers || [{ player: run.player, downed: false }];
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      if (!s || !s.good || s.bought) continue;
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

  function purchaseByUid(run, uid, owner) {
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      if (!s || !s.good || uid !== s.uid) continue;
      if (s.bought) return { ok: false, reason: '商品已售出' };
      var buyerId = owner && (owner.peerId || (owner.isHost ? 'host' : 'local')) || 'host';
      if (run.gold < s.good.cost) return { ok: false, reason: '金币不足' };
      run.gold -= s.good.cost;
      buy(run, s.good, owner);
      s.bought = true;
      return { ok: true, uid: s.uid, buyer: buyerId };
    }
    return { ok: false, reason: '商品已售罄' };
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
    // 按内容质心重锚定,让身体水平中心钉在 M.x(见 frameCenters 注释)
    var cxs = frameCenters(actionName, merchantFrames);
    var cx = cxs[frameIndex % cxs.length] || (mimg.width / 2);
    var left = M.x - (cx / mimg.width) * mw;
    if (combat.face < 0 && combat.prone < 0.65) {
      ctx.save(); ctx.translate(M.x, 0); ctx.scale(-1, 1);
      ctx.drawImage(mimg, -(cx / mimg.width) * mw, mTop, mw, mh);
      ctx.restore();
    } else {
      ctx.drawImage(mimg, left, mTop, mw, mh);
    }
    if (dialogue.until > run.t) drawDialogue(ctx, M, dialogue.text);

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
      ctx.font = Engine.zoomFont('bold 13px "KaiTi","楷体","STKaiti","华文楷体",serif');
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

  function drawDialogue(ctx, M, text) {
    // 长句折成最多两行,每行 18 字内 —— 保证不溢出聊天框
    var max = 18, lines = [];
    if (text.length <= max) lines.push(text);
    else {
      lines.push(text.slice(0, max));
      lines.push(text.slice(max, max * 2));
    }
    var lh = 16, w = 204, h = lines.length * lh + 12;
    // 盒子放在商人头顶上方,不再压住贴图;商人母版高 drawH,头顶约在 M.y-56-drawH
    var x = M.x - w / 2, y = M.y - M.drawH - 112;
    ctx.save();
    ctx.fillStyle = 'rgba(255,253,245,.96)';
    ctx.strokeStyle = '#69482c'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 13, y); ctx.lineTo(x + w - 13, y); ctx.quadraticCurveTo(x + w, y, x + w, y + 13);
    ctx.lineTo(x + w, y + h - 13); ctx.quadraticCurveTo(x + w, y + h, x + w - 13, y + h);
    ctx.lineTo(x + 13, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - 13);
    ctx.lineTo(x, y + 13); ctx.quadraticCurveTo(x, y, x + 13, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(M.x - 9, y + h); ctx.lineTo(M.x + 3, y + h); ctx.lineTo(M.x - 3, y + h + 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#38241a'; ctx.font = Engine.zoomFont('bold 11px "KaiTi","楷体","STKaiti","华文楷体",serif'); ctx.textAlign = 'center';
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], M.x, y + 18 + i * lh);
    }
    ctx.restore();
  }

  return { reset: reset, update: update, draw: draw, drawProjectiles: drawProjectiles, roll: roll, poke: poke,
           slots: function () { return slots; }, snapshot: snapshot, applySnapshot: applySnapshot, purchaseByUid: purchaseByUid,
           dialogueState: function () { return { text: dialogue.text, until: dialogue.until, nextAt: dialogue.nextAt }; },
           combatState: function () { return { prone: combat.prone, arrows: arrows.length, target: !!combat.target }; } };
})();
