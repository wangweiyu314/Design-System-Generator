#!/usr/bin/env node
/**
 * 设计稿样式采集器（Figma 端） v1.0
 * ------------------------------------------------------------
 * 技能包 §2.1「路线 A：Figma」的落地工具：把 Figma 文件里节点的**实际取值**
 * （fills / strokes / effects / padding / cornerRadius / textStyle / 几何尺寸）
 * 聚合成 `collect-from-browser.js` **同款格式**，让 `mine-tokens.js` 不改一行就能吃。
 *
 * ── 为什么需要它 ──────────────────────────────────────
 * `mine-tokens.js --figma=` 收的是「变量导出」（Tokens Studio / Figma Variables 的
 * name→value 映射）——**只有值，没有用法与频次**。
 * 而「这个色值被用了多少次、用在文字还是背景」恰恰是判读语义的关键线索：
 * 出现 47 次的那个蓝和出现 2 次的那个蓝，谁更像品牌主色，靠的是频次不是直觉。
 * 节点数据里两样都有，变量导出里只剩前者。
 *
 * 所以本工具走的是「按用法统计」而不是「按变量名罗列」——
 * 它输出的就是一份「设计稿版的线上采集」，两路数据因此可以直接比对。
 *
 * ── 用法 ─────────────────────────────────────────────
 *   # 1) 从 Figma REST 拉（需要 token：--token-file / FIGMA_TOKEN 环境变量 / --token）
 *   node scripts/collect-from-figma.js --key=<fileKey> --out=./figma-collect
 *   node scripts/collect-from-figma.js --key=<fileKey> --ids=1:1466,1:3294 --out=./figma-collect
 *   #    不给 --ids 时自动取每个页面的顶层 FRAME（整页都采）
 *
 *   # 2) 用已存盘的节点响应（离线可复现，推荐）
 *   node scripts/collect-from-figma.js --nodes=<nodes.json> --out=./figma-collect
 *
 *   # 可选
 *   --evidence=<path.md>   额外输出「设计稿证据」：外壳几何、浮层候选、变量绑定统计
 *   --min-count=1          低于此次数的取值不进候选（与 mine-tokens 同名参数含义一致）
 *   --top-n=60             每个维度最多保留多少条
 *   --json                 把摘要打到 stdout（默认打人读摘要）
 *
 * 产出：`<out>/<id>-<名字>-styles.json`，每帧一份（与「一页一份采集」一致），
 *       可直接喂给 mine-tokens.js 的 --online=。
 *
 * ── 与线上采集的差异（判读时要注意）─────────────────────
 *   · 设计稿量的是「意图值」，线上量的是「渲染值」。同一件事两边可能写法不同
 *     （设计稿 padding 16、线上 computed 16px），下游做差异比对时按值归一化处理
 *   · 设计稿没有 z-index（本工具输出空数组）、没有字体回退链
 *     （Figma 只给第一个字体族名）
 *   · 设计稿里**不可见**的节点（visible:false 及其整棵子树）一律跳过——
 *     它们不是设计取值，是设计师留着的备选
 *   · 遮罩 / 弹窗这类默认不渲染的浮层，设计稿里是画出来的，**能采到**——
 *     这正是设计稿相对线上采集的优势
 *
 * 退出码：0 正常；1 参数错误或输入不可解析
 */

const fs = require('fs');
const path = require('path');

/* ---------- 参数 ---------- */
const argv = process.argv.slice(2);
const opts = {};
for (const a of argv) {
  if (!a.startsWith('--')) continue;
  const idx = a.indexOf('=');
  const k = a.slice(2, idx === -1 ? undefined : idx);
  opts[k] = idx === -1 ? true : a.slice(idx + 1);
}
const AS_JSON = !!opts.json;
const MIN_COUNT = Math.max(1, parseInt(opts['min-count'] || '1', 10) || 1);
const TOP_N = Math.max(1, parseInt(opts['top-n'] || '60', 10) || 60);
const OUT = String(opts.out || './figma-collect');
const EVIDENCE = opts.evidence ? String(opts.evidence) : '';
const KEY = opts.key ? String(opts.key) : '';
const NODES_FILE = opts.nodes ? String(opts.nodes) : '';
const IDS = String(opts.ids || '').split(',').map((s) => s.trim()).filter(Boolean);

if (!KEY && !NODES_FILE) {
  console.error('✗ 至少要给一路输入：');
  console.error('    --key=<fileKey>      从 Figma REST 拉取（需 token）');
  console.error('    --nodes=<nodes.json> 用已存盘的 /v1/files/:key/nodes 响应');
  process.exit(1);
}

