// i18n.js — 界面多语言(中文/English)。数据文案(武器/敌人描述等)暂跟随界面语言做核心翻译。
window.L = (function () {
  'use strict';

  var DICTS = {
    zh: {
      // 标题/菜单
      title_click: '— 点击任意处开始 —',
      title_credit: '全部素材程序化生成 · 存档保存在本地浏览器',
      menu_start: '⚔ 开始远征',
      menu_coop: '👥 联机远征',
      menu_shop: '🏛 强化圣坛',
      menu_achv: '🏆 成就',
      menu_codex: '📖 百科全书',
      menu_settings: '⚙ 设置',
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
      go: '出发'
    },
    en: {
      title_click: '— Click anywhere to start —',
      title_credit: 'All assets procedurally generated · Save stored locally',
      menu_start: '⚔ Campaign',
      menu_coop: '👥 Co-op',
      menu_shop: '🏛 Altar',
      menu_achv: '🏆 Achievements',
      menu_codex: '📖 Codex',
      menu_settings: '⚙ Settings',
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
      go: 'Go'
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
