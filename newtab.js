(() => {
  'use strict';

  /* ============================================================
   * 0. 工具
   * ============================================================ */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad = (n) => String(n).padStart(2, '0');
  const cssVar = (k, v) => document.documentElement.style.setProperty(k, v);

  /* ============================================================
   * 1. 存储层（扩展环境用 chrome.storage，直接打开时回退 localStorage）
   *    小体积设置走 sync，大体积数据（壁纸/历史/快捷方式）走 local
   * ============================================================ */
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

  /* ============================================================
   * 2. 常量与默认值
   * ============================================================ */
  const PRESETS = {
    ink:   { label: '墨', css: 'radial-gradient(90% 70% at 18% 12%, rgba(84,94,120,.28), transparent 60%), radial-gradient(80% 60% at 85% 90%, rgba(120,100,80,.14), transparent 55%), linear-gradient(165deg, #191c22 0%, #0d0f13 58%, #12151b 100%)' },
    night: { label: '黛', css: 'radial-gradient(85% 65% at 20% 10%, rgba(64,105,150,.30), transparent 60%), radial-gradient(70% 55% at 88% 85%, rgba(38,70,110,.25), transparent 60%), linear-gradient(170deg, #0f1522 0%, #090c14 60%, #0c111c 100%)' },
    moss:  { label: '苔', css: 'radial-gradient(85% 65% at 15% 85%, rgba(58,96,70,.30), transparent 60%), radial-gradient(70% 50% at 85% 15%, rgba(96,110,70,.18), transparent 55%), linear-gradient(168deg, #0f1b15 0%, #0a110d 58%, #0d1512 100%)' },
    wine:  { label: '绛', css: 'radial-gradient(85% 65% at 82% 18%, rgba(150,70,90,.24), transparent 58%), radial-gradient(60% 50% at 12% 88%, rgba(110,60,80,.22), transparent 55%), linear-gradient(170deg, #1d1216 0%, #11090d 60%, #160e12 100%)' },
    ember: { label: '烬', css: 'radial-gradient(85% 65% at 80% 12%, rgba(190,120,70,.22), transparent 55%), radial-gradient(60% 50% at 10% 90%, rgba(150,90,50,.18), transparent 55%), linear-gradient(170deg, #1f1812 0%, #120d09 60%, #17100b 100%)' },
    mist:  { label: '雾', css: 'radial-gradient(85% 65% at 78% 10%, rgba(90,140,150,.20), transparent 58%), radial-gradient(60% 50% at 12% 92%, rgba(70,110,120,.18), transparent 55%), linear-gradient(170deg, #101a1e 0%, #0a1114 60%, #0d1519 100%)' }
  };

  const DEFAULT_LAYOUT = {
    clock: { x: 50, y: 38, s: 1 },
    date:  { x: 50, y: 52, s: 1 },
    search:{ x: 50, y: 66, s: 1 }
  };

  const CLOCK_STYLES = ['serif', 'light', 'mono', 'din'];

  const DEFAULTS = {
    preset: 'ink',
    customType: 'none',       // none | url | data | url-video | data-video
    customUrl: '',
    h24: true,
    seconds: false,
    showClock: true,
    showDate: true,
    showMark: true,
    clockBold: false,
    dateBold: false,
    blur: 26,                 // 聚焦模糊 px
    bgBright: 100,            // 壁纸常驻亮度 %
    bgBlur: 0,                // 壁纸常驻模糊 px
    history: true,
    searchNewTab: true,       // 搜索结果打开方式
    linksNewTab: true,        // 快捷方式打开方式
    suggestN: 8,              // 联想条目数
    searchW: 620,             // 搜索框宽度 px
    iconSearch: false,        // 仅图标模式
    searchOp: 100,            // 搜索栏透明度 %
    tileOp: 100,              // 快捷方式图标透明度 %
    radialOut: false,         // 聚焦时以搜索栏为中心向外扩散消失
    clockStyle: 'serif',
    dateFmt: '{Y}.{M}.{D} · {W}',
    dateFont: 'ui',           // ui | serif | mono
    linkNames: true,
    guides: [],               // 自定义吸附线 [{id, x, y, a}]，x/y 中心百分比，a 角度
    layout: DEFAULT_LAYOUT
  };

  /* 旧版 dateStyle → 格式串迁移映射 */
  const LEGACY_DATE = {
    dot: '{Y}.{M}.{D} · {W}',
    cn: '{y}年{m}月{d}日 · {W}',
    slash: '{M} / {D} · {w}',
    en: '{WE} · {ME} {D}'
  };

  const MAX_LINKS = 12;
  const LETTER_COLORS = ['#5a6b8c', '#7c6f56', '#56806a', '#8c5f66', '#5b7a84', '#6f5b8c'];

  const SG_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg>';
  const HIST_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>';
  const FMT_RE = /\{(ME|WE|Y|y|M|m|D|d|W|w)\}/g;   // 日期占位符（模块级预编译）

  const CN_D = '〇一二三四五六七八九';
  const WD_CN = ['日', '一', '二', '三', '四', '五', '六'];
  const WD_EN = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const MON_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

  /* ============================================================
   * 3. 元素缓存 —— 启动时一次性收集全部 [id] 节点，
   *    渲染路径上零 querySelector
   * ============================================================ */
  const el = {};
  for (const n of document.querySelectorAll('[id]')) el[n.id] = n;

  const body = document.body;
  const stage = el.stage;
  const input = el.searchInput;
  const searchBox = el.searchBox;
  const suggest = el.suggest;
  const sgScroll = el.sgScroll;
  const clockEl = el.clock;
  const ampmEl = el.ampm;
  const dateText = el.dateText;

  /* ============================================================
   * 4. 运行态
   * ============================================================ */
  let state = Object.assign({}, DEFAULTS);
  let customData = null;      // 本地上传的图片/视频 data URL
  let historyList = [];       // 搜索历史
  let links = [];             // 快捷方式 [{id,name,url,icon,pos:{x,y,s}}]
  let tileEls = [];           // [{el, link}] 快捷方式 DOM 引用
  let guideEls = [];          // [{el, guide}] 吸附线 DOM 引用
  let editMode = false;
  let dragged = false;        // 本轮 pointer 是否发生拖动（抑制误点击）
  let dialogOpen = false;
  let dialogIdx = -1;         // -1 = 新增
  let dlgIconUpload = null;   // 对话框中上传的图标 data URL
  let selectedEl = null;      // 编辑模式下选中的块（配 ＋/－ 缩放）
  const posRegistry = new Map();  // el → {posOf, applyPos, persistNow, sMin, sMax}

  /* ============================================================
   * 5. 打开方式（新标签页 / 当前页，按设置）
   * ============================================================ */
  function openUrl(u, newTab) {
    if (newTab) {
      /* 'noopener' 不能放进 features —— 会让 window.open 按规范返回 null；
         拿到窗口引用后手动置空 opener 即可 */
      const w = window.open(u, '_blank');
      if (w) { try { w.opener = null; } catch (e) { /* 跨域时忽略 */ } }
    } else {
      location.href = u;
    }
  }

  /* ============================================================
   * 6. 时钟与日期
   *    日期串按「天 + 格式」缓存：每秒 tick 只做两次字符串比较，
   *    不再每秒重建占位符映射表
   * ============================================================ */
  let lastStr = '';        // 上次时间串（避免整树 diff）
  let lastAmpm = null;
  let dateDayKey = -1;     // 缓存命中：天序号
  let dateFmtKey = '';     // 缓存命中：格式串
  let dateTxtCache = '';

  function invalidateDate() { dateDayKey = -1; }

  function applyBoldAndMark() {
    clockEl.classList.toggle('font-bold', !!state.clockBold);
    dateText.classList.toggle('font-bold', !!state.dateBold);
    body.classList.toggle('no-mark', !state.showMark);
  }

  function applyClockStyle(animate) {
    const target = CLOCK_STYLES.includes(state.clockStyle) ? state.clockStyle : 'serif';
    const apply = () => {
      clockEl.className = 'style-' + target + (state.clockBold ? ' font-bold' : '');
      for (const b of el.clockStyles.children) {
        b.classList.toggle('active', b.dataset.style === target);
      }
    };
    /* 切换样式时轻柔淡出淡入，避免字体生硬跳变 */
    if (animate) {
      clockEl.style.opacity = '0';
      setTimeout(() => { apply(); clockEl.style.opacity = ''; }, 200);
    } else {
      apply();
    }
  }

  /* 逐位 diff：仅对变化的数字播放浮现过渡 */
  function renderClock(str) {
    const old = clockEl.children;
    if (old.length === str.length) {
      let same = true;
      for (let i = 0; i < str.length; i++) {
        const isSep = str[i] === ':';
        if ((isSep ? old[i].className === 'sep' : old[i].className.indexOf('ch') !== -1) === false) { same = false; break; }
      }
      if (same) {
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
    }
    clockEl.textContent = '';
    for (const ch of str) {
      const sp = document.createElement('span');
      if (ch === ':') { sp.className = 'sep'; sp.textContent = ':'; }
      else { sp.className = 'ch'; sp.textContent = ch; }
      clockEl.appendChild(sp);
    }
  }

  function cnNum(n) {
    if (n >= 100) return String(n).split('').map((d) => CN_D[+d]).join('');
    if (n <= 10) return n === 10 ? '十' : CN_D[n];
    if (n < 20) return '十' + CN_D[n % 10];
    return CN_D[Math.floor(n / 10)] + '十' + (n % 10 ? CN_D[n % 10] : '');
  }

  /* {Y}2026 {y}二〇二六 {M}08 {m}八 {ME}AUGUST {D}16 {d}十六 {W}星期日 {w}周日 {WE}SUNDAY */
  function fmtDate(d) {
    const map = {
      Y: String(d.getFullYear()),
      y: cnNum(d.getFullYear()),
      M: pad(d.getMonth() + 1),
      m: cnNum(d.getMonth() + 1),
      ME: MON_EN[d.getMonth()],
      D: String(d.getDate()),
      d: cnNum(d.getDate()),
      W: '星期' + WD_CN[d.getDay()],
      w: '周' + WD_CN[d.getDay()],
      WE: WD_EN[d.getDay()]
    };
    return (state.dateFmt || '{Y}.{M}.{D} · {W}').replace(FMT_RE, (_, k) => map[k] || '');
  }

  function applyDateFont() {
    dateText.classList.remove('f-serif', 'f-mono');
    if (state.dateFont === 'serif') dateText.classList.add('f-serif');
    if (state.dateFont === 'mono') dateText.classList.add('f-mono');
    for (const b of el.dateFonts.children) {
      b.classList.toggle('active', b.dataset.f === state.dateFont);
    }
  }

  function applyDateFmt(animate) {
    for (const b of el.dateStyles.children) {
      b.classList.toggle('active', b.dataset.fmt === state.dateFmt);
    }
    const paint = () => { invalidateDate(); renderTime(); };
    if (animate) {
      dateText.style.opacity = '0';
      setTimeout(() => { paint(); dateText.style.opacity = ''; }, 200);
    } else paint();
  }

  function renderTime() {
    const d = new Date();
    let h = d.getHours();
    let ampm = '';
    if (!state.h24) { ampm = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; }
    let s = (state.h24 ? pad(h) : String(h)) + ':' + pad(d.getMinutes());
    if (state.seconds) s += ':' + pad(d.getSeconds());
    if (s !== lastStr) { lastStr = s; renderClock(s); }
    if (ampm !== lastAmpm) { lastAmpm = ampm; ampmEl.textContent = ampm; }
    if (state.showDate) {
      const dayKey = d.getFullYear() * 512 + d.getMonth() * 32 + d.getDate();
      if (dayKey !== dateDayKey || state.dateFmt !== dateFmtKey) {
        dateDayKey = dayKey;
        dateFmtKey = state.dateFmt;
        dateTxtCache = fmtDate(d);
        if (dateText.textContent !== dateTxtCache) dateText.textContent = dateTxtCache;
      }
    }
  }

  function loop() {
    renderTime();
    setTimeout(loop, 1000 - (Date.now() % 1000) + 15);
  }

  /* ============================================================
   * 7. 搜索联想（事件委托：容器上固定 2 个监听器，
   *    渲染 N 条目不再挂 3N 个监听器）
   * ============================================================ */
  let debounceT = null;
  let ctrl = null;
  let items = [];
  let activeIdx = -1;

  function hideSuggest() {
    suggest.hidden = true;
    sgScroll.textContent = '';
    suggest.style.top = suggest.style.bottom = suggest.style.left = suggest.style.width = suggest.style.maxHeight = '';
    items = [];
    activeIdx = -1;
  }

  /* 联想框自适应定位：宽度对齐搜索框（≥320px）并夹在屏幕内留边距；
     垂直优先向下，空间不足且上方更宽裕时改向上；最大高度受剩余空间约束 */
  function positionSuggest() {
    if (suggest.hidden) return;
    const M = 16, gap = 10;
    const r = searchBox.getBoundingClientRect();
    const vw = innerWidth, vh = innerHeight;

    const width = clamp(Math.max(r.width, 320), 320, vw - 2 * M);
    suggest.style.width = width + 'px';
    suggest.style.left = clamp(r.left + r.width / 2 - width / 2, M, vw - M - width) + 'px';
    suggest.style.right = 'auto';

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
    const kids = sgScroll.children;
    for (let i = 0; i < kids.length; i++) {
      kids[i].classList.toggle('active', i === activeIdx);
    }
    if (activeIdx >= 0 && kids[activeIdx]) kids[activeIdx].scrollIntoView({ block: 'nearest' });
  }

  function renderSuggest(list, histSet) {
    items = list;
    activeIdx = -1;
    const frag = document.createDocumentFragment();
    list.forEach((q, i) => {
      const isHist = histSet.has(q);
      const div = document.createElement('div');
      div.className = 'sg-item';
      div.dataset.i = i;
      div.dataset.q = q;
      div.style.setProperty('--i', i);
      div.innerHTML = (isHist ? HIST_ICON : SG_ICON)
        + '<span class="sg-t"></span>'
        + (isHist ? '<span class="sg-x" title="删除该记录">×</span>' : '');
      div.querySelector('.sg-t').textContent = q;
      frag.appendChild(div);
    });
    sgScroll.textContent = '';
    sgScroll.appendChild(frag);
    suggest.hidden = false;
    positionSuggest();
  }

  function historyMatches(q) {
    if (!state.history) return [];
    const total = clamp(state.suggestN || 8, 3, 15);
    const ql = q.toLowerCase();
    return historyList.filter((h) => h.toLowerCase().includes(ql)).slice(0, Math.min(4, total));
  }

  async function fetchSuggest(q) {
    const hist = historyMatches(q);
    const total = clamp(state.suggestN || 8, 3, 15);
    try {
      if (ctrl) ctrl.abort();
      ctrl = new AbortController();
      const r = await fetch('https://api.bing.com/osjson.aspx?query=' + encodeURIComponent(q), { signal: ctrl.signal });
      const data = await r.json();
      if (!input.value.trim()) return hideSuggest();
      const histLow = hist.map((h) => h.toLowerCase());
      const bing = (Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [])
        .filter((s) => !histLow.includes(s.toLowerCase()))
        .slice(0, Math.max(0, total - hist.length));
      const combined = hist.length ? [...hist, ...bing] : bing;
      combined.length ? renderSuggest(combined, new Set(hist)) : hideSuggest();
    } catch (e) {
      /* 网络失败时仅显示历史 */
      if (e.name !== 'AbortError') {
        hist.length ? renderSuggest(hist, new Set(hist)) : hideSuggest();
      }
    }
  }

  /* --- 联想事件（委托到滚动容器，恒定 2 个监听器） --- */
  sgScroll.addEventListener('pointerover', (e) => {
    const item = e.target.closest('.sg-item');
    if (!item) return;
    const i = +item.dataset.i;
    if (i !== activeIdx) { activeIdx = i; paintActive(); }
  });

  sgScroll.addEventListener('pointerdown', (e) => {
    const x = e.target.closest('.sg-x');
    if (x) {
      e.preventDefault();
      e.stopPropagation();
      removeFromHistory(x.closest('.sg-item').dataset.q);
      return;
    }
    const item = e.target.closest('.sg-item');
    if (item) {
      e.preventDefault();   // 防止先触发 input blur
      go(item.dataset.q);
    }
  });

  input.addEventListener('input', () => {
    clearTimeout(debounceT);
    const q = input.value.trim();
    if (!q) return hideSuggest();
    debounceT = setTimeout(() => fetchSuggest(q), 150);
  });

  input.addEventListener('focus', () => {
    if (state.radialOut) updateRadialDelays();   // 聚焦前按当前布局算好扩散顺序
    body.classList.add('searching');
    const q = input.value.trim();
    if (q) fetchSuggest(q);
    /* 仅图标模式：展开动画结束后校正联想框位置与宽度 */
    if (state.iconSearch) setTimeout(positionSuggest, 440);
  });

  input.addEventListener('blur', () => {
    body.classList.remove('searching');
    setTimeout(hideSuggest, 120);
  });

  input.addEventListener('keydown', (e) => {
    const open = !suggest.hidden;
    if (e.key === 'ArrowDown' && open && items.length) {
      e.preventDefault();
      activeIdx = (activeIdx + 1) % items.length;
      paintActive();
    } else if (e.key === 'ArrowUp' && open && items.length) {
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

  /* 仅图标模式：点击圆形图标聚焦输入框 */
  searchBox.addEventListener('click', () => {
    if (state.iconSearch && document.activeElement !== input) input.focus();
  });

  async function go(q) {
    q = (q || '').trim();
    if (!q) { openUrl('https://www.bing.com', false); input.blur(); return; }
    /* 记录搜索历史（先写入再跳转） */
    if (state.history) {
      const ql = q.toLowerCase();
      historyList = [q, ...historyList.filter((h) => h.toLowerCase() !== ql)].slice(0, 100);
      try { await dataStore.set({ history: historyList }); } catch (e) { /* ignore */ }
    }
    let target;
    if (/^https?:\/\//i.test(q)) target = q;
    else if (!/\s/.test(q) && /^[\w-]+(\.[\w-]+)+([/?#].*)?$/i.test(q)) target = 'https://' + q;
    else target = 'https://www.bing.com/search?q=' + encodeURIComponent(q);
    hideSuggest();
    input.blur();       // 触发快捷方式回归动画
    openUrl(target, state.searchNewTab);
  }

  /* ============================================================
   * 8. 搜索历史（管理列表 + storage 实时同步）
   * ============================================================ */
  function removeFromHistory(term) {
    historyList = historyList.filter((h) => h !== term);
    dataStore.set({ history: historyList });
    renderHistoryList();
    const q = input.value.trim();
    if (q) fetchSuggest(q); else hideSuggest();
  }

  function renderHistoryList() {
    const wrap = el.histList;
    wrap.textContent = '';
    const frag = document.createDocumentFragment();
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
      btn.dataset.term = term;
      row.appendChild(t);
      row.appendChild(btn);
      frag.appendChild(row);
    });
    wrap.appendChild(frag);
  }

  /* 删除按钮委托（单监听器） */
  el.histList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-term]');
    if (btn) removeFromHistory(btn.dataset.term);
  });

  /* ============================================================
   * 9. 布局：拖动（含居中吸附）/ 滚轮缩放
   *    性能要点：pointermove 用 rAF 合帧；拖动期间只写
   *    当前元素的定位样式，不再全量刷新所有块与图标
   * ============================================================ */
  function applyBlockPos(elm, st) {
    elm.style.left = st.x + '%';
    elm.style.top = st.y + '%';
    elm.style.transform = 'translate(-50%, -50%) scale(' + st.s + ')';
  }

  function applyTilePos(elm, st) {
    elm.style.setProperty('--x', st.x + '%');
    elm.style.setProperty('--y', st.y + '%');
    elm.style.setProperty('--s', st.s);
  }

  function refreshPositions() {
    applyBlockPos(el.clockGroup, state.layout.clock);
    applyBlockPos(el.dateGroup, state.layout.date);
    applyBlockPos(el.searchWrap, state.layout.search);
    for (const { el: t, link } of tileEls) applyTilePos(t, link.pos);
  }

  function persist() { store.set(state); }

  function debounce(key, fn, ms) {
    clearTimeout(key._t);
    key._t = setTimeout(fn, ms);
  }
  const persistLayoutSoon = () => debounce(persistLayoutSoon, persist, 350);
  const persistLinksSoon = () => debounce(persistLinksSoon, () => dataStore.set({ links }), 350);

  const SNAP = 2.2; // 吸附半径（屏幕百分比）

  function bindDrag(elm, posOf, applyPos, persistSoon, persistNow, scaleRange) {
    const [sMin, sMax] = scaleRange || [0.5, 2.5];
    posRegistry.set(elm, { posOf, applyPos, persistNow, sMin, sMax });
    elm.addEventListener('pointerdown', (e) => {
      if (!editMode || e.button !== 0) return;
      if (e.target.closest('.del')) return;
      e.preventDefault();
      hideSuggest();
      dragged = false;
      elm.setPointerCapture(e.pointerId);
      const sx = e.clientX, sy = e.clientY;
      const st = posOf();
      const ox = st.x, oy = st.y;
      /* rAF 合帧：pointermove 高频触发时每帧最多写一次样式 */
      let pending = null, scheduled = false;
      const applyFromEvent = (ev) => {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) dragged = true;
        let nx = clamp(ox + (ev.clientX - sx) / innerWidth * 100, 4, 96);
        let ny = clamp(oy + (ev.clientY - sy) / innerHeight * 100, 6, 94);
        /* 自定义吸附线优先：命中则元素中心钉到线上（沿线自由滑动） */
        const snapG = snapToGuides(nx, ny);
        if (snapG) {
          nx = snapG.nx; ny = snapG.ny;
          hotGuide(snapG.id);
          body.classList.remove('snap-x', 'snap-y');
        } else {
          hotGuide(null);
          /* 居中吸附：接近屏幕中心时吸附并显示辅助线 */
          const snapX = Math.abs(nx - 50) < SNAP;
          const snapY = Math.abs(ny - 50) < SNAP;
          if (snapX) nx = 50;
          if (snapY) ny = 50;
          body.classList.toggle('snap-x', snapX);
          body.classList.toggle('snap-y', snapY);
        }
        st.x = +nx.toFixed(2); st.y = +ny.toFixed(2);
        applyPos(elm, st);   // 只写被拖元素
      };
      const flush = () => {
        scheduled = false;
        if (!pending) return;
        const ev = pending;
        pending = null;
        applyFromEvent(ev);
      };
      const move = (ev) => {
        pending = ev;
        if (!scheduled) { scheduled = true; requestAnimationFrame(flush); }
      };
      const up = () => {
        elm.removeEventListener('pointermove', move);
        elm.removeEventListener('pointerup', up);
        elm.removeEventListener('pointercancel', up);
        /* 松手前把最后一帧未合帧的位移同步应用，保证状态/DOM/存储一致 */
        if (pending) { const ev = pending; pending = null; applyFromEvent(ev); }
        hotGuide(null);
        body.classList.remove('snap-x', 'snap-y');
        setTimeout(() => { dragged = false; }, 60);
        persistNow();
      };
      elm.addEventListener('pointermove', move);
      elm.addEventListener('pointerup', up);
      elm.addEventListener('pointercancel', up);
    });

    elm.addEventListener('wheel', (e) => {
      if (!editMode) return;
      e.preventDefault();
      const st = posOf();
      st.s = clamp(+(st.s * (e.deltaY < 0 ? 1.06 : 0.943)).toFixed(3), sMin, sMax);
      applyPos(elm, st);
      persistSoon();
    }, { passive: false });
  }

  /* ============================================================
   * 9b. 自定义吸附线：元素中心吸附到任意角度的直线上，沿线自由排列
   * ============================================================ */
  const GUIDE_SNAP_PX = 14;   // 吸附判定距离（px）

  /* 计算元素中心 (nx%, ny%) 到各线的距离，返回最近命中线的投影点 */
  function snapToGuides(nx, ny) {
    const gs = state.guides;
    if (!gs.length) return null;
    const iw = innerWidth, ih = innerHeight;
    const px = nx / 100 * iw, py = ny / 100 * ih;
    let best = GUIDE_SNAP_PX, hit = null;
    for (const g of gs) {
      const cx = g.x / 100 * iw, cy = g.y / 100 * ih;
      const rad = g.a * Math.PI / 180;
      const dx = Math.cos(rad), dy = Math.sin(rad);
      const vx = px - cx, vy = py - cy;
      const dist = Math.abs(vx * dy - vy * dx);          // 点到直线距离（叉积）
      if (dist < best) {
        const t = vx * dx + vy * dy;                     // 沿线投影
        const qnx = (cx + t * dx) / iw * 100;
        const qny = (cy + t * dy) / ih * 100;
        /* 投影点须在屏幕范围内才有效 */
        if (qnx >= 4 && qnx <= 96 && qny >= 6 && qny <= 94) {
          best = dist;
          hit = { id: g.id, nx: qnx, ny: qny };
        }
      }
    }
    return hit;
  }

  /* 命中线高亮（id 为 null 时全部熄灭） */
  function hotGuide(id) {
    for (const { el: gEl, guide } of guideEls) {
      gEl.classList.toggle('hot', guide.id === id);
    }
  }

  function refreshGuidePos() {
    for (const { el: gEl, guide: g } of guideEls) {
      gEl.style.setProperty('--gx', g.x + '%');
      gEl.style.setProperty('--gy', g.y + '%');
      gEl.style.setProperty('--ga', g.a + 'deg');
    }
  }

  /* 吸附线手势：线身/中心点拖动 = 移动；两端圆点拖动 = 旋转（绕线中心） */
  function bindGuideGesture(elm, g) {
    elm.addEventListener('pointerdown', (e) => {
      if (!editMode || e.button !== 0) return;
      if (e.target.closest('.g-del')) return;
      e.preventDefault();
      e.stopPropagation();
      const isEnd = !!e.target.closest('.g-end');
      dragged = false;
      elm.setPointerCapture(e.pointerId);
      const sx = e.clientX, sy = e.clientY;
      const ox = g.x, oy = g.y;
      const move = (ev) => {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 3) dragged = true;
        if (isEnd) {
          const cx = ox / 100 * innerWidth, cy = oy / 100 * innerHeight;
          let a = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI;
          /* 水平 / 垂直磁吸：靠近 0°/90°/180°/270° 时吸附（±5°） */
          const near = Math.round(a / 90) * 90;
          if (Math.abs(a - near) < 5) a = near;
          g.a = +a.toFixed(1);
        } else {
          g.x = +clamp(ox + (ev.clientX - sx) / innerWidth * 100, 2, 98).toFixed(2);
          g.y = +clamp(oy + (ev.clientY - sy) / innerHeight * 100, 2, 98).toFixed(2);
        }
        refreshGuidePos();
        renderGuideList();
      };
      const up = () => {
        elm.removeEventListener('pointermove', move);
        elm.removeEventListener('pointerup', up);
        elm.removeEventListener('pointercancel', up);
        setTimeout(() => { dragged = false; }, 60);
        persist();
      };
      elm.addEventListener('pointermove', move);
      elm.addEventListener('pointerup', up);
      elm.addEventListener('pointercancel', up);
    });
  }

  function renderGuides() {
    for (const { el: gEl } of guideEls) gEl.remove();
    guideEls = [];
    const frag = document.createDocumentFragment();
    for (const g of state.guides) {
      const d = document.createElement('div');
      d.className = 'guide';
      d.innerHTML = '<span class="g-end l"></span><span class="g-end r"></span>'
        + '<span class="g-mid"></span>'
        + '<button class="g-del" type="button" title="删除吸附线">×</button>';
      frag.appendChild(d);
      guideEls.push({ el: d, guide: g });
      bindGuideGesture(d, g);
    }
    stage.appendChild(frag);
    refreshGuidePos();
  }

  function deleteGuide(id) {
    state.guides = state.guides.filter((g) => g.id !== id);
    persist();
    renderGuides();
    renderGuideList();
    toast('吸附线已删除');
  }

  /* 设置面板中的吸附线列表 */
  function renderGuideList() {
    const wrap = el.guideList;
    if (!wrap) return;
    wrap.textContent = '';
    const frag = document.createDocumentFragment();
    state.guides.forEach((g, i) => {
      const deg = ((g.a % 180) + 180) % 180;
      const row = document.createElement('div');
      row.className = 'h-row';
      const t = document.createElement('span');
      t.textContent = '线 ' + (i + 1) + ' · ' + deg.toFixed(0) + '°';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '×';
      btn.title = '删除';
      btn.dataset.gid = g.id;
      row.appendChild(t);
      row.appendChild(btn);
      frag.appendChild(row);
    });
    wrap.appendChild(frag);
  }

  el.addGuide.addEventListener('click', () => {
    state.guides.push({ id: Date.now(), x: 50, y: 50, a: 0 });
    persist();
    renderGuides();
    renderGuideList();
    toast('已添加吸附线（编辑布局中可拖动 / 旋转）');
  });

  el.guideList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-gid]');
    if (btn) deleteGuide(+btn.dataset.gid);
  });

  function enterEdit() {
    editMode = true;
    body.classList.add('edit-mode');
    closePanel();
    hideSuggest();
    /* 触屏无滚轮：提示改用点选 + ＋/－ 缩放 */
    const touch = matchMedia('(hover: none), (pointer: coarse)').matches;
    toast(touch ? '拖动调整位置 · 点选后用 ＋/－ 缩放' : '拖动调整位置 · 滚轮缩放 · 靠近中心自动吸附');
  }

  function exitEdit() {
    editMode = false;
    body.classList.remove('edit-mode');
    selectBlock(null);
    persist();
    dataStore.set({ links });
  }

  /* ---------- 编辑模式：点击选中块，＋/－ 调整大小（触屏无滚轮的替代） ---------- */
  function selectBlock(elm) {
    if (selectedEl === elm) return;
    if (selectedEl) selectedEl.classList.remove('selected');
    selectedEl = elm || null;
    if (selectedEl) {
      selectedEl.classList.add('selected');
      const e = posRegistry.get(selectedEl);
      if (e) el.szVal.textContent = e.posOf().s.toFixed(2) + '×';
    }
    body.classList.toggle('has-selection', !!selectedEl);
  }

  function nudgeScale(factor) {
    if (!selectedEl) return;
    const e = posRegistry.get(selectedEl);
    if (!e) return;
    const st = e.posOf();
    st.s = clamp(+(st.s * factor).toFixed(3), e.sMin, e.sMax);
    e.applyPos(selectedEl, st);
    e.persistNow();
    el.szVal.textContent = st.s.toFixed(2) + '×';
  }
  el.szPlus.addEventListener('click', () => nudgeScale(1.06));
  el.szMinus.addEventListener('click', () => nudgeScale(0.943));

  /* 编辑布局：按钮（进入/退出文案切换） */
  function paintEditBtn() {
    el.optEdit.textContent = editMode ? '退出编辑布局' : '进入编辑布局';
  }
  el.optEdit.addEventListener('click', () => { editMode ? exitEdit() : enterEdit(); paintEditBtn(); });
  el.editDone.addEventListener('click', () => { exitEdit(); paintEditBtn(); });

  el.resetLayout.addEventListener('click', () => {
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
      if (body.classList.contains('panel-open')) return closePanel();
      return;
    }
    if (editMode || dialogOpen) return;
    const t = e.target;
    if (t === input || (t.closest && (t.closest('#panel') || t.closest('#linkDialog')))) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    input.focus();
  });

  /* ============================================================
   * 10. 快捷方式（每个网站一个独立图标块）
   *     性能要点：DocumentFragment 批量插入；点击/删除/双击
   *     全部委托到 stage，图标重建不再反复挂监听器
   * ============================================================ */
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

  /* 图标解析：自定义图标 → 站点常见 favicon 路径 → 首字母底块。
     许多 SPA 站点对未知路径返回 200+HTML，/favicon.ico 会解码失败，
     因此依次尝试 .ico / .png / .svg 多个候选 */
  function fillIcon(box, link) {
    box.textContent = '';
    const candidates = [];
    if (link.icon) candidates.push(link.icon);
    const d = domainOf(link.url);
    if (d) {
      candidates.push('https://' + d + '/favicon.ico');
      candidates.push('https://' + d + '/favicon.png');
      candidates.push('https://' + d + '/favicon.svg');
    }
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

  /* ---------- 向外扩散退场：按到搜索栏中心的距离排序计算逐个延迟 ---------- */
  function updateRadialDelays() {
    if (!state.radialOut || !tileEls.length) return;
    const sr = searchBox.getBoundingClientRect();
    const cx = sr.left + sr.width / 2, cy = sr.top + sr.height / 2;
    const ds = tileEls.map(({ el: t }) => {
      const r = t.getBoundingClientRect();
      return { el: t, d: Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy) };
    }).sort((a, b) => a.d - b.d);
    const n = ds.length;
    /* 总错峰钳制在 360ms 内（18–60ms/个），加上 0.3s 退场动画，
       在背景模糊(0.65s)完成前收尾 */
    const step = n > 1 ? Math.min(60, Math.max(18, 360 / (n - 1))) : 0;
    ds.forEach((x, i) => x.el.style.setProperty('--d', Math.round(i * step)));
  }

  function deleteLink(i) {
    const name = (links[i] && links[i].name) || '';
    links.splice(i, 1);
    dataStore.set({ links });
    renderLinks();
    renderLinkList();
    toast('已删除「' + name + '」');
  }

  function renderLinks() {
    for (const { el: t } of tileEls) { posRegistry.delete(t); t.remove(); }
    tileEls = [];
    const frag = document.createDocumentFragment();
    links.forEach((link, i) => {
      if (!link.pos) link.pos = defaultPos(i, links.length);

      const a = document.createElement('a');
      a.className = 'tile link block';
      a.href = normUrl(link.url);
      a.title = link.name;
      a.dataset.idx = i;
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
      /* 编辑模式下的删除角标（点击走 stage 委托） */
      const del = document.createElement('button');
      del.className = 'del';
      del.type = 'button';
      del.textContent = '×';
      del.title = '删除';
      a.appendChild(inn);
      a.appendChild(del);

      frag.appendChild(a);
      tileEls.push({ el: a, link });
      bindDrag(a, () => link.pos, applyTilePos, persistLinksSoon, () => dataStore.set({ links }), [0.6, 1.8]);
    });
    stage.appendChild(frag);
    refreshPositions();
    updateRadialDelays();
  }

  /* --- 磁贴点击 / 双击 / 删除 + 吸附线删除 + 块选中：委托到 stage --- */
  stage.addEventListener('click', (e) => {
    const del = e.target.closest('.g-del');
    if (del) {
      e.preventDefault();
      const gEl = del.closest('.guide');
      const rec = guideEls.find((r) => r.el === gEl);
      if (rec) deleteGuide(rec.guide.id);
      return;
    }
    /* 编辑模式：点块选中（再点空白取消选中），选中后可用 ＋/－ 缩放 */
    if (editMode) {
      const blk = e.target.closest('.block');
      selectBlock(blk || null);
    }
    const tile = e.target.closest('.tile.link');
    if (!tile) return;
    const i = +tile.dataset.idx;
    if (e.target.closest('.del')) { e.preventDefault(); e.stopPropagation(); deleteLink(i); return; }
    if (editMode || dragged) { e.preventDefault(); return; }
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;  // 修饰键走浏览器默认行为
    e.preventDefault();
    openUrl(normUrl(links[i].url), state.linksNewTab);
  });

  stage.addEventListener('dblclick', (e) => {
    const tile = e.target.closest('.tile.link');
    if (tile && editMode) { e.preventDefault(); openDlg(+tile.dataset.idx); }
  });

  /* --- 设置面板中的管理列表（委托 + data-act） --- */
  function renderLinkList() {
    const wrap = el.linkList;
    wrap.textContent = '';
    const frag = document.createDocumentFragment();
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
      const mk = (txt, title, act, cls) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = txt;
        btn.title = title;
        btn.dataset.idx = i;
        btn.dataset.act = act;
        if (cls) btn.className = cls;
        return btn;
      };
      if (i > 0) acts.appendChild(mk('↑', '上移', 'up'));
      if (i < links.length - 1) acts.appendChild(mk('↓', '下移', 'down'));
      acts.appendChild(mk('✎', '编辑', 'edit'));
      acts.appendChild(mk('×', '删除', 'del', 'danger'));
      row.appendChild(ic);
      row.appendChild(meta);
      row.appendChild(acts);
      frag.appendChild(row);
    });
    wrap.appendChild(frag);
  }

  el.linkList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const i = +btn.dataset.idx;
    switch (btn.dataset.act) {
      case 'up':   [links[i - 1], links[i]] = [links[i], links[i - 1]]; saveLinks(); break;
      case 'down': [links[i + 1], links[i]] = [links[i], links[i + 1]]; saveLinks(); break;
      case 'edit': openDlg(i); break;
      case 'del':  deleteLink(i); break;
    }
  });

  function saveLinks() {
    dataStore.set({ links });
    renderLinks();
    renderLinkList();
  }

  /* ============================================================
   * 11. 快捷方式对话框（预览走 200ms 防抖，避免逐键触发图标探测）
   * ============================================================ */
  let dlgPrevT = null;
  function scheduleDlgPreview() {
    clearTimeout(dlgPrevT);
    dlgPrevT = setTimeout(updateDlgPreview, 200);
  }

  function updateDlgPreview() {
    fillIcon(el.dlgPrevBox, {
      name: el.dlgName.value.trim(),
      url: el.dlgUrl.value.trim(),
      icon: dlgIconUpload || el.dlgIcon.value.trim() || ''
    });
  }

  function openDlg(idx) {
    dialogIdx = idx;
    dlgIconUpload = null;
    const src = idx >= 0 ? links[idx] : null;
    el.dlgTitle.textContent = src ? '编辑快捷方式' : '添加快捷方式';
    el.dlgName.value = src ? (src.name || '') : '';
    el.dlgUrl.value = src ? (src.url || '') : '';
    const icon = src ? (src.icon || '') : '';
    el.dlgIcon.value = icon && !icon.startsWith('data:') ? icon : '';
    if (icon.startsWith('data:')) dlgIconUpload = icon;
    updateDlgPreview();
    dialogOpen = true;
    body.classList.add('dialog-open');
    setTimeout(() => el.dlgName.focus(), 250);
  }

  function closeDlg() {
    dialogOpen = false;
    body.classList.remove('dialog-open');
  }

  el.addLink.addEventListener('click', () => openDlg(-1));
  el.dlgCancel.addEventListener('click', closeDlg);
  el.dlgScrim.addEventListener('click', closeDlg);

  for (const id of ['dlgName', 'dlgUrl', 'dlgIcon']) {
    el[id].addEventListener('input', () => {
      if (id === 'dlgIcon') dlgIconUpload = null;
      scheduleDlgPreview();
    });
    el[id].addEventListener('keydown', (e) => {   // 对话框内回车直接保存
      if (e.key === 'Enter') el.dlgSave.click();
    });
  }

  el.dlgIconFile.addEventListener('change', (e) => {
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
        cv.getContext('2d').drawImage(img, 0, 0, 128, 128);
        dlgIconUpload = cv.toDataURL('image/png');
        el.dlgIcon.value = '';
        updateDlgPreview();
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(f);
  });

  el.dlgSave.addEventListener('click', () => {
    const name = el.dlgName.value.trim();
    const url = el.dlgUrl.value.trim();
    if (!url) return toast('请填写网址');
    const icon = dlgIconUpload || el.dlgIcon.value.trim() || '';
    const item = { name: name || domainOf(url), url: normUrl(url), icon };
    if (dialogIdx >= 0) {
      links[dialogIdx] = Object.assign({}, links[dialogIdx], item);
    } else {
      if (links.length >= MAX_LINKS) return toast('最多 ' + MAX_LINKS + ' 个快捷方式');
      links.push(Object.assign({ id: Date.now(), pos: defaultPos(links.length, links.length + 1) }, item));
    }
    closeDlg();
    saveLinks();
    toast('已保存');
  });

  /* ============================================================
   * 12. 背景（渐变 / 图片 / MP4 视频）
   * ============================================================ */
  function stopVideo() {
    const v = el.bgVideo;
    v.pause();
    v.removeAttribute('src');
    v.load();
    v.classList.remove('on');
  }

  function applyBackground() {
    const t = state.customType;
    if (t === 'url-video' || t === 'data-video') {
      const src = t === 'url-video' ? state.customUrl : customData;
      if (src) {
        el.bg.style.background = '#000';
        const v = el.bgVideo;
        v.src = src;
        v.classList.add('on');
        v.play().catch(() => { /* 自动播放被拒时静默处理 */ });
        return;
      }
    }
    stopVideo();
    let css;
    if (t === 'url' && state.customUrl) {
      css = '#000 url("' + state.customUrl.replace(/"/g, '%22') + '") center / cover no-repeat';
    } else if (t === 'data' && customData) {
      css = '#000 url("' + customData + '") center / cover no-repeat';
    } else {
      css = (PRESETS[state.preset] || PRESETS.ink).css;
    }
    el.bg.style.background = css;
  }

  function paintSwatches() {
    for (const s of el.swatches.children) {
      s.classList.toggle('active', state.customType === 'none' && s.dataset.key === state.preset);
    }
    el.customChip.hidden = state.customType === 'none';
  }

  /* ---------- Toast ---------- */
  let toastT = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.toast.classList.remove('show'), 2200);
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

  /* ============================================================
   * 13. 设置面板
   * ============================================================ */
  function openPanel() {
    el.panel.setAttribute('aria-hidden', 'false');
    body.classList.add('panel-open');
  }
  function closePanel() {
    el.panel.setAttribute('aria-hidden', 'true');
    body.classList.remove('panel-open');
  }
  el.settingsBtn.addEventListener('click', openPanel);
  el.closePanel.addEventListener('click', closePanel);
  el.scrim.addEventListener('click', closePanel);

  /* 预设色卡（DocumentFragment 一次性插入） */
  {
    const frag = document.createDocumentFragment();
    for (const key of Object.keys(PRESETS)) {
      const p = PRESETS[key];
      const d = document.createElement('button');
      d.className = 'sw';
      d.dataset.key = key;
      d.style.background = p.css;
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = p.label;
      d.appendChild(nm);
      d.addEventListener('click', () => {
        state.preset = key;
        state.customType = 'none';
        state.customUrl = '';
        customData = null;
        persist();
        applyBackground();
        paintSwatches();
      });
      frag.appendChild(d);
    }
    el.swatches.appendChild(frag);
  }

  /* 时钟样式 */
  for (const b of el.clockStyles.children) {
    b.addEventListener('click', () => {
      if (state.clockStyle === b.dataset.style) return;
      state.clockStyle = b.dataset.style;
      applyClockStyle(true);
      persist();
    });
  }

  /* 日期样式预设 / 自定义格式 / 字体 */
  for (const b of el.dateStyles.children) {
    b.addEventListener('click', () => {
      state.dateFmt = b.dataset.fmt;
      el.dateFmt.value = state.dateFmt;
      applyDateFmt(true);
      persist();
    });
  }
  {
    let t = null;
    el.dateFmt.addEventListener('input', (e) => {
      state.dateFmt = e.target.value || '{Y}.{M}.{D} · {W}';
      invalidateDate();
      renderTime();
      clearTimeout(t);
      t = setTimeout(persist, 400);
    });
  }
  for (const b of el.dateFonts.children) {
    b.addEventListener('click', () => {
      state.dateFont = b.dataset.f;
      applyDateFont();
      persist();
    });
  }

  /* ---------- 状态应用器（被开关表 / init 复用） ---------- */
  function applyLinkNames() {
    body.classList.toggle('no-names', !state.linkNames);
    el.optLinkNames.checked = !!state.linkNames;
  }
  function applySearchLook() {
    body.classList.toggle('icon-search', !!state.iconSearch);
    cssVar('--searchW', clamp(state.searchW || 620, 300, 1200) + 'px');
  }
  function applyTileOp() { cssVar('--tileOp', String(state.tileOp / 100)); }
  function applySearchOp() { cssVar('--searchOp', String(state.searchOp / 100)); }
  function applyBgAdjust() {
    cssVar('--bgBright', String(state.bgBright / 100));
    cssVar('--bgBlur', state.bgBlur + 'px');
  }
  function applyFocusBlur() { cssVar('--focusBlur', state.blur + 'px'); }
  function applyRadial() {
    body.classList.toggle('radial-out', !!state.radialOut);
    updateRadialDelays();
  }

  /* ---------- 声明式开关表（替代散落的 bindToggle） ---------- */
  const TOGGLES = {
    optClock:      { key: 'showClock', after: () => body.classList.toggle('no-clock', !state.showClock) },
    optH24:        { key: 'h24', after: () => { lastStr = ''; renderTime(); } },
    optSeconds:    { key: 'seconds', after: () => { lastStr = ''; renderTime(); } },
    optDate:       { key: 'showDate', after: () => {
      el.dateGroup.style.display = state.showDate ? '' : 'none';
      if (state.showDate) { invalidateDate(); renderTime(); }
    } },
    optClockBold:  { key: 'clockBold', after: applyBoldAndMark },
    optDateBold:   { key: 'dateBold', after: applyBoldAndMark },
    optMark:       { key: 'showMark', after: applyBoldAndMark },
    optLinkNames:  { key: 'linkNames', after: applyLinkNames },
    optHistory:    { key: 'history' },
    optSearchTab:  { key: 'searchNewTab' },
    optLinksTab:   { key: 'linksNewTab' },
    optIconSearch: { key: 'iconSearch', after: applySearchLook },
    optRadial:     { key: 'radialOut', after: applyRadial }
  };
  for (const id of Object.keys(TOGGLES)) {
    el[id].addEventListener('change', () => {
      const t = TOGGLES[id];
      state[t.key] = el[id].checked;
      if (t.after) t.after();
      persist();
    });
  }

  /* ---------- 声明式滑杆表（label 联动 + 实时预览 + 松手持久化） ---------- */
  const SLIDERS = [
    { id: 'optSearchW',  key: 'searchW',  label: 'searchWVal',  fmt: (v) => v + 'px',    on: applySearchLook },
    { id: 'optSuggestN', key: 'suggestN', label: 'suggestNVal', fmt: (v) => v + ' 条',   onEnd: () => {
      const q = input.value.trim();
      if (q && !suggest.hidden) fetchSuggest(q);
    } },
    { id: 'optSearchOp', key: 'searchOp', label: 'searchOpVal', fmt: (v) => v + '%',     on: applySearchOp },
    { id: 'optTileOp',   key: 'tileOp',   label: 'tileOpVal',   fmt: (v) => v + '%',     on: applyTileOp },
    { id: 'optBright',   key: 'bgBright', label: 'brightVal',   fmt: (v) => v + '%',     on: applyBgAdjust },
    { id: 'optBgBlur',   key: 'bgBlur',   label: 'bgBlurVal',   fmt: (v) => v + 'px',    on: applyBgAdjust },
    { id: 'optBlur',     key: 'blur',     label: 'blurVal',     fmt: (v) => v + 'px',    on: applyFocusBlur }
  ];
  for (const s of SLIDERS) {
    const elm = el[s.id];
    elm.addEventListener('input', () => {
      state[s.key] = +elm.value;
      el[s.label].textContent = s.fmt(state[s.key]);
      if (s.on) s.on();
    });
    elm.addEventListener('change', () => {
      persist();
      if (s.onEnd) s.onEnd();
    });
  }

  /* 自定义背景链接（图片或 MP4/WebM 视频直链） */
  el.applyUrl.addEventListener('click', async () => {
    const u = el.bgUrl.value.trim();
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
  el.bgFile.addEventListener('change', (e) => {
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
        const url = cv.toDataURL(f.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85);
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
  el.clearCustom.addEventListener('click', () => {
    state.customType = 'none';
    state.customUrl = '';
    customData = null;
    stopVideo();
    dataStore.set({ customBgData: null });
    el.bgUrl.value = '';
    persist();
    applyBackground();
    paintSwatches();
    toast('已恢复预设背景');
  });

  /* 历史清空 */
  el.clearHistory.addEventListener('click', () => {
    historyList = [];
    dataStore.set({ history: [] });
    renderHistoryList();
    hideSuggest();
    toast('搜索历史已清空');
  });

  /* 窗口尺寸变化：联想框重新夹取到屏幕内（隐藏时零成本） */
  window.addEventListener('resize', positionSuggest);

  /* ============================================================
   * 14. 初始化
   * ============================================================ */
  (async function init() {
    const s = await store.get(DEFAULTS);
    state = Object.assign({}, DEFAULTS, s);
    /* 旧版 dateStyle → dateFmt 迁移 */
    if (!state.dateFmt && state.dateStyle && LEGACY_DATE[state.dateStyle]) {
      state.dateFmt = LEGACY_DATE[state.dateStyle];
    }
    delete state.dateStyle;
    /* 合并布局，保证字段齐全（老版本数据可能缺 date 块） */
    const layout = Object.assign({}, DEFAULT_LAYOUT, state.layout || {});
    for (const k of ['clock', 'date', 'search']) {
      layout[k] = Object.assign({}, DEFAULT_LAYOUT[k], layout[k] || {});
    }
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
    /* 断开与 DEFAULTS 的共享引用（浅拷贝陷阱）：避免 push 污染常量表 */
    state.guides = Array.isArray(state.guides) ? state.guides.slice() : [];
    /* 旧数据迁移：补默认独立位置 */
    if (links.some((l) => !l.pos)) {
      links.forEach((l, i) => { if (!l.pos) l.pos = defaultPos(i, links.length); });
      dataStore.set({ links });
    }

    /* --- 控件回填（一次遍历，与开关/滑杆表同源） --- */
    for (const id of Object.keys(TOGGLES)) {
      el[id].checked = !!state[TOGGLES[id].key];
    }
    for (const sl of SLIDERS) {
      el[sl.id].value = state[sl.key];
      el[sl.label].textContent = sl.fmt(state[sl.key]);
    }
    el.dateFmt.value = state.dateFmt;
    if (state.customUrl) el.bgUrl.value = state.customUrl;
    el.dateGroup.style.display = state.showDate ? '' : 'none';
    body.classList.toggle('no-clock', !state.showClock);

    /* --- CSS 变量 / 状态类 --- */
    applyFocusBlur();
    applyBgAdjust();
    applySearchLook();
    applySearchOp();
    applyTileOp();
    applyRadial();
    applyLinkNames();
    applyBoldAndMark();
    applyClockStyle();
    applyDateFont();
    applyDateFmt(false);

    /* --- 拖拽绑定与首屏渲染 --- */
    bindDrag(el.clockGroup, () => state.layout.clock, applyBlockPos, persistLayoutSoon, persist, [0.5, 2.5]);
    bindDrag(el.dateGroup, () => state.layout.date, applyBlockPos, persistLayoutSoon, persist, [0.5, 2.5]);
    bindDrag(el.searchWrap, () => state.layout.search, applyBlockPos, persistLayoutSoon, persist, [0.6, 1.8]);
    renderLinks();
    renderLinkList();
    refreshPositions();
    renderGuides();
    renderGuideList();
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