/* ---------- 工具 ---------- */
const round = (n) => Math.round(n);

/** 把 Figma Paint 转成 CSS 色值。与 collect-from-browser.js 的 toHex 同款输出格式：
 *  不透明 → `#RRGGBB`（大写）；半透明 → `rgba(r, g, b, a)`（保留 alpha，不丢信息）。 */
function paintToColor(paint, inheritedOpacity) {
  if (!paint || paint.visible === false) return null;
  if (paint.type !== 'SOLID' || !paint.color) return null;
  const c = paint.color;
  const a = (c.a === undefined ? 1 : c.a)
    * (paint.opacity === undefined ? 1 : paint.opacity)
    * (inheritedOpacity === undefined ? 1 : inheritedOpacity);
  if (a <= 0.001) return null;
  const [r, g, b] = [round(c.r * 255), round(c.g * 255), round(c.b * 255)];
  if (a >= 0.999) {
    return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + Number(a.toFixed(3)) + ')';
}

function lumaOf(color) {
  const h = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color || '');
  if (h) return 0.299 * parseInt(h[1], 16) + 0.587 * parseInt(h[2], 16) + 0.114 * parseInt(h[3], 16);
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(color || '');
  if (m) return 0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3];
  return null;
}

function firstSolidFill(node, opacity) {
  for (const f of (node.fills || [])) {
    const c = paintToColor(f, opacity);
    if (c) return c;
  }
  return null;
}
function firstSolidStroke(node, opacity) {
  for (const s of (node.strokes || [])) {
    const c = paintToColor(s, opacity);
    if (c) return c;
  }
  return null;
}

/** 节点的「有效底色」：自身没有填色时，往下找面积最大的可见子节点的底色。
 *  设计稿里外壳容器常常是空 Frame，真正的填色挂在它的子层上
 *  （例如顶栏 `顶部导航` 无填色，深蓝挂在子节点 `菜单` 上）。
 *  只看自身会把 `tone` 记成「未取到」——那是工具的问题，不是设计稿的问题。 */
function effectiveBg(node, opacity, depth) {
  const own = firstSolidFill(node, opacity);
  if (own) return own;
  if (depth === undefined) depth = 3;
  if (depth <= 0) return null;
  const kids = (node.children || [])
    .filter((c) => c.visible !== false && c.absoluteBoundingBox)
    .sort((a, b) => (b.absoluteBoundingBox.width * b.absoluteBoundingBox.height)
      - (a.absoluteBoundingBox.width * a.absoluteBoundingBox.height));
  for (const k of kids) {
    const op = opacity * (k.opacity === undefined ? 1 : k.opacity);
    const c = effectiveBg(k, op, depth - 1);
    if (c) return c;
  }
  return null;
}

/** 阴影 → CSS box-shadow 文本。与线上 computed box-shadow 的语义对齐，便于两路比对。 */
function effectToShadow(e, opacity) {
  if (!e || e.visible === false) return null;
  if (e.type !== 'DROP_SHADOW' && e.type !== 'INNER_SHADOW') return null;
  const c = paintToColor({ type: 'SOLID', color: e.color, visible: true }, opacity);
  if (!c) return null;
  const o = e.offset || { x: 0, y: 0 };
  const px = (n) => (n || 0) + 'px';
  const inset = e.type === 'INNER_SHADOW' ? 'inset ' : '';
  return inset + px(o.x) + ' ' + px(o.y) + ' ' + px(e.radius) + ' ' + px(e.spread) + ' ' + c;
}

/** 节点路径，作为 sample（对应线上采集里的选择器） */
function nodePath(ancestors, name) {
  return ancestors.concat([name]).join('/').slice(0, 160);
}

/* ---------- 结构特征 / 布局指纹 / 关键尺寸：与线上采集同一套判据 ----------
 * 线上靠 class/id + 几何；设计稿没有 class，但有**设计师起的图层名**——
 * 那是本系统的命名习惯，比 class 更接近语义。所以这一路是「名字为主、几何为辅」，
 * 与线上那一路恰好互补。 */
const STRUCT_RE = {
  tables: /表格|列表|table|grid/i,
  forms: /表单|form/i,
  buttons: /按钮|btn|button/i,
  inputs: /输入框|输入|下拉|选择器|input|select|picker/i,
  sidebar: /侧导航|侧边栏|sidebar|sider|aside|侧栏/i,
  header: /顶部导航|顶栏|导航栏|topbar|top-bar|header/i,
  footer: /页脚|footer/i,
  paginations: /分页|页码|pagination|pager/i,
  drawers: /抽屉|drawer/i,
  tabs: /选项卡|标签页|页签|tabs?$|tab-/i,
  charts: /图表|chart|echarts|graph/i,
  cards: /卡片|card/i,
  tags: /标签|tag|badge/i,
  modals: /弹窗|对话框|modal|dialog/i
};

