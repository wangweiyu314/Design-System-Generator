/**
 * 线上页面样式采集器（浏览器端） v1.4
 * ------------------------------------------------------------
 * 用途：设计系统建包时，「线上产品实际长什么样」是最可靠的取值来源之一。
 * 但中后台系统大多在内网、需要登录，Agent 打不开。
 * 解法：让能打开页面的人在控制台跑一次本脚本，把真实 computed style 导出成 JSON。
 *
 * ── 使用方法（三种任选）────────────────────────────────
 * 1) 控制台粘贴：打开目标页面 → F12 → Console → 粘贴本文件全部内容 → 回车
 *    → 弹出下载 <hostname>-styles.json，把文件交给 Agent
 * 2) 存成书签（更快）：新建书签，网址填
 *      javascript:(function(){...})()
 *    把本文件内容压缩成一行填进去，之后点一下书签即可
 * 3) 控制台拿到对象后自己处理：window.__DSF_COLLECT__(...)
 *
 * ── 采集什么 ────────────────────────────────────────
 *   colors      颜色（背景/文字/边框），带出现次数与用途分布
 *   fontSizes   字号    fontWeights 字重    lineHeights 行高
 *   fontFamilies 字体族
 *   spacings    间距（padding / margin / gap），用于拟合网格基数
 *   radii       圆角    shadows 阴影        borders 描边
 *   metrics     关键区块尺寸（顶栏高、侧边栏宽、表格行高、按钮高、控件高）
 *   structure   页面结构特征（有无侧边栏/顶栏/表格/表单/分页/浮层/图表；
 *               `<svg>` 矢量图元单列 svgIcons，不计入 charts——见下方 v1.4 说明）
 *   layout      布局指纹：侧栏在哪一侧、深浅、顶栏是否通栏、有无面包屑/多标签/
 *               收起触发器、内容区留白——用于「布局从采集长出来」，
 *               而不是把别的系统的布局直接搬过来
 *
 * ── v1.4：`charts` 与 `<svg>` 拆开 ──────────────────────
 *   原先把 `tag === 'svg'` 也算进 `structure.charts`。antd 这类图标密集的系统里
 *   每个图标都是 `<svg>`，于是 `charts` 数≈图标数，下游拿它推断「有没有仪表盘页」
 *   就会在没有图表的系统上凭空造出一个页面类型（详见 CHANGELOG v1.14）。
 *   现在 `charts` 只认 `<canvas>` 与带图表语义的类名，`<svg>` 单列 `svgIcons`。
 *   ⚠ 图表画在 `<canvas>` 上时配色不进 computed style，采集器拿不到——是能力边界，不是漏采。
 *
 * ── 注意事项 ────────────────────────────────────────
 *   - 只读 DOM，不发请求、不改页面、不碰登录态，可放心在生产页跑
 *   - 页面越大越慢；默认最多扫 8000 个元素，超了会提示
 *   - 采集的是「渲染后 computed style」，会包含浏览器默认值，
 *     所以每个取值都带 count 与 props，让下游按频次筛选
 *   - 布局指纹以「几何位置」为主、类名为辅：几何判出来的外壳（侧栏/顶栏/页脚）
 *     不依赖命名习惯；面包屑/多标签这类没有可靠几何特征的，只能靠类名给信号
 *
 * ── 跳过「人造临时件」：data-collect-ignore ────────────
 *   打上 data-collect-ignore 的元素**及其全部后代**会被整块跳过。
 *   给谁用：设计系统生成器注入的演示入口条、模板自带的演示触发区——
 *   这些是「为了让人看得见」而临时造出来的 DOM，不是本系统的设计取值。
 *   不跳过会怎样：演示条用 em 写死相对单位，computed 成 7px / 11.9px / 3.5px
 *   这类值，混进间距与圆角候选里，还会把「网格覆盖率」压低。
 *   要跳过别的元素（骨架屏、埋点占位）也用它，属性名可用
 *   __DSF_COLLECT__({ ignoreAttr: 'data-xxx' }) 改。
 *
 * ── 跳过「不可见节点」：默认行为，v1.3 起 ────────────────
 *   为什么必须过滤：SPA（antd / Element 尤甚）会把**未激活的页签面板**、
 *   **未打开的弹窗**、**图标雪碧图里的 <symbol>/<path>** 全部挂在 DOM 里。
 *   这些节点继承 html/body 的浏览器默认值（color: 黑、font-size: 16px、
 *   font-family: sans-serif），频次会高到把真实色板整个盖住。
 *
 *   实测（某深色金融系统单页）：2255 个节点里 1866 个不可见，
 *   黑色文字色统计 1794 条来自隐藏节点 vs 7 条来自可见节点——
 *   结果挖掘报告把 pageBg / textPrimary / border 全判成 #000000，字阶首档判成 16px。
 *   这不是「按频次筛选」能救的：污染项就是频次最高的那些。
 *
 *   判定为不可见：display:none | visibility:hidden | opacity:0 | 盒模型宽或高为 0。
 *   需要旧行为（含隐藏节点）时：__DSF_COLLECT__({ includeHidden: true })
 *
 * 输出：下载 JSON 文件；同时挂到 window.__DSF_RESULT__ 便于二次处理
 */

