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
  // 图标是"把精灵拷进一张 canvas"的快照。UI 在 boot 时同步构建,而图集还在后台
  // 下载,此刻取到的往往是洋红占位块,快照又不会自己更新 —— HUD 上的金币/击杀
  // 图标就这样一直是花格子。记下源名字,等图集就绪后由 refreshIcons() 重绘。
  var iconNodes = [];
  function paintIcon(c) {
    var src = SpriteGen.get(c.dataset.icon);
    if (c.width !== src.width || c.height !== src.height) {
      c.width = src.width; c.height = src.height;
    }
    var g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(src, 0, 0);
  }
  function iconCanvas(name, px) {
    var c = document.createElement('canvas');
    c.dataset.icon = name;
    c.style.width = px + 'px'; c.style.height = px + 'px';
    c.className = 'pix';
    paintIcon(c);
    iconNodes.push(c);
    return c;
  }
  // 图集加载完成后由 main.js 调用,把早期快照重绘成真素材
  function refreshIcons() {
    for (var i = 0; i < iconNodes.length; i++) paintIcon(iconNodes[i]);
  }
  function btn(text, cls, onClick) {
    var b = h('button', 'btn ' + (cls || ''), text);
    var lastTouch = 0;
    function activate() { AudioSys.play('ui_click'); onClick(); }
    // 触摸使用 pointerdown 立即响应。这样左拇指持续操控画布时，右拇指仍能
    // 暂停或切换索敌；随后浏览器合成的 click 会被去重。
    b.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType !== 'touch') return;
      ev.preventDefault(); ev.stopPropagation();
      lastTouch = Date.now();
      activate();
    });
    b.addEventListener('click', function (ev) {
      if (Date.now() - lastTouch < 700) { ev.preventDefault(); return; }
      activate();
    });
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
    logo.appendChild(h('div', 'logo-main gothic-title', 'DarkEscaper'));
    logo.appendChild(h('div', 'logo-sub', '暗黑逃跑神'));
    s.appendChild(logo);
    s.appendChild(h('div', 'blink hint', L.t('title_click')));
    s.appendChild(h('div', 'credits', L.t('title_credit')));
    s.addEventListener('click', function () {
      AudioSys.unlock();
      AudioSys.play('ui_click');
      AudioSys.playMusic('menu');
      show('menu');
    }, { once: false });
    screens.title = s; root.appendChild(s);
  }

  // ---------- 主菜单 ----------
  var menuStats, menuBoard, menuAltar, menuVersion;
  function buildMenu() {
    var s = h('div', 'screen menu-screen');
    // 大标题:居中偏上
    var logo = h('div', 'logo menu-logo');
    logo.appendChild(h('div', 'logo-main menu-big gothic-title', 'DarkEscaper'));
    logo.appendChild(h('div', 'menu-tagline', '暗黑逃跑神'));
    s.appendChild(logo);
    // 三列主体:左右侧栏对称,中间按钮列
    var body = h('div', 'menu-body');
    // 左侧:强化圣坛入口
    menuAltar = h('div', 'menu-altar');
    menuAltar.appendChild(h('div', 'menu-altar-title', '强化圣坛'));
    s.appendChild(menuAltar);
    // 中间:主按钮列 + 小按钮行 + 设置(最下面)
    var mid = h('div', 'menu-mid');
    var col = h('div', 'menu-col');
    col.appendChild(btn(L.t('menu_start'), 'primary', function () { coopMode = false; refreshChars(); show('chars'); }));
    col.appendChild(btn(L.t('menu_coop'), '', function () { refreshLobbyEntry(); show('coop'); }));
    mid.appendChild(col);
    var subRow = h('div', 'menu-subrow');
    subRow.appendChild(btn(L.t('menu_achv'), 'sub', function () { refreshAchv(); show('achv'); }));
    subRow.appendChild(btn(L.t('menu_codex'), 'sub', function () { codexFrom = 'menu'; refreshCodex(); show('codex'); }));
    mid.appendChild(subRow);
    // 设置单独放最下面一行
    var settingsRow = h('div', 'menu-settings-row');
    settingsRow.appendChild(btn(L.t('menu_settings'), '', function () { refreshSettings(); show('settings'); }));
    mid.appendChild(settingsRow);
    body.appendChild(menuAltar);
    body.appendChild(mid);
    // 右侧:公告栏
    menuBoard = h('div', 'menu-board');
    menuBoard.appendChild(h('div', 'menu-board-title', '战报'));
    menuStats = h('div', 'menu-board-body');
    menuBoard.appendChild(menuStats);
    body.appendChild(menuBoard);
    s.appendChild(body);
    // 左下角版本号
    menuVersion = h('div', 'menu-version', '');
    s.appendChild(menuVersion);
    screens.menu = s; root.appendChild(s);
  }
  function refreshMenu() {
    var d = Meta.data();
    menuVersion.textContent = CFG.GAME.VERSION;
    // 左侧圣坛快捷入口:大图标置顶 + 标题 + 金币 + 宝石红进入按钮
    menuAltar.innerHTML = '';
    var iconBox = h('div', 'menu-altar-icon menu-altar-flame');
    var totalMeta = 0;
    for (var mk in d.metaLv) totalMeta += d.metaLv[mk] || 0;
    var altarPower = Math.min(1, totalMeta / Math.max(1, CFG.META.length * 3)).toFixed(2);
    iconBox.className += ' altar-cross-state-' + Math.min(3, Math.floor(Number(altarPower) * 4));
    if (menuAltar.style && menuAltar.style.setProperty) menuAltar.style.setProperty('--altar-power', altarPower);
    menuAltar.appendChild(iconBox);
    menuAltar.appendChild(h('div', 'menu-altar-title', '强化圣坛'));
    var goBtn = btn(L.t('altar_enter'), 'sub ruby', function () { refreshShop(); show('shop'); });
    menuAltar.appendChild(goBtn);
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
    s.appendChild(h('div', 'page-title', L.t('pick_char')));
    // 右上角:训练场入口(无刷怪实机验收)
    var trainBtn = btn('训练场', 'small-btn accent', function () { if (cb.onArtTest) cb.onArtTest(); });
    trainBtn.style.position = 'absolute';
    trainBtn.style.top = '16px';
    trainBtn.style.right = '16px';
    trainBtn.style.zIndex = 6;
    s.appendChild(trainBtn);
    charGrid = h('div', 'card-grid');
    s.appendChild(charGrid);
    charInfo = h('div', 'info-box');
    s.appendChild(charInfo);
    var row = h('div', 'btn-row');
    row.appendChild(btn(L.t('back'), '', function () { show('menu'); }));
    row.appendChild(btn(L.t('next') + ' →', 'primary', function () { refreshMaps(); show('maps'); }));
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
    s.appendChild(h('div', 'page-title', L.t('pick_map')));
    mapGrid = h('div', 'card-grid maps');
    s.appendChild(mapGrid);
    var row = h('div', 'btn-row');
    row.appendChild(btn(L.t('back'), '', function () { show('chars'); }));
    row.appendChild(btn(L.t('start_run'), 'primary big', function () {
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
    s.appendChild(h('div', 'page-title', L.t('shop_title')));
    shopGold = h('div', 'gold-line');
    s.appendChild(shopGold);
    shopGrid = h('div', 'shop-grid');
    s.appendChild(shopGrid);
    var row = h('div', 'btn-row');
    row.appendChild(btn(L.t('back'), '', function () { show('menu'); }));
    row.appendChild(btn(L.t('shop_reset'), 'danger small-btn', function () {
      var back = Meta.refundAll();
      toastText(L.t('shop_reset_done') + back + L.t('shop_gold'));
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
        item.appendChild(h('div', 'shop-max', L.t('shop_max')));
      } else {
        var b = btn(cost + L.t('shop_gold'), 'buy' + (d.gold < cost ? ' disabled' : ''), function () {
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
    s.appendChild(h('div', 'page-title', L.t('achv_title')));
    achvList = h('div', 'achv-list');
    s.appendChild(achvList);
    s.appendChild(btn(L.t('back'), '', function () { show('menu'); }));
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
      row.appendChild(h('div', 'achv-reward', '+' + a.reward + L.t('achv_reward')));
      achvList.appendChild(row);
    });
    achvList.insertBefore(h('div', 'achv-progress', L.t('achv_progress') + got + ' / ' + CFG.ACHV.length), achvList.firstChild);
  }

  // ---------- 联机:入口 + 大厅 ----------
  var coopMode = false;          // 当前是否处于联机流程
  var coopEntry, coopLobby, coopRosterBox, coopCodeLine, coopHint, coopStartBtn, coopCharBox, coopMapBox;
  var myCharId = null, myReady = false;
  var coopMapId = null;   // 当前选定地图;房主选择后广播,客户端只读显示

  function buildCoop() {
    var s = h('div', 'screen panel-col');
    s.appendChild(h('div', 'page-title', L.t('coop_title')));

    coopEntry = h('div', 'coop-entry');
    var nameRow = h('div', 'coop-row');
    nameRow.appendChild(h('span', 'coop-label', L.t('coop_nick')));
    var nameIn = h('input', 'coop-input');
    nameIn.type = 'text'; nameIn.value = L.t('coop_default_nick') + (100 + Math.floor(Math.random() * 900));
    nameIn.maxLength = 10;
    nameRow.appendChild(nameIn);
    coopEntry.appendChild(nameRow);

    coopEntry.appendChild(btn(L.t('coop_create'), 'big primary', function () {
      coopHint.textContent = L.t('coop_creating');
      Net.host(nameIn.value).then(function (code) {
        coopMode = true;
        coopHint.textContent = '';
        showLobby(true, code);
      }).catch(function (e) {
        coopHint.textContent = '创建失败: ' + (e && e.message ? e.message : '未知错误');
      });
    }));

    var joinRow = h('div', 'coop-row');
    joinRow.appendChild(h('span', 'coop-label', L.t('coop_room_code')));
    var codeIn = h('input', 'coop-input code');
    codeIn.type = 'text'; codeIn.maxLength = 5; codeIn.placeholder = 'ABCDE';
    joinRow.appendChild(codeIn);
    coopEntry.appendChild(joinRow);
    coopEntry.appendChild(btn(L.t('coop_join'), 'big', function () {
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
      L.t('coop_note')));
    s.appendChild(coopEntry);

    // 大厅
    coopLobby = h('div', 'coop-lobby hidden');
    coopCodeLine = h('div', 'coop-code-line', '');
    coopLobby.appendChild(coopCodeLine);
    coopLobby.appendChild(h('div', 'coop-sub', L.t('coop_sub')));
    // 地图选择(仅房主可改;选择广播给全员同步显示)
    var mapRow = h('div', 'coop-row');
    mapRow.appendChild(h('span', 'coop-label', L.t('coop_map')));
    coopMapBox = h('div', 'coop-maps');
    mapRow.appendChild(coopMapBox);
    coopLobby.appendChild(mapRow);
    coopCharBox = h('div', 'coop-chars');
    coopLobby.appendChild(coopCharBox);
    coopRosterBox = h('div', 'coop-roster');
    coopLobby.appendChild(coopRosterBox);
    coopStartBtn = btn(L.t('coop_start'), 'big primary', function () {
      if (cb.onCoopStart) cb.onCoopStart();
    });
    coopLobby.appendChild(coopStartBtn);
    s.appendChild(coopLobby);

    s.appendChild(btn(L.t('back'), '', function () {
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
    coopCodeLine.appendChild(h('span', 'coop-label', L.t('coop_room_code')));
    coopCodeLine.appendChild(h('span', 'coop-code', code));
    // 复制房间号按钮
    var copyBtn = btn('📋 ' + L.t('coop_copy'), 'small-btn', function () {
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
    var tabs = [['w', '⚔ 武器'], ['p', '💠 被动'], ['e', '☠ 敌人'], ['m', '📖 机制'], ['g', '🎮 操作指南'], ['s', '📜 故事']];
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
    else if (codexTab === 'a') renderArtGallery();
    else if (codexTab === 'g') renderEncGuide();
    else if (codexTab === 's') renderEncStory();
    else renderEncMechanics();
  }

  function renderArtGallery() {
    // “训练场”入口在选人界面右上角,这里保留图集索引作为静态参考墙。
    var atlas = window.SPRITE_ATLAS || { frames: {} };
    var names = Object.keys(atlas.frames || {}).sort();
    codexBody.appendChild(h('div', 'enc-intro', '当前图集：' + names.length + ' 个素材；缩略图直接读取正在运行的图集。'));
    var groups = [
      ['角色动作', function (n) { return n.indexOf('char_') === 0; }],
      ['敌人与首领', function (n) { return n.indexOf('boss_') === 0 || n.indexOf('elite_') === 0 || /^(bat|slime|zombie|skeleton|spider|ghost|orc|imp|mummy|gargoyle|wraith|werewolf|cultist|knight_)/.test(n); }],
      ['武器、弹幕与特效', function (n) { return n.indexOf('p_') === 0 || n.indexOf('vfx_') === 0 || n.indexOf('w_') === 0 || n.indexOf('we_') === 0 || n === 'tesla_tower'; }],
      ['环境、拾取物与界面', function (n) { return n.indexOf('terrain_') === 0 || n.indexOf('deco_') === 0 || n.indexOf('icon_') === 0 || n.indexOf('hud_') === 0 || n.indexOf('ui_') === 0 || n.indexOf('pickup_') === 0; }]
    ];
    groups.forEach(function (group) {
      var subset = names.filter(group[1]);
      if (!subset.length) return;
      codexBody.appendChild(h('div', 'enc-section-title', group[0] + ' · ' + subset.length));
      var grid = h('div', 'asset-gallery');
      subset.forEach(function (name) {
        var cell = h('div', 'asset-cell');
        cell.appendChild(iconCanvas(name, 46));
        cell.appendChild(h('div', 'asset-name', name));
        grid.appendChild(cell);
      });
      codexBody.appendChild(grid);
    });
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

  function renderEncGuide() {
    Encyclopedia.guide().forEach(function (m) {
      var card = h('div', 'enc-card');
      card.appendChild(h('div', 'enc-name', m.title));
      var box = h('div', 'enc-traits');
      m.lines.forEach(function (l) { box.appendChild(h('div', 'enc-trait', '· ' + l)); });
      card.appendChild(box);
      codexBody.appendChild(card);
    });
  }

  function renderEncStory() {
    Encyclopedia.story().forEach(function (ch) {
      var card = h('div', 'enc-card story-card');
      // 插图 + 标题 + 章节标签
      var head = h('div', 'enc-head story-head');
      var img = iconCanvas(ch.icon, 52);
      img.className = 'story-illu';
      head.appendChild(img);
      var ht = h('div', 'enc-headtext');
      var titleRow = h('div', 'story-title-row');
      titleRow.appendChild(h('span', 'story-tag ' + (ch.type || 'main'), ch.tag || ''));
      titleRow.appendChild(h('div', 'enc-name', ch.title));
      ht.appendChild(titleRow);
      head.appendChild(ht);
      card.appendChild(head);
      // 段落
      var body = h('div', 'story-body');
      ch.paras.forEach(function (p) { body.appendChild(h('div', 'story-para', p)); });
      card.appendChild(body);
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
    s.appendChild(btn(L.t('set_back'), '', function () { Meta.persist(); show('menu'); }));
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
    setBody.appendChild(slider(L.t('set_music'), st.music, function (v) { st.music = v; AudioSys.setVolumes(st.music, st.sfx); }));
    setBody.appendChild(slider(L.t('set_sfx'), st.sfx, function (v) { st.sfx = v; AudioSys.setVolumes(st.music, st.sfx); AudioSys.play('hit1'); }));
    setBody.appendChild(toggle(L.t('set_shake'), st.shake, function (v) { st.shake = v; FX.setCfg({ shake: st.shake, dmgText: st.dmgText }); }));
    setBody.appendChild(toggle(L.t('set_dmgtext'), st.dmgText, function (v) { st.dmgText = v; FX.setCfg({ shake: st.shake, dmgText: st.dmgText }); }));
    setBody.appendChild(toggle(L.t('set_hpbar'), st.hpBar, function (v) { st.hpBar = v; }));
    setBody.appendChild(cycleToggle(L.t('set_fit'), ['contain', 'fill', 'native'], st.uiScale, [L.t('set_fit_contain'), L.t('set_fit_fill'), L.t('set_fit_native')], function (v) {
      st.uiScale = v;
      if (window.CFG) CFG.GAME.UI_SCALE = v;
      if (window.Engine && Engine.refit) Engine.refit();
    }));
    setBody.appendChild(cycleToggle(L.t('set_lang'), ['zh', 'en'], st.lang, [L.t('set_lang_zh'), L.t('set_lang_en')], function (v) {
      st.lang = v;
      Meta.persist();
      location.reload();   // 切换语言需重建界面,重载最可靠
    }));
    var danger = h('div', 'set-danger');
    danger.appendChild(btn(L.t('set_wipe'), 'danger', function () {
      if (confirm(L.t('set_wipe_confirm'))) { Meta.wipe(); location.reload(); }
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
    // 触屏暂停按钮(仅移动端显示):小地图左侧,贴顶部边缘
    hudRefs.pauseBtn = btn('⏸', 'hud-pausebtn', function () {
      cb.onPauseToggle && cb.onPauseToggle();
    });
    s.appendChild(hudRefs.pauseBtn);
    // 触屏索敌切换按钮(仅移动端显示):暂停键下方,底部与小地图对齐
    hudRefs.targetBtn = btn('🎯', 'hud-targetbtn', function () {
      var m = Weapons.cycleTargetMode();
      cb.onTargetChanged && cb.onTargetChanged(m.name);
    });
    s.appendChild(hudRefs.targetBtn);
    // 大门在终局二阶段开启后才显示：触屏可点，键鼠也能看到 E 的明确提示。
    hudRefs.exitGateBtn = btn('↪ 撤离 [E]', 'hud-exitgate hidden', function () {
      if (cb.onExitGate) cb.onExitGate();
    });
    s.appendChild(hudRefs.exitGateBtn);
    // 右上
    var tr = h('div', 'hud-tr');
    var goldRow = h('div', 'hud-stat');
    goldRow.appendChild(iconCanvas('icon_gold', 16));
    goldRow.appendChild(h('span', 'hud-stat-label', '金币'));
    hudRefs.gold = h('span', '', '0');
    goldRow.appendChild(hudRefs.gold);
    tr.appendChild(goldRow);
    var killRow = h('div', 'hud-stat');
    killRow.appendChild(iconCanvas('icon_kill', 16));
    killRow.appendChild(h('span', 'hud-stat-label', '击杀'));
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
    hudRefs.testPanel = h('div', 'test-panel hidden');
    hudRefs.testPanel.appendChild(h('div', 'test-panel-title', '训练场'));
    hudRefs.testPanel.appendChild(h('div', 'test-panel-note', '无自动刷怪 · 逐项实机验收'));
    // 训练场里的控件用完即失焦,避免焦点留在下拉/按钮上导致键盘输入被吞
    // (表现为"自己按住 W"或按 WASD 没反应)。
    hudRefs.testPanel.addEventListener('change', function (ev) {
      if (ev.target && ev.target.blur) ev.target.blur();
    });
    hudRefs.testPanel.addEventListener('click', function (ev) {
      if (ev.target && ev.target.tagName === 'BUTTON' && ev.target.blur) ev.target.blur();
    });
    function addTestPicker(label, choices, actionType, altType, primaryText, altText) {
      var row = h('div', 'test-picker');
      row.appendChild(h('label', '', label));
      var select = h('select', 'test-select');
      choices.forEach(function (entry) {
        var opt = document.createElement('option');
        opt.value = entry.id;
        opt.textContent = entry.name;
        select.appendChild(opt);
      });
      row.appendChild(select);
      var actions = h('div', 'test-picker-actions');
      actions.appendChild(btn(primaryText, 'small-btn', function () { if (cb.onTestAction) cb.onTestAction({ type: actionType, id: select.value }); }));
      if (altType) actions.appendChild(btn(altText, 'small-btn accent', function () { if (cb.onTestAction) cb.onTestAction({ type: altType, id: select.value }); }));
      row.appendChild(actions);
      hudRefs.testPanel.appendChild(row);
    }
    function defsToChoices(defs) {
      return Object.keys(defs).sort().map(function (id) { return { id: id, name: defs[id].name }; });
    }
    addTestPicker('武器', defsToChoices(CFG.WEAPONS), 'weapon', 'ultimateWeapon', '获得/升级', '满级进化');
    addTestPicker('被动', defsToChoices(CFG.PASSIVES), 'passive', null, '满级被动', '');
    addTestPicker('掉落物', [
      { id: 'coin', name: '金币' }, { id: 'meat', name: '大腿肉' }, { id: 'magnet', name: '红蓝磁铁' },
      { id: 'bomb', name: '复古炸弹' }, { id: 'clock', name: '时之沙漏' }, { id: 'chest', name: '宝箱' }
    ], 'item', null, '生成掉落', '');
    addTestPicker('敌人', defsToChoices(CFG.ENEMIES), 'enemy', null, '生成敌人', '');
    addTestPicker('首领', defsToChoices(CFG.BOSSES), 'testBoss', null, '生成首领', '');
    var batch = h('div', 'test-batch-actions');
    [['weapons', '全武器'], ['ultimate', '全进化'], ['enemies', '全怪物'], ['boss', '轮换 Boss'], ['clear', '清场'], ['heal', '回满血']].forEach(function (entry) {
      batch.appendChild(btn(entry[1], 'small-btn', function () { if (cb.onTestAction) cb.onTestAction(entry[0]); }));
    });
    hudRefs.testPanel.appendChild(batch);
    s.appendChild(hudRefs.testPanel);
    screens.hud = s; root.appendChild(s);
  }

  function setTestMode(enabled) {
    if (!hudRefs.testPanel) return;
    hudRefs.testPanel.classList.toggle('hidden', !enabled);
  }

  var slotSig = '';
  function updateHUD(run) {
    var p = run.player;
    var gate = run.exitGate;
    var gateNear = !!(gate && gate.open && !gate.used && Engine.dist2(p.x, p.y, gate.x, gate.y) < 92 * 92);
    if (hudCache.gateNear !== gateNear) {
      hudCache.gateNear = gateNear;
      hudRefs.exitGateBtn.classList.toggle('hidden', !gateNear);
    }
    var xpPct = Math.min(100, run.xp / run.xpNeed * 100);
    var xpW = Math.round(xpPct);
    if (hudCache.xpW !== xpW) { hudCache.xpW = xpW; hudRefs.xpFill.style.width = xpW + '%'; }
    if (hudCache.lv !== run.level) { hudCache.lv = run.level; hudRefs.lvText.textContent = 'Lv.' + run.level; }
    var hpPct = Math.max(0, p.hp / p.stats.hp * 100);
    var hpW = Math.round(hpPct);
    if (hudCache.hpW !== hpW) { hudCache.hpW = hpW; hudRefs.hpFill.style.width = hpW + '%'; }
    var hpCls = 'hp-fill' + (hpPct < 30 ? ' low' : '');
    if (hudCache.hpCls !== hpCls) { hudCache.hpCls = hpCls; hudRefs.hpFill.className = hpCls; }
    var hpTxt = Math.ceil(p.hp) + '/' + Math.round(p.stats.hp);
    // 护盾叠加显示
    var shPct = p.stats.shieldMax > 0 ? Math.max(0, p.shield / p.stats.hp * 100) : 0;
    var shW = Math.min(100, Math.round(shPct));
    if (hudCache.shW !== shW) { hudCache.shW = shW; hudRefs.shieldFill.style.width = shW + '%'; }
    var shHidden = p.shield <= 0;
    if (hudCache.shHidden !== shHidden) { hudCache.shHidden = shHidden; hudRefs.shieldFill.classList.toggle('hidden', shHidden); }
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
      if (hudCache.neVis !== true) { hudCache.neVis = true; hudRefs.nextEv.classList.remove('hidden'); }
      var neUrgent = nsec <= 10;
      if (hudCache.neUrg !== neUrgent) { hudCache.neUrg = neUrgent; hudRefs.nextEv.classList.toggle('urgent', neUrgent); }
    } else if (hudCache.neVis !== false) {
      hudCache.neVis = false; hudRefs.nextEv.classList.add('hidden');
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
      if (hudCache.bossVis !== true) { hudCache.bossVis = true; hudRefs.bossWrap.classList.remove('hidden'); }
      var bName = run.bossBarName || CFG.BOSSES[run.boss.bossType].name;
      if (hudCache.bossName !== bName) { hudCache.bossName = bName; hudRefs.bossName.textContent = bName; }
      var bossW = Math.round(Math.max(0, (run.bossBarHp !== null && run.bossBarHp !== undefined ? run.bossBarHp : run.boss.hp) /
        (run.bossBarMax || run.boss.maxHp) * 100));
      if (hudCache.bossW !== bossW) { hudCache.bossW = bossW; hudRefs.bossFill.style.width = bossW + '%'; }
    } else if (hudCache.bossVis !== false) {
      hudCache.bossVis = false; hudRefs.bossWrap.classList.add('hidden');
    }
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
  // 联机模式下弹出升级选择;选择后由调用方结算并隐藏,不影响主循环
  function coopLevelUp(choices, onPick) {
    if (!coopLu) return;
    coopLuChoices = choices || [];
    coopLuBody.innerHTML = '';
    coopLuChoices.forEach(function (opt, idx) {
      var card = h('div', 'coop-lu-card');
      card.appendChild(iconCanvas(opt.icon, 30));
      var mid = h('div', '');
      mid.appendChild(h('div', 'coop-lu-name', opt.name));
      mid.appendChild(h('div', 'coop-lu-desc', opt.desc));
      card.appendChild(mid);
      card.addEventListener('click', function () {
        overlay('cooplu', false);
        if (onPick) onPick(opt, idx);
      });
      coopLuBody.appendChild(card);
    });
    overlay('cooplu', true);
  }
  // 客户端收到房主推送的升级选项,弹出同样的非阻塞卡
  function remoteLevelUp(choices, onPick) {
    if (!coopLu) return;
    coopLuChoices = choices || [];
    coopLuBody.innerHTML = '';
    coopLuChoices.forEach(function (opt, idx) {
      var card = h('div', 'coop-lu-card');
      card.appendChild(iconCanvas(opt.icon, 30));
      var mid = h('div', '');
      mid.appendChild(h('div', 'coop-lu-name', opt.name));
      mid.appendChild(h('div', 'coop-lu-desc', opt.desc));
      card.appendChild(mid);
      card.addEventListener('click', function () {
        overlay('cooplu', false);
        if (onPick) onPick(opt, idx);
      });
      coopLuBody.appendChild(card);
    });
    overlay('cooplu', true);
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
    box.appendChild(h('div', 'modal-title', L.t('pause_title')));
    pauseBuild = h('div', 'pause-build');
    box.appendChild(pauseBuild);
    var col = h('div', 'pause-menu');
    col.appendChild(btn(L.t('pause_resume'), 'big primary', function () { cb.onResume(); }));
    col.appendChild(btn(L.t('pause_codex'), 'big', function () {
      // 先渲染再切换可见性,避免中途按 ESC 时出现两层都开/都关的中间态
      codexFrom = 'pause';
      refreshCodex();
      overlay('codex', true);
      overlay('pause', false);
    }));
    col.appendChild(btn(L.t('pause_giveup'), 'big danger', function () { cb.onGiveUp(); }));
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
    stat(L.t('rs_time'), Engine.fmtTime(run.t));
    stat(L.t('rs_level'), run.level);
    stat(L.t('rs_kills'), run.kills);
    stat(L.t('rs_gold'), run.gold);
    stat(L.t('rs_boss'), run.bossesKilled);
    stat(L.t('rs_dps'), Math.round(run.maxDps || 0));
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
        aBox.appendChild(h('div', 'result-achv', '🏆 ' + a.name + ' (+' + a.reward + L.t('achv_reward') + ')'));
      });
      resBody.appendChild(aBox);
    }
    var row = h('div', 'btn-row');
    if (canEndless) {
      row.appendChild(btn(L.t('result_menu'), 'big', function () { show('menu'); AudioSys.playMusic('menu'); }));
      row.appendChild(btn('∞ ' + L.t('result_continue'), 'big primary', function () { cb.onEndless(); }));
      row.appendChild(btn(L.t('result_again'), 'big', function () { refreshChars(); show('chars'); }));
    } else {
      row.appendChild(btn(L.t('result_again'), 'big primary', function () { refreshChars(); show('chars'); }));
      row.appendChild(btn(L.t('result_menu'), 'big', function () { show('menu'); AudioSys.playMusic('menu'); }));
    }
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
    refreshIcons: refreshIcons,
    updateHUD: updateHUD, warn: warn, bossBanner: bossBanner,
    showLevelUp: showLevelUp, hideLevelUp: hideLevelUp,
    showChest: showChest, showPause: showPause, hidePause: hidePause,
    showResult: showResult, toastAchv: toastAchv, toastText: toastText, setTestMode: setTestMode,
    isCodexOpen: isCodexOpen, closeCodexOverlay: closeCodexOverlay,
    renderRoster: renderRoster, showLobby: showLobby, applyCoopMap: applyCoopMap,
    coopMap: function () { return coopMapId; },
    coopLevelUp: coopLevelUp, remoteLevelUp: remoteLevelUp, hideCoopLevelUp: hideCoopLevelUp,
    isCoop: function () { return coopMode; },
    myPick: function () { return myCharId; }
  };
})();