/* 矢量图元：图标的内部构造（路径、布尔运算、圆点、线）。
 * 它们的**填充**是图标着色（有效信息），但**描边**多半是路径构造的副产物 ——
 * 被缩放过的图标会算出 `1.7999999523162842px` 这种值，
 * 混进「描边宽度」候选里，看起来像个正经档位。所以：
 *   · 填充记成 `fill` 属性（与 background-color 区分开，不污染底色初判）
 *   · 描边不计（容器描边才是 border 取值，它长在 FRAME/RECTANGLE/INSTANCE 上） */
const VECTORISH = new Set([
  'VECTOR', 'BOOLEAN_OPERATION', 'ELLIPSE', 'LINE', 'STAR', 'POLYGON', 'REGULAR_POLYGON'
]);

/* 间距上限：auto-layout 的 `itemSpacing` 常被设计师用来「撑开」布局
 * （把两块内容顶到两端，随手填 465 / 700 / 1178）。那是排版手段，不是间距档位。
 * 超过此值的 gap 一律不当候选，但要留痕 —— 静默丢弃等于让人以为设计里没有这个值。 */
const SPACING_MAX_PX = 200;

/* 浮层遮罩：设计稿里它是「盖住整帧的一层暗色矩形」。
 * 线上采集抓不到它（默认不渲染），这是设计稿独有的信息 —— 所以单独识别。 */
function looksLikeMask(node, frameBb) {
  const bb = node.absoluteBoundingBox;
  if (!bb || !frameBb) return false;
  const coversW = bb.width >= frameBb.width * 0.9;
  const coversH = bb.height >= frameBb.height * 0.9;
  if (!coversW || !coversH) return false;
  const fill = firstSolidFill(node, 1);
  const luma = lumaOf(fill);
  const darkish = luma !== null && luma < 90;
  return darkish || /遮罩|mask|overlay/i.test(node.name || '');
}

