/* Bing 搜索记录捕获：内容脚本
   任何到达 Bing 搜索结果页的搜索（地址栏 / Bing 页内 / 本扩展搜索框）
   都会落在这里被记录，与新标签页共享 chrome.storage.local 的 history。 */
(() => {
  'use strict';
  if (window.__sereneHist) return;
  window.__sereneHist = true;

  const KEY = 'history';
  let last = '';

  function currentQuery() {
    try { return (new URLSearchParams(location.search).get('q') || '').trim(); }
    catch (e) { return ''; }
  }

  function record() {
    const term = currentQuery();
    if (!term || term === last) return;
    last = term;
    try {
      chrome.storage.local.get(KEY, (r) => {
        const list = Array.isArray(r && r[KEY]) ? r[KEY] : [];
        const out = [term, ...list.filter((h) => h.toLowerCase() !== term.toLowerCase())].slice(0, 100);
        chrome.storage.local.set({ [KEY]: out });
      });
    } catch (e) { /* 存储不可用时静默 */ }
  }

  /* Bing 站内搜索不整页刷新（SPA 改写地址），需要挂钩路由变化 */
  ['pushState', 'replaceState'].forEach((name) => {
    const orig = history[name].bind(history);
    history[name] = (...args) => {
      const ret = orig(...args);
      setTimeout(record, 80);
      return ret;
    };
  });
  window.addEventListener('popstate', record);

  record();
})();
