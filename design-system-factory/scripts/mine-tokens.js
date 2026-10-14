#!/usr/bin/env node
/**
 * 取值挖掘器 v1.1 —— 从「线上页面采集 JSON」「Figma 变量导出」「人工标注」里挖 Token 候选
 * ------------------------------------------------------------
 * 建包最难的不是写文档，是确定取值。本脚本把三路原始素材聚合成候选，
 * 并把「设计稿 vs 线上实现」的差异摆出来让人裁决。
 *
 * 用法：
 *   node mine-tokens.js [--online=<采集JSON>[,<采集JSON>...]] [--figma=<导出文件>]
 *                       [--intake=<人工标注JSON>] [--grid=8] [--space-base=4]
 *                       [--min-count=2] [--emit-tokens=<path>] [--json] [--out=<path>]
 *
 *   --online        collect-from-browser.js 导出的 JSON，可多份（多页面合并统计）
 *   --figma         设计稿变量导出（复用 check-design-sync.js 能识别的 4 种形态）
 *   --intake        人工标注 JSON（模板见工厂包 examples/intake.sample.json）。
 *                   三路数据源至少要有一路。人工标注还能**补齐另两路**：
 *                   里面填了 collectFiles / exportFile 就自动当成 --online / --figma 用。
 *   --grid          期望的间距网格基数，默认 8（人工标注里填了 gridBase 则以它为准）
 *   --space-base    间距 Token 的档位基数，默认 4。`--space-N` 的 N = px / base，
 *                   与引擎模板的既有约定一致（--space-4 = 16px）。除不尽的值会
 *                   退化成 `--space-<px>px` 并在报告里标出来。
 *   --min-count     出现次数低于此值的取值不进候选，默认 2（过滤个别手滑值）
 *   --emit-tokens   额外输出一份 tokens.md 草稿表格，供人工确认后并入规范
 *   --json          输出机器可读 JSON
 *   --out           报告写到文件（默认打 stdout）
 *
 * 输出八节内容（见报告）：
 *   1. 页面结构特征 → 推断该建哪些页面/组件文档（不建不存在的东西）
 *   2. 布局候选     → 按几何指纹聚类，决定该沉淀几套布局模板
 *   3. 颜色候选     4. 字阶   5. 间距与网格拟合   6. 圆角/阴影/描边/层级
 *   7. 设计稿 ↔ 线上 差异（F1 设计稿有线上无 / F2 线上有设计稿无）
 *   8. 存疑项清单（不合网格、低饱和难归类、透明色未换算等）
 *
 * 重要：本脚本只做「候选 + 存疑」，不做命名裁决。
 * 语义命名（哪个是主色、哪个是危险色）必须由人确认——机器猜错的代价远大于猜对的收益。
 *
 * 退出码：0 正常；1 参数错误或输入文件不可解析
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
  const v = idx === -1 ? true : a.slice(idx + 1);
  opts[k] = v;
}

const AS_JSON = !!opts.json;
const MIN_COUNT = parseInt(opts['min-count'] || '2', 10) || 1;
const SPACE_BASE = parseInt(opts['space-base'] || '4', 10) || 4;
const ONLINE = String(opts.online || '').split(',').map((s) => s.trim()).filter(Boolean);
let FIGMA = opts.figma ? String(opts.figma) : '';
const INTAKE_FILE = opts.intake ? String(opts.intake) : '';

/* ---------- 读 JSON ---------- */
function readJson(p) {
  if (!fs.existsSync(p)) {
    console.error('✗ 文件不存在：' + p);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error('✗ 不是合法 JSON：' + p + '\n  ' + e.message);
    process.exit(1);
  }
}

/* ---------- 人工标注（三路数据源之一，且能给另两路兜底） ----------
 * 场景：Figma 导不出、线上页面打不开。人照着截图填 examples/intake.sample.json。
 * 它是最弱的一路（没有 computed style 的频次支撑），但比硬编一套数值强——
 * 至少每个值都有人认领。 */
const intake = INTAKE_FILE ? readJson(INTAKE_FILE) : null;
const intakeNotes = [];

if (intake) {
  const files = (intake.online && Array.isArray(intake.online.collectFiles))
    ? intake.online.collectFiles.filter(Boolean) : [];
  if (files.length && !ONLINE.length) {
    files.forEach((f) => ONLINE.push(f));
    intakeNotes.push('从人工标注的 `online.collectFiles` 补入 ' + files.length + ' 份采集文件');
  } else if (files.length) {
    intakeNotes.push('人工标注里填了 `online.collectFiles`，但已用 --online 显式指定，忽略之');
  }
  if (!FIGMA && intake.figma && intake.figma.exportFile) {
    FIGMA = String(intake.figma.exportFile);
    intakeNotes.push('从人工标注的 `figma.exportFile` 补入设计稿导出');
  }
}