/* ---------- 单帧采集 ---------- */
function collectFrame(frame) {
  const frameBb = frame.absoluteBoundingBox;
  const VW = frameBb ? round(frameBb.width) : 0;
  const VH = frameBb ? round(frameBb.height) : 0;

  const bump = (map, key, prop, sample) => {
    if (!key) return;
    let e = map.get(key);
    if (!e) { e = { value: key, count: 0, props: {}, sample: sample || '' }; map.set(key, e); }
    e.count++;
    if (prop) e.props[prop] = (e.props[prop] || 0) + 1;
  };

  const maps = {
    colors: new Map(), fontSizes: new Map(), fontWeights: new Map(),
    lineHeights: new Map(), fontFamilies: new Map(), spacings: new Map(),
    radii: new Map(), shadows: new Map(), borderWidths: new Map(), zIndexes: new Map()
  };
  const structure = {
    sidebar: 0, header: 0, footer: 0, tables: 0, forms: 0,
    buttons: 0, inputs: 0, paginations: 0, modals: 0, drawers: 0,
    tabs: 0, charts: 0, cards: 0, tags: 0
  };
  const layout = {
    sidebar: null, topbar: null, footer: null, breadcrumb: false, tabsbar: false,
    collapseTrigger: false, pageHeader: false, navItemCount: null, tabCount: null,
    mainPadding: null
  };
  const metrics = {};
  const overlays = [];
  const boundVars = new Map();
  const textSamples = [];
  const tabStrips = [];
  const spacerGaps = [];
  let textCount = 0;

  /* 先做一遍顶层扫描，识别浮层遮罩：它们的子节点就是弹窗/抽屉，要单独记账 */
  const overlayRoots = new Set();
  for (const child of (frame.children || [])) {
    if (looksLikeMask(child, frameBb)) {
      overlayRoots.add(child);
      const dialogs = [];
      for (const d of (child.children || [])) {
        const dbb = d.absoluteBoundingBox;
        if (!dbb) continue;
        dialogs.push({
          name: d.name,
          width: round(dbb.width),
          height: round(dbb.height),
          parts: (d.children || []).map((p) => {
            const pbb = p.absoluteBoundingBox;
            return { name: p.name, height: pbb ? round(pbb.height) : null };
          })
        });
      }
      overlays.push({
        maskName: child.name,
        maskFill: firstSolidFill(child, 1),
        maskSize: VW + 'x' + VH,
        dialogs
      });
      structure.modals += Math.max(1, dialogs.length);
    }
  }

  /* 递归采集。opacity 逐层相乘 —— 设计稿的半透明常常写在父层，
   * 只看当前节点的 paint.opacity 会把 `rgba(0,0,0,0.5)` 记成 `#000000`。 */
  function walk(node, ancestors, opacity) {
    if (!node || node.visible === false) return;
    const op = opacity * (node.opacity === undefined ? 1 : node.opacity);
    const name = node.name || '';
    const sample = nodePath(ancestors, name);
    const bb = node.absoluteBoundingBox;

    /* 变量绑定统计：只作证据，不参与取值——
     * 值已经被 Figma 解析进 fills/color 里，我们要的是「哪些值是有变量认领的」。 */
    if (node.boundVariables) {
      for (const [prop, v] of Object.entries(node.boundVariables)) {
        const arr = Array.isArray(v) ? v : [v];
        for (const item of arr) {
          if (item && item.id) boundVars.set(item.id, (boundVars.get(item.id) || 0) + 1);
        }
      }
    }

    const isText = node.type === 'TEXT';

    /* 颜色：文字节点取文字色，矢量图元取图标色，其余取背景色；容器描边另记 */
    const vectorish = VECTORISH.has(node.type);
    const fill = firstSolidFill(node, op);
    if (fill) {
      bump(maps.colors, fill, isText ? 'color' : (vectorish ? 'fill' : 'background-color'), sample);
    }
    if (!vectorish) {
      const stroke = firstSolidStroke(node, op);
      if (stroke) {
        bump(maps.colors, stroke, 'border-color', sample);
        const sw = node.strokeWeight;
        if (typeof sw === 'number' && sw > 0) {
          /* 取两位小数：Figma 对缩放过的节点会给出 1.7999999523162842 这类浮点尾巴 */
          bump(maps.borderWidths, round(sw * 100) / 100 + 'px', 'border-width', sample);
        }
      }
    }

    /* 字体：设计稿的文字样式比线上 computed 更接近意图（线上会被继承链污染） */
    if (isText) {
      const st = node.style || {};
      if (st.fontSize) bump(maps.fontSizes, st.fontSize + 'px', 'font-size', sample);
      if (st.fontWeight) bump(maps.fontWeights, String(st.fontWeight), 'font-weight', sample);
      if (st.lineHeightPx) bump(maps.lineHeights, round(st.lineHeightPx) + 'px', 'line-height', sample);
      if (st.fontFamily) bump(maps.fontFamilies, st.fontFamily, 'font-family', sample);
      textCount++;
      if (textSamples.length < 400 && node.characters) {
        textSamples.push({ path: sample, text: String(node.characters).slice(0, 60) });
      }
    }

    /* 间距：padding 与 auto-layout 的 gap。设计稿只有「有意为之」的间距，
     * 不像线上那样混着浏览器默认值 —— 所以这里的噪声天然更低。
     * 但 `itemSpacing` 会被当排版手段用（撑开布局），那类值要挡掉并留痕。 */
    for (const [k, prop] of [['paddingTop', 'padding-top'], ['paddingRight', 'padding-right'],
      ['paddingBottom', 'padding-bottom'], ['paddingLeft', 'padding-left']]) {
      const v = node[k];
      if (typeof v === 'number' && v > 0) bump(maps.spacings, v + 'px', prop, sample);
    }
    for (const k of ['itemSpacing', 'counterAxisSpacing']) {
      const v = node[k];
      if (typeof v !== 'number' || v <= 0) continue;
      if (v > SPACING_MAX_PX) {
        spacerGaps.push({ value: v + 'px', name, sample });
        continue;
      }
      bump(maps.spacings, v + 'px', 'gap', sample);
    }

    /* 圆角 / 阴影 */
    if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0) {
      bump(maps.radii, node.cornerRadius + 'px', 'border-radius', sample);
    } else if (Array.isArray(node.rectangleCornerRadii)) {
      const uniq = [...new Set(node.rectangleCornerRadii.filter((n) => n > 0))];
      if (uniq.length === 1) bump(maps.radii, uniq[0] + 'px', 'border-radius', sample);
      else if (uniq.length) bump(maps.radii, uniq.join('px ') + 'px', 'border-radius', sample);
    }
    for (const e of (node.effects || [])) {
      const s = effectToShadow(e, op);
      if (s) bump(maps.shadows, s, 'box-shadow', sample);
    }

    /* 结构特征：按图层名给「有没有」的信号 */
    for (const [k, re] of Object.entries(STRUCT_RE)) {
      if (re.test(name)) structure[k]++;
    }

    /* 页签栏候选：宽条状的「选项卡 / 标签页」容器。
     * 同一个组件在设计稿里既可能当「页面级页签栏」（内容区顶部、整宽），
     * 也可能当「页内选项卡」（表单/卡片内部、窄）。机器分不清这两种用法 ——
     * 列出来交人裁决，不要替使用者拍板。 */
    if (bb && VW && /选项卡|标签页|页签/i.test(name) && round(bb.width) >= VW * 0.3) {
      tabStrips.push({
        name,
        width: round(bb.width),
        height: round(bb.height),
        frameY: round(bb.y - frameBb.y),
        children: (node.children || []).length
      });
    }

    /* 布局结构件 */
    if (!layout.breadcrumb && /面包屑|breadcrumb|crumb/i.test(name)) layout.breadcrumb = true;
    if (!layout.tabsbar && /多标签|页签栏|tabs-?bar|nav-tabs|tab-nav|page-tabs|tab-strip/i.test(name)) {
      layout.tabsbar = true;
    }
    if (!layout.collapseTrigger && /收起|折叠|collapse|fold-?trigger|menu-?trigger/i.test(name)) {
      layout.collapseTrigger = true;
    }
    if (!layout.pageHeader && /页头|页面标题|page-?header|page-?title|content-?header/i.test(name)) {
      layout.pageHeader = true;
    }

    /* ---- 几何判据（与线上采集同一套阈值，只是坐标系换成帧内相对坐标）---- */
    if (bb && VW && VH) {
      const w = round(bb.width), h = round(bb.height);
      const left = round(bb.x - frameBb.x);
      const right = left + w;
      const top = round(bb.y - frameBb.y);
      const bottom = top + h;

      if (!metrics.headerHeight && STRUCT_RE.header.test(name) && w > 600) metrics.headerHeight = h;
      if (!metrics.sidebarWidth && STRUCT_RE.sidebar.test(name) && h > 300) metrics.sidebarWidth = w;
      if (!metrics.buttonHeight && STRUCT_RE.buttons.test(name) && h > 0 && h < 80) metrics.buttonHeight = h;
      if (!metrics.inputHeight && STRUCT_RE.inputs.test(name) && h > 0 && h < 80) metrics.inputHeight = h;

      /* 侧栏：贴左/贴右的竖长条 */
      if (!layout.sidebar && h >= VH * 0.55 && w >= 100 && w <= 420
        && (left <= 8 || right >= VW - 8)) {
        const bg = effectiveBg(node, op);
        const luma = lumaOf(bg);
        /* 菜单项数量：数「一级/二级菜单」这类叶子项，不是数容器的直接子节点。
         * 直接子节点只会得到 1~2（菜单组 + 收起按钮），那是个没用的数字。 */
        const menuRe = /一级菜单|二级菜单|菜单项|nav-?item|menu-?item/i;
        let navCount = 0;
        (function cnt(n) {
          for (const c of (n.children || [])) {
            if (menuRe.test(c.name || '')) navCount++;
            cnt(c);
          }
        })(node);
        layout.sidebar = {
          side: left <= VW - right ? 'left' : 'right',
          width: w, height: h, position: 'static',
          bg: bg || null,
          tone: bg ? (luma > 150 ? 'light' : 'dark') : null,
          navItemCount: navCount || (node.children || []).length
        };
        if (layout.navItemCount === null) layout.navItemCount = layout.sidebar.navItemCount;
      }

      /* 顶栏：贴顶的横向条。宽度阈值 40% —— 有右侧栏时顶栏本就不通栏 */
      if (!layout.topbar && top <= 8 && w >= VW * 0.4 && h >= 32 && h <= 120) {
        const bg = effectiveBg(node, op);
        const luma = lumaOf(bg);
        layout.topbar = {
          height: h, width: w, fullWidth: w >= VW * 0.95,
          bg: bg || null,
          tone: bg ? (luma > 150 ? 'light' : 'dark') : null
        };
      }

      /* 页脚 */
      if (!layout.footer && bottom >= VH - 8 && w >= VW * 0.8 && h > 0 && h <= 200) {
        layout.footer = { height: h, bg: effectiveBg(node, op) || null };
      }

      /* 内容区留白 */
      if (!layout.mainPadding && /内容区|内容|content|main/i.test(name) && node.layoutMode) {
        layout.mainPadding = {
          top: (node.paddingTop || 0) + 'px', right: (node.paddingRight || 0) + 'px',
          bottom: (node.paddingBottom || 0) + 'px', left: (node.paddingLeft || 0) + 'px'
        };
      }
    }

    for (const c of (node.children || [])) walk(c, ancestors.concat([name]), op);
  }

  walk(frame, [], 1);

  /* 多标签数量：在设计稿里数「选项卡」容器下的页签 */
  if (structure.tabs) layout.tabCount = null;

  const finalize = (map) => [...map.values()]
    .filter((e) => e.count >= MIN_COUNT)
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N)
    .map((e) => ({
      value: e.value, count: e.count,
      props: Object.keys(e.props).sort((x, y) => e.props[y] - e.props[x]),
      /* propCounts 是本工具相对线上采集的增量：线上那路只有「用过哪些属性」，
       * 没有「各用了几次」。判读「这个色主要用在文字还是背景」时，
       * 属性种类列表会误导（`#313133` 的 props 里同时有 color 与 background-color，
       * 看起来两边都用得多，实际 95% 是文字色）。下游不认识这个字段也不影响。 */
      propCounts: Object.fromEntries(
        Object.entries(e.props).sort((x, y) => y[1] - x[1])
      ),
      sample: e.sample
    }));

  return {
    meta: {
      scriptVersion: '1.0',
      source: 'figma',
      url: 'figma://' + (KEY || 'local') + '/' + frame.id,
      title: frame.name || '',
      viewport: VW + 'x' + VH,
      collectedAt: new Date().toISOString(),
      elementsScanned: textCount,
      elementsSkipped: 0,
      elementsTotal: null,
      truncated: false,
      frameId: frame.id,
      note: '设计稿量的是意图值，线上量的是渲染值；做 F1/F2 差异比对时按值归一化'
    },
    structure, layout, metrics,
    colors: finalize(maps.colors),
    fontSizes: finalize(maps.fontSizes),
    fontWeights: finalize(maps.fontWeights),
    lineHeights: finalize(maps.lineHeights),
    fontFamilies: finalize(maps.fontFamilies),
    spacings: finalize(maps.spacings),
    radii: finalize(maps.radii),
    shadows: finalize(maps.shadows),
    borderWidths: finalize(maps.borderWidths),
    zIndexes: finalize(maps.zIndexes),
    /* 设计稿独有：不进 mine-tokens 的计算，只作裁决证据 */
    figmaEvidence: {
      overlays,
      tabStrips,
      spacerGaps,
      boundVariableCount: boundVars.size,
      topBoundVariables: [...boundVars.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
        .map(([id, n]) => ({ id, boundCount: n })),
      textSamples: textSamples.slice(0, 200)
    }
  };
}