window.__DSF_COLLECT__ = function collectFromBrowser(opts) {
  'use strict';
  var O = opts || {};
  var MAX_NODES = O.maxNodes || 8000;
  var TOP_N = O.topN || 60;
  /* 是否把不可见节点也算进来。默认 false——见文件头「跳过不可见节点」 */
  var INCLUDE_HIDDEN = !!O.includeHidden;
  /* 打上这个属性的元素及其后代整块跳过（见文件头「跳过人造临时件」） */
  var IGNORE_ATTR = O.ignoreAttr || 'data-collect-ignore';

  var doc = document;
  var win = window;

  /* ---------- 工具 ---------- */
  function toHex(c) {
    if (!c) return null;
    var m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(c.trim());
    if (!m) return null;
    var r = Math.round(+m[1]), g = Math.round(+m[2]), b = Math.round(+m[3]);
    var a = m[4] === undefined ? 1 : +m[4];
    var hex = '#' + [r, g, b].map(function (n) {
      return ('0' + n.toString(16)).slice(-2);
    }).join('').toUpperCase();
    if (a >= 0.999) return hex;
    /* 半透明保留 rgba 原样，避免丢信息 */
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
  }

  function isTransparent(c) {
    return !c || c === 'transparent' || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c);
  }

  /* 感知亮度：用于判断侧栏/顶栏是浅色还是深色 */
  function lumaOf(c) {
    var m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(c || '');
    if (!m) {
      var h = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c || '');
      if (!h) return null;
      m = [null, parseInt(h[1], 16), parseInt(h[2], 16), parseInt(h[3], 16)];
    }
    return 0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3];
  }

  /* 不可见判定：纯函数，不依赖 DOM——self-check [S17] 会抽出这段源码跑断言。
   * 改动这里等于改「采样口径」，必须同时更新 [S17] 的正反样例。 */
  function isHiddenBox(style, rect) {
    if (!style) return true;
    if (style.display === 'none') return true;
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return true;
    var op = parseFloat(style.opacity);
    if (!isNaN(op) && op === 0) return true;
    if (!rect) return true;
    if (rect.width === 0 || rect.height === 0) return true;
    return false;
  }

  function bump(map, key, prop, sample) {
    if (!key) return;
    var e = map.get(key);
    if (!e) { e = { value: key, count: 0, props: {}, sample: sample || '' }; map.set(key, e); }
    e.count++;
    if (prop) e.props[prop] = (e.props[prop] || 0) + 1;
  }

  function finalize(map) {
    return Array.from(map.values())
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, TOP_N)
      .map(function (e) {
        var props = Object.keys(e.props).sort(function (a, b) { return e.props[b] - e.props[a]; });
        return { value: e.value, count: e.count, props: props, sample: e.sample.slice(0, 160) };
      });
  }

  function sel(el) {
    if (!el || !el.tagName) return '';
    var s = el.tagName.toLowerCase();
    if (el.id) return s + '#' + el.id;
    var cls = (el.getAttribute && el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (cls.length) return s + '.' + cls.join('.');
    return s;
  }

  /* ---------- 采集 ---------- */
  var all = doc.querySelectorAll('*');
  var total = all.length;
  var truncated = total > MAX_NODES;
  var n = Math.min(total, MAX_NODES);

  /* 人造临时件：自身 + 全部后代都不采。
   * 先建成集合，循环里做 O(1) 判断——不能每次 closest() 往上爬，页面大了会慢。 */
  var ignoreSet = new Set();
  var ignoreRoots = doc.querySelectorAll('[' + IGNORE_ATTR + ']');
  for (var g = 0; g < ignoreRoots.length; g++) {
    ignoreSet.add(ignoreRoots[g]);
    var kin = ignoreRoots[g].querySelectorAll('*');
    for (var q = 0; q < kin.length; q++) ignoreSet.add(kin[q]);
  }
  var skipped = 0;

  /* 不可见节点：自身 + 全部后代都不采（与 data-collect-ignore 同一套写法）。
   * 按文档顺序遍历，父节点先于子节点——父节点命中后子节点已在集合里，
   * 不会再展开一次，整体仍是 O(n)。 */
  var hiddenSet = new Set();
  var hiddenSkipped = 0;
  if (!INCLUDE_HIDDEN) {
    for (var hx = 0; hx < n; hx++) {
      var hel = all[hx];
      if (!hel || hel.nodeType !== 1) continue;
      if (ignoreSet.has(hel) || hiddenSet.has(hel)) continue;
      var hcs;
      try { hcs = win.getComputedStyle(hel); } catch (eH) { continue; }
      if (!hcs) continue;
      if (!isHiddenBox(hcs, hel.getBoundingClientRect())) continue;
      hiddenSet.add(hel);
      var hkin = hel.querySelectorAll('*');
      for (var hq = 0; hq < hkin.length; hq++) hiddenSet.add(hkin[hq]);
    }
  }

  var colors = new Map();
  var fontSizes = new Map();
  var fontWeights = new Map();
  var lineHeights = new Map();
  var fontFamilies = new Map();
  var spacings = new Map();
  var radii = new Map();
  var shadows = new Map();
  var borders = new Map();
  var zIndexes = new Map();

  var metrics = {};
  var structure = {
    sidebar: 0, header: 0, footer: 0, tables: 0, forms: 0,
    buttons: 0, inputs: 0, paginations: 0, modals: 0, drawers: 0,
    tabs: 0, charts: 0, svgIcons: 0, cards: 0, tags: 0
  };

  /* 布局指纹：外壳以几何位置判定（不依赖类名），结构件靠类名给「有没有」的信号 */
  var layout = {
    sidebar: null,   // { side, width, height, bg, tone, position }
    topbar: null,    // { height, fullWidth, width, bg, tone }
    footer: null,    // { height, bg }
    breadcrumb: false,
    tabsbar: false,
    collapseTrigger: false,
    pageHeader: false,
    navItemCount: null,
    tabCount: null,
    mainPadding: null
  };
  var VW = win.innerWidth, VH = win.innerHeight;

  var SPACING_PROPS = [
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'column-gap', 'row-gap'
  ];

  function looksLike(el, re) {
    var c = (el.getAttribute && el.getAttribute('class') || '') + ' ' + (el.id || '');
    return re.test(c) || re.test(el.tagName || '');
  }

  /* 结构特征计数：靠类名/标签猜，不追求精确，只给下游一个「有没有」的信号。
     ★ 为什么抽成具名函数：这个口径**判错不会报错**，只会让下游的判断失真
       （见 CHANGELOG v1.14：`<svg>` 被算成图表 → 凭空推断出仪表盘页）。
       具名之后工厂自检 [S21] 能直接抽这段源码做单元测试，口径才有机器盯着。 */
  function bumpStructure(structure, el, tag) {
    if (tag === 'table' || looksLike(el, /(^|[\s-])table|data-grid|datagrid/i)) structure.tables++;
    if (tag === 'form' || looksLike(el, /(^|[\s-])form|search-bar|query-filter/i)) structure.forms++;
    if (tag === 'button' || looksLike(el, /(^|[\s-])btn|button/i)) structure.buttons++;
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || looksLike(el, /(^|[\s-])input|select|picker/i)) structure.inputs++;
    if (looksLike(el, /sidebar|sider|aside|nav-menu|menu-left/i)) structure.sidebar++;
    if (tag === 'header' || looksLike(el, /(^|[\s-])header|topbar|top-bar|navbar/i)) structure.header++;
    if (tag === 'footer' || looksLike(el, /(^|[\s-])footer/i)) structure.footer++;
    if (looksLike(el, /pagination|pager/i)) structure.paginations++;
    if (looksLike(el, /modal|dialog|popup/i)) structure.modals++;
    if (looksLike(el, /drawer|slide-panel|side-panel/i)) structure.drawers++;
    if (looksLike(el, /(^|[\s-])tab|tabs/i)) structure.tabs++;
    /* ★ 图表 ≠ 矢量图元。原先把 tag==='svg' 也算进 charts，而 antd 这类图标密集的系统里
       <svg> 数量极大（实测某页 charts 报 121，全页却没有任何图表容器），
       于是「charts 有值 → 推断出 dashboard」这条链会在没有图表的系统上凭空造出仪表盘页。
       现在 <svg> 单列 svgIcons（保留这个信息，但不再冒充图表），
       charts 只认真正的图表载体 <canvas> 与带图表语义的类名。
       ⚠ 图表画在 <canvas> 上时，内部（坐标轴/网格线/系列色）不会出现在 computed style 里，
         采集器**天然拿不到图表配色**——这是能力边界，不是漏采，
         见 README「图表配色采不到，算漏采吗？」与 references/04-pitfalls.md §3.11。 */
    if (tag === 'canvas' || looksLike(el, /chart|echarts|graph/i)) structure.charts++;
    if (tag === 'svg') structure.svgIcons++;
    if (looksLike(el, /(^|[\s-])card|panel/i)) structure.cards++;
    if (looksLike(el, /(^|[\s-])tag|badge|chip|label-status/i)) structure.tags++;
  }

  for (var i = 0; i < n; i++) {
    var el = all[i];
    if (!el || el.nodeType !== 1) continue;
    if (ignoreSet.has(el)) { skipped++; continue; }
    if (hiddenSet.has(el)) { hiddenSkipped++; continue; }
    var cs;
    try { cs = win.getComputedStyle(el); } catch (err) { continue; }
    if (!cs) continue;

    var s = sel(el);

    /* 颜色：背景 / 文字 / 边框，分别记 prop 便于判断用途 */
    var bg = cs.backgroundColor;
    if (!isTransparent(bg)) bump(colors, toHex(bg) || bg, 'background-color', s);
    var fg = cs.color;
    if (!isTransparent(fg)) bump(colors, toHex(fg) || fg, 'color', s);
    var bc = cs.borderTopColor;
    if (!isTransparent(bc) && cs.borderTopWidth !== '0px') {
      bump(colors, toHex(bc) || bc, 'border-color', s);
      bump(borders, cs.borderTopWidth, 'border-width', s);
    }

    /* 字体 */
    if (cs.fontSize) bump(fontSizes, cs.fontSize, 'font-size', s);
    if (cs.fontWeight) bump(fontWeights, cs.fontWeight, 'font-weight', s);
    if (cs.lineHeight && cs.lineHeight !== 'normal') bump(lineHeights, cs.lineHeight, 'line-height', s);
    if (cs.fontFamily) bump(fontFamilies, cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(), 'font-family', s);

    /* 间距：只收非零，否则全是 0 */
    for (var p = 0; p < SPACING_PROPS.length; p++) {
      var v = cs[SPACING_PROPS[p].replace(/-(\w)/g, function (m, c) { return c.toUpperCase(); })];
      if (v && v !== '0px' && v !== 'normal' && /px$/.test(v)) bump(spacings, v, SPACING_PROPS[p], s);
    }
    if (cs.gap && cs.gap !== 'normal' && cs.gap !== '0px') bump(spacings, cs.gap, 'gap', s);

    /* 圆角 / 阴影 / 层级 */
    if (cs.borderTopLeftRadius && cs.borderTopLeftRadius !== '0px') bump(radii, cs.borderTopLeftRadius, 'border-radius', s);
    if (cs.boxShadow && cs.boxShadow !== 'none') bump(shadows, cs.boxShadow, 'box-shadow', s);
    if (cs.zIndex && cs.zIndex !== 'auto') bump(zIndexes, cs.zIndex, 'z-index', s);

    /* 结构特征：靠类名/标签猜，不追求精确，只给下游一个「有没有」的信号 */
    var tag = (el.tagName || '').toLowerCase();
    bumpStructure(structure, el, tag);

    /* 布局结构件：没有可靠几何特征的，只能靠类名给「有没有」的信号 */
    if (!layout.breadcrumb && looksLike(el, /breadcrumb|crumb/i)) layout.breadcrumb = true;
    if (!layout.tabsbar && looksLike(el, /tabs-?bar|nav-tabs|tab-nav|page-tabs|multi-?tab|tab-strip/i)) layout.tabsbar = true;
    if (!layout.collapseTrigger && looksLike(el, /collapse|fold-?trigger|sider-?trigger|menu-?trigger|collapse-?trigger/i)) layout.collapseTrigger = true;
    if (!layout.pageHeader && looksLike(el, /page-?header|page-?title|content-?header/i)) layout.pageHeader = true;

    /* 关键区块尺寸：只测第一个命中的，避免被列表项污染 */
    try {
      var r = el.getBoundingClientRect();
      var w = Math.round(r.width), h = Math.round(r.height);
      if (w > 0 && h > 0) {
        if (!metrics.headerHeight && (tag === 'header' || looksLike(el, /(^|[\s-])header|topbar|top-bar/i)) && w > 600) metrics.headerHeight = h;
        /* 宽度上限与布局指纹的侧栏判定保持一致：没有上限会命中横向溢出的内容容器 */
        if (!metrics.sidebarWidth && looksLike(el, /sidebar|sider|nav-menu/i)
            && h > 300 && w >= 100 && w <= 420) metrics.sidebarWidth = w;
        if (!metrics.tableRowHeight && tag === 'tr') metrics.tableRowHeight = h;
        if (!metrics.buttonHeight && (tag === 'button' || looksLike(el, /(^|[\s-])btn/i)) && h > 0 && h < 80) metrics.buttonHeight = h;
        if (!metrics.inputHeight && (tag === 'input' || looksLike(el, /(^|[\s-])input/i)) && h > 0 && h < 80) metrics.inputHeight = h;

        /* ---- 布局指纹 ---- */
        var pos = cs.position;
        var fixedish = pos === 'fixed' || pos === 'sticky';

        /* 侧栏：贴左/贴右的竖长条。几何优先，类名只作补充判据 */
        if (!layout.sidebar && h >= VH * 0.55 && w >= 100 && w <= 420
            && (r.left <= 8 || r.right >= VW - 8)
            && (fixedish || looksLike(el, /sidebar|sider|aside|nav-menu|menu-left|menu-side/i))) {
          var sbg = cs.backgroundColor;
          layout.sidebar = {
            side: r.left <= VW - r.right ? 'left' : 'right',
            width: w,
            height: h,
            position: pos,
            bg: isTransparent(sbg) ? null : (toHex(sbg) || sbg),
            tone: isTransparent(sbg) ? null : (lumaOf(sbg) > 150 ? 'light' : 'dark'),
            navItemCount: el.querySelectorAll('a,li,[role="menuitem"]').length
          };
          if (layout.navItemCount === null) layout.navItemCount = layout.sidebar.navItemCount;
        }

        /* 顶栏：贴顶的横向条。宽度阈值放到 40%——有右侧栏时顶栏本就不通栏，
         * 卡死 80% 会漏判；是否通栏另由 fullWidth 记录 */
        var topbarish = fixedish || tag === 'header'
          || looksLike(el, /(^|[\s-])header|topbar|top-bar|navbar/i);
        if (!layout.topbar && topbarish && r.top <= 8 && w >= VW * 0.4 && h >= 32 && h <= 120) {
          var tbg = cs.backgroundColor;
          layout.topbar = {
            height: h,
            width: w,
            fullWidth: w >= VW * 0.95,
            bg: isTransparent(tbg) ? null : (toHex(tbg) || tbg),
            tone: isTransparent(tbg) ? null : (lumaOf(tbg) > 150 ? 'light' : 'dark')
          };
        }

        /* 页脚 */
        if (!layout.footer && r.bottom >= VH - 8 && w >= VW * 0.8 && h > 0 && h <= 200) {
          layout.footer = { height: h };
        }

        /* 内容区留白：<main> 或角色为 main 的容器 */
        if (!layout.mainPadding && (tag === 'main' || el.getAttribute('role') === 'main')) {
          layout.mainPadding = {
            top: cs.paddingTop, right: cs.paddingRight,
            bottom: cs.paddingBottom, left: cs.paddingLeft
          };
        }
      }
    } catch (e2) { /* 忽略布局异常 */ }
  }

  /* 多标签数量：在已识别的多标签栏内数页签 */
  if (layout.tabsbar) {
    var tabHost = null;
    var tabRe = /tabs-?bar|nav-tabs|tab-nav|page-tabs|multi-?tab|tab-strip/i;
    for (var k = 0; k < n && !tabHost; k++) {
      var probe = all[k];
      if (probe && probe.nodeType === 1 && looksLike(probe, tabRe)) tabHost = probe;
    }
    if (tabHost) layout.tabCount = tabHost.querySelectorAll('[role="tab"],li,a').length;
  }

  var result = {
    meta: {
      scriptVersion: '1.3',
      url: location.href,
      title: doc.title || '',
      viewport: win.innerWidth + 'x' + win.innerHeight,
      collectedAt: new Date().toISOString(),
      elementsScanned: n - skipped - hiddenSkipped,
      elementsSkipped: skipped,
      elementsHidden: hiddenSkipped,
      elementsTotal: total,
      truncated: truncated
    },
    structure: structure,
    layout: layout,
    metrics: metrics,
    colors: finalize(colors),
    fontSizes: finalize(fontSizes),
    fontWeights: finalize(fontWeights),
    lineHeights: finalize(lineHeights),
    fontFamilies: finalize(fontFamilies),
    spacings: finalize(spacings),
    radii: finalize(radii),
    shadows: finalize(shadows),
    borderWidths: finalize(borders),
    zIndexes: finalize(zIndexes)
  };

  win.__DSF_RESULT__ = result;

  /* ---------- 输出 ---------- */
  var json = JSON.stringify(result, null, 2);
  var name = (location.hostname || 'page').replace(/[^\w.-]/g, '_') + '-styles.json';
  try {
    var blob = new Blob([json], { type: 'application/json' });
    var a = doc.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    doc.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    console.log('%c[设计采集] 已导出 ' + name + '（' + (n - skipped) + ' 个元素）', 'color:#2A6CDD;font-weight:bold');
  } catch (e3) {
    console.log('[设计采集] 自动下载失败，请手动复制下面 JSON：');
    console.log(json);
  }
  console.log('[设计采集] 结构特征：', structure);
  console.log('[设计采集] 布局指纹：', layout);
  console.log('[设计采集] 关键尺寸：', metrics);
  if (skipped) {
    console.log('[设计采集] 已跳过 ' + skipped + ' 个 data-collect-ignore 元素（演示入口条 / 演示触发区等临时件）');
  }
  if (hiddenSkipped) {
    console.log('[设计采集] 已跳过 ' + hiddenSkipped + ' 个不可见节点（display:none / visibility:hidden / opacity:0 / 零尺寸）');
  }
  if (truncated) {
    console.warn('[设计采集] 元素超过 ' + MAX_NODES + ' 个，只扫了前 ' + MAX_NODES + ' 个。' +
      '如需全量，在控制台执行 __DSF_COLLECT__({maxNodes: 50000})');
  }
  return result;
};

/* 粘贴到控制台即自动运行一次；需要调整参数时再手动调 __DSF_COLLECT__({maxNodes: 50000}) */
if (typeof window !== 'undefined') window.__DSF_COLLECT__();