if (!ONLINE.length && !FIGMA && !intake) {
  console.error('✗ 至少要给一路数据源：');
  console.error('    --online=<采集JSON>    让能打开页面的人跑 scripts/collect-from-browser.js');
  console.error('    --figma=<设计稿导出>   设计师导出变量文件');
  console.error('    --intake=<人工标注>    以上都拿不到时的兜底，模板见 examples/intake.sample.json');
  process.exit(1);
}

/* 网格基数：--grid 显式指定 > 人工标注里的 gridBase > 默认 8 */
const GRID = parseInt(opts.grid || '', 10)
  || (intake && intake.tokens && parseInt(intake.tokens.gridBase, 10))
  || 8;

const pages = ONLINE.map(readJson);

/* ---------- 读 Figma 导出（与 check-design-sync.js 同一套识别逻辑，简化版） ---------- */

/* 只收看起来像色值/尺寸的叶子节点，避免把 type / description 也当成变量。
   必须定义在 loadFigma 之外：walk 是函数声明会提升，const 不会，
   放在函数体内的调用点之后会撞 TDZ。 */
const VALUE_LIKE = /^(#|rgba?\(|hsla?\(|[\d.]+(px|rem|em|%)?( |$)|[\d.]+px [\d.]+px)/i;

function loadFigma(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const out = new Map(); // name -> value
  let text = raw.trim();

  if (text.startsWith('{') || text.startsWith('[')) {
    let data;
    try { data = JSON.parse(text); } catch (e) {
      console.error('✗ Figma 导出不是合法 JSON：' + file);
      process.exit(1);
    }
    walk(data, '');
  } else {
    /* CSV / TSV */
    const lines = text.split(/\r?\n/).filter(Boolean);
    const sep = lines[0].includes('\t') ? '\t' : ',';
    const head = lines[0].split(sep).map((s) => s.trim().toLowerCase());
    const iName = head.findIndex((h) => /name|名称|token|变量/.test(h));
    const iVal = head.findIndex((h) => /value|值|默认|default/.test(h));
    if (iName < 0 || iVal < 0) {
      console.error('✗ 表格缺少 名称/值 列：' + file);
      process.exit(1);
    }
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(sep);
      if (c[iName] && c[iVal]) out.set(c[iName].trim(), c[iVal].trim());
    }
  }

  function walk(node, prefix) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((n) => walk(n, prefix)); return; }

    /* 形态 1：{ name, value } 或 { value, type }（Figma 原生 / Tokens Studio 叶子节点） */
    if (typeof node.value === 'string') {
      const nm = typeof node.name === 'string' ? node.name : prefix;
      if (nm && VALUE_LIKE.test(node.value)) out.set(nm, node.value);
      return;
    }

    const entries = Object.entries(node);

    /* 形态 2：扁平映射 { "--color-primary": "#2A6CDD" } */
    if (entries.length && entries.every(([, v]) => typeof v === 'string')) {
      entries.forEach(([k, v]) => { if (VALUE_LIKE.test(v)) out.set(k, v); });
      return;
    }

    /* 形态 3：继续下钻，路径作为变量名 */
    entries.forEach(([k, v]) => walk(v, prefix ? prefix + '/' + k : k));
  }
  return out;
}

const figma = FIGMA ? loadFigma(FIGMA) : new Map();

/* ---------- 合并多页统计 ---------- */
function merge(key) {
  const map = new Map();
  for (const p of pages) {
    const arr = (p && p[key]) || [];
    for (const e of arr) {
      const cur = map.get(e.value);
      if (cur) {
        cur.count += e.count;
        (e.props || []).forEach((pr) => { cur.props[pr] = (cur.props[pr] || 0) + 1; });
      } else {
        map.set(e.value, { value: e.value, count: e.count, props: {}, samples: [] });
        (e.props || []).forEach((pr) => { map.get(e.value).props[pr] = (e.props[pr] || 0) + 1; });
      }
      if (e.sample && map.get(e.value).samples.length < 3) map.get(e.value).samples.push(e.sample);
    }
  }
  /* props 累加时是对象（带次数），输出前转成按次数排序的数组，下游统一当数组用 */
  return [...map.values()]
    .filter((e) => e.count >= MIN_COUNT)
    .sort((a, b) => b.count - a.count)
    .map((e) => ({
      value: e.value,
      count: e.count,
      props: Object.keys(e.props).sort((x, y) => e.props[y] - e.props[x]),
      samples: e.samples
    }));
}

const C = {
  colors: merge('colors'),
  fontSizes: merge('fontSizes'),
  fontWeights: merge('fontWeights'),
  lineHeights: merge('lineHeights'),
  fontFamilies: merge('fontFamilies'),
  spacings: merge('spacings'),
  radii: merge('radii'),
  shadows: merge('shadows'),
  borderWidths: merge('borderWidths'),
  zIndexes: merge('zIndexes')
};

/* ---------- 人工标注取值 → 候选 ----------
 * 命名只做**确定性的格式转换**（camelCase → kebab-case，加 `--` 前缀），
 * 不猜语义：`colorPrimary` → `--color-primary` 是格式规则，不是判断。
 * 值本身才是人认领的部分——它是三种合法出处之一（人工确认）。 */