/* ---------- 输入 ---------- */
async function loadFrames() {
  if (NODES_FILE) {
    const raw = JSON.parse(fs.readFileSync(NODES_FILE, 'utf8'));
    if (raw.nodes && typeof raw.nodes === 'object') {
      return Object.entries(raw.nodes).map(([id, v]) => v.document || v);
    }
    if (raw.document) return [raw.document];
    if (Array.isArray(raw)) return raw;
    return [raw];
  }

  const token = (opts['token-file'] ? fs.readFileSync(String(opts['token-file']), 'utf8').trim() : '')
    || process.env.FIGMA_TOKEN || String(opts.token || '');
  if (!token) {
    console.error('✗ 缺少 token：用 --token-file=<路径>、--token=<值> 或 FIGMA_TOKEN 环境变量');
    process.exit(1);
  }
  const H = { 'X-Figma-Token': token };
  const base = 'https://api.figma.com/v1/files/' + KEY;

  let ids = IDS;
  if (!ids.length) {
    const r = await fetch(base + '?depth=2', { headers: H });
    if (!r.ok) { console.error('✗ 读文件结构失败：HTTP ' + r.status); process.exit(1); }
    const f = await r.json();
    ids = [];
    for (const page of (f.document.children || [])) {
      for (const c of (page.children || [])) if (c.type === 'FRAME') ids.push(c.id);
    }
    if (!ids.length) { console.error('✗ 没找到顶层 FRAME'); process.exit(1); }
    console.error('· 自动取到 ' + ids.length + ' 个顶层 FRAME：' + ids.join(', '));
  }
  const r2 = await fetch(base + '/nodes?ids=' + ids.join(','), { headers: H });
  if (!r2.ok) { console.error('✗ 读节点失败：HTTP ' + r2.status); process.exit(1); }
  const data = await r2.json();
  return Object.entries(data.nodes || {}).map(([id, v]) => v.document || v);
}

