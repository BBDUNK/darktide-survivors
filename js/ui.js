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
    buildShop(); buildAchv(); buildCodex(); buildSettings(); buildCoop(); buildCoopLevelUp();
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
  var menuGold, menuStats, menuBoard, menuGoldPile;
  function buildMenu() {
    var s = h('div', 'screen');
    // 大标题:居中偏上,足够醒目
    var logo = h('div', 'logo menu-logo');
    logo.appendChild(h('div', 'logo-main menu-big', '暗潮幸存者'));
    s.appendChild(logo);
    // 按钮列:缩小
    var col = h('div', 'menu-col');
    col.appendChild(btn('⚔ 开始远征', 'primary', function () { coopMode = false; refreshChars(); show('chars'); }));
    col.appendChild(btn('👥 联机远征', '', function () { refreshLobbyEntry(); show('coop'); }));
    col.appendChild(btn('🏛 强化圣坛', '', function () { refreshShop(); show('shop'); }));
    col.appendChild(btn('🏆 成就', '', function () { refreshAchv(); show('achv'); }));
    col.appendChild(btn('📖 百科全书', '', function () { codexFrom = 'menu'; refreshCodex(); show('codex'); }));
    col.appendChild(btn('⚙ 设置', '', function () { refreshSettings(); show('settings'); }));
    s.appendChild(col);
    // 左侧金币山
    menuGoldPile = h('div', 'menu-goldpile');
    s.appendChild(menuGoldPile);
    // 右侧公告栏:纸质底,红字
    menuBoard = h('div', 'menu-board');
    menuBoard.appendChild(h('div', 'menu-board-title', '📜 战报'));
    menuStats = h('div', 'menu-board-body');
    menuBoard.appendChild(menuStats);
    s.appendChild(menuBoard);
    screens.menu = s; root.appendChild(s);
  }
  function refreshMenu() {
    var d = Meta.data();
    // 金币山:按数量分档显示金币堆状态
    var gold = d.gold;
    var pileTxt, pileCls;
    if (gold <= 0) { pileTxt = '🪙 空空如也'; pileCls = 'empty'; }
    else if (gold < 500) { pileTxt = '🪙 少许金币'; pileCls = 'few'; }
    else if (gold < 3000) { pileTxt = '🪙 一堆金币'; pileCls = 'heap'; }
    else if (gold < 10000) { pileTxt = '💰 金币小山'; pileCls = 'mountain'; }
    else { pileTxt = '👑 金山!'; pileCls = 'king'; }
    menuGoldPile.innerHTML = '';
    menuGoldPile.appendChild(h('div', 'goldpile-icon ' + pileCls, pileTxt));
    menuGoldPile.appendChild(h('div', 'goldpile-num', gold.toLocaleString()));
    // 公告栏:总击杀等,红字
    var st = d.stats;
    menuStats.innerHTML = '';
    var rows = [
      ['总击杀', st.kills.toLocaleString()],
      ['胜场', st.wins],
      ['最长存活', Engine.fmtTime(st.bestSurvive)],
      ['游玩时间', Math.floor(st.playTime / 60) + ' 分钟'],
      ['累计金币', d.gold.toLocaleString()]
    ];
    rows.forEach(function (r) {
      var row = h('div', 'board-row');
      row.appendChild(h('span', 'board-label', r[0]));
      row.appendChild(h('span', 'board-val', r[1]));
      menuStats.appendChild(row);
    });
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

  // ---------- 联机:入口 + 大厅 ----------
  var coopMode = false;          // 当前是否处于联机流程
  var coopEntry, coopLobby, coopRosterBox, coopCodeLine, coopHint, coopStartBtn, coopCharBox, coopMapBox;
  var myCharId = null, myReady = false;
  var coopMapId = null;   // 当前选定地图;房主选择后广播,客户端只读显示

  function buildCoop() {
    var s = h('div', 'screen panel-col');
    s.appendChild(h('div', 'page-title', '联机远征'));

    coopEntry = h('div', 'coop-entry');
    var nameRow = h('div', 'coop-row');
    nameRow.appendChild(h('span', 'coop-label', '昵称'));
    var nameIn = h('input', 'coop-input');
    nameIn.type = 'text'; nameIn.value = '幸存者' + (100 + Math.floor(Math.random() * 900));
    nameIn.maxLength = 10;
    nameRow.appendChild(nameIn);
    coopEntry.appendChild(nameRow);

    coopEntry.appendChild(btn('🏠 创建房间', 'big primary', function () {
      coopHint.textContent = '正在创建房间…';
      Net.host(nameIn.value).then(function (code) {
        coopMode = true;
        coopHint.textContent = '';
        showLobby(true, code);
      }).catch(function (e) {
        coopHint.textContent = '创建失败: ' + (e && e.message ? e.message : '未知错误');
      });
    }));

    var joinRow = h('div', 'coop-row');
    joinRow.appendChild(h('span', 'coop-label', '房间号'));
    var codeIn = h('input', 'coop-input code');
    codeIn.type = 'text'; codeIn.maxLength = 5; codeIn.placeholder = 'ABCDE';
    joinRow.appendChild(codeIn);
    coopEntry.appendChild(joinRow);
    coopEntry.appendChild(btn('🔗 加入房间', 'big', function () {
      if (!codeIn.value.trim()) { coopHint.textContent = '请输入房间号'; return; }
      coopHint.textContent = '正在连接…';
      Net.join(codeIn.value, nameIn.value).then(function () {
        coopMode = true;
        coopHint.textContent = '';
        showLobby(false, codeIn.value.toUpperCase());
      }).catch(function (e) {
        coopHint.textContent = '连接失败: ' + (e && e.message ? e.message : '房间不存在');
      });
    }));

    coopHint = h('div', 'coop-hint', '');
    coopEntry.appendChild(coopHint);
    coopEntry.appendChild(h('div', 'coop-note',
      '联机为点对点直连(WebRTC),房主需保持在线。首次使用需联网加载连接库。'));
    s.appendChild(coopEntry);

    // 大厅
    coopLobby = h('div', 'coop-lobby hidden');
    coopCodeLine = h('div', 'coop-code-line', '');
    coopLobby.appendChild(coopCodeLine);
    coopLobby.appendChild(h('div', 'coop-sub', '选择角色,全员准备后由房主开始'));
    // 地图选择(仅房主可改;选择广播给全员同步显示)
    var mapRow = h('div', 'coop-row');
    mapRow.appendChild(h('span', 'coop-label', '地图'));
    coopMapBox = h('div', 'coop-maps');
    mapRow.appendChild(coopMapBox);
    coopLobby.appendChild(mapRow);
    coopCharBox = h('div', 'coop-chars');
    coopLobby.appendChild(coopCharBox);
    coopRosterBox = h('div', 'coop-roster');
    coopLobby.appendChild(coopRosterBox);
    coopStartBtn = btn('▶ 开始战斗', 'big primary', function () {
      if (cb.onCoopStart) cb.onCoopStart();
    });
    coopLobby.appendChild(coopStartBtn);
    s.appendChild(coopLobby);

    s.appendChild(btn('← 返回', '', function () {
      Net.close(); coopMode = false;
      coopLobby.classList.add('hidden');
      coopEntry.classList.remove('hidden');
      show('menu');
    }));
    screens.coop = s; root.appendChild(s);
  }

  function refreshLobbyEntry() {
    coopEntry.classList.remove('hidden');
    coopLobby.classList.add('hidden');
    coopHint.textContent = '';
  }

  function showLobby(isHost, code) {
    coopEntry.classList.add('hidden');
    coopLobby.classList.remove('hidden');
    coopCodeLine.innerHTML = '';
    coopCodeLine.appendChild(h('span', 'coop-label', '房间号'));
    coopCodeLine.appendChild(h('span', 'coop-code', code));
    // 复制房间号按钮
    var copyBtn = btn('📋 复制', 'small-btn', function () {
      var ok = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code);
          ok = true;
        }
      } catch (e) { ok = false; }
      // 兼容非 https(file:// 或旧浏览器)走降级方案
      if (!ok) {
        var ta = document.createElement('textarea');
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); ok = true; } catch (e2) {}
        document.body.removeChild(ta);
      }
      var label = copyBtn.textContent;
      copyBtn.textContent = '✅ 已复制';
      setTimeout(function () { copyBtn.textContent = label; }, 1500);
    });
    coopCodeLine.appendChild(copyBtn);
    coopStartBtn.classList.toggle('hidden', !isHost);
    myCharId = null; myReady = false;
    if (!coopMapId) coopMapId = CFG.MAPS[0].id;   // 默认第一张
    renderCoopMaps();
    renderCoopChars();
    renderRoster(Net.getRoster());
  }

  // 客户端收到房主的选图:更新高亮显示
  function applyCoopMap(mid) {
    if (!mid) return;
    coopMapId = mid;
    if (coopMapBox) renderCoopMaps();
  }

  // 地图选择:房主可点选,客户端只读显示
  function renderCoopMaps() {
    coopMapBox.innerHTML = '';
    CFG.MAPS.forEach(function (m) {
      var isHost = Net.isHost();
      var card = h('div', 'coop-map' + (coopMapId === m.id ? ' sel' : ''));
      card.appendChild(h('div', 'coop-map-name', m.name));
      card.appendChild(h('div', 'coop-map-desc', m.desc));
      if (isHost) {
        card.addEventListener('click', function () {
          coopMapId = m.id;
          Net.setMap(m.id);          // 广播给客户端
          renderCoopMaps();
        });
      }
      coopMapBox.appendChild(card);
    });
  }

  function renderCoopChars() {
    coopCharBox.innerHTML = '';
    CFG.CHARS.forEach(function (c) {
      var unlocked = Meta.isCharUnlocked(c);
      var card = h('div', 'coop-char' + (myCharId === c.id ? ' sel' : '') + (unlocked ? '' : ' locked'));
      card.appendChild(iconCanvas(c.sprite, 34));
      card.appendChild(h('div', 'coop-char-name', unlocked ? c.name.split('·')[0] : '???'));
      if (unlocked) {
        card.addEventListener('click', function () {
          myCharId = c.id;
          Net.setMyPick(myCharId, myReady);
          renderCoopChars();
        });
      }
      coopCharBox.appendChild(card);
    });
    // 准备按钮
    var rd = btn(myReady ? '✅ 已准备' : '准备', 'small-btn' + (myReady ? ' primary' : ''), function () {
      if (!myCharId) { coopHint.textContent = '请先选择角色'; return; }
      myReady = !myReady;
      Net.setMyPick(myCharId, myReady);
      renderCoopChars();
    });
    coopCharBox.appendChild(rd);
  }

  function renderRoster(roster) {
    if (!coopRosterBox) return;
    coopRosterBox.innerHTML = '';
    coopRosterBox.appendChild(h('div', 'coop-label', '房间成员 (' + roster.length + '/' + Net.MAX_PLAYERS + ')'));
    roster.forEach(function (r) {
      var row = h('div', 'coop-member');
      var cdef = null;
      for (var i = 0; i < CFG.CHARS.length; i++) if (CFG.CHARS[i].id === r.charId) cdef = CFG.CHARS[i];
      row.appendChild(iconCanvas(cdef ? cdef.sprite : 'icon_hp', 24));
      row.appendChild(h('span', 'coop-mname', r.name + (r.isHost ? ' (房主)' : '')));
      row.appendChild(h('span', 'coop-mchar', cdef ? cdef.name.split('·')[0] : '未选择'));
      row.appendChild(h('span', 'coop-mready' + (r.ready ? ' on' : ''), r.ready ? '已准备' : '等待'));
      coopRosterBox.appendChild(row);
    });
    // 房主:只有全员准备且至少两人才能开始
    if (Net.isHost()) {
      var allReady = roster.length >= 2 && roster.every(function (r) { return r.ready && r.charId; });
      coopStartBtn.classList.toggle('disabled', !allReady);
      coopStartBtn.textContent = allReady ? '▶ 开始战斗' : '等待全员准备…';
    }
  }

  // ---------- 百科全书 ----------
  var codexBody, codexTabs, codexTab = 'w', codexFrom = 'menu';

  // 局内百科是覆盖层:是否打开 / 关闭并退回暂停菜单
  function isCodexOpen() {
    return codexFrom === 'pause' && !!screens.codex && !screens.codex.classList.contains('hidden');
  }
  function closeCodexOverlay() {
    overlay('codex', false);
    overlay('pause', true);
  }
  function buildCodex() {
    var s = h('div', 'screen panel-col wide enc-layer');
    s.appendChild(h('div', 'page-title', '百科全书'));
    codexTabs = h('div', 'btn-row');
    s.appendChild(codexTabs);
    codexBody = h('div', 'enc-body');
    s.appendChild(codexBody);
    s.appendChild(btn('← 返回', '', function () {
      if (codexFrom === 'pause') closeCodexOverlay();
      else show('menu');
    }));
    screens.codex = s; root.appendChild(s);
  }

  function renderCodexTabs() {
    codexTabs.innerHTML = '';
    var tabs = [['w', '⚔ 武器'], ['p', '💠 被动'], ['e', '☠ 敌人'], ['m', '📖 机制']];
    tabs.forEach(function (t) {
      codexTabs.appendChild(btn(t[1], codexTab === t[0] ? 'primary small-btn' : 'small-btn',
        function () { codexTab = t[0]; refreshCodex(); }));
    });
  }

  function refreshCodex() {
    renderCodexTabs();
    codexBody.innerHTML = '';
    if (codexTab === 'w') renderEncWeapons();
    else if (codexTab === 'p') renderEncPassives();
    else if (codexTab === 'e') renderEncEnemies();
    else renderEncMechanics();
  }

  function renderEncWeapons() {
    Encyclopedia.weapons().forEach(function (w) {
      var card = h('div', 'enc-card');
      var head = h('div', 'enc-head');
      head.appendChild(iconCanvas(w.icon, 34));
      var ht = h('div', 'enc-headtext');
      ht.appendChild(h('div', 'enc-name', w.name));
      ht.appendChild(h('div', 'enc-sub', w.desc));
      head.appendChild(ht);
      card.appendChild(head);
      card.appendChild(h('div', 'enc-base', '基础:' + w.base));
      var lvBox = h('div', 'enc-levels');
      lvBox.appendChild(h('div', 'enc-label', '升级成长(满级 Lv.' + w.maxLv + ')'));
      w.levels.forEach(function (l) {
        var row = h('div', 'enc-lvrow');
        row.appendChild(h('span', 'enc-lvnum', 'Lv.' + l.lv));
        row.appendChild(h('span', 'enc-lvtext', l.text));
        lvBox.appendChild(row);
      });
      card.appendChild(lvBox);
      var evoBox = h('div', 'enc-evo');
      var eh = h('div', 'enc-evohead');
      eh.appendChild(iconCanvas(w.evo.icon, 26));
      var eht = h('div', '');
      eht.appendChild(h('div', 'enc-evoname', '🌟 ' + w.evo.name));
      eht.appendChild(h('div', 'enc-sub', w.evo.desc));
      eh.appendChild(eht);
      evoBox.appendChild(eh);
      evoBox.appendChild(h('div', 'enc-evoneed', '进化条件:' + w.evo.how));
      if (w.evo.mult) evoBox.appendChild(h('div', 'enc-evomult', '进化加成:' + w.evo.mult));
      card.appendChild(evoBox);
      codexBody.appendChild(card);
    });
  }

  function renderEncPassives() {
    Encyclopedia.passives().forEach(function (p) {
      var card = h('div', 'enc-card');
      var head = h('div', 'enc-head');
      head.appendChild(iconCanvas(p.icon, 30));
      var ht = h('div', 'enc-headtext');
      ht.appendChild(h('div', 'enc-name', p.name));
      ht.appendChild(h('div', 'enc-sub', p.desc + ' · 最高 ' + p.maxLv + ' 级'));
      head.appendChild(ht);
      card.appendChild(head);
      var lvBox = h('div', 'enc-levels');
      p.rows.forEach(function (r) {
        var row = h('div', 'enc-lvrow');
        row.appendChild(h('span', 'enc-lvnum', 'Lv.' + r.lv));
        row.appendChild(h('span', 'enc-lvtext', r.text));
        lvBox.appendChild(row);
      });
      card.appendChild(lvBox);
      if (p.unlocks.length) {
        card.appendChild(h('div', 'enc-evoneed', '可触发进化:' + p.unlocks.join('、')));
      }
      codexBody.appendChild(card);
    });
  }

  function renderEncEnemies() {
    var list = Encyclopedia.enemies();
    list.forEach(function (e) {
      var card = h('div', 'enc-card' + (e.boss ? ' boss' : ''));
      var head = h('div', 'enc-head');
      head.appendChild(iconCanvas(e.id, e.boss ? 40 : 30));
      var ht = h('div', 'enc-headtext');
      ht.appendChild(h('div', 'enc-name', (e.boss ? '👑 ' : '') + e.name));
      ht.appendChild(h('div', 'enc-sub', e.ai));
      head.appendChild(ht);
      card.appendChild(head);
      var st = h('div', 'enc-stats');
      [['生命', e.hp], ['伤害', e.dmg], ['速度', e.spd], ['经验', e.xp]].forEach(function (kv) {
        var cell = h('div', 'enc-stat');
        cell.appendChild(h('div', 'enc-statval', String(kv[1])));
        cell.appendChild(h('div', 'enc-statlabel', kv[0]));
        st.appendChild(cell);
      });
      card.appendChild(st);
      if (e.traits.length) {
        var tb = h('div', 'enc-traits');
        e.traits.forEach(function (t) { tb.appendChild(h('div', 'enc-trait', '· ' + t)); });
        card.appendChild(tb);
      }
      codexBody.appendChild(card);
    });
  }

  function renderEncMechanics() {
    Encyclopedia.mechanics().forEach(function (m) {
      var card = h('div', 'enc-card');
      card.appendChild(h('div', 'enc-name', m.title));
      var box = h('div', 'enc-traits');
      m.lines.forEach(function (l) { box.appendChild(h('div', 'enc-trait', '· ' + l)); });
      card.appendChild(box);
      codexBody.appendChild(card);
    });
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
    setBody.appendChild(cycleToggle('画面适配', ['contain', 'fill', 'native'], st.uiScale, ['等比适配', '拉伸铺满', '原尺寸'], function (v) {
      st.uiScale = v;
      if (window.CFG) CFG.GAME.UI_SCALE = v;
      if (window.Engine && Engine.refit) Engine.refit();
    }));
    var danger = h('div', 'set-danger');
    danger.appendChild(btn('清空全部存档', 'danger', function () {
      if (confirm('确定清空全部进度?此操作不可恢复!')) { Meta.wipe(); location.reload(); }
    }));
    setBody.appendChild(danger);
  }
  // 多档循环切换:点按在 options 间循环,labels 为对应显示名
  function cycleToggle(label, options, val, labels, onChange) {
    var row = h('div', 'set-row');
    row.appendChild(h('span', 'set-label', label));
    var idx = Math.max(0, options.indexOf(val));
    var b = btn(labels[idx], 'toggle' + (idx > 0 ? ' on' : ''), function () {
      idx = (idx + 1) % options.length;
      b.textContent = labels[idx];
      b.classList.toggle('on', idx > 0);
      onChange(options[idx]);
    });
    row.appendChild(b);
    return row;
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
    hudRefs.shieldFill = h('div', 'shield-fill hidden');
    hpWrap.appendChild(hudRefs.shieldFill);
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
    // 下一事件倒计时
    hudRefs.nextEv = h('div', 'hud-nextev hidden', '');
    s.appendChild(hudRefs.nextEv);
    // 触屏索敌切换按钮(仅移动端显示)
    hudRefs.targetBtn = btn('🎯', 'hud-targetbtn', function () {
      var m = Weapons.cycleTargetMode();
      cb.onTargetChanged && cb.onTargetChanged(m.name);
    });
    s.appendChild(hudRefs.targetBtn);
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
    // 护盾叠加显示
    var shPct = p.stats.shieldMax > 0 ? Math.max(0, p.shield / p.stats.hp * 100) : 0;
    hudRefs.shieldFill.style.width = Math.min(100, shPct) + '%';
    hudRefs.shieldFill.classList.toggle('hidden', p.shield <= 0);
    if (p.shield > 0) hpTxt += ' +' + Math.ceil(p.shield);
    if (hudCache.hp !== hpTxt) { hudCache.hp = hpTxt; hudRefs.hpText.textContent = hpTxt; }
    var t = Engine.fmtTime(run.t);
    if (hudCache.t !== t) {
      hudCache.t = t; hudRefs.timer.textContent = t;
      hudRefs.timer.classList.toggle('endless', !!run.endless);
    }
    // 下一事件倒计时(≤10s 转红闪烁)
    var ne = run.nextEvent;
    if (ne) {
      var nsec = Math.ceil(ne.left);
      var neTxt = ne.label + ' ' + (nsec >= 60 ? Engine.fmtTime(nsec) : nsec + 's');
      if (hudCache.ne !== neTxt) { hudCache.ne = neTxt; hudRefs.nextEv.textContent = neTxt; }
      hudRefs.nextEv.classList.remove('hidden');
      hudRefs.nextEv.classList.toggle('urgent', nsec <= 10);
    } else if (!hudRefs.nextEv.classList.contains('hidden')) {
      hudRefs.nextEv.classList.add('hidden');
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
  // 联机非阻塞升级悬浮卡:游戏不暂停,右下角弹出,选完即消
  var coopLu = null, coopLuBody = null, coopLuChoices = [], coopLuCb = null, coopLuTimer = 0;
  function buildCoopLevelUp() {
    var s = h('div', 'coop-lu hidden');
    var box = h('div', 'coop-lu-box');
    var head = h('div', 'coop-lu-title', '⬆ 升级!');
    box.appendChild(head);
    coopLuBody = h('div', 'coop-lu-body');
    box.appendChild(coopLuBody);
    var note = h('div', 'coop-lu-note', '游戏不暂停,随时选择');
    box.appendChild(note);
    s.appendChild(box);
    screens.cooplu = s; root.appendChild(s);
    coopLu = s;
  }
  // 联机模式下弹出升级选择;选择后立即结算并隐藏,不影响主循环
  function coopLevelUp(run, level) {
    if (!coopLu) return;
    coopLuChoices = Weapons.getLevelUpChoices(run);
    coopLuBody.innerHTML = '';
    coopLuChoices.forEach(function (opt, idx) {
      var card = h('div', 'coop-lu-card');
      card.appendChild(iconCanvas(opt.icon, 30));
      var mid = h('div', '');
      mid.appendChild(h('div', 'coop-lu-name', opt.name));
      mid.appendChild(h('div', 'coop-lu-desc', opt.desc));
      card.appendChild(mid);
      card.addEventListener('click', function () {
        // 本地立即应用,保证手感;房主再代跑结算
        Weapons.applyChoice(run, opt);
        if (run.onCoopPick) run.onCoopPick(opt);
        overlay('cooplu', false);
      });
      coopLuBody.appendChild(card);
    });
    overlay('cooplu', true);
  }
  // 客户端收到房主推送的升级选项,弹出同样的非阻塞卡
  function remoteLevelUp(choices) {
    if (!coopLu) return;
    coopLuBody.innerHTML = '';
    choices.forEach(function (opt, idx) {
      var card = h('div', 'coop-lu-card');
      card.appendChild(iconCanvas(opt.icon, 30));
      var mid = h('div', '');
      mid.appendChild(h('div', 'coop-lu-name', opt.name));
      mid.appendChild(h('div', 'coop-lu-desc', opt.desc));
      card.appendChild(mid);
      card.addEventListener('click', function () {
        overlay('cooplu', false);
        Net.toHost({ t: 'pickup', optIdx: idx });
      });
      coopLuBody.appendChild(card);
    });
    overlay('cooplu', true);
  }
  // 客户端收到房主代选结果:本地应用到自己的快照世界
  function remoteAppliedChoice(opt) {
    if (!window.Debug || !window.Debug.run) return;
    var r = window.Debug.run();
    if (r) Weapons.applyChoice(r, opt);
    overlay('cooplu', false);
  }

  // 客户端:房主宣布本档升级已解决,隐藏悬浮卡
  function hideCoopLevelUp() {
    overlay('cooplu', false);
  }

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
      // 进化提示:右侧小图标提示升到哪个形态/还缺什么
      if (opt.evo && !opt.evo.evolved) {
        var ev = opt.evo;
        var hint = h('div', 'evo-hint');
        hint.title = '进化形态: ' + ev.evoName + (ev.evolved ? '' : ' (需要: ' + ev.needName + ' + 满级 + 宝箱)');
        // 进化武器图标
        hint.appendChild(iconCanvas(ev.evoIcon, 22));
        // 进化材料图标(已拥有时高亮,未拥有时半透明)
        var needIc = iconCanvas(ev.needIcon, 18);
        needIc.style.opacity = ev.hasNeed ? '1' : '0.35';
        needIc.title = ev.hasNeed ? '✅ 已持有 ' + ev.needName : '❌ 还缺 ' + ev.needName;
        hint.appendChild(needIc);
        // 满级指示
        var maxDot = h('span', 'evo-dot' + (ev.atMax ? ' ready' : ''), ev.atMax ? '✓' : 'LV');
        maxDot.title = ev.atMax ? '已满级' : '需满级';
        hint.appendChild(maxDot);
        mid.appendChild(hint);
      }
      if (opt.pEvo && opt.pEvo.length) {
        var ph = h('div', 'evo-hint');
        ph.title = '可解锁进化: ' + opt.pEvo.map(function (x) { return x.evoName; }).join(', ');
        opt.pEvo.forEach(function (x) {
          ph.appendChild(iconCanvas(x.evoIcon, 20));
        });
        mid.appendChild(ph);
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
    if (counters.banishes > 0) luBtns.appendChild(btn(banishMode ? '取消丢弃' : '🚫 丢弃 (' + counters.banishes + ')', 'small-btn' + (banishMode ? ' danger' : ''), function () {
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
    var col = h('div', 'pause-menu');
    col.appendChild(btn('▶ 继续', 'big primary', function () { cb.onResume(); }));
    col.appendChild(btn('📖 百科全书', 'big', function () {
      // 先渲染再切换可见性,避免中途按 ESC 时出现两层都开/都关的中间态
      codexFrom = 'pause';
      refreshCodex();
      overlay('codex', true);
      overlay('pause', false);
    }));
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
    showResult: showResult, toastAchv: toastAchv, toastText: toastText,
    isCodexOpen: isCodexOpen, closeCodexOverlay: closeCodexOverlay,
    renderRoster: renderRoster, showLobby: showLobby, applyCoopMap: applyCoopMap,
    coopMap: function () { return coopMapId; },
    coopLevelUp: coopLevelUp, remoteLevelUp: remoteLevelUp, hideCoopLevelUp: hideCoopLevelUp,
    isCoop: function () { return coopMode; },
    myPick: function () { return myCharId; }
  };
})();