const intakeTokens = [];
if (intake && intake.tokens && typeof intake.tokens === 'object') {
  for (const [k, v] of Object.entries(intake.tokens)) {
    if (k.startsWith('_') || k === 'gridBase') continue;
    if (v === '' || v === null || v === undefined) continue;
    intakeTokens.push({
      key: k,
      token: '--' + k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(),
      value: String(v).trim()
    });
  }
}

/* ---------- 结构特征汇总 ---------- */
const struct = {};
const metrics = {};
for (const p of pages) {
  const s = p.structure || {};
  for (const [k, v] of Object.entries(s)) struct[k] = (struct[k] || 0) + v;
  const m = p.metrics || {};
  for (const [k, v] of Object.entries(m)) if (v && !metrics[k]) metrics[k] = v;
}

/* 人工标注的结构布尔值并进来（只抬下限，不加次数——它不是频次统计，是人的断言） */
const INTAKE_STRUCT_MAP = {
  hasSidebar: 'sidebar', hasTopBar: 'header', hasFooter: 'footer',
  hasTable: 'tables', hasForm: 'forms', hasDashboard: 'charts', hasChart: 'charts',
  hasModal: 'modals', hasDrawer: 'drawers', hasTabs: 'tabs',
  hasCard: 'cards', hasTag: 'tags', hasPagination: 'paginations'
};
const intakeStructKeys = [];
if (intake && intake.structure && typeof intake.structure === 'object') {
  for (const [k, v] of Object.entries(intake.structure)) {
    if (k.startsWith('_') || v !== true) continue;
    const target = INTAKE_STRUCT_MAP[k];
    if (!target) continue;
    struct[target] = Math.max(struct[target] || 0, 1);
    intakeStructKeys.push(k);
  }
}

/* ---------- 布局指纹聚类 ----------
 * 布局不预设、不套用：把各页采集到的外壳特征（侧栏/顶栏/结构件）聚类，
 * 得出「本系统实际存在哪几种布局、各由哪些页面体现」。
 * 具体每套布局长什么样，由设计稿 + 这里的指纹共同裁决。 */
function layoutSig(L) {
  const s = L.sidebar;
  const round8 = (n) => (n ? Math.round(n / 8) * 8 : '?');
  return [
    s ? [s.side, round8(s.width), s.tone || '?'].join('/') : 'no-sidebar',
    L.topbar ? ['top', round8(L.topbar.height), L.topbar.fullWidth ? 'full' : 'partial'].join('/') : 'no-topbar',
    L.footer ? 'footer' : 'no-footer',
    L.breadcrumb ? 'crumb' : 'no-crumb',
    L.tabsbar ? 'tabs' : 'no-tabs'
  ].join(' | ');
}

function layoutDesc(L) {
  const parts = [];
  if (L.sidebar) {
    const s = L.sidebar;
    parts.push((s.side === 'right' ? '右侧' : '左侧') + '侧栏（'
      + (s.width ? s.width + 'px，' : '')
      + (s.tone === 'dark' ? '深色' : s.tone === 'light' ? '浅色' : '底色未取到')
      + (s.navItemCount ? '，' + s.navItemCount + ' 个菜单项' : '') + '）');
  } else parts.push('无侧栏');
  if (L.topbar) {
    parts.push((L.topbar.fullWidth ? '通栏' : '非通栏') + '顶栏（' + L.topbar.height + 'px，'
      + (L.topbar.tone === 'dark' ? '深色' : L.topbar.tone === 'light' ? '浅色' : '底色未取到') + '）');
  } else parts.push('无顶栏');
  if (L.footer) parts.push('有页脚');
  if (L.breadcrumb) parts.push('有面包屑');
  if (L.tabsbar) parts.push('有多标签栏' + (L.tabCount ? '（' + L.tabCount + ' 个页签）' : ''));
  if (L.collapseTrigger) parts.push('有收起触发器');
  if (L.pageHeader) parts.push('有页头标题区');
  return parts.join(' + ');
}

const layoutGroups = [];
const noFingerprint = [];
ONLINE.forEach((file, i) => {
  const L = pages[i] && pages[i].layout;
  if (!L) { noFingerprint.push(path.basename(file)); return; }
  const sig = layoutSig(L);
  let g = layoutGroups.find((x) => x.sig === sig);
  if (!g) { g = { sig, desc: layoutDesc(L), files: [] }; layoutGroups.push(g); }
  g.files.push(path.basename(file));
});
layoutGroups.sort((a, b) => b.files.length - a.files.length);

/* ---------- 颜色语义初判（只给候选，明确标注待确认） ---------- */
const isGray = (hex) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return false;
  const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  return Math.max(r, g, b) - Math.min(r, g, b) <= 8;
};
const isLight = (hex) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return false;
  const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  return (0.299 * r + 0.587 * g + 0.114 * b) > 200;
};