/* ---------- 输出 ---------- */
function safeName(s) {
  return String(s).replace(/[^\w\u4e00-\u9fa5.-]+/g, '_').slice(0, 40) || 'frame';
}

(async () => {
  const frames = await loadFrames();
  const results = [];
  for (const fr of frames) results.push(collectFrame(fr));

  /* 单帧 → 单文件：与「一页一份采集」一致，mine-tokens 才能按页聚类布局 */
  fs.mkdirSync(OUT, { recursive: true });
  const written = [];
  for (const r of results) {
    const fn = r.meta.frameId.replace(':', '-') + '-' + safeName(r.meta.title) + '-styles.json';
    const p = path.join(OUT, fn);
    fs.writeFileSync(p, JSON.stringify(r, null, 2), 'utf8');
    written.push(p);
  }

  if (EVIDENCE) {
    const L = [];
    L.push('# 设计稿采集证据（由 collect-from-figma.js 生成）');
    L.push('');
    L.push('- 帧数：' + results.length + '　|　来源：' + (NODES_FILE ? '本地 ' + path.basename(NODES_FILE) : 'REST key=' + KEY));
    L.push('- 生成时间：' + new Date().toISOString());
    L.push('');
    L.push('> 本文件只汇总**机器能算出来的证据**，不做语义裁决。');
    L.push('> 「哪个是主色」「浮层分几档」这类判断仍然要人来做——见挖掘报告第 8 节。');
    L.push('');
    L.push('## 1. 每帧外壳几何');
    L.push('');
    L.push('| 帧 | 尺寸 | 侧栏 | 顶栏 | 内容区留白 | 页脚 | 面包屑 | 多标签 |');
    L.push('| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |');
    for (const r of results) {
      const s = r.layout.sidebar, t = r.layout.topbar, m = r.layout.mainPadding;
      L.push('| ' + r.meta.title + '（' + r.meta.frameId + '） | ' + r.meta.viewport
        + ' | ' + (s ? s.side + ' ' + s.width + 'px ' + (s.tone || '?') + ' `' + (s.bg || '') + '`' : '无')
        + ' | ' + (t ? t.height + 'px ' + (t.fullWidth ? '通栏' : '非通栏') + ' ' + (t.tone || '?') + ' `' + (t.bg || '') + '`' : '无')
        + ' | ' + (m ? [m.top, m.right, m.bottom, m.left].join(' ') : '—')
        + ' | ' + (r.layout.footer ? r.layout.footer.height + 'px' : '无')
        + ' | ' + (r.layout.breadcrumb ? '有' : '无')
        + ' | ' + (r.layout.tabsbar ? '有' : '无') + ' |');
    }
    L.push('');
    L.push('## 2. 浮层候选（设计稿独有：线上采集抓不到默认不渲染的浮层）');
    L.push('');
    const anyOverlay = results.some((r) => r.figmaEvidence.overlays.length);
    if (!anyOverlay) {
      L.push('（未识别到遮罩层。若设计稿里确实画了弹窗/抽屉，说明遮罩不是「盖满整帧的暗色矩形」，');
      L.push('需要人工在设计稿里定位后补进 contract.json。）');
    } else {
      L.push('| 帧 | 遮罩名 | 遮罩取值 | 弹窗 | 宽 | 高 | 内部结构 |');
      L.push('| :-- | :-- | :-- | :-- | :-- | :-- | :-- |');
      for (const r of results) {
        for (const o of r.figmaEvidence.overlays) {
          for (const d of o.dialogs) {
            L.push('| ' + r.meta.title + ' | ' + o.maskName + ' | `' + o.maskFill + '` | ' + d.name
              + ' | **' + d.width + 'px** | ' + d.height + 'px'
              + ' | ' + d.parts.map((p) => p.name + (p.height ? '(' + p.height + ')' : '')).join(' + ') + ' |');
          }
        }
      }
    }
    L.push('');
    L.push('## 3. 页签栏候选（需人工区分「页面级页签栏」与「页内选项卡」）');
    L.push('');
    const anyTabs = results.some((r) => r.figmaEvidence.tabStrips.length);
    if (!anyTabs) {
      L.push('（未识别到宽条状选项卡容器。若设计稿里确实有页签栏，检查图层名是否含「选项卡 / 标签页 / 页签」。）');
    } else {
      L.push('| 帧 | 图层名 | 宽 | 高 | 帧内 y | 子节点数 | 判读提示 |');
      L.push('| :-- | :-- | :-- | :-- | :-- | :-- | :-- |');
      for (const r of results) {
        for (const t of r.figmaEvidence.tabStrips) {
          /* 内容区顶部、紧贴顶栏下方（y ≈ 顶栏高）且整宽的 → 更像页面级页签栏；
           * 落在内容深处、宽度不足内容区整宽的 → 更像页内选项卡。 */
          const topbarH = r.layout.topbar ? r.layout.topbar.height : 56;
          const pageLevel = t.frameY <= topbarH + 4 && r.layout.mainPadding
            && t.width >= 0.95 * (Number(r.meta.viewport.split('x')[0]) - (r.layout.sidebar ? r.layout.sidebar.width : 0));
          L.push('| ' + r.meta.title + ' | ' + t.name + ' | ' + t.width + ' | ' + t.height
            + ' | ' + t.frameY + ' | ' + t.children + ' | '
            + (pageLevel ? '**疑似页面级页签栏**（贴顶 + 内容区整宽）' : '疑似页内选项卡') + ' |');
        }
      }
    }
    L.push('');
    L.push('> 两者在实现上是同一个组件的两种用法，但**契约不同**：页面级页签栏属于布局外壳');
    L.push('> （`<!-- @tabs-slot -->`），页内选项卡属于内容区模板。判错会让页签栏出现在错误的位置。');
    L.push('');
    L.push('## 4. 已排除的「布局撑开值」（不是间距档位）');
    L.push('');
    const anySpacer = results.some((r) => r.figmaEvidence.spacerGaps.length);
    if (!anySpacer) {
      L.push('（无。设计稿里没有用大 gap 撑开布局的写法。）');
    } else {
      L.push('auto-layout 的 `itemSpacing` 会被当排版手段用——把两块内容顶到容器两端时随手填一个大数。');
      L.push('那是手段不是档位，已从间距候选里排除；列在这里是为了**留痕**，不是让人照着建 Token。');
      L.push('');
      L.push('| 帧 | 取值 | 所在图层 |');
      L.push('| :-- | :-- | :-- |');
      for (const r of results) {
        for (const s of r.figmaEvidence.spacerGaps) {
          L.push('| ' + r.meta.title + ' | `' + s.value + '` | ' + s.name + ' |');
        }
      }
    }
    L.push('');
    L.push('## 5. 变量绑定（证据：设计稿是否在用变量体系）');
    L.push('');
    for (const r of results) {
      L.push('- ' + r.meta.title + '：绑定变量 ' + r.figmaEvidence.boundVariableCount + ' 个');
    }
    L.push('');
    L.push('> 变量**值**要 `/v1/files/:key/variables/local` 接口（需 `file_variables:read` 权限），');
    L.push('> 本工具读不到；但 Figma 已把变量值解析进节点的 fills/color，所以取值本身不缺失，');
    L.push('> 缺的只是「变量名叫什么」——那属于语义裁决，本来就要人来做。');
    L.push('');
    fs.writeFileSync(EVIDENCE, L.join('\n'), 'utf8');
  }

  if (AS_JSON) {
    console.log(JSON.stringify({
      frames: results.map((r) => ({
        id: r.meta.frameId, name: r.meta.title, viewport: r.meta.viewport,
        layout: r.layout, structure: r.structure, metrics: r.metrics,
        overlays: r.figmaEvidence.overlays,
        colors: r.colors.length, spacings: r.spacings.length, fontSizes: r.fontSizes.length
      })),
      written
    }, null, 2));
  } else {
    console.log('· 已采集 ' + results.length + ' 帧 → ' + OUT);
    for (const r of results) {
      const s = r.layout.sidebar, t = r.layout.topbar;
      console.log('  - ' + r.meta.title + '（' + r.meta.frameId + '）' + r.meta.viewport
        + '　色值候选 ' + r.colors.length
        + '　间距候选 ' + r.spacings.length
        + '　字号候选 ' + r.fontSizes.length
        + (s ? '　侧栏 ' + s.width + 'px' : '')
        + (t ? '　顶栏 ' + t.height + 'px' : '')
        + (r.figmaEvidence.overlays.length ? '　浮层 ' + r.figmaEvidence.overlays.length : ''));
    }
    if (EVIDENCE) console.log('· 证据已写入：' + EVIDENCE);
  }
  process.exit(0);
})().catch((e) => {
  console.error('✗ 采集失败：' + (e && e.stack || e));
  process.exit(1);
});
