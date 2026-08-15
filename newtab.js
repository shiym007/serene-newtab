(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- 存储层（扩展环境用 chrome.storage，直接用浏览器打开时回退 localStorage） ---------- */
  const hasExt = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;
  const LS_KEY = 'serene.settings';

  const store = {
    async get(defs) {
      if (hasExt) return chrome.storage.sync.get(defs);
      try {
        const raw = localStorage.getItem(LS_KEY);
        return Object.assign({}, defs, raw ? JSON.parse(raw) : {});
      } catch (e) { return Object.assign({}, defs); }
    },
    async set(obj) {
      if (hasExt) return chrome.storage.sync.set(obj);
      try {
        const cur = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
        localStorage.setItem(LS_KEY, JSON.stringify(Object.assign(cur, obj)));
      } catch (e) { /* ignore */ }
    }
  };

  /* 大体积数据（自定义图片 / 视频、搜索历史、快捷方式）存 local（sync 有体积限制） */
  const dataStore = {
    async get(k) {
      if (hasExt) return chrome.storage.local.get(k);
      const v = localStorage.getItem('serene.' + k);
      return v ? { [k]: JSON.parse(v) } : {};
    },
    async set(o) {
      if (hasExt) return chrome.storage.local.set(o);
      for (const k in o) localStorage.setItem('serene.' + k, JSON.stringify(o[k]));
    }
  };

  /* ---------- 预设背景 ---------- */
  const PRESETS = {
    ink: {
      label: '墨',
      css: 'radial-gradient(90% 70% at 18% 12%, rgba(84,94,120,.28), transparent 60%), radial-gradient(80% 60% at 85% 90%, rgba(120,100,80,.14), transparent 55%), linear-gradient(165deg, #191c22 0%, #0d0f13 58%, #12151b 100%)'
    },
    night: {
      label: '黛',
      css: 'radial-gradient(85% 65% at 20% 10%, rgba(64,105,150,.30), transparent 60%), radial-gradient(70% 55% at 88% 85%, rgba(38,70,110,.25), transparent 60%), linear-gradient(170deg, #0f1522 0%, #090c14 60%, #0c111c 100%)'
    },
    moss: {
      label: '苔',
      css: 'radial-gradient(85% 65% at 15% 85%, rgba(58,96,70,.30), transparent 60%), radial-gradient(70% 50% at 85% 15%, rgba(96,110,70,.18), transparent 55%), linear-gradient(168deg, #0f1b15 0%, #0a110d 58%, #0d1512 100%)'
    },
    wine: {
      label: '绛',
      css: 'radial-gradient(85% 65% at 82% 18%, rgba(150,70,90,.24), transparent 58%), radial-gradient(60% 50% at 12% 88%, rgba(110,60,80,.22), transparent 55%), linear-gradient(170deg, #1d1216 0%, #11090d 60%, #160e12 100%)'
    },
    ember: {
      label: '烬',
      css: 'radial-gradient(85% 65% at 80% 12%, rgba(190,120,70,.22), transparent 55%), radial-gradient(60% 50% at 10% 90%, rgba(150,90,50,.18), transparent 55%), linear-gradient(170deg, #1f1812 0%, #120d09 60%, #17100b 100%)'
    },
    mist: {
      label: '雾',
      css: 'radial-gradient(85% 65% at 78% 10%, rgba(90,140,150,.20), transparent 58%), radial-gradient(60% 50% at 12% 92%, rgba(70,110,120,.18), transparent 55%), linear-gradient(170deg, #101a1e 0%, #0a1114 60%, #0d1519 100%)'
    }
  };

  const DEFAULT_LAYOUT = {
    clock: { x: 50, y: 43, s: 1 },
    search: { x: 50, y: 63, s: 1 }
  };

  const CLOCK_STYLES = ['serif', 'light', 'mono', 'din'];

  const DEFAULTS = {
    preset: 'ink',
    customType: 'none',      // none | url | data | url-video | data-video
    customUrl: '',
    h24: true,
    seconds: false,
    showDate: true,
    blur: 26,
    history: true,
    clockStyle: 'serif',
    dateStyle: 'dot',        // dot | cn | slash | en
    linkNames: true,
    layout: DEFAULT_LAYOUT
  };

  const MAX_LINKS = 12;
  const LETTER_COLORS = ['#5a6b8c', '#7c6f56', '#56806a', '#8c5f66', '#5b7a84', '#6f5b8c'];

  let state = Object.assign({}, DEFAULTS);
  let customData = null;     // 本地上传的图片/视频 data URL
  let historyList = [];      // 搜索历史
  let links = [];            // 快捷方式 [{id,name,url,icon,pos:{x,y,s}}]
  let tileEls = [];          // [{el, link}] 快捷方式 DOM 引用
  let editMode = false;
  let dragged = false;       // 本轮 pointer 是否发生了拖动（抑制误点击）
  let dialogOpen = false;
  let dialogIdx = -1;        // -1 = 新增
  let dlgIconUpload = null;  // 对话框中上传的图标 data URL

  /* ---------- 元素 ---------- */
  const bg = $('#bg');
  const bgVideo = $('#bgVideo');
  const clockEl = $('#clock');
  const ampmEl = $('#ampm');
  const dateText = $('#dateText');
  const dateRow = $('#dateRow');
  const clockGroup = $('#clockGroup');
  const searchWrap = $('#searchWrap');
  const stage = $('#stage');
  const input = $('#searchInput');
  const searchBox = $('#searchBox');
  const suggest = $('#suggest');
  const sgScroll = $('#sgScroll');
  const panel = $('#panel');
  const blurInput = $('#optBlur');

  /* ================= 在新标签页打开（当前标签页保持不动） ================= */
  function openUrl(u) {
    /* 注意：不能把 'noopener' 放进 features —— 那会让 window.open 按规范返回 null，
       曾被误判为弹窗被拦截而触发 location.href 回退，导致当前页也跳转。
       正确做法：拿到窗口引用后手动置空 opener。 */
    const w = window.open(u, '_blank');
    if (w) { try { w.opener = null; } catch (e) { /* 跨域时忽略 */ } }
  }

  /* ================= 时钟 ================= */
  let lastStr = '';

  function applyClockStyle(animate) {
    const target = CLOCK_STYLES.includes(state.clockStyle) ? state.clockStyle : 'serif';
    const apply = () => {
      CLOCK_STYLES.forEach((st) => clockEl.classList.remove('style-' + st));
      clockEl.classList.add('style-' + target);
      document.querySelectorAll('#clockStyles .cs').forEach((b) => {
        b.classList.toggle('active', b.dataset.style === target);
      });
    };
    /* 切换样式时轻柔淡出淡入，避免字体生硬跳变 */
    if (animate) {
      clockEl.style.opacity = '0';
      setTimeout(() => { apply(); clockEl.style.opacity = ''; }, 200);
    } else {
      apply();
    }
  }

  function renderClock(str) {
    const old = [...clockEl.children];
    /* 结构未变时逐位对比，仅对变化的数字播放浮现过渡 */
    if (old.length === str.length &&
        old.every((s, i) => (str[i] === ':' ? s.classList.contains('sep') : s.classList.contains('ch')))) {
      for (let i = 0; i < str.length; i++) {
        const sp = old[i];
        if (sp.textContent !== str[i]) {
          sp.textContent = str[i];
          sp.classList.remove('tick');
          void sp.offsetWidth;   // 重启动画
          sp.classList.add('tick');
        }
      }
      return;
    }
    clockEl.textContent = '';
    for (const ch of str) {
      const sp = document.createElement('span');
      if (ch === ':') { sp.className = 'sep'; sp.textContent = ':'; }
      else { sp.className = 'ch'; sp.textContent = ch; }
      clockEl.appendChild(sp);
    }
  }

  /* ---------- 日期样式 ---------- */
  const CN_D = '〇一二三四五六七八九';
  const WD_CN = ['日', '一', '二', '三', '四', '五', '六'];
  const WD_EN = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const MON_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

  function cnNum(n) {
    if (n >= 100) return String(n).split('').map((d) => CN_D[+d]).join('');
    if (n <= 10) return n === 10 ? '十' : CN_D[n];
    if (n < 20) return '十' + CN_D[n % 10];
    return CN_D[Math.floor(n / 10)] + '十' + (n % 10 ? CN_D[n % 10] : '');
  }

  function fmtDate(d) {
    const p = (n) => String(n).padStart(2, '0');
    const wd = d.getDay();
    switch (state.dateStyle) {
      case 'cn': return cnNum(d.getFullYear()) + ' 年 ' + cnNum(d.getMonth() + 1) + ' 月 ' + cnNum(d.getDate()) + ' 日 · 星期' + WD_CN[wd];
      case 'slash': return p(d.getMonth() + 1) + ' / ' + p(d.getDate()) + ' · 周' + WD_CN[wd];
      case 'en': return WD_EN[wd] + ' · ' + MON_EN[d.getMonth()] + ' ' + d.getDate();
      default: return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate()) + ' · 星期' + WD_CN[wd];
    }
  }

  function applyDateStyle() {
    dateRow.classList.remove('date-dot', 'date-cn', 'date-slash', 'date-en');
    dateRow.classList.add('date-' + (state.dateStyle || 'dot'));
    document.querySelectorAll('#dateStyles .ds').forEach((b) => {
      b.classList.toggle('active', b.dataset.style === state.dateStyle);
    });
    dateText.style.opacity = '0';
    setTimeout(() => {
      if (state.showDate) dateText.textContent = fmtDate(new Date());
      dateText.style.opacity = '';
    }, 200);
  }

  function renderTime() {
    const d = new Date();
    let h = d.getHours();
    let ampm = '';
    if (!state.h24) { ampm = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; }
    const hh = state.h24 ? String(h).padStart(2, '0') : String(h);
    let s = hh + ':' + String(d.getMinutes()).padStart(2, '0');
    if (state.seconds) s += ':' + String(d.getSeconds()).padStart(2, '0');
    if (s !== lastStr) { lastStr = s; renderClock(s); }
    ampmEl.textContent = ampm;
    if (state.showDate) {
      const txt = fmtDate(d);
      if (dateText.textContent !== txt) dateText.textContent = txt;
    }
  }

  function loop() {
    renderTime();
    setTimeout(loop, 1000 - (Date.now() % 1000) + 15);
  }

  /* ================= Bing 搜索 + 历史 + 联想 ================= */
  let debounceT = null;
  let ctrl = null;
  let items = [];
  let activeIdx = -1;

  const SG_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg>';
  const HIST_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>';

  function hideSuggest() {
    suggest.hidden = true;
    sgScroll.textContent = '';
    suggest.style.top = suggest.style.bottom = suggest.style.left = suggest.style.width = suggest.style.maxHeight = '';
    items = [];
    activeIdx = -1;
  }

  /* 联想框自适应定位：
     - 宽度对齐搜索框（不小于 320px），整体夹在屏幕内并留出边距
     - 垂直优先向下展开，空间不足且上方更宽裕时改向上
     - 最大高度受剩余空间约束，超出自动裁剪滚动 */
  function positionSuggest() {
    if (suggest.hidden) return;
    const M = 16; // 距屏幕边缘的安全距离
    const r = searchBox.getBoundingClientRect();
    const vw = innerWidth, vh = innerHeight;

    const width = clamp(Math.max(r.width, 320), 320, vw - 2 * M);
    suggest.style.width = width + 'px';

    let left = r.left + r.width / 2 - width / 2;
    left = clamp(left, M, vw - M - width);
    suggest.style.left = left + 'px';
    suggest.style.right = 'auto';

    const gap = 10;
    const below = vh - r.bottom - gap - M;
    const above = r.top - gap - M;
    if (below >= 160 || below >= above) {
      suggest.style.top = (r.bottom + gap) + 'px';
      suggest.style.bottom = 'auto';
      suggest.style.maxHeight = Math.max(140, below) + 'px';
    } else {
      suggest.style.bottom = (vh - r.top + gap) + 'px';
      suggest.style.top = 'auto';
      suggest.style.maxHeight = Math.max(140, above) + 'px';
    }
  }

  function paintActive() {
    [...sgScroll.children].forEach((el, i) => {
      el.classList.toggle('active', i === activeIdx);
      if (i === activeIdx) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function renderSuggest(list, histSet) {
    items = list;
    activeIdx = -1;
    sgScroll.textContent = '';
    list.forEach((q, i) => {
      const isHist = histSet.has(q);
      const div = document.createElement('div');
      div.className = 'sg-item';
      div.style.setProperty('--i', i);
      div.innerHTML = (isHist ? HIST_ICON : SG_ICON)
        + '<span class="sg-t"></span>'
        + (isHist ? '<span class="sg-x" title="删除该记录">×</span>' : '');
      div.querySelector('.sg-t').textContent = q;
      div.addEventListener('mouseenter', () => {
        activeIdx = i;
        paintActive();
      });
      /* 历史条目：悬停出的 × 单条删除（阻止触发搜索） */
      const x = div.querySelector('.sg-x');
      if (x) {
        const del = (e) => {
          e.preventDefault();
          e.stopPropagation();
          removeFromHistory(q);
        };
        x.addEventListener('pointerdown', del);
        x.addEventListener('click', del);
      }
      sgScroll.appendChild(div);
    });
    suggest.hidden = false;
    positionSuggest();
  }

  /* ---------- 历史管理：单条删除 / 列表渲染 / 实时同步 ---------- */
  function removeFromHistory(term) {
    historyList = historyList.filter((h) => h !== term);
    dataStore.set({ history: historyList });
    renderHistoryList();
    const q = input.value.trim();
    if (q) fetchSuggest(q); else hideSuggest();
  }

  function renderHistoryList() {
    const wrap = $('#histList');
    if (!wrap) return;
    wrap.textContent = '';
    historyList.slice(0, 30).forEach((term) => {
      const row = document.createElement('div');
      row.className = 'h-row';
      const t = document.createElement('span');
      t.textContent = term;
      t.title = term;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '×';
      btn.title = '删除';
      btn.addEventListener('click', () => removeFromHistory(term));
      row.appendChild(t);
      row.appendChild(btn);
      wrap.appendChild(row);
    });
  }

  function historyMatches(q) {
    if (!state.history) return [];
    const ql = q.toLowerCase();
    return historyList.filter((h) => h.toLowerCase().includes(ql)).slice(0, 4);
  }

  async function fetchSuggest(q) {
    const hist = historyMatches(q);
    try {
      if (ctrl) ctrl.abort();
      ctrl = new AbortController();
      const r = await fetch('https://api.bing.com/osjson.aspx?query=' + encodeURIComponent(q), { signal: ctrl.signal });
      const data = await r.json();
      if (!input.value.trim()) return hideSuggest();
      const histLow = hist.map((h) => h.toLowerCase());
      const bing = (Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [])
        .filter((s) => !histLow.includes(s.toLowerCase()))
        .slice(0, Math.max(2, 8 - hist.length));
      const combined = [...hist, ...bing];
      combined.length ? renderSuggest(combined, new Set(hist)) : hideSuggest();
    } catch (e) {
      /* 网络失败时仅显示历史 */
      if (e.name !== 'AbortError') {
        hist.length ? renderSuggest(hist, new Set(hist)) : hideSuggest();
      }
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceT);
    const q = input.value.trim();
    if (!q) return hideSuggest();
    debounceT = setTimeout(() => fetchSuggest(q), 150);
  });

  input.addEventListener('focus', () => {
    document.body.classList.add('searching');
    const q = input.value.trim();
    if (q) fetchSuggest(q);
  });

  input.addEventListener('blur', () => {
    document.body.classList.remove('searching');
    setTimeout(hideSuggest, 120);
  });

  input.addEventListener('keydown', (e) => {
    const open = !suggest.hidden;
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      activeIdx = (activeIdx + 1) % items.length;
      paintActive();
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      activeIdx = (activeIdx - 1 + items.length) % items.length;
      paintActive();
    } else if (e.key === 'Enter') {
      go(activeIdx >= 0 ? items[activeIdx] : input.value);
    } else if (e.key === 'Escape') {
      hideSuggest();
      input.blur();
    }
  });

  /* 点击联想词 / 历史记录直接搜索（pointerdown + preventDefault 防止先触发 blur） */
  suggest.addEventListener('pointerdown', (e) => {
    const item = e.target.closest('.sg-item');
    if (!item) return;
    e.preventDefault();
    go(item.querySelector('.sg-t').textContent);
  });

  async function go(q) {
    q = (q || '').trim();
    if (!q) { openUrl('https://www.bing.com'); input.blur(); return; }
    /* 记录搜索历史（先写入再跳转） */
    if (state.history) {
      historyList = [q, ...historyList.filter((h) => h.toLowerCase() !== q.toLowerCase())].slice(0, 100);
      try { await dataStore.set({ history: historyList }); } catch (e) { /* ignore */ }
    }
    let target;
    if (/^https?:\/\//i.test(q)) target = q;
    else if (!/\s/.test(q) && /^[\w-]+(\.[\w-]+)+([/?#].*)?$/i.test(q)) target = 'https://' + q;
    else target = 'https://www.bing.com/search?q=' + encodeURIComponent(q);
    hideSuggest();
    input.blur();       // 触发快捷方式回归动画
    openUrl(target);    // 新标签页打开
  }

  /* ================= 布局：拖动（含居中吸附） + 滚轮缩放 ================= */
  function refreshPositions() {
    const c = state.layout.clock, s = state.layout.search;
    clockGroup.style.left = c.x + '%';
    clockGroup.style.top = c.y + '%';
    clockGroup.style.transform = 'translate(-50%, -50%) scale(' + c.s + ')';
    searchWrap.style.left = s.x + '%';
    searchWrap.style.top = s.y + '%';
    searchWrap.style.transform = 'translate(-50%, -50%) scale(' + s.s + ')';
    tileEls.forEach(({ el, link }) => {
      const p = link.pos;
      el.style.setProperty('--x', p.x + '%');
      el.style.setProperty('--y', p.y + '%');
      el.style.setProperty('--s', p.s);
    });
  }

  function persist() { store.set(state); }

  let layoutPersistT = null;
  function persistLayoutSoon() {
    clearTimeout(layoutPersistT);
    layoutPersistT = setTimeout(persist, 350);
  }

  let linksPersistT = null;
  function persistLinksSoon() {
    clearTimeout(linksPersistT);
    linksPersistT = setTimeout(() => dataStore.set({ links }), 350);
  }

  const SNAP = 2.2; // 吸附半径（屏幕百分比）

  /* 通用拖动 / 缩放绑定：posOf 返回可变位置对象 */
  function bindDrag(el, posOf, persistSoon, persistNow, scaleRange) {
    const [sMin, sMax] = scaleRange || [0.5, 2.5];
    el.addEventListener('pointerdown', (e) => {
      if (!editMode || e.button !== 0) return;
      if (e.target.closest('.del')) return;
      e.preventDefault();
      hideSuggest();
      dragged = false;
      el.setPointerCapture(e.pointerId);
      const sx = e.clientX, sy = e.clientY;
      const st = posOf();
      const ox = st.x, oy = st.y;
      const move = (ev) => {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) dragged = true;
        let nx = clamp(ox + (ev.clientX - sx) / innerWidth * 100, 4, 96);
        let ny = clamp(oy + (ev.clientY - sy) / innerHeight * 100, 6, 94);
        /* 居中吸附：接近屏幕中心时吸附并显示辅助线 */
        const snapX = Math.abs(nx - 50) < SNAP;
        const snapY = Math.abs(ny - 50) < SNAP;
        if (snapX) nx = 50;
        if (snapY) ny = 50;
        document.body.classList.toggle('snap-x', snapX);
        document.body.classList.toggle('snap-y', snapY);
        st.x = +nx.toFixed(2); st.y = +ny.toFixed(2);
        refreshPositions();
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        document.body.classList.remove('snap-x', 'snap-y');
        setTimeout(() => { dragged = false; }, 60);
        persistNow();
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });

    el.addEventListener('wheel', (e) => {
      if (!editMode) return;
      e.preventDefault();
      const st = posOf();
      st.s = clamp(+(st.s * (e.deltaY < 0 ? 1.06 : 0.943)).toFixed(3), sMin, sMax);
      refreshPositions();
      persistSoon();
    }, { passive: false });
  }

  function enterEdit() {
    editMode = true;
    document.body.classList.add('edit-mode');
    closePanel();
    hideSuggest();
    toast('拖动调整位置 · 滚轮缩放 · 靠近中心自动吸附');
  }

  function exitEdit() {
    editMode = false;
    document.body.classList.remove('edit-mode');
    $('#optEdit').checked = false;
    persist();
    dataStore.set({ links });
  }

  $('#optEdit').addEventListener('change', (e) => { e.target.checked ? enterEdit() : exitEdit(); });
  $('#editDone').addEventListener('click', exitEdit);

  $('#resetLayout').addEventListener('click', () => {
    state.layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
    links.forEach((l, i) => { l.pos = defaultPos(i, links.length); });
    refreshPositions();
    persist();
    dataStore.set({ links });
    toast('布局已重置');
  });

  /* 直接敲键盘即聚焦搜索框（编辑模式 / 面板 / 对话框中不触发） */
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (dialogOpen) return closeDlg();
      if (editMode) return exitEdit();
      if (document.body.classList.contains('panel-open')) return closePanel();
      return;
    }
    if (editMode || dialogOpen) return;
    const t = e.target;
    if (t === input || (t.closest && (t.closest('#panel') || t.closest('#linkDialog')))) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    input.focus();
  });

  /* ================= 快捷方式（每个网站一个独立图标块） ================= */
  function normUrl(u) {
    u = (u || '').trim();
    if (!u) return '';
    return /^https?:\/\//i.test(u) ? u : 'https://' + u;
  }

  function domainOf(u) {
    try { return new URL(normUrl(u)).hostname; } catch (e) { return ''; }
  }

  /* 默认位置：底部自动排布，每行 8 个，居中 */
  function defaultPos(i, total) {
    const per = 8;
    const row = Math.floor(i / per);
    const start = row * per;
    const inRow = Math.min(per, total - start);
    const col = i - start;
    const x = clamp(50 + (col - (inRow - 1) / 2) * 8.5, 8, 92);
    const y = clamp(76 + row * 13, 8, 92);
    return { x: +x.toFixed(1), y, s: 1 };
  }

  function letterColor(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return LETTER_COLORS[h % LETTER_COLORS.length];
  }

  function letterOf(link) {
    const n = (link.name || '').trim();
    if (n) return n[0].toUpperCase();
    const d = domainOf(link.url || '');
    return d ? d[0].toUpperCase() : '?';
  }

  /* 图标解析：自定义图标 → 网站自身 favicon → 首字母底块 */
  function fillIcon(box, link) {
    box.textContent = '';
    const candidates = [];
    if (link.icon) candidates.push(link.icon);
    const d = domainOf(link.url);
    if (d) candidates.push('https://' + d + '/favicon.ico');
    let idx = 0;
    const tryNext = () => {
      if (idx >= candidates.length) {
        const lt = document.createElement('span');
        lt.className = 'lt';
        lt.textContent = letterOf(link);
        lt.style.background = letterColor(link.name || d || 'x');
        lt.style.width = lt.style.height = '100%';
        box.appendChild(lt);
        return;
      }
      const img = new Image();
      img.alt = '';
      img.onerror = () => { idx++; tryNext(); };
      img.onload = () => {
        box.textContent = '';
        box.appendChild(img);
      };
      img.src = candidates[idx];
    };
    tryNext();
  }

  function renderLinks() {
    tileEls.forEach(({ el }) => el.remove());
    tileEls = [];
    links.forEach((link, i) => {
      if (!link.pos) link.pos = defaultPos(i, links.length);

      const a = document.createElement('a');
      a.className = 'tile link block';
      a.href = normUrl(link.url);
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = link.name;
      a.style.setProperty('--i', i);

      /* 内层承载入场动画，外层承载定位与显隐动画 */
      const inn = document.createElement('span');
      inn.className = 'tile-in';
      inn.style.setProperty('--i', i);
      const ic = document.createElement('span');
      ic.className = 'ic';
      fillIcon(ic, link);
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = link.name || domainOf(link.url);
      inn.appendChild(ic);
      inn.appendChild(nm);
      a.appendChild(inn);

      /* 编辑模式下的删除角标 */
      const del = document.createElement('button');
      del.className = 'del';
      del.type = 'button';
      del.textContent = '×';
      del.title = '删除';
      del.addEventListener('pointerdown', (e) => e.stopPropagation());
      del.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        links.splice(i, 1);
        dataStore.set({ links });
        renderLinks();
        renderLinkList();
        toast('已删除「' + (link.name || '') + '」');
      });
      a.appendChild(del);

      /* 编辑模式 / 刚拖动完：不导航 */
      a.addEventListener('click', (e) => {
        if (editMode || dragged) e.preventDefault();
      });
      a.addEventListener('dblclick', (e) => {
        e.preventDefault();
        if (editMode) openDlg(i);
      });

      stage.appendChild(a);
      tileEls.push({ el: a, link });

      bindDrag(a, () => link.pos, persistLinksSoon, () => dataStore.set({ links }), [0.6, 1.8]);
    });
    refreshPositions();
  }

  function renderLinkList() {
    const wrap = $('#linkList');
    wrap.textContent = '';
    links.forEach((link, i) => {
      const row = document.createElement('div');
      row.className = 'lk-row';
      row.style.setProperty('--i', i);
      const ic = document.createElement('span');
      ic.className = 'lk-ic';
      fillIcon(ic, link);
      const meta = document.createElement('div');
      meta.className = 'lk-meta';
      const b = document.createElement('b');
      b.textContent = link.name || domainOf(link.url);
      const s = document.createElement('span');
      s.textContent = link.url;
      meta.appendChild(b);
      meta.appendChild(s);
      const acts = document.createElement('div');
      acts.className = 'lk-acts';
      const mk = (txt, title, fn, cls) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = txt;
        btn.title = title;
        if (cls) btn.className = cls;
        btn.addEventListener('click', fn);
        return btn;
      };
      if (i > 0) acts.appendChild(mk('↑', '上移', () => { [links[i - 1], links[i]] = [links[i], links[i - 1]]; saveLinks(); }));
      if (i < links.length - 1) acts.appendChild(mk('↓', '下移', () => { [links[i + 1], links[i]] = [links[i], links[i + 1]]; saveLinks(); }));
      acts.appendChild(mk('✎', '编辑', () => openDlg(i)));
      acts.appendChild(mk('×', '删除', () => { links.splice(i, 1); saveLinks(); toast('已删除'); }, 'danger'));
      row.appendChild(ic);
      row.appendChild(meta);
      row.appendChild(acts);
      wrap.appendChild(row);
    });
  }

  function saveLinks() {
    dataStore.set({ links });
    renderLinks();
    renderLinkList();
  }

  /* ---------- 快捷方式对话框 ---------- */
  function updateDlgPreview() {
    const link = {
      name: $('#dlgName').value.trim(),
      url: $('#dlgUrl').value.trim(),
      icon: dlgIconUpload || $('#dlgIcon').value.trim() || ''
    };
    fillIcon($('#dlgPrevBox'), link);
  }

  function openDlg(idx) {
    dialogIdx = idx;
    dlgIconUpload = null;
    if (idx >= 0 && links[idx]) {
      $('#dlgTitle').textContent = '编辑快捷方式';
      $('#dlgName').value = links[idx].name || '';
      $('#dlgUrl').value = links[idx].url || '';
      $('#dlgIcon').value = links[idx].icon && !links[idx].icon.startsWith('data:') ? links[idx].icon : '';
      if (links[idx].icon && links[idx].icon.startsWith('data:')) dlgIconUpload = links[idx].icon;
    } else {
      $('#dlgTitle').textContent = '添加快捷方式';
      $('#dlgName').value = '';
      $('#dlgUrl').value = '';
      $('#dlgIcon').value = '';
    }
    updateDlgPreview();
    dialogOpen = true;
    document.body.classList.add('dialog-open');
    setTimeout(() => $('#dlgName').focus(), 250);
  }

  function closeDlg() {
    dialogOpen = false;
    document.body.classList.remove('dialog-open');
  }

  $('#addLink').addEventListener('click', () => openDlg(-1));
  $('#dlgCancel').addEventListener('click', closeDlg);
  $('#dlgScrim').addEventListener('click', closeDlg);

  ['dlgName', 'dlgUrl', 'dlgIcon'].forEach((id) => {
    $('#' + id).addEventListener('input', () => {
      if (id === 'dlgIcon') dlgIconUpload = null;
      updateDlgPreview();
    });
  });
  /* 对话框内回车直接保存 */
  ['dlgName', 'dlgUrl', 'dlgIcon'].forEach((id) => {
    $('#' + id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('#dlgSave').click();
    });
  });

  $('#dlgIconFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f || !/^image\//.test(f.type)) return;
    const fr = new FileReader();
    fr.onload = () => {
      /* 压缩到 128px 小图标，避免存储膨胀 */
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 128;
        const ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0, 128, 128);
        dlgIconUpload = cv.toDataURL('image/png');
        $('#dlgIcon').value = '';
        updateDlgPreview();
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(f);
  });

  $('#dlgSave').addEventListener('click', () => {
    const name = $('#dlgName').value.trim();
    const url = $('#dlgUrl').value.trim();
    if (!url) return toast('请填写网址');
    const icon = dlgIconUpload || $('#dlgIcon').value.trim() || '';
    if (dialogIdx >= 0) {
      links[dialogIdx] = Object.assign({}, links[dialogIdx], { name: name || domainOf(url), url: normUrl(url), icon });
    } else {
      if (links.length >= MAX_LINKS) return toast('最多 ' + MAX_LINKS + ' 个快捷方式');
      links.push({
        id: Date.now(),
        name: name || domainOf(url),
        url: normUrl(url),
        icon,
        pos: defaultPos(links.length, links.length + 1)
      });
    }
    closeDlg();
    saveLinks();
    toast('已保存');
  });

  /* ================= 背景（渐变 / 图片 / MP4 视频） ================= */
  function stopVideo() {
    bgVideo.pause();
    bgVideo.removeAttribute('src');
    bgVideo.load();
    bgVideo.classList.remove('on');
  }

  function applyBackground() {
    const isVideo = state.customType === 'url-video' || state.customType === 'data-video';
    if (isVideo) {
      const src = state.customType === 'url-video' ? state.customUrl : customData;
      if (src) {
        bg.style.background = '#000';
        bgVideo.src = src;
        bgVideo.classList.add('on');
        bgVideo.play().catch(() => { /* 自动播放被拒时静默处理 */ });
        return;
      }
    }
    stopVideo();
    let css = '';
    if (state.customType === 'url' && state.customUrl) {
      css = '#000 url("' + state.customUrl.replace(/"/g, '%22') + '") center / cover no-repeat';
    } else if (state.customType === 'data' && customData) {
      css = '#000 url("' + customData + '") center / cover no-repeat';
    } else {
      css = (PRESETS[state.preset] || PRESETS.ink).css;
    }
    bg.style.background = css;
  }

  function paintSwatches() {
    document.querySelectorAll('.sw').forEach((s) => {
      s.classList.toggle('active', state.customType === 'none' && s.dataset.key === state.preset);
    });
    $('#customChip').hidden = state.customType === 'none';
  }

  /* ---------- Toast ---------- */
  let toastT = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------- 视频源可用性检测 ---------- */
  function testVideoSrc(src, timeout) {
    return new Promise((res) => {
      const v = document.createElement('video');
      let done = false;
      const fin = (ok) => { if (done) return; done = true; v.removeAttribute('src'); res(ok); };
      v.muted = true;
      v.addEventListener('loadeddata', () => fin(true));
      v.addEventListener('error', () => fin(false));
      setTimeout(() => fin(false), timeout || 12000);
      v.src = src;
    });
  }

  /* ================= 设置面板 ================= */
  function openPanel() {
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('panel-open');
  }
  function closePanel() {
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('panel-open');
  }
  $('#settingsBtn').addEventListener('click', openPanel);
  $('#closePanel').addEventListener('click', closePanel);
  $('#scrim').addEventListener('click', closePanel);

  /* 预设色卡 */
  const swWrap = $('#swatches');
  Object.keys(PRESETS).forEach((key) => {
    const p = PRESETS[key];
    const d = document.createElement('button');
    d.className = 'sw';
    d.dataset.key = key;
    d.style.background = p.css;
    d.innerHTML = '<span class="nm"></span>';
    d.querySelector('.nm').textContent = p.label;
    d.addEventListener('click', () => {
      state.preset = key;
      state.customType = 'none';
      state.customUrl = '';
      customData = null;
      persist();
      applyBackground();
      paintSwatches();
    });
    swWrap.appendChild(d);
  });

  /* 时钟样式 */
  document.querySelectorAll('#clockStyles .cs').forEach((b) => {
    b.addEventListener('click', () => {
      if (state.clockStyle === b.dataset.style) return;
      state.clockStyle = b.dataset.style;
      applyClockStyle(true);
      persist();
    });
  });

  /* 日期样式 */
  document.querySelectorAll('#dateStyles .ds').forEach((b) => {
    b.addEventListener('click', () => {
      state.dateStyle = b.dataset.style;
      applyDateStyle();
      persist();
    });
  });

  /* 快捷方式名称开关 */
  function applyLinkNames() {
    document.body.classList.toggle('no-names', !state.linkNames);
    $('#optLinkNames').checked = !!state.linkNames;
  }
  $('#optLinkNames').addEventListener('change', (e) => {
    state.linkNames = e.target.checked;
    applyLinkNames();
    persist();
  });

  /* 自定义背景链接（图片或 MP4/WebM 视频直链） */
  $('#applyUrl').addEventListener('click', async () => {
    const u = $('#bgUrl').value.trim();
    if (!/^https?:\/\//i.test(u)) return toast('请输入以 http(s):// 开头的链接');
    if (/\.(mp4|webm|ogv|mov)([?#].*)?$/i.test(u)) {
      toast('视频检测中…');
      const ok = await testVideoSrc(u);
      if (!ok) return toast('视频加载失败，请检查链接');
      state.customType = 'url-video';
      state.customUrl = u;
      customData = null;
      persist();
      applyBackground();
      paintSwatches();
      toast('动态背景已更新');
      return;
    }
    const img = new Image();
    img.onload = () => {
      state.customType = 'url';
      state.customUrl = u;
      persist();
      applyBackground();
      paintSwatches();
      toast('背景已更新');
    };
    img.onerror = () => toast('资源加载失败，请检查链接');
    img.src = u;
  });

  /* 上传本地图片 / MP4 视频 */
  $('#bgFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const isVideo = /^video\//.test(f.type);
    if (!isVideo && !/^image\//.test(f.type)) return toast('请选择图片或视频文件');
    if (isVideo && f.size > 120 * 1024 * 1024) return toast('视频过大（限 120MB）');
    toast(isVideo ? '视频读取中…' : '图片处理中…');
    const fr = new FileReader();
    fr.onload = () => {
      if (isVideo) {
        testVideoSrc(fr.result).then((ok) => {
          if (!ok) return toast('无法播放该视频');
          customData = fr.result;
          state.customType = 'data-video';
          state.customUrl = '';
          persist();
          dataStore.set({ customBgData: customData }).then(() => {
            applyBackground();
            paintSwatches();
            toast('动态背景已更新');
          });
        });
        return;
      }
      const img = new Image();
      img.onload = () => {
        const MAX = 2400;
        const sc = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * sc));
        const h = Math.max(1, Math.round(img.height * sc));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        const type = f.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const url = cv.toDataURL(type, 0.85);
        if (url.length > 4.5 * 1024 * 1024) return toast('图片过大，请换一张或降低分辨率');
        customData = url;
        state.customType = 'data';
        state.customUrl = '';
        persist();
        dataStore.set({ customBgData: url }).then(() => {
          applyBackground();
          paintSwatches();
          toast('背景已更新');
        });
      };
      img.onerror = () => toast('无法读取该图片');
      img.src = fr.result;
    };
    fr.readAsDataURL(f);
  });

  /* 移除自定义背景 */
  $('#clearCustom').addEventListener('click', () => {
    state.customType = 'none';
    state.customUrl = '';
    customData = null;
    stopVideo();
    dataStore.set({ customBgData: null });
    $('#bgUrl').value = '';
    persist();
    applyBackground();
    paintSwatches();
    toast('已恢复预设背景');
  });

  /* 历史记录开关 / 清空 */
  $('#optHistory').addEventListener('change', (e) => {
    state.history = e.target.checked;
    persist();
  });
  $('#clearHistory').addEventListener('click', () => {
    historyList = [];
    dataStore.set({ history: [] });
    renderHistoryList();
    hideSuggest();
    toast('搜索历史已清空');
  });

  /* 时间开关 */
  function bindToggle(sel, key) {
    const el = $(sel);
    el.addEventListener('change', () => {
      state[key] = el.checked;
      if (key === 'h24' || key === 'seconds') { lastStr = ''; renderTime(); }
      if (key === 'showDate') dateRow.style.display = state.showDate ? '' : 'none';
      persist();
    });
  }
  bindToggle('#optH24', 'h24');
  bindToggle('#optSeconds', 'seconds');
  bindToggle('#optDate', 'showDate');

  /* 模糊强度 */
  blurInput.addEventListener('input', () => {
    state.blur = +blurInput.value;
    $('#blurVal').textContent = state.blur + 'px';
    document.documentElement.style.setProperty('--focusBlur', state.blur + 'px');
  });
  blurInput.addEventListener('change', persist);

  /* 窗口尺寸变化：联想框重新夹取到屏幕内 */
  window.addEventListener('resize', positionSuggest);

  /* ================= 初始化 ================= */
  (async function init() {
    const s = await store.get(DEFAULTS);
    state = Object.assign({}, DEFAULTS, s);
    /* 合并布局，保证字段齐全（老版本数据可能缺字段） */
    const layout = Object.assign({}, DEFAULT_LAYOUT, state.layout || {});
    ['clock', 'search'].forEach((k) => {
      layout[k] = Object.assign({}, DEFAULT_LAYOUT[k], layout[k] || {});
    });
    state.layout = layout;

    if (state.customType === 'data' || state.customType === 'data-video') {
      const d = await dataStore.get('customBgData');
      customData = d.customBgData || null;
      if (!customData) state.customType = 'none';
    }
    const h = await dataStore.get('history');
    historyList = Array.isArray(h.history) ? h.history : [];
    const lk = await dataStore.get('links');
    links = Array.isArray(lk.links) ? lk.links.filter((x) => x && x.url) : [];
    /* 旧数据迁移：补默认独立位置 */
    if (links.some((l) => !l.pos)) {
      links.forEach((l, i) => { if (!l.pos) l.pos = defaultPos(i, links.length); });
      dataStore.set({ links });
    }

    document.documentElement.style.setProperty('--focusBlur', state.blur + 'px');
    $('#optH24').checked = !!state.h24;
    $('#optSeconds').checked = !!state.seconds;
    $('#optDate').checked = !!state.showDate;
    $('#optHistory').checked = !!state.history;
    $('#optLinkNames').checked = !!state.linkNames;
    blurInput.value = state.blur;
    $('#blurVal').textContent = state.blur + 'px';
    if (state.customUrl) $('#bgUrl').value = state.customUrl;
    dateRow.style.display = state.showDate ? '' : 'none';

    applyClockStyle();
    applyDateStyle();
    applyLinkNames();
    bindDrag(clockGroup, () => state.layout.clock, persistLayoutSoon, persist, [0.5, 2.5]);
    bindDrag(searchWrap, () => state.layout.search, persistLayoutSoon, persist, [0.6, 1.8]);
    renderLinks();
    renderLinkList();
    refreshPositions();
    applyBackground();
    paintSwatches();
    renderHistoryList();
    /* 内容脚本（Bing 搜索页）写入历史时实时同步到本页 */
    if (hasExt && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.history) {
          const nv = changes.history.newValue;
          historyList = Array.isArray(nv) ? nv : [];
          renderHistoryList();
        }
      });
    }
    loop();
  })();
})();
