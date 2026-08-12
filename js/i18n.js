// i18n.js — 界面多语言(中文/English)。数据文案(武器/敌人描述等)暂跟随界面语言做核心翻译。
window.L = (function () {
  'use strict';

  var DICTS = {
    zh: {
      // 标题/菜单
      title_click: '— 点击任意处开始 —',
      title_credit: '全部素材程序化生成 · 存档保存在本地浏览器',
      menu_start: '开始远征',
      menu_coop: '联机远征',
      menu_shop: '强化圣坛',
      menu_achv: '成就',
      menu_codex: '百科全书',
      menu_settings: '设置',
      altar_enter: '进入',
      // 设置
      set_music: '音乐音量',
      set_sfx: '音效音量',
      set_shake: '屏幕震动',
      set_dmgtext: '伤害数字',
      set_hpbar: '小怪血条',
      set_fit: '画面适配',
      set_fit_contain: '等比适配',
      set_fit_fill: '拉伸铺满',
      set_fit_native: '原尺寸',
      set_lang: '语言',
      set_lang_zh: '中文',
      set_lang_en: 'English',
      set_wipe: '清空全部存档',
      set_wipe_confirm: '确定清空全部进度?此操作不可恢复!',
      set_back: '← 返回',
      on: '开', off: '关',
      // 暂停
      pause_title: '⏸ 暂停',
      pause_resume: '▶ 继续',
      pause_codex: '📖 百科全书',
      pause_giveup: '🏳 放弃这局',
      // 结算
      result_win: '☀ 破晓而归 ☀',
      result_lose: '✝ 你倒下了 ✝',
      // 通用
      back: '← 返回',
      next: '下一步',
      go: '出发',
      // 选人
      pick_char: '选择角色',
      lock_hint: '🔒 ',
      // 选图
      pick_map: '选择地图',
      start_run: '⚔ 出发!',
      // 商店
      shop_title: '强化圣坛',
      shop_reset: '重置返还全部金币',
      shop_reset_done: '已重置,返还 ',
      shop_gold: ' 金币',
      shop_max: 'MAX',
      // 成就
      achv_title: '成就',
      achv_progress: '已达成 ',
      achv_reward: ' 金',
      // 结算
      result_again: '再来一局',
      result_continue: '无尽模式',
      result_menu: '返回主菜单',
      result_new: '🎉 新成就',
      rs_time: '存活时间', rs_level: '等级', rs_kills: '击杀', rs_gold: '金币收获', rs_boss: '击败Boss', rs_dps: 'DPS峰值',
      // 升级
      lu_title: '选择强化',
      lu_refresh: '刷新',
      lu_banish: '丢弃',
      lu_chest_title: '宝箱开启',
      // 联机
      coop_title: '联机远征',
      coop_nick: '昵称',
      coop_default_nick: '幸存者',
      coop_create: '🏠 创建房间',
      coop_join: '🔑 加入房间',
      coop_room_code: '房间号',
      coop_code_ph: '输入房号',
      coop_back: '返回',
      coop_ready: '准备',
      coop_start: '🚀 开始游戏',
      coop_map_select: '房主选图',
      coop_creating: '正在创建房间…',
      coop_joining: '正在加入…',
      coop_note: '联机为点对点直连(WebRTC),房主需保持在线。首次使用需联网加载连接库。',
      coop_sub: '选择角色,全员准备后由房主开始',
      coop_map: '地图',
      coop_copy: '复制'
    },
    en: {
      title_click: '— Click anywhere to start —',
      title_credit: 'All assets procedurally generated · Save stored locally',
      menu_start: 'Campaign',
      menu_coop: 'Co-op',
      menu_shop: 'Altar',
      menu_achv: 'Achievements',
      menu_codex: 'Codex',
      menu_settings: 'Settings',
      altar_enter: 'Enter',
      set_music: 'Music',
      set_sfx: 'SFX',
      set_shake: 'Screen Shake',
      set_dmgtext: 'Damage Numbers',
      set_hpbar: 'Enemy HP Bars',
      set_fit: 'Display Fit',
      set_fit_contain: 'Fit',
      set_fit_fill: 'Fill',
      set_fit_native: 'Native',
      set_lang: 'Language',
      set_lang_zh: '中文',
      set_lang_en: 'English',
      set_wipe: 'Reset Save',
      set_wipe_confirm: 'Delete all progress? This cannot be undone!',
      set_back: '← Back',
      on: 'ON', off: 'OFF',
      pause_title: '⏸ Paused',
      pause_resume: '▶ Resume',
      pause_codex: '📖 Codex',
      pause_giveup: '🏳 Give Up',
      result_win: '☀ Victory ☀',
      result_lose: '✝ Defeated ✝',
      back: '← Back',
      next: 'Next',
      go: 'Go',
      // 选人
      pick_char: 'Choose Character',
      lock_hint: '🔒 ',
      // 选图
      pick_map: 'Choose Map',
      start_run: '⚔ Start!',
      // 商店
      shop_title: 'Altar of Power',
      shop_reset: 'Refund All Coins',
      shop_reset_done: 'Reset! Refunded ',
      shop_gold: ' coins',
      shop_max: 'MAX',
      // 成就
      achv_title: 'Achievements',
      achv_progress: 'Unlocked ',
      achv_reward: ' gold',
      // 结算
      result_again: 'Play Again',
      result_continue: 'Endless Mode',
      result_menu: 'Main Menu',
      result_new: '🎉 New Achievement',
      rs_time: 'Time', rs_level: 'Level', rs_kills: 'Kills', rs_gold: 'Gold', rs_boss: 'Bosses', rs_dps: 'Peak DPS',
      // 升级
      lu_title: 'Choose Upgrade',
      lu_refresh: 'Reroll',
      lu_banish: 'Banish',
      lu_chest_title: 'Chest Opened',
      // 联机
      coop_title: 'Co-op Expedition',
      coop_nick: 'Nickname',
      coop_default_nick: 'Survivor',
      coop_create: '🏠 Create Room',
      coop_join: '🔑 Join Room',
      coop_room_code: 'Room Code',
      coop_code_ph: 'Enter room code',
      coop_back: 'Back',
      coop_ready: 'Ready',
      coop_start: '🚀 Start Game',
      coop_map_select: 'Host picks map',
      coop_creating: 'Creating room…',
      coop_joining: 'Joining…',
      coop_note: 'Co-op uses peer-to-peer WebRTC; the host must stay online. First use loads the connection library online.',
      coop_sub: 'Pick a character; host starts when all ready',
      coop_map: 'Map',
      coop_copy: 'Copy'
    }
  };

  var lang = 'zh';
  function setLang(l) { lang = (l === 'en') ? 'en' : 'zh'; }
  function getLang() { return lang; }
  // 取文案:字典有则返回翻译,无则回退原文
  function t(key, fallback) {
    var d = DICTS[lang] || DICTS.zh;
    if (key in d) return d[key];
    return fallback !== undefined ? fallback : key;
  }

  return { setLang: setLang, getLang: getLang, t: t, DICTS: DICTS };
})();
