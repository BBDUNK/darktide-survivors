// minimap.js — 哥特像素罗盘：局部视野 / 全图切换
window.Minimap = (function () {
  'use strict';

  var SIZE = 132;
  var FOOTER = 28;
  var EDGE = 8;
  var LOCAL_RANGE = 420;
  var mode = 'local';

  function toggle() {
    mode = mode === 'local' ? 'full' : 'local';
    return mode;
  }
  function getMode() { return mode; }

  function project(wx, wy, p, cx, cy, half) {
    if (mode === 'full') {
      var worldR = CFG.GAME.MAP_R;
      return { x: cx + wx / worldR * half, y: cy + wy / worldR * half };
    }
    var dx = wx - p.x, dy = wy - p.y;
    if (Math.hypot(dx, dy) > LOCAL_RANGE) return null;
    return { x: cx + dx / LOCAL_RANGE * half, y: cy + dy / LOCAL_RANGE * half };
  }

  // 常驻地标(商人):本地模式超出范围也钳制到罗盘边缘指示方向,保证始终可见
  function landmarkPoint(wx, wy, p, cx, cy, half) {
    if (mode === 'full') return project(wx, wy, p, cx, cy, half);
    var dx = wx - p.x, dy = wy - p.y;
    var dist = Math.hypot(dx, dy);
    if (dist <= LOCAL_RANGE) return project(wx, wy, p, cx, cy, half);
    var k = half * 0.96 / dist;
    return { x: cx + dx * k, y: cy + dy * k };
  }

  function dot(ctx, pt, color, size) {
    ctx.fillStyle = 'rgba(5,3,12,0.86)';
    ctx.fillRect(Math.round(pt.x - size / 2) - 1, Math.round(pt.y - size / 2) - 1, size + 2, size + 2);
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(pt.x - size / 2), Math.round(pt.y - size / 2), size, size);
  }

  function drawFrame(ctx, x, y) {
    var totalH = SIZE + FOOTER;
    ctx.fillStyle = '#0b0913';
    ctx.fillRect(x, y, SIZE, totalH);
    ctx.strokeStyle = '#161124';
    ctx.lineWidth = 5;
    ctx.strokeRect(x + 2.5, y + 2.5, SIZE - 5, totalH - 5);
    ctx.strokeStyle = '#7e6440';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 3, y + 3, SIZE - 6, totalH - 6);
    ctx.strokeStyle = '#9a6cff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 6.5, y + 6.5, SIZE - 13, SIZE - 13);
    // 四角金属铆钉与内收装饰
    var corners = [[x + 1, y + 1], [x + SIZE - 8, y + 1], [x + 1, y + SIZE - 8], [x + SIZE - 8, y + SIZE - 8]];
    for (var i = 0; i < corners.length; i++) {
      ctx.fillStyle = '#241a32'; ctx.fillRect(corners[i][0], corners[i][1], 7, 7);
      ctx.fillStyle = '#c89c55'; ctx.fillRect(corners[i][0] + 2, corners[i][1] + 2, 3, 3);
    }
    var artFrame = SpriteGen.get('hud_minimap_frame');
    ctx.drawImage(artFrame, x - 5, y - 5, SIZE + 10, SIZE + 10);
  }

  function draw(ctx, run) {
    var p = run.player;
    var x0 = CFG.GAME.W - SIZE - EDGE;
    var y0 = 16;
    var inset = 10;
    var mapSize = SIZE - inset * 2;
    var half = mapSize / 2;
    var cx = x0 + SIZE / 2;
    var cy = y0 + SIZE / 2;

    drawFrame(ctx, x0, y0);
    ctx.fillStyle = 'rgba(16,13,27,0.98)';
    ctx.fillRect(x0 + inset, y0 + inset, mapSize, mapSize);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 + inset, y0 + inset, mapSize, mapSize);
    ctx.clip();

    // 低对比的不规则星尘，不画网格。
    for (var n = 0; n < 23; n++) {
      var nx = x0 + inset + ((n * 47 + 13) % mapSize);
      var ny = y0 + inset + ((n * 31 + 7) % mapSize);
      ctx.fillStyle = n % 4 === 0 ? 'rgba(126,99,170,0.20)' : 'rgba(104,91,126,0.13)';
      ctx.fillRect(nx, ny, n % 5 === 0 ? 2 : 1, 1);
    }
    if (mode === 'full') {
      ctx.strokeStyle = 'rgba(162,112,255,0.62)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - half + 1, cy - half + 1, half * 2 - 2, half * 2 - 2);
    } else {
      ctx.strokeStyle = 'rgba(160,120,210,0.18)';
      ctx.beginPath(); ctx.arc(cx, cy, half * 0.62, 0, Math.PI * 2); ctx.stroke();
    }

    var gems = Entities.getGems();
    for (var i = 0; i < gems.length; i++) {
      var gm = gems[i];
      if (!gm.alive) continue;
      var gp = project(gm.x, gm.y, p, cx, cy, half - 2);
      if (gp) dot(ctx, gp, '#5cc8ff', gm.v >= 10 ? 3 : 2);
    }

    var items = Entities.getItems();
    for (var j = 0; j < items.length; j++) {
      var it = items[j];
      if (!it.alive) continue;
      var ip = project(it.x, it.y, p, cx, cy, half - 2);
      if (!ip) continue;
      dot(ctx, ip, it.type === 'chest' ? '#ffd76b' : (it.type === 'coin' ? '#f4c94d' : '#ff79a5'), it.type === 'chest' ? 6 : 3);
    }

    var merchant = CFG.MERCHANT;
    if (merchant) {
      // 商人是常驻 NPC,超出局部范围也钳制到边缘显示方向
      var mp = landmarkPoint(merchant.x, merchant.y, p, cx, cy, half - 2);
      if (mp) {
        ctx.fillStyle = '#1a1010';
        ctx.fillRect(mp.x - 4, mp.y - 5, 9, 10);
        ctx.fillStyle = '#ffd76b';
        ctx.beginPath();
        ctx.moveTo(mp.x, mp.y - 4); ctx.lineTo(mp.x - 4, mp.y + 4); ctx.lineTo(mp.x + 4, mp.y + 4);
        ctx.closePath(); ctx.fill();
      }
    }

    var pool = Entities.pool;
    for (var k = 0; k < pool.length; k++) {
      var enemy = pool[k];
      if (!enemy.alive || (!enemy.boss && !enemy.elite)) continue;
      var ep = project(enemy.x, enemy.y, p, cx, cy, half - 2);
      if (ep) dot(ctx, ep, enemy.boss ? '#ff5268' : '#ff9d5c', enemy.boss ? 7 : 5);
    }

    var pp = mode === 'full' ? project(p.x, p.y, p, cx, cy, half - 2) : { x: cx, y: cy };
    ctx.fillStyle = '#07100a';
    ctx.beginPath();
    ctx.moveTo(pp.x, pp.y - 6); ctx.lineTo(pp.x - 5, pp.y + 5); ctx.lineTo(pp.x + 5, pp.y + 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#82ff91';
    ctx.beginPath();
    ctx.moveTo(pp.x, pp.y - 4); ctx.lineTo(pp.x - 3, pp.y + 3); ctx.lineTo(pp.x + 3, pp.y + 3); ctx.closePath(); ctx.fill();
    ctx.restore();

    // 罗盘字与底部状态条都纳入同一框体，避免散落在地图下方。
    ctx.font = 'bold 9px "KaiTi","楷体","STKaiti","华文楷体",serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d7bd82';
    ctx.fillText('N', cx, y0 + 17);
    ctx.fillStyle = '#171120';
    ctx.fillRect(x0 + 8, y0 + SIZE + 3, SIZE - 16, 20);
    ctx.strokeStyle = '#4f3c63';
    ctx.strokeRect(x0 + 8.5, y0 + SIZE + 3.5, SIZE - 17, 19);
    // 底部状态条只放"索敌方式",居中占满整条。
    // 之前左边还并排一个"周围/全图",两段合起来 110px + 间距 > 116px 的内宽,
    // 在"最低血量/最高血量"这两个较长的模式名下会挤出边框。
    // 视野模式改为画在地图右上角的小角标(见下),不再争抢这条的宽度。
    ctx.font = 'bold 10px "KaiTi","楷体","STKaiti","华文楷体",serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd992';
    ctx.fillText('索敌方式：' + Weapons.getTargetModeName(), cx, y0 + SIZE + 17);

    // 视野模式角标:贴在小地图右上角内侧,带深色衬底保证在地图内容上也可读
    var tag = mode === 'full' ? '全图' : '周围';
    ctx.font = 'bold 9px "KaiTi","楷体","STKaiti","华文楷体",serif';
    var tw = ctx.measureText(tag).width;
    ctx.fillStyle = 'rgba(12,8,20,0.78)';
    ctx.fillRect(x0 + SIZE - tw - 12, y0 + 5, tw + 7, 13);
    ctx.strokeStyle = 'rgba(120,96,150,0.75)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + SIZE - tw - 11.5, y0 + 5.5, tw + 6, 12);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#c8b6dd';
    ctx.fillText(tag, x0 + SIZE - tw / 2 - 8, y0 + 15);
    ctx.textAlign = 'left';
  }

  function hitBox() {
    return { x: CFG.GAME.W - SIZE - EDGE, y: 16, w: SIZE, h: SIZE + FOOTER };
  }

  return { draw: draw, toggle: toggle, getMode: getMode, hitBox: hitBox };
})();