function topByProp(list, prop) {
  return list
    .filter((e) => e.props && e.props.includes(prop))
    .sort((a, b) => b.count - a.count)[0];
}

const guess = {};
const bgTop = topByProp(C.colors, 'background-color');
const fgTop = topByProp(C.colors, 'color');
const bdTop = topByProp(C.colors, 'border-color');
if (bgTop) guess.pageBg = bgTop.value + '（背景色第 1 高频）';
if (fgTop) guess.textPrimary = fgTop.value + '（文字色第 1 高频）';
if (bdTop) guess.border = bdTop.value + '（描边色第 1 高频）';
/* 主色候选：非灰、用于背景、非页面底色里频次最高的 */
const primaryCand = C.colors
  .filter((e) => e.props && e.props.includes('background-color'))
  .filter((e) => !isGray(e.value) && e.value !== (bgTop && bgTop.value))
  .sort((a, b) => b.count - a.count)[0];
if (primaryCand) guess.primary = primaryCand.value + '（非灰背景色第 1 高频，**必须人工确认是否为品牌主色**）';

/* ---------- 网格拟合 ---------- */
const pxOf = (s) => parseFloat(String(s).replace('px', '')) || 0;
function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

/* 拟合网格基数时要先剔离群值：一个 15px 就能把 gcd 从 8 拉到 1，
   拟合结果反而最没用。按「出现次数不低于最高频 5%」筛出核心档位。 */
const maxSp = C.spacings.reduce((m, e) => Math.max(m, e.count), 1);
const coreSp = C.spacings.filter((e) => e.count >= maxSp * 0.05).map((e) => pxOf(e.value)).filter((n) => n > 0);
let gridFit = 0;
if (coreSp.length) gridFit = coreSp.reduce((acc, n) => gcd(acc, n), coreSp[0]);

/* 覆盖率比裸 gcd 更有用：「80% 的间距落在 8px 网格上」比「公约数是 4」好判读 */
function coverage(base) {
  const total = C.spacings.reduce((s, e) => s + e.count, 0) || 1;
  const hit = C.spacings.filter((e) => pxOf(e.value) % base === 0).reduce((s, e) => s + e.count, 0);
  return Math.round((hit / total) * 100);
}
const cover = { 4: coverage(4), 8: coverage(8) };
const offGrid = C.spacings.filter((e) => pxOf(e.value) % GRID !== 0).slice(0, 10);

