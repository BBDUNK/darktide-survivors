// minimap.js — 小地图:显示玩家周围的经验宝石和掉落物
window.Minimap = (function () {
  'use strict';

  var SIZE = 100;  // 小地图尺寸
  var RANGE = 400; // 显示范围半径

  function draw(ctx, run) {
    var p = run.player;
    var x0 = CFG.GAME.W - SIZE - 12;
    var y0 = 65;

    // 背景
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#1a1625';
    ctx.fillRect(x0, y0, SIZE, SIZE);
    ctx.strokeStyle = '#4a3f5a';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, SIZE, SIZE);
    ctx.globalAlpha = 1;

    // 玩家中心点
    var cx = x0 + SIZE / 2;
    var cy = y0 + SIZE / 2;

    // 绘制经验宝石
    var gems = Entities.getGems();
    for (var i = 0; i < gems.length; i++) {
      var g = gems[i];
      if (!g.alive) continue;
      var dx = g.x - p.x;
      var dy = g.y - p.y;
      var dist = Math.hypot(dx, dy);
      if (dist > RANGE) continue;
      var mx = cx + (dx / RANGE) * (SIZE / 2);
      var my = cy + (dy / RANGE) * (SIZE / 2);
      ctx.fillStyle = '#59c2ff';
      ctx.fillRect(mx - 1, my - 1, 2, 2);
    }

    // 绘制道具
    var items = Entities.getItems();
    for (var j = 0; j < items.length; j++) {
      var it = items[j];
      if (!it.alive) continue;
      var dx2 = it.x - p.x;
      var dy2 = it.y - p.y;
      var dist2 = Math.hypot(dx2, dy2);
      if (dist2 > RANGE) continue;
      var mx2 = cx + (dx2 / RANGE) * (SIZE / 2);
      var my2 = cy + (dy2 / RANGE) * (SIZE / 2);
      var color = it.type === 'chest' ? '#ffd76b' : (it.type === 'coin' ? '#ffeb3b' : '#ff6b9d');
      ctx.fillStyle = color;
      if (it.type === 'chest') {
        ctx.fillRect(mx2 - 2, my2 - 2, 4, 4);
      } else {
        ctx.fillRect(mx2 - 1, my2 - 1, 3, 3);
      }
    }

    // 玩家位置(中心三角形)
    ctx.fillStyle = '#7dff7d';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 4);
    ctx.lineTo(cx - 3, cy + 3);
    ctx.lineTo(cx + 3, cy + 3);
    ctx.closePath();
    ctx.fill();
  }

  return { draw: draw };
})();
