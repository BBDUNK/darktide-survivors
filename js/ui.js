// ui.js — 全部界面(DOM 覆盖层):菜单 / HUD / 升级 / 宝箱 / 结算 / 商店 / 成就 / 图鉴 / 设置
window.UI = (function () {
  'use strict';

  var root, cb = {};
  var screens = {};
  var sel = { charId: 'knight', mapId: 'graveyard' };
  var hudRefs = {};
  var hudCache = {};
  var banishMode = false;

  // ---------- DOM 工具 ----------
  function h(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function iconCanvas(name, px) {
    var src = SpriteGen.get(name);
    var c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    c.style.width = px + 'px'; c.style.height = px + 'px';
    c.className = 'pix';
    return c;
  }
  function btn(text, cls, onClick) {
    var b = h('button', 'btn ' + (cls || ''), text);
    b.addEventListener('click', function () { AudioSys.play('ui_click'); onClick(); });
    b.addEventListener('mouseenter', function () { AudioSys.play('ui_hover'); });
    return b;
  }
  function show(id) {
    for (var k in screens) {
      if (k === 'toasts') continue;
      screens[k].classList.toggle('hidden', k !== id);
    }
    if (id === 'menu') refreshMenu();
  }
  function overlay(id, visible) {
    if (screens[id]) screens[id].classList.toggle('hidden', !visible);
  }

  // ---------- 构建 ----------
  function init(callbacks) {
    cb = callbacks;
    root = document.getElementById('ui');
    buildTitle(); buildMenu(); buildChars(); buildMaps();
    buildShop(); buildAchv(); buildCodex(); buildSettings();
    buildHUD(); buildLevelUp(); buildChest(); buildPause(); buildResult();
    screens.toasts = h('div', 'toasts');
    root.appendChild(screens.toasts);
    show('title');
  }

  // ---------- 标题 ----------
  function buildTitle() {
    var s = h('div', 'screen center-col');
    var logo = h('div', 'logo');
    logo.appendChild(h('div', 'logo-main', '暗潮幸存者'));
    logo.appendChild(h('div', 'logo-sub', 'DARKTIDE SURVIVORS'));
    s.appendChild(logo);
    s.appendChild(h('div', 'blink hint', '— 点击任意处开始 —'));
    s.appendChild(h('div', 'credits', '全部素材程序化生成 · 存档保存在本地浏览器'));
    s.addEventListener('click', function () {
      AudioSys.unlock();
      AudioSys.play('ui_click');
      AudioSys.playMusic('menu');
      show('menu');
    }, { once: false });
    screens.title = s; root.appendChild(s);
  }

  // ---------- 主菜单 ----------
  var menuGold, menuStats;
  function buildMenu() {
    var s = h('div', 'screen center-col');
    var logo = h('div', 'logo small');
    logo.appendChild(h('div', 'logo-main', '暗潮幸存者'));
    s.appendChild(logo);
    menuGold = h('div', 'gold-line');
    s.appendChild(menuGold);
    var col = h('div', 'menu-col');
    col.appendChild(btn('⚔ 开始远征', 'big primary', function () { refreshChars(); show('chars'); }));
    col.appendChild(btn('🏛 强化圣坛', 'big', function () { refreshShop(); show('shop'); }));
    col.appendChild(btn('🏆 成就', 'big', function () { refreshAchv(); show('achv'); }));
    col.appendChild(btn('📖 图鉴', 'big', function () { refreshCodex(); show('codex'); }));
    col.appendChild(btn('⚙ 设置', 'big', function () { refreshSettings(); show('settings'); }));
    s.appendChild(col);
    menuStats = h('div', 'menu-stats');
    s.appendChild(menuStats);
    screens.menu = s; root.appendChild(s);
  }
  function refreshMenu() {
    var d = Meta.data();
    menuGold.innerHTML = '';
    menuGold.appendChild(iconCanvas('icon_gold', 20));
    menuGold.appendChild(h('span', '', ' ' + d.gold));
    var st = d.stats;
    menuStats.textContent = '总击杀 ' + st.kills + ' · 胜场 ' + st.wins + ' · 最长存活 ' + Engine.fmtTime(st.bestSurvive) + ' · 游玩 ' + Math.floor(st.playTime / 60) + ' 分钟';
  }

  // ---------- 选人 ----------
  var charGrid, charInfo;
  function buildChars() {
    var s = h('div', 'screen panel-col');
    s.appendChild(h('div', 'page-title', '选择角色'));
    charGrid = h('div', 'card-grid');
    s.appendChild(charGrid);
    charInfo = h('div', 'info-box');
    s.appendChild(charInfo);
    var row = h('div', 'btn-row');
    row.appendChild(btn('← 返回', '', function () { show('menu'); }));
    row.appendChild(btn('下一步 →', 'primary', function () { refreshMaps(); show('maps'); }));
    s.appendChild(row);
    screens.chars = s; root.appendChild(s);
  }
  function refreshChars() {
    charGrid.innerHTML = '';
    CFG.CHARS.forEach(function (c) {
      var unlocked = Meta.isCharUnlocked(c);
      var card = h('div', 'card' + (unlocked ? '' : ' locked') + (sel.charId === c.id ? ' selected' : ''));
      card.appendChild(iconCanvas(unlocked ? c.sprite : c.sprite, 48));
      card.appendChild(h('div', 'card-name', unlocked ? c.name : '???'));
      if (!unlocked) {
        var a = achvById(c.unlock.achv);
        card.appendChild(h('div', 'card-lock', '🔒 ' + (a ? a.desc.split('(')[0] : '')));
      } else {
        card.appendChild(h('div', 'card-sub', CFG.WEAPONS[c.weapon].name));
      }
      if (unlocked) card.addEventListener('click', function () {
        AudioSys.play('ui_click');
        sel.charId = c.id; refreshChars();
      });
      charGrid.appendChild(card);
    });
    var c = charById(sel.charId);
    charInfo.innerHTML = '';
    charInfo.appendChild(h('div', 'info-title', c.name));
    charInfo.appendChild(h('div', 'info-desc', c.desc));
    charInfo.appendChild(h('div', 'info-bonus', '★ ' + c.bonusText));
  }
  function charById(id) { for (var i = 0; i < CFG.CHARS.length; i++) if (CFG.CHARS[i].id === id) return CFG.CHARS[i]; return CFG.CHARS[0]; }
  function achvById(id) { for (var i = 0; i < CFG.ACHV.length; i++) if (CFG.ACHV[i].id === id) return CFG.ACHV[i]; return null; }

  // ---------- 选图 ----------
  var mapGrid;
  function buildMaps() {
    var s = h('div', 'screen panel-col');
    s.appendChild(h('div', 'page-title', '选择地图'));
    mapGrid = h('div', 'card-grid maps');
    s.appendChild(mapGrid);
    var row = h('div', 'btn-row');
    row.appendChild(btn('← 返回', '', function () { show('chars'); }));
    row.appendChild(btn('⚔ 出发!', 'primary big', function () {
      AudioSys.play('run_start');
      cb.onStartRun(sel.charId, sel.mapId);
    }));
    s.appendChild(row);
    screens.maps = s; root.appendChild(s);
  }
  function refreshMaps() {
    mapGrid.innerHTML = '';
    CFG.MAPS.forEach(function (m) {
      var unlocked = Meta.isMapUnlocked(m);
      if (!unlocked && sel.mapId === m.id) sel.mapId = 'graveyard';
      var card = h('div', 'card map-card' + (unlocked ? '' : ' locked') + (sel.mapId === m.id ? ' selected' : ''));
      var sw = h('div', 'map-swatch');
      sw.style.background = 'linear-gradient(135deg,' + m.palette.ground2 + ',' + m.palette.fog + ')';
      var dec = iconCanvas(m.decors[0], 32);
      sw.appendChild(dec);
      card.appendChild(sw);
      card.appendChild(h('div', 'card-name', unlocked ? m.name : '???'));
      card.appendChild(h('div', 'card-sub', unlocked ? m.desc : ''));
      if (!unlocked) {
        var a = achvById(m.unlock.achv);
        card.appendChild(h('div', 'card-lock', '🔒 ' + (a ? a.desc.split('(')[0] : '')));
      }
      if (unlocked) card.addEventListener('click', function () {
        AudioSys.play('ui_click');
        sel.mapId = m.id; refreshMaps();
      });
      mapGrid.appendChild(card);
    });
  }

  // ---------- 商店 ----------
  var shopGrid, shopGold;
  function buildShop() {
    var s = h('div', 'screen panel-col wide');
    s.appendChild(h('div', 'page-title', '强化圣坛'));
    shopGold = h('div', 'gold-line');
    s.appendChild(shopGold);
    shopGrid = h('div', 'shop-grid');
    s.appendChild(shopGrid);
    var row = h('div', 'btn-row');
    row.appendChild(btn('← 返回', '', function () { show('menu'); }));
    row.appendChild(btn('重置返还全部金币', 'danger small-btn', function () {
      var back = Meta.refundAll();
      toastText('已重置,返还 ' + back + ' 金币');
      refreshShop();
    }));
    s.appendChild(row);
    screens.shop = s; root.appendChild(s);
  }
  function refreshShop() {
    var d = Meta.data();
    shopGold.innerHTML = '';
    shopGold.appendChild(iconCanvas('icon_gold', 20));
    shopGold.appendChild(h('span', '', ' ' + d.gold));
    shopGrid.innerHTML = '';
    CFG.META.forEach(function (m) {
      var lv = d.metaLv[m.id] || 0;
      var cost = Meta.metaCost(m);
      var item = h('div', 'shop-item');
      var top = h('div', 'shop-top');
      top.appendChild(iconCanvas(m.icon, 28));
      var mid = h('div', 'shop-mid');
      mid.appendChild(h('div', 'shop-name', m.name));
      mid.appendChild(h('div', 'shop-desc', m.desc));
      top.appendChild(mid);
      item.appendChild(top);
      var pips = h('div', 'pips');
      for (var i = 0; i < m.maxLv; i++) pips.appendChild(h('span', 'pip' + (i < lv ? ' on' : '')));
      item.appendChild(pips);
      if (cost < 0) {
        item.appendChild(h('div', 'shop-max', 'MAX'));
      } else {
        var b = btn(cost + ' 金币', 'buy' + (d.gold < cost ? ' disabled' : ''), function () {
          if (Meta.buyMeta(m.id)) {
            AudioSys.play('coin');
            var fresh = Meta.checkAchv();
            fresh.forEach(toastAchv);
            refreshShop();
          } else AudioSys.play('ui_back');
        });
        item.appendChild(b);
      }
      shopGrid.appendChild(item);
    });
  }

  // ---------- 成就 ----------
  var achvList;
  function buildAchv() {
    var s = h('div', 'screen panel-col wide');
    s.appendChild(h('div', 'page-title', '成就'));
    achvList = h('div', 'achv-list');
    s.appendChild(achvList);
    s.appendChild(btn('← 返回', '', function () { show('menu'); }));
    screens.achv = s; root.appendChild(s);
  }
  function refreshAchv() {
    achvList.innerHTML = '';
    var d = Meta.data();
    var got = 0;
    CFG.ACHV.forEach(function (a) {
      var has = !!d.achv[a.id];
      if (has) got++;
      var row = h('div', 'achv-row' + (has ? ' got' : ''));
      row.appendChild(h('div', 'achv-ico', has ? '🏆' : '🔒'));
      var mid = h('div', 'achv-mid');
      mid.appendChild(h('div', 'achv-name', a.name));
      mid.appendChild(h('div', 'achv-desc', a.desc));
      row.appendChild(mid);
      row.appendChild(h('div', 'achv-reward', '+' + a.reward + ' 金'));
      achvList.appendChild(row);
    });
    achvList.insertBefore(h('div', 'achv-progress', '已达成 ' + got + ' / ' + CFG.ACHV.length), achvList.firstChild);
  }

  // ---------- 图鉴 ----------
  var codexBody, codexTab = 'w';
  function buildCodex() {
    var s = h('div', 'screen panel-col wide');
    s.appendChild(h('div', 'page-title', '图鉴'));
    var tabs = h('div', 'btn-row');
    tabs.appendChild(btn('武器', '', function () { codexTab = 'w'; refreshCodex(); }));
    tabs.appendChild(btn('敌人', '', function () { codexTab = 'e'; refreshCodex(); }));
    s.appendChild(tabs);
    codexBody = h('div', 'codex-grid');
    s.appendChild(codexBody);
    s.appendChild(btn('← 返回', '', function () { show('menu'); }));
    screens.codex = s; root.appendChild(s);
  }
  function refreshCodex() {
    codexBody.innerHTML = '';
    var seen = Meta.data().codex;
    if (codexTab === 'w') {
      for (var wid in CFG.WEAPONS) {
        var w = CFG.WEAPONS[wid];
        var evo = CFG.EVOS[w.evo];
        var cell = h('div', 'codex-cell');
        cell.appendChild(iconCanvas(w.icon, 32));
        cell.appendChild(h('div', 'codex-name', w.name));
        cell.appendChild(h('div', 'codex-desc', w.desc));
        var evoSeen = seen['e_' + w.evo];
        var evoLine = h('div', 'codex-evo');
        evoLine.appendChild(iconCanvas(evoSeen ? evo.icon : w.icon, 18));
        evoLine.appendChild(h('span', '', evoSeen ? ' → ' + evo.name : ' → ???(' + CFG.PASSIVES[w.evoNeed].name + ' + 满级 + 宝箱)'));
        cell.appendChild(evoLine);
        codexBody.appendChild(cell);
      }
    } else {
      var all = Object.keys(CFG.ENEMIES).concat(Object.keys(CFG.BOSSES));
      all.forEach(function (id) {
        var def = CFG.ENEMIES[id] || CFG.BOSSES[id];
        var s2 = seen[id];
        var cell = h('div', 'codex-cell' + (s2 ? '' : ' unseen'));
        cell.appendChild(iconCanvas(id, 32));
        cell.appendChild(h('div', 'codex-name', s2 ? def.name : '???'));
        cell.appendChild(h('div', 'codex-desc', s2 ? ('生命 ' + def.hp + ' · 伤害 ' + def.dmg + (CFG.BOSSES[id] ? ' · BOSS' : '')) : '尚未遭遇'));
        codexBody.appendChild(cell);
      });
    }
  }

  // ---------- 设置 ----------
  var setBody;
  function buildSettings() {
    var s = h('div', 'screen panel-col');
    s.appendChild(h('div', 'page-title', '设置'));
    setBody = h('div', 'settings-body');
    s.appendChild(setBody);
    s.appendChild(btn('← 返回', '', function () { Meta.persist(); show('menu'); }));
    screens.settings = s; root.appendChild(s);
  }
  function slider(label, val, onChange) {
    var row = h('div', 'set-row');
    row.appendChild(h('span', 'set-label', label));
    var inp = document.createElement('input');
    inp.type = 'range'; inp.min = 0; inp.max = 100; inp.value = Math.round(val * 100);
    inp.addEventListener('input', function () { onChange(inp.value / 100); });
    row.appendChild(inp);
    return row;
  }
  function toggle(label, val, onChange) {
    var row = h('div', 'set-row');
    row.appendChild(h('span', 'set-label', label));
    var b = btn(val ? '开' : '关', 'toggle' + (val ? ' on' : ''), function () {
      val = !val;
      b.textContent = val ? '开' : '关';
      b.classList.toggle('on', val);
      onChange(val);
    });
    row.appendChild(b);
    return row;
  }
  function refreshSettings() {
    var st = Meta.settings();
    setBody.innerHTML = '';
    setBody.appendChild(slider('音乐音量', st.music, function (v) { st.music = v; AudioSys.setVolumes(st.music, st.sfx); }));
    setBody.appendChild(slider('音效音量', st.sfx, function (v) { st.sfx = v; AudioSys.setVolumes(st.music, st.sfx); AudioSys.play('hit1'); }));
    setBody.appendChild(toggle('屏幕震动', st.shake, function (v) { st.shake = v; FX.setCfg({ shake: st.shake, dmgText: st.dmgText }); }));
    setBody.appendChild(toggle('伤害数字', st.dmgText, function (v) { st.dmgText = v; FX.setCfg({ shake: st.shake, dmgText: st.dmgText }); }));
    setBody.appendChild(toggle('小怪血条', st.hpBar, function (v) { st.hpBar = v; }));
    var danger = h('div', 'set-danger');
    danger.appendChild(btn('清空全部存档', 'danger', function () {
      if (confirm('确定清空全部进度?此操作不可恢复!')) { Meta.wipe(); location.reload(); }
    }));
    setBody.appendChild(danger);
  }

  // ---------- HUD ----------
  function buildHUD() {
    var s = h('div', 'hud hidden');
    // 顶部经验条
    var xpWrap = h('div', 'xp-wrap');
    hudRefs.xpFill = h('div', 'xp-fill');
    xpWrap.appendChild(hudRefs.xpFill);
    hudRefs.lvText = h('div', 'lv-text', 'Lv.1');
    xpWrap.appendChild(hudRefs.lvText);
    s.appendChild(xpWrap);
    // 左上生命
    var tl = h('div', 'hud-tl');
    var hpWrap = h('div', 'hp-wrap');
    hudRefs.hpFill = h('div', 'hp-fill');
    hpWrap.appendChild(hudRefs.hpFill);
    hudRefs.hpText = h('div', 'hp-text', '');
    hpWrap.appendChild(hudRefs.hpText);
    tl.appendChild(hpWrap);
    // 武器/被动栏
    hudRefs.slotW = h('div', 'slots');
    hudRefs.slotP = h('div', 'slots small');
    tl.appendChild(hudRefs.slotW);
    tl.appendChild(hudRefs.slotP);
    s.appendChild(tl);
    // 顶部中央计时
    hudRefs.timer = h('div', 'hud-timer', '00:00');
    s.appendChild(hudRefs.timer);
    // 右上
    var tr = h('div', 'hud-tr');
    var goldRow = h('div', 'hud-stat');
    goldRow.appendChild(iconCanvas('icon_gold', 16));
    hudRefs.gold = h('span', '', '0');
    goldRow.appendChild(hudRefs.gold);
    tr.appendChild(goldRow);
    var killRow = h('div', 'hud-stat');
    killRow.appendChild(iconCanvas('icon_kill', 16));
    hudRefs.kills = h('span', '', '0');
    killRow.appendChild(hudRefs.kills);
    tr.appendChild(killRow);
    s.appendChild(tr);
    // Boss 条
    hudRefs.bossWrap = h('div', 'boss-wrap hidden');
    hudRefs.bossName = h('div', 'boss-name', '');
    hudRefs.bossFill = h('div', 'boss-fill');
    var bossBar = h('div', 'boss-bar');
    bossBar.appendChild(hudRefs.bossFill);
    hudRefs.bossWrap.appendChild(hudRefs.bossName);
    hudRefs.bossWrap.appendChild(bossBar);
    s.appendChild(hudRefs.bossWrap);
    // 警告文字
    hudRefs.warn = h('div', 'hud-warn hidden', '');
    s.appendChild(hudRefs.warn);
    // 暂停按钮(触屏)
    var pauseBtn = btn('❚❚', 'pause-btn', function () { cb.onPauseToggle(); });
    s.appendChild(pauseBtn);
    screens.hud = s; root.appendChild(s);
  }

  var slotSig = '';
  function updateHUD(run) {
    var p = run.player;
    var xpPct = Math.min(100, run.xp / run.xpNeed * 100);
    hudRefs.xpFill.style.width = xpPct + '%';
    if (hudCache.lv !== run.level) { hudCache.lv = run.level; hudRefs.lvText.textContent = 'Lv.' + run.level; }
    var hpPct = Math.max(0, p.hp / p.stats.hp * 100);
    hudRefs.hpFill.style.width = hpPct + '%';
    hudRefs.hpFill.className = 'hp-fill' + (hpPct < 30 ? ' low' : '');
    var hpTxt = Math.ceil(p.hp) + '/' + Math.round(p.stats.hp);
    if (hudCache.hp !== hpTxt) { hudCache.hp = hpTxt; hudRefs.hpText.textContent = hpTxt; }
    var t = Engine.fmtTime(run.t);
    if (hudCache.t !== t) {
      hudCache.t = t; hudRefs.timer.textContent = t;
      hudRefs.timer.classList.toggle('endless', !!run.endless);
    }
    if (hudCache.gold !== run.gold) { hudCache.gold = run.gold; hudRefs.gold.textContent = ' ' + run.gold; }
    if (hudCache.kills !== run.kills) { hudCache.kills = run.kills; hudRefs.kills.textContent = ' ' + run.kills; }
    // 武器/被动栏(签名变化才重建)
    var sig = run.weapons.map(function (w) { return w.id + (w.evolved ? 'E' : w.lv); }).join(',') + '|' +
      Object.keys(run.passives).map(function (k) { return k + run.passives[k]; }).join(',');
    if (sig !== slotSig) {
      slotSig = sig;
      hudRefs.slotW.innerHTML = '';
      run.weapons.forEach(function (w) {
        var d = h('div', 'slot');
        var icon = w.evolved ? CFG.EVOS[CFG.WEAPONS[w.id].evo].icon : CFG.WEAPONS[w.id].icon;
        d.appendChild(iconCanvas(icon, 22));
        d.appendChild(h('span', 'slot-lv', w.evolved ? '★' : String(w.lv)));
        hudRefs.slotW.appendChild(d);
      });
      hudRefs.slotP.innerHTML = '';
      for (var k in run.passives) {
        var d2 = h('div', 'slot');
        d2.appendChild(iconCanvas(CFG.PASSIVES[k].icon, 16));
        d2.appendChild(h('span', 'slot-lv', String(run.passives[k])));
        hudRefs.slotP.appendChild(d2);
      }
    }
    // Boss 条
    if (run.boss && run.boss.alive) {
      hudRefs.bossWrap.classList.remove('hidden');
      hudRefs.bossName.textContent = CFG.BOSSES[run.boss.bossType].name;
      hudRefs.bossFill.style.width = Math.max(0, run.boss.hp / run.boss.maxHp * 100) + '%';
    } else hudRefs.bossWrap.classList.add('hidden');
  }

  var warnT = null;
  function warn(text) {
    hudRefs.warn.textContent = text;
    hudRefs.warn.classList.remove('hidden');
    hudRefs.warn.style.animation = 'none';
    void hudRefs.warn.offsetWidth;
    hudRefs.warn.style.animation = '';
    if (warnT) clearTimeout(warnT);
    warnT = setTimeout(function () { hudRefs.warn.classList.add('hidden'); }, 2600);
  }

  // ---------- 升级选择 ----------
  var luBody, luBtns, luChoices = [], luCb = null;
  function buildLevelUp() {
    var s = h('div', 'modal hidden');
    var box = h('div', 'modal-box');
    box.appendChild(h('div', 'modal-title', '⬆ 升级!选择一项'));
    luBody = h('div', 'lu-cards');
    box.appendChild(luBody);
    luBtns = h('div', 'btn-row');
    box.appendChild(luBtns);
    s.appendChild(box);
    screens.levelup = s; root.appendChild(s);
  }
  function showLevelUp(choices, counters, onAction) {
    luChoices = choices; luCb = onAction; banishMode = false;
    renderLU(counters);
    overlay('levelup', true);
  }
  function renderLU(counters) {
    luBody.innerHTML = '';
    luChoices.forEach(function (opt) {
      var card = h('div', 'lu-card' + (banishMode ? ' banish-target' : ''));
      var top = h('div', 'lu-top');
      top.appendChild(iconCanvas(opt.icon, 40));
      var mid = h('div', 'lu-mid');
      var nameRow = h('div', 'lu-name', opt.name);
      if (opt.isNew) nameRow.appendChild(h('span', 'badge-new', 'NEW'));
      mid.appendChild(nameRow);
      if (opt.maxLv > 0) {
        var pips = h('div', 'pips');
        for (var i = 0; i < opt.maxLv; i++) pips.appendChild(h('span', 'pip' + (i < opt.curLv ? ' on' : (i === opt.curLv ? ' next' : ''))));
        mid.appendChild(pips);
      }
      top.appendChild(mid);
      card.appendChild(top);
      card.appendChild(h('div', 'lu-desc', opt.desc));
      card.addEventListener('click', function () {
        if (banishMode) { luCb('banish', opt); }
        else { luCb('pick', opt); }
      });
      card.addEventListener('mouseenter', function () { AudioSys.play('ui_hover'); });
      luBody.appendChild(card);
    });
    luBtns.innerHTML = '';
    if (counters.rerolls > 0) luBtns.appendChild(btn('🎲 刷新 (' + counters.rerolls + ')', 'small-btn', function () { luCb('reroll'); }));
    if (counters.banishes > 0) luBtns.appendChild(btn(banishMode ? '取消放逐' : '🚫 放逐 (' + counters.banishes + ')', 'small-btn' + (banishMode ? ' danger' : ''), function () {
      banishMode = !banishMode; renderLU(counters);
    }));
  }
  function hideLevelUp() { overlay('levelup', false); }

  // ---------- 宝箱 ----------
  var chestBody, chestBtnRow;
  function buildChest() {
    var s = h('div', 'modal hidden');
    var box = h('div', 'modal-box chest-box');
    box.appendChild(h('div', 'modal-title gold-text', '✨ 宝箱开启 ✨'));
    chestBody = h('div', 'chest-items');
    box.appendChild(chestBody);
    chestBtnRow = h('div', 'btn-row');
    box.appendChild(chestBtnRow);
    s.appendChild(box);
    screens.chest = s; root.appendChild(s);
  }
  function showChest(results, onClose) {
    chestBody.innerHTML = '';
    chestBtnRow.innerHTML = '';
    results.forEach(function (r, i) {
      var row = h('div', 'chest-item' + (r.evolved ? ' evolved' : ''));
      row.style.animationDelay = (i * 0.35) + 's';
      row.appendChild(iconCanvas(r.icon, 32));
      var mid = h('div', '');
      mid.appendChild(h('div', 'chest-name', (r.evolved ? '🌟 进化!' : '') + r.name));
      mid.appendChild(h('div', 'chest-desc', r.desc));
      row.appendChild(mid);
      chestBody.appendChild(row);
    });
    setTimeout(function () {
      chestBtnRow.appendChild(btn('收下!', 'primary big', function () { overlay('chest', false); onClose(); }));
    }, results.length * 350 + 200);
    overlay('chest', true);
  }

  // ---------- 暂停 ----------
  var pauseBuild;
  function buildPause() {
    var s = h('div', 'modal hidden');
    var box = h('div', 'modal-box');
    box.appendChild(h('div', 'modal-title', '⏸ 暂停'));
    pauseBuild = h('div', 'pause-build');
    box.appendChild(pauseBuild);
    var col = h('div', 'menu-col');
    col.appendChild(btn('▶ 继续', 'big primary', function () { cb.onResume(); }));
    col.appendChild(btn('🏳 放弃这局', 'big danger', function () { cb.onGiveUp(); }));
    box.appendChild(col);
    s.appendChild(box);
    screens.pause = s; root.appendChild(s);
  }
  function showPause(run) {
    pauseBuild.innerHTML = '';
    var wRow = h('div', 'pause-row');
    run.weapons.forEach(function (w) {
      var icon = w.evolved ? CFG.EVOS[CFG.WEAPONS[w.id].evo].icon : CFG.WEAPONS[w.id].icon;
      wRow.appendChild(iconCanvas(icon, 26));
    });
    pauseBuild.appendChild(wRow);
    var pRow = h('div', 'pause-row');
    for (var k in run.passives) pRow.appendChild(iconCanvas(CFG.PASSIVES[k].icon, 20));
    pauseBuild.appendChild(pRow);
    overlay('pause', true);
  }
  function hidePause() { overlay('pause', false); }

  // ---------- 结算 ----------
  var resBody;
  function buildResult() {
    var s = h('div', 'screen center-col hidden');
    resBody = h('div', 'result-box');
    s.appendChild(resBody);
    screens.result = s; root.appendChild(s);
  }
  function showResult(run, newAchvs, canEndless) {
    resBody.innerHTML = '';
    resBody.appendChild(h('div', 'result-title ' + (run.victory ? 'win' : 'lose'),
      run.victory ? '☀ 破晓而归 ☀' : '✝ 你倒下了 ✝'));
    var map = run.map, c = run.player.char;
    resBody.appendChild(h('div', 'result-sub', c.name + ' · ' + map.name));
    var grid = h('div', 'result-grid');
    function stat(label, val) {
      var d = h('div', 'result-stat');
      d.appendChild(h('div', 'rs-val', String(val)));
      d.appendChild(h('div', 'rs-label', label));
      grid.appendChild(d);
    }
    stat('存活时间', Engine.fmtTime(run.t));
    stat('等级', run.level);
    stat('击杀', run.kills);
    stat('金币收获', run.gold);
    stat('击败Boss', run.bossesKilled);
    stat('DPS峰值', Math.round(run.maxDps || 0));
    resBody.appendChild(grid);
    // 最终 Build
    var bRow = h('div', 'pause-row');
    run.weapons.forEach(function (w) {
      var icon = w.evolved ? CFG.EVOS[CFG.WEAPONS[w.id].evo].icon : CFG.WEAPONS[w.id].icon;
      bRow.appendChild(iconCanvas(icon, 28));
    });
    resBody.appendChild(bRow);
    if (newAchvs.length) {
      var aBox = h('div', 'result-achvs');
      newAchvs.forEach(function (a) {
        aBox.appendChild(h('div', 'result-achv', '🏆 ' + a.name + ' (+' + a.reward + ' 金)'));
      });
      resBody.appendChild(aBox);
    }
    var row = h('div', 'btn-row');
    if (canEndless) row.appendChild(btn('∞ 无尽模式', 'big', function () { cb.onEndless(); }));
    row.appendChild(btn('再来一局', 'big primary', function () { refreshChars(); show('chars'); }));
    row.appendChild(btn('回到主菜单', 'big', function () { show('menu'); AudioSys.playMusic('menu'); }));
    resBody.appendChild(row);
    show('result');
  }

  // ---------- 提示 ----------
  function toastAchv(a) {
    AudioSys.play('achievement');
    var t = h('div', 'toast');
    t.appendChild(h('div', 'toast-title', '🏆 成就达成:' + a.name));
    t.appendChild(h('div', 'toast-desc', a.desc + ' (+' + a.reward + ' 金币)'));
    screens.toasts.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, 3600);
    setTimeout(function () { t.remove(); }, 4200);
  }
  function toastText(msg) {
    var t = h('div', 'toast');
    t.appendChild(h('div', 'toast-title', msg));
    screens.toasts.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, 2400);
    setTimeout(function () { t.remove(); }, 3000);
  }
  function bossBanner(bossDef) {
    warn('⚠ ' + bossDef.name + ' 现身!');
  }

  function showHud(v) { overlay('hud', v); if (v) { slotSig = ''; hudCache = {}; } }
  function hideAllScreens() {
    for (var k in screens) { if (k === 'toasts') continue; screens[k].classList.add('hidden'); }
  }

  return {
    init: init, show: show, showHud: showHud, hideAllScreens: hideAllScreens,
    updateHUD: updateHUD, warn: warn, bossBanner: bossBanner,
    showLevelUp: showLevelUp, hideLevelUp: hideLevelUp,
    showChest: showChest, showPause: showPause, hidePause: hidePause,
    showResult: showResult, toastAchv: toastAchv, toastText: toastText
  };
})();
