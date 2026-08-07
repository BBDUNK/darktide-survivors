// meta.js — 存档 / 商店 / 成就 / 累计统计
window.Meta = (function () {
  'use strict';

  // ⚠ 测试期配置:新存档直接全解锁 + 商店满级,方便试玩全部内容。
  // 正式发布前把 TEST_UNLOCK_ALL 改为 false 即恢复从零开始的渐进解锁。
  var TEST_UNLOCK_ALL = true;

  function allAchv() {
    var o = {};
    for (var i = 0; i < CFG.ACHV.length; i++) o[CFG.ACHV[i].id] = true;
    return o;
  }
  function allMetaMax() {
    var o = {};
    for (var i = 0; i < CFG.META.length; i++) o[CFG.META[i].id] = CFG.META[i].maxLv;
    return o;
  }
  function allCodex() {
    var o = {}, k;
    for (k in CFG.ENEMIES) o[k] = true;
    for (k in CFG.BOSSES) o[k] = true;
    for (k in CFG.WEAPONS) { o['w_' + k] = true; o['e_' + CFG.WEAPONS[k].evo] = true; }
    for (var i = 0; i < CFG.CHARS.length; i++) o[CFG.CHARS[i].sprite] = true;
    return o;
  }

  var defaults = function () {
    if (TEST_UNLOCK_ALL) {
      return {
        gold: 50000,
        metaLv: allMetaMax(),
        achv: allAchv(),
        codex: allCodex(),
        settings: { music: 0.7, sfx: 0.8, shake: true, dmgText: true, hpBar: true, uiScale: 'contain' },
        stats: {
          kills: 25000, goldEarned: 60000, deaths: 5, wins: 5, bossKills: 20,
          evolves: 10, chests: 50, shopBuys: 50, bombs: 20,
          bestSurvive: 1200, bestLevel: 80, bestWeapons: 6, bestKillsRun: 5000,
          runs: 10, playTime: 7200,
          surviveByMap: { graveyard: 1200, wilds: 900, abyss: 600 }
        }
      };
    }
    return {
      gold: 0,
      metaLv: {},          // {m_hp: 2, ...}
      achv: {},            // {a_kill_100: true}
      codex: {},           // 见过的敌人/武器 {bat: true}
      settings: { music: 0.7, sfx: 0.8, shake: true, dmgText: true, hpBar: true, uiScale: 'contain' },
      stats: {
        kills: 0, goldEarned: 0, deaths: 0, wins: 0, bossKills: 0,
        evolves: 0, chests: 0, shopBuys: 0, bombs: 0,
        bestSurvive: 0, bestLevel: 0, bestWeapons: 0, bestKillsRun: 0,
        runs: 0, playTime: 0,
        surviveByMap: {}   // {graveyard: 620, ...}
      }
    };
  };

  var save = defaults();

  function deepMerge(dst, src) {
    for (var k in src) {
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
        if (!dst[k] || typeof dst[k] !== 'object') dst[k] = {};
        deepMerge(dst[k], src[k]);
      } else dst[k] = src[k];
    }
    return dst;
  }

  function load() {
    try {
      var raw = localStorage.getItem(CFG.GAME.SAVE_KEY);
      if (raw) save = deepMerge(defaults(), JSON.parse(raw));
    } catch (e) { console.warn('存档读取失败', e); save = defaults(); }
  }

  var persistT = 0;
  function persist() {
    try { localStorage.setItem(CFG.GAME.SAVE_KEY, JSON.stringify(save)); }
    catch (e) { console.warn('存档写入失败', e); }
  }

  // ---------- 成就 ----------
  function statOf(cond) {
    var st = save.stats;
    switch (cond.type) {
      case 'kills': return st.kills;
      case 'survive': return st.bestSurvive;
      case 'survive_map': return st.surviveByMap[cond.map] || 0;
      case 'wins': return st.wins;
      case 'bossKills': return st.bossKills;
      case 'evolves': return st.evolves;
      case 'bestLevel': return st.bestLevel;
      case 'goldEarned': return st.goldEarned;
      case 'chests': return st.chests;
      case 'bestWeapons': return st.bestWeapons;
      case 'shopBuys': return st.shopBuys;
      case 'deaths': return st.deaths;
      case 'bombs': return st.bombs;
      default: return 0;
    }
  }

  // 检查全部成就,返回新解锁列表 [{id,name,reward}]
  function checkAchv() {
    var fresh = [];
    for (var i = 0; i < CFG.ACHV.length; i++) {
      var a = CFG.ACHV[i];
      if (save.achv[a.id]) continue;
      if (statOf(a.cond) >= a.cond.n) {
        save.achv[a.id] = true;
        save.gold += a.reward;
        save.stats.goldEarned += a.reward;
        fresh.push(a);
      }
    }
    if (fresh.length) persist();
    return fresh;
  }

  function hasAchv(id) { return !!save.achv[id]; }

  function isCharUnlocked(c) { return !c.unlock || hasAchv(c.unlock.achv); }
  function isMapUnlocked(m) { return !m.unlock || hasAchv(m.unlock.achv); }

  // ---------- 商店 ----------
  function metaCost(def) {
    var lv = save.metaLv[def.id] || 0;
    return lv >= def.maxLv ? -1 : def.cost[lv];
  }
  function buyMeta(id) {
    for (var i = 0; i < CFG.META.length; i++) {
      var def = CFG.META[i];
      if (def.id !== id) continue;
      var cost = metaCost(def);
      if (cost < 0 || save.gold < cost) return false;
      save.gold -= cost;
      save.metaLv[id] = (save.metaLv[id] || 0) + 1;
      save.stats.shopBuys++;
      persist();
      return true;
    }
    return false;
  }
  function refundAll() { // 重置商店,退还全部金币
    var total = 0;
    for (var i = 0; i < CFG.META.length; i++) {
      var def = CFG.META[i], lv = save.metaLv[def.id] || 0;
      for (var j = 0; j < lv; j++) total += def.cost[j];
    }
    save.gold += total;
    save.metaLv = {};
    persist();
    return total;
  }

  // 把商店永久加成应用到属性对象
  function applyMeta(stats) {
    for (var i = 0; i < CFG.META.length; i++) {
      var def = CFG.META[i], lv = save.metaLv[def.id] || 0;
      if (lv > 0) def.apply(stats, lv);
    }
  }

  // ---------- 局内事件上报 ----------
  function track(ev, n) {
    n = n === undefined ? 1 : n;
    var st = save.stats;
    switch (ev) {
      case 'kill': st.kills += n; break;
      case 'gold': st.goldEarned += n; save.gold += n; break;
      case 'death': st.deaths += n; break;
      case 'win': st.wins += n; break;
      case 'bossKill': st.bossKills += n; break;
      case 'evolve': st.evolves += n; break;
      case 'chest': st.chests += n; break;
      case 'bomb': st.bombs += n; break;
      case 'run': st.runs += n; break;
      case 'playTime': st.playTime += n; break;
    }
    // 高频事件节流持久化(由 endRun/checkAchv 落盘兜底)
    persistT++;
    if (persistT > 40) { persistT = 0; persist(); }
  }

  function trackBest(key, v, mapId) {
    var st = save.stats;
    if (key === 'survive') {
      if (v > st.bestSurvive) st.bestSurvive = v;
      if (mapId) {
        var cur = st.surviveByMap[mapId] || 0;
        if (v > cur) st.surviveByMap[mapId] = v;
      }
    } else if (key === 'level') { if (v > st.bestLevel) st.bestLevel = v; }
    else if (key === 'weapons') { if (v > st.bestWeapons) st.bestWeapons = v; }
    else if (key === 'killsRun') { if (v > st.bestKillsRun) st.bestKillsRun = v; }
  }

  function seeCodex(id) {
    if (!save.codex[id]) { save.codex[id] = true; }
  }

  return {
    load: load, persist: persist,
    data: function () { return save; },
    settings: function () { return save.settings; },
    checkAchv: checkAchv, hasAchv: hasAchv,
    isCharUnlocked: isCharUnlocked, isMapUnlocked: isMapUnlocked,
    metaCost: metaCost, buyMeta: buyMeta, applyMeta: applyMeta, refundAll: refundAll,
    track: track, trackBest: trackBest, seeCodex: seeCodex,
    wipe: function () { save = defaults(); persist(); }
  };
})();