/* ---------- 设计稿 ↔ 线上 差异 ---------- */
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, '').replace(/\.(\d)/g, '0.$1');
let figmaDiff = null;
if (figma.size) {
  const onlineColors = new Set(C.colors.map((e) => norm(e.value)));
  const figmaColors = new Map();
  for (const [name, value] of figma) {
    if (/^(#|rgba?\()/i.test(value)) figmaColors.set(name, norm(value));
  }
  const onlineSet = new Set([...onlineColors]);
  const figmaSet = new Set([...figmaColors.values()]);

  const onlyFigma = [...figma.entries()].filter(([, v]) => /^(#|rgba?\()/i.test(v) && !onlineSet.has(norm(v)));
  const onlyOnline = C.colors.filter((e) => !figmaSet.has(norm(e.value)));

  figmaDiff = {
    figmaColorCount: figmaColors.size,
    onlineColorCount: onlineColors.size,
    matched: [...figmaSet].filter((v) => onlineSet.has(v)).length,
    /* F1：设计稿有、线上没落地 */
    onlyInFigma: onlyFigma.slice(0, 30).map(([n, v]) => ({ name: n, value: v })),
    /* F2：线上在用、设计稿没定义 */
    onlyInOnline: onlyOnline.slice(0, 30).map((e) => ({ value: e.value, count: e.count })),
    onlyInFigmaTotal: onlyFigma.length,
    onlyInOnlineTotal: onlyOnline.length
  };
}

/* ---------- 推断该建哪些文档 ---------- */
const has = (k) => (struct[k] || 0) > 0;
const pageTypes = [];
if (has('tables') || has('paginations')) pageTypes.push('list（列表页：检测到表格/分页）');
if (has('forms') || has('inputs')) pageTypes.push('form（表单页：检测到表单/输入控件）');
/* 仪表盘只认图表：卡片在列表页、详情页都很常见，拿卡片推断仪表盘会误报 */
if (has('charts')) pageTypes.push('dashboard（仪表盘页：检测到图表）');
if (has('drawers') || has('modals')) pageTypes.push('overlay（浮层：检测到弹窗/抽屉）');
if (has('header') || has('sidebar')) pageTypes.push('layout（导航布局：检测到顶栏/侧边栏）');

/* 组件级信号另列：卡片/标签在多种页面都有，但它们值得单独建组件文档 */
const compHints = [];
if (has('cards')) compHints.push('卡片（' + struct.cards + ' 处）');
if (has('tags')) compHints.push('标签 Tag（' + struct.tags + ' 处）');
if (has('tabs')) compHints.push('标签页 / 多标签（' + struct.tabs + ' 处）');
if (has('buttons')) compHints.push('按钮（' + struct.buttons + ' 处）');
if (has('inputs')) compHints.push('输入控件（' + struct.inputs + ' 处）');

/* ---------- 输出 ---------- */
function table(list, cols) {
  if (!list.length) return '（无）\n';
  const head = '| ' + cols.map((c) => c.title).join(' | ') + ' |';
  const sep = '| ' + cols.map(() => '---').join(' | ') + ' |';
  const rows = list.map((e) => '| ' + cols.map((c) => String(c.get(e)).replace(/\|/g, '\\|')).join(' | ') + ' |');
  return [head, sep, ...rows].join('\n') + '\n';
}

const L = [];
L.push('# 取值挖掘报告');
L.push('');
const sources = ['线上采集 ' + pages.length + ' 份'];
if (FIGMA) sources.push('设计稿导出 ' + path.basename(FIGMA));
if (intake) sources.push('人工标注 ' + (INTAKE_FILE ? path.basename(INTAKE_FILE) : ''));
L.push('- 数据源：' + sources.join(' + '));
L.push('- 网格基数：' + GRID + 'px；间距档位基数：' + SPACE_BASE + 'px；最小出现次数：' + MIN_COUNT);
if (intake && intake.system && intake.system.name) {
  L.push('- 目标系统：' + intake.system.name
    + (intake.system.prefix ? '（前缀 `' + intake.system.prefix + '-`）' : '')
    + (intake.system.domain ? '，' + intake.system.domain : ''));
}
intakeNotes.forEach((n) => L.push('- ' + n));
L.push('');
if (intake) {
  L.push('> **本次用了人工标注。** 它是三路数据源里最弱的一路——没有 computed style 的频次支撑，');
  L.push('> 只有「人看着截图认领的值」。它的价值在于每个值都有人负责，代价是没有交叉验证。');
  L.push('> 报告里所有来自人工标注的项都单独标注了来源，不要把它们的可信度等同于线上实测。');
  L.push('');
}
if (ONLINE.length && pages.length < 3) {
  L.push('> ⚠ **只采到 ' + pages.length + ' 个页面。** 单页采集噪声极大——一个列表页采出来的「主色」');
  L.push('> 很可能是表格斑马纹。规范要求至少 3 个不同页面（列表页 / 表单页 / 详情页各一）再合并跑。');
  L.push('> 下面的候选、布局聚类都只是线索，不要当结论。');
  L.push('');
}
if (!ONLINE.length) {
  L.push('> ⚠ **没有线上采集**，因此：没有布局指纹（布局候选一节为空）、没有频次统计、');
  L.push('> 没有「设计稿 ↔ 线上差异」。这份报告只能给出人工标注里填过的那些值。');
  L.push('');
}

L.push('## 1. 页面结构特征 → 该建哪些文档');
L.push('');
L.push('```');
Object.entries(struct).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => { if (v) L.push('  ' + k.padEnd(12) + v); });
L.push('```');
L.push('');
L.push('> ⚠ `charts` 只认 `<canvas>` 与带图表语义的类名；`<svg>` 矢量图元单列 `svgIcons`。');
L.push('> v1.14 之前两者混计，图标密集的系统里 `charts` 会≈图标数，**不能用它推断 dashboard**。');
L.push('> 另外：图表画在 `<canvas>` 上时配色不进 computed style，采集器拿不到——别把「采不到」当成「没有」。');
L.push('');
L.push('推断页面/组件类型：');
L.push('');
(pageTypes.length ? pageTypes : ['（结构特征不足，需人工确认页面类型）']).forEach((t) => L.push('- ' + t));
L.push('');
if (intake && intake.system && Array.isArray(intake.system.pages) && intake.system.pages.filter(Boolean).length) {
  L.push('**人工标注声明的页面类型**（没有结构信号支撑，需在设计稿里核对）：'
    + intake.system.pages.filter(Boolean).map((p) => '`' + p + '`').join('、'));
  L.push('');
}
if (intakeStructKeys.length) {
  L.push('**人工标注声明的结构信号**：' + intakeStructKeys.join('、')
    + '（已并入上方统计，但只有「有/没有」的信息，没有次数）');
  L.push('');
}
if (compHints.length) {
  L.push('建议单独建组件文档的信号：' + compHints.join('、'));
  L.push('');
}
if (Object.keys(metrics).length) {
  L.push('关键尺寸（渲染实测）：');
  L.push('');
  L.push('| 指标 | 实测值 |');
  L.push('| --- | --- |');
  /* 采集器产出的 metrics 是纯数字（getBoundingClientRect 取整）。
   * 但人工标注 / 第三方工具构造的 JSON 常直接写 `14px`——无条件拼 px 会得到 `14pxpx`。
   * 已带单位的原样输出。 */
  const withUnit = (v) => (/^[\d.]+$/.test(String(v).trim()) ? v + 'px' : String(v));
  Object.entries(metrics).forEach(([k, v]) => L.push('| ' + k + ' | ' + withUnit(v) + ' |'));
  L.push('');
}

L.push('## 2. 布局候选 → 该沉淀哪些布局模板');
L.push('');
if (noFingerprint.length) {
  L.push('> ⚠ 以下采集文件没有 layout 字段（采集脚本版本较旧）：' + noFingerprint.join('、'));
  L.push('> 用最新版 `collect-from-browser.js` 重采，或从截图人工确认外壳结构。');
  L.push('');
}
if (layoutGroups.length) {
  L.push('| 布局 | 体现页面 | 指纹特征 |');
  L.push('| :-- | :-- | :-- |');
  layoutGroups.forEach((g, i) => {
    L.push('| ' + String.fromCharCode(65 + i) + ' | ' + g.files.join('、') + ' | ' + g.desc + ' |');
  });
  L.push('');
  L.push('**这一步要定的是「该沉淀哪些布局模板」，不是「该用哪套现成布局」。**');
  L.push('');
  L.push('- 外壳结构、侧栏位置与宽度、顶栏高度与是否通栏、有没有面包屑 / 多标签，以上表为准，再结合设计稿裁决');
  L.push('- 沉淀方式：每个布局一份 `scripts/layout/<名字>.html`，内容插入点放 `<!-- @content-slot -->`，');
  L.push('  可选 `<!-- @tabs-slot -->`、`<!-- @page-title -->`；生成器按文件名识别可用布局');
  L.push('- 起点用 `scripts/layout/_skeleton.html`（只标契约、结构留空）——');
  L.push('  **不要照抄其它系统的布局**，外壳要照本系统的设计稿 / 线上实测搭');
} else {
  L.push('（未采到布局指纹，无法推断布局模板；先确认采集脚本版本，或从截图人工确认）');
}
L.push('');

L.push('## 3. 颜色候选');
L.push('');
L.push(table(C.colors.slice(0, 30), [
  { title: '取值', get: (e) => '`' + e.value + '`' },
  { title: '次数', get: (e) => e.count },
  { title: '用途分布', get: (e) => (e.props || []).slice(0, 3).join(' / ') },
  { title: '样例选择器', get: (e) => '`' + ((e.samples && e.samples[0]) || '') + '`' }
]));
L.push('语义初判（**仅供参考，必须人工确认**）：');
L.push('');
Object.entries(guess).forEach(([k, v]) => L.push('- ' + k + '：' + v));
L.push('');

L.push('## 4. 字阶候选');
L.push('');
L.push(table(C.fontSizes.slice(0, 16), [
  { title: '字号', get: (e) => '`' + e.value + '`' },
  { title: '次数', get: (e) => e.count }
]));
if (C.lineHeights.length) {
  L.push('行高：' + C.lineHeights.slice(0, 8).map((e) => '`' + e.value + '`(' + e.count + ')').join('、'));
  L.push('');
}
if (C.fontWeights.length) {
  L.push('字重：' + C.fontWeights.slice(0, 8).map((e) => '`' + e.value + '`(' + e.count + ')').join('、'));
  L.push('');
}
if (C.fontFamilies.length) {
  L.push('字体族：' + C.fontFamilies.slice(0, 5).map((e) => '`' + e.value + '`(' + e.count + ')').join('、'));
  L.push('');
}

L.push('## 5. 间距候选与网格拟合');
L.push('');
L.push(table(C.spacings.slice(0, 16), [
  { title: '取值', get: (e) => '`' + e.value + '`' },
  { title: '次数', get: (e) => e.count },
  { title: '主要用途', get: (e) => (e.props || []).slice(0, 3).join(' / ') }
]));
L.push('- 核心档位公约数（已剔除离群值）：**' + (gridFit || '—') + 'px**');
L.push('- 网格覆盖率：4px → ' + cover[4] + '%；8px → ' + cover[8] + '%（覆盖率 = 落在该网格上的间距出现次数占比）');
L.push('- 期望基数：' + GRID + 'px → ' + (cover[GRID] >= 90 ? '覆盖良好' : '**覆盖偏低，需人工确认是设计不规整还是基线不同**'));
if (offGrid.length) {
  L.push('- 不合 ' + GRID + 'px 网格的间距：' + offGrid.map((e) => '`' + e.value + '`(' + e.count + ')').join('、'));
}
L.push('');

L.push('## 6. 圆角 / 阴影 / 描边 / 层级');
L.push('');
L.push('圆角：' + (C.radii.length ? C.radii.slice(0, 8).map((e) => '`' + e.value + '`(' + e.count + ')').join('、') : '（无）'));
L.push('');
L.push('描边宽度：' + (C.borderWidths.length ? C.borderWidths.slice(0, 5).map((e) => '`' + e.value + '`(' + e.count + ')').join('、') : '（无）'));
L.push('');
if (C.zIndexes.length) {
  L.push('z-index：' + C.zIndexes.slice(0, 8).map((e) => '`' + e.value + '`(' + e.count + ')').join('、'));
  L.push('');
}
if (C.shadows.length) {
  L.push('阴影（取前 6）：');
  L.push('');
  L.push(table(C.shadows.slice(0, 6), [
    { title: '阴影', get: (e) => '`' + e.value.slice(0, 90) + '`' },
    { title: '次数', get: (e) => e.count }
  ]));
}

if (figmaDiff) {
  L.push('## 7. 设计稿 ↔ 线上实现 差异');
  L.push('');
  L.push('- 设计稿色值 ' + figmaDiff.figmaColorCount + ' 个，线上色值 ' + figmaDiff.onlineColorCount + ' 个，完全匹配 ' + figmaDiff.matched + ' 个');
  L.push('');
  if (figmaDiff.onlyInFigmaTotal) {
    L.push('### F1 设计稿有、线上未落地（' + figmaDiff.onlyInFigmaTotal + ' 个）');
    L.push('');
    L.push('| 设计稿变量 | 取值 |');
    L.push('| --- | --- |');
    figmaDiff.onlyInFigma.forEach((e) => L.push('| ' + e.name + ' | `' + e.value + '` |'));
    L.push('');
  }
  if (figmaDiff.onlyInOnlineTotal) {
    L.push('### F2 线上在用、设计稿未定义（' + figmaDiff.onlyInOnlineTotal + ' 个）');
    L.push('');
    L.push('| 线上取值 | 次数 |');
    L.push('| --- | --- |');
    figmaDiff.onlyInOnline.forEach((e) => L.push('| `' + e.value + '` | ' + e.count + ' |'));
    L.push('');
  }
  L.push('> F1/F2 都要人工判读：F1 可能是设计稿超前（线上还没改），也可能是设计稿虚胖；');
  L.push('> F2 往往是线上历史遗留色，是收编进规范还是线上整改，得定哪边是意图源。');
  L.push('');
}

L.push('## 8. 存疑项（必读）');
L.push('');
L.push('1. 颜色语义命名（主色 / 成功 / 警告 / 错误）**机器判断不可靠**，上表只是频次排序，必须由设计师确认');
L.push('2. 采集到的是渲染后 computed style，含浏览器默认值与内联样式，频次高不代表是规范值');
L.push('3. 单个页面的采集结果不具备代表性，**至少采集 3 个不同页面**再合并跑，噪声会明显下降');
L.push('4. 状态色（hover / active / disabled）默认态采集不到，需人工补或在页面上手动触发后再采一次');
L.push('5. 图表系列色、数据可视化色通常不在 computed style 里，需从设计稿补');
L.push('');

/* ---------- 附：人工标注取值 ----------
 * 不占正文章节号——它是「输入的回显」，不是分析结果。
 * 单独成块的原因：这些值的可信度与前七节不同（无频次交叉验证），
 * 混进候选表里会被误当成实测结论。 */
if (intakeTokens.length) {
  L.push('## 附：人工标注取值（来源：人工确认）');
  L.push('');
  L.push('下表是人工标注文件里填过的值，**不是从页面上量出来的**。');
  L.push('它们已经是合法出处（人工确认），但没有频次交叉验证——');
  L.push('填表人看走眼一处，这里就错一处，没有第二路数据能兜住。');
  L.push('');
  L.push('| 标注键 | 建议 Token 名 | 值 |');
  L.push('| :-- | :-- | :-- |');
  intakeTokens.forEach((t) => L.push('| `' + t.key + '` | `' + t.token + '` | `' + t.value + '` |'));
  L.push('');
  L.push('建议 Token 名只做了格式转换（camelCase → kebab-case + `--` 前缀），**不是语义判断**。');
  L.push('转正时请与本包 `scripts/` 模板里已有的 Token 名对齐（见 `scripts/README.md`），');
  L.push('对不上就是两个名字指同一个值，将来必然漂移。');
  L.push('');
}
if (intake && Array.isArray(intake.openQuestions) && intake.openQuestions.filter(Boolean).length) {
  L.push('### 人工标注里挂起的待确认问题');
  L.push('');
  intake.openQuestions.filter(Boolean).forEach((q) => L.push('- [ ] ' + q));
  L.push('');
}

const report = L.join('\n');

/* ---------- tokens.md 草稿 ---------- */
if (opts['emit-tokens']) {
  const T = [];
  const emittedIntake = new Set();
  /* 人工标注的取值按类别并进对应小节，并标记来源；
   * 没归到任何类别的留在文末「其他」里，不静默丢弃。 */
  const intakePick = (re) => intakeTokens.filter((t) => {
    if (emittedIntake.has(t.key)) return false;
    if (!re.test(t.key) && !re.test(t.token)) return false;
    emittedIntake.add(t.key);
    return true;
  });
  const intakeRow = (t) => '| ' + t.token + ' | ' + t.value
    + ' | **人工标注**（原键名 `' + t.key + '`）——转正前与模板既有 Token 名对齐 |';

  T.push('# 设计 Token 汇总（草稿 · 由 mine-tokens.js 生成，需人工确认后转正）');
  T.push('');
  T.push('> 本表由线上采集 + 设计稿导出 + 人工标注自动生成，语义命名与取值均**待确认**。');
  T.push('> 确认后删除本提示，并作为 `foundation/tokens.md` 的正式内容。');
  T.push('>');
  T.push('> 标了 **人工标注** 的行来自 `--intake` 文件：值是人认领的，没有频次交叉验证。');
  T.push('');
  T.push('## 颜色变量');
  T.push('');
  T.push('| Token | 默认值 | 用途 |');
  T.push('|-------|--------|------|');
  C.colors.slice(0, 24).forEach((e, i) => {
    const props = (e.props || []).join('/');
    T.push('| --color-candidate-' + (i + 1) + ' | ' + e.value + ' | 待命名：线上出现 ' + e.count + ' 次，用途 ' + props + ' |');
  });
  intakePick(/color|bg|border|text/i).forEach((t) => T.push(intakeRow(t)));
  T.push('');
  T.push('## 字号变量');
  T.push('');
  T.push('| Token | 默认值 | 用途 |');
  T.push('|-------|--------|------|');
  C.fontSizes.slice(0, 12).forEach((e, i) => {
    T.push('| --font-size-candidate-' + (i + 1) + ' | ' + e.value + ' | 待命名：出现 ' + e.count + ' 次 |');
  });
  intakePick(/font|line-height|字/i).forEach((t) => T.push(intakeRow(t)));
  T.push('');
  T.push('## 间距变量');
  T.push('');
  /* 命名规则必须与引擎模板一致：--space-N 的 N 是**档位**（px / 基数），不是 px 值。
   * 按 px 值命名会得到 --space-16 = 16px，而模板里的 --space-4 也是 16px，
   * 同一套系统里两个名字指一个值 → 回灌时必然漂移。 */
  T.push('> 命名规则：`--space-<档位>`，档位 = px ÷ ' + SPACE_BASE + '（例：`--space-4` = 16px）。');
  T.push('> 除不尽 ' + SPACE_BASE + ' 的值退化成 `--space-<px>px` 并标出——那说明它不在本系统的间距阶梯上，');
  T.push('> 是设计不规整还是采集噪声，要人工判。');
  T.push('');
  T.push('| Token | 默认值 | 用途 |');
  T.push('|-------|--------|------|');
  C.spacings.slice(0, 14).forEach((e) => {
    const n = pxOf(e.value);
    const step = n / SPACE_BASE;
    const exact = Number.isInteger(step);
    const name = exact ? '--space-' + step : '--space-' + n + 'px';
    const flags = [];
    if (!exact) flags.push('⚠ 不是 ' + SPACE_BASE + 'px 的整数倍，命名需人工裁决');
    if (n % GRID) flags.push('不合 ' + GRID + 'px 网格');
    T.push('| ' + name + ' | ' + e.value + ' | 待确认：出现 ' + e.count + ' 次'
      + (flags.length ? '（' + flags.join('；') + '）' : '') + ' |');
  });
  intakePick(/space|gap|padding|margin/i).forEach((t) => T.push(intakeRow(t)));
  T.push('');
  T.push('## 圆角变量');
  T.push('');
  T.push('| Token | 默认值 | 用途 |');
  T.push('|-------|--------|------|');
  C.radii.slice(0, 6).forEach((e, i) => {
    T.push('| --radius-candidate-' + (i + 1) + ' | ' + e.value + ' | 待命名：出现 ' + e.count + ' 次 |');
  });
  intakePick(/radius|圆角/i).forEach((t) => T.push(intakeRow(t)));
  T.push('');
  const leftover = intakeTokens.filter((t) => !emittedIntake.has(t.key));
  if (leftover.length) {
    T.push('## 其他（人工标注，未归类）');
    T.push('');
    T.push('| Token | 默认值 | 用途 |');
    T.push('|-------|--------|------|');
    leftover.forEach((t) => T.push(intakeRow(t)));
    T.push('');
  }
  fs.writeFileSync(opts['emit-tokens'], T.join('\n'), 'utf8');
  if (!AS_JSON) console.log('· Token 草稿已写入：' + opts['emit-tokens'] + '\n');
}

if (AS_JSON) {
  console.log(JSON.stringify({
    pages: pages.length, structure: struct, metrics,
    colors: C.colors, fontSizes: C.fontSizes, spacings: C.spacings,
    radii: C.radii, shadows: C.shadows, gridFit, guesses: guess,
    figmaDiff, pageTypes
  }, null, 2));
} else if (opts.out) {
  fs.writeFileSync(opts.out, report, 'utf8');
  console.log('· 报告已写入：' + opts.out);
} else {
  console.log(report);
}
process.exit(0);
