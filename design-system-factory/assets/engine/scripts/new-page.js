#!/usr/bin/env node
/**
 * 页面脚手架生成器  v1.6
 * ------------------------------------------------------------
 * 把「规范 + 模板」封装成一条命令：选好页面类型，自动拼装
 * 布局骨架 + 内容区模板 + 多标签导航 + 浮层（弹窗/抽屉），
 * 写入文件并跑 Token 校验，实现「页面 + 浮层」完整覆盖。
 *
 * 用法：
 *   node design-specs/scripts/new-page.js --type=<类型> --name=<名称> [选项]
 *
 * 必填：
 *   --type     页面类别，取值 = scripts/templates/ 下的目录名。
 *              本生成器不预设任何类别——「中后台有哪几类页面」是每个系统自己的答案。
 *              某一类实际能不能用，取决于 scripts/templates/<类别>/ 下有没有模板——
 *              引擎不预置模板，没沉淀过就报错并给沉淀步骤。
 *              contract.json 的 types 是**可选**白名单；留空则完全按目录名发现。
 *              属于浮层类别的（遮罩类名声明在 contract.json 的 overlay 里）
 *              直接产出可独立打开的浮层演示页
 *   --name     标题，填入 <title>、布局的 @page-title 与模板里的 @@页面标题@@
 *
 * 选项：
 *   --layout   布局名 = scripts/layout/ 下的文件名（不含 .html）。
 *              不写：本包只有一个布局时自动用它；有多个则必须指定；一个都没有会报错并给沉淀步骤。
 *              none：只要内容区（已有项目里加页面时用）
 *   --template 同一类别沉淀了多个模板时，指定用哪一个（不带 .html）。
 *              只有一个时不用写；一个都没有会报错并给沉淀步骤。
 *   --tabs     把多标签栏插进布局的 <!-- @tabs-slot -->（布局没有该标记则忽略并提示）
 *   --overlay  在页面里附带浮层骨架，逗号分隔，写法 <类别>[:<档位>]。全部来自 contract.json：
 *                <类别>           用该类声明的 defaultSize
 *                <类别>:<档位>    指定档位（档位名由 contract.json 的 sizes 声明）
 *                <别名>           contract.json 的 alias 声明的组合
 *              contract.json 的 overlay 为空时本参数不可用（先裁决契约，报错会给步骤）。
 *   --no-trigger  不注入「演示入口」触发条（默认注入，接业务后整块删除）
 *   --out      输出路径，默认 ./<name>.html
 *   --system   系统名称。不传则取本包 templates/contract.json 的 system；
 *              两处都没有则**不兜底**，把 @@系统名@@ 留在产物里并警告
 *   --no-check 生成后不自动跑 Token 校验
 *
 * ── 布局从哪来 ──────────────────────────────────────
 * 本生成器不预置任何布局，也不认识任何具体系统的类名。
 * 它只认布局模板里的三个注释标记（见 scripts/layout/_skeleton.html）：
 *   <!-- @content-slot -->  必填
 *   <!-- @tabs-slot -->     选填
 *   <!-- @page-title -->    选填
 * 外壳（顶栏 / 侧栏 / 面包屑 / 多标签）由本系统的设计稿与线上采集决定，
 * 不要照抄其它系统的布局——那套结构在本系统没验证过。
 *
 * ★ 标记的**示范性引用**要写在 <style> / <script> 里（布局骨架就是这么做的），
 *   不要写在 body 的 HTML 注释里——换标记时只认「非 style/script 区」的第一个，
 *   body 注释里的写法会被当成真插入点。详见 replaceSlot() 的注释。
 *
 * ── 内容区模板从哪来 ────────────────────────────────
 * 同理，本生成器也不预置任何内容区模板。落位 scripts/templates/<类别>/<名字>.html，
 * 目录名即 --type 取值；发现规则与布局完全一致：
 *   0 个 → 报错并打印沉淀步骤（不静默退化到别的结构）
 *   1 个 → 自动用它
 *   多个 → 必须 --template=<名字> 指定
 * 结构性的那部分（浮层遮罩类名 / 宽度档位 / 样式提取范围）声明在
 * scripts/templates/contract.json，不写在生成器里。
 * 模板里要填页面标题的地方写 @@页面标题@@，系统名写 @@系统名@@——
 * 生成器不认识任何具体系统的类名，只认这两个占位符。
 *
 * 示例（<类别> 换成本包已沉淀的类别名）：
 *   node new-page.js --type=<类别> --name=<页面名>
 *   node new-page.js --type=<类别> --name=<页面名> --layout=<布局名>
 *   node new-page.js --type=<类别> --name=<页面名> --overlay=<类别>[:<档位>]
 *   node new-page.js --type=<类别> --name=<页面名> --layout=none
 *
 * 浮层接入提示：生成后把 <触发属性>="<遮罩 id>" 挂到任意按钮即可打开。
 * 属性名与遮罩 id 都由 contract.json 与模板决定，生成时会打印出来。
 * 关闭已内置（关闭图标 / 取消按钮 / 点遮罩 / Esc）。
 *
 * 【实现要点｜改动前必读】
 * 注入到宿主页面的浮层 CSS 一律加作用域前缀（用 contract.json 里的 overlay.<类别>.mask）。
 * 原因：浮层模板与布局模板的按钮语义常常相反——布局里裸的按钮类可能是主按钮，
 * 浮层模板里同名的可能是次按钮。若不做作用域隔离，后注入的浮层样式会覆盖宿主页面，
 * 导致全站按钮样式集体变样。作用域隔离后两套语义各自生效、互不干扰。
 * ⚠ 这条对「模板来自别的系统」尤其危险：你没法预判两边按钮语义是否一致。
 *
 * 退出码：0 成功；1 参数错误、生成失败或 Token 校验未通过
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/* ---------- 参数解析 ---------- */
const argv = process.argv.slice(2);
const opts = {};
for (const a of argv) {
  if (!a.startsWith('--')) continue;
  const [k, v] = a.replace(/^--/, '').split('=');
  opts[k] = v === undefined ? true : v;
}

const TYPE = opts.type;
const NAME = opts.name;
const LAYOUT_OPT = typeof opts.layout === 'string' ? opts.layout : '';
const OUT = opts.out || path.join(process.cwd(), `${NAME || 'new-page'}.html`);
const WITH_TABS = !!opts.tabs;
const DO_CHECK = opts.check !== 'false' && !opts['no-check'];

const SCRIPTS_DIR = __dirname;

/* 插入点标记：布局模板与生成器之间的唯一契约。
 * 生成器不认识任何具体系统的类名，只认这三个注释。 */
const CONTENT_SLOT = '<!-- @content-slot -->';
const TABS_SLOT = '<!-- @tabs-slot -->';
const TITLE_SLOT = '<!-- @page-title -->';

/* 可用布局 = scripts/layout/ 下的 *.html（`_` 开头的是骨架/草稿，不算可用布局）
 * 布局不预置、不写死在代码里：本包该有哪些布局，由采集与设计稿裁决后沉淀进来。 */
const LAYOUT_DIR = path.join(SCRIPTS_DIR, 'layout');
function discoverLayouts() {
  if (!fs.existsSync(LAYOUT_DIR)) return [];
  return fs.readdirSync(LAYOUT_DIR)
    .filter((f) => f.endsWith('.html') && !f.startsWith('_'))
    .map((f) => ({ key: f.replace(/\.html$/, ''), file: 'layout/' + f }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
const LAYOUTS = discoverLayouts();

/* ---------- 内容区模板：按目录发现 ----------
 * 引擎不预置任何内容区模板。模板的结构与取值阶梯都必须来自本系统的设计稿——
 * 从别的系统搬，本系统的规范里会凭空多出几十个「待填」条目。
 * 落位：scripts/templates/<类别>/<名字>.html，目录名即 --type 取值。
 * 与布局发现同构：0 个报错给沉淀步骤、1 个自动用、多个要 --template 指定。 */
const TEMPLATES_DIR = path.join(SCRIPTS_DIR, 'templates');

/* 结构性契约（浮层遮罩类名 / 宽度档位 / 样式提取范围）由本系统声明，
 * 不硬编码在生成器里——凡是「只对某一个系统成立」的知识都不该写死在工具里。 */
const CONTRACT_PATH = path.join(TEMPLATES_DIR, 'contract.json');
if (!fs.existsSync(CONTRACT_PATH)) {
  console.error('✗ 找不到 templates/contract.json');
  console.error('  它是内容区模板的结构性契约（浮层遮罩类名 / 宽度档位 / 样式提取范围）。');
  console.error('  包不完整——从工厂包 assets/engine/scripts/templates/ 补一份。');
  process.exit(1);
}
let CONTRACT;
try {
  CONTRACT = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
} catch (e) {
  console.error('✗ templates/contract.json 不是合法 JSON：' + e.message);
  process.exit(1);
}

/* 系统名：--system 优先，否则取本包契约里声明的 contract.json 的 system。
 *
 * ★ 绝不拿「别的系统」的名字兜底。这个默认值曾经写死成某个具体系统的名称，
 *   于是**每一个**不显式传 --system 的产物都被贴上别人的品牌文案，
 *   而 check-tokens / [E4] 一个字都不会说——它看着像正常业务文案。
 *   引擎里凡是「只对某一个系统成立」的知识都不该写死，系统名尤其显眼。
 *
 * 两处都没有 → 不替换 @@系统名@@，把占位符留在产物里并明确警告。
 *   可见的缺失远好过静默的错误填充：占位符一眼能看见，错名字要等人去核对。 */
const SYSTEM = opts.system || CONTRACT.system || '';
/* --type 白名单的取值来源有两处，缺一不可：
 *   · contract.json 的 types      —— 页面类别（list / form / dashboard…）
 *   · contract.json 的 overlay 键 —— 浮层类别（modal / drawer…）
 * 浮层类别同样是 scripts/templates/ 下的目录名，而且 --type=<浮层类别> 是
 * 「独立全屏浮层页」的**正常用法**（见下方 IS_OVERLAY_TYPE）。
 * ★ 曾经漏了第二处：types=[list,form,dashboard] 时 --type=modal 被拒，
 *   而 templates/modal/ 明明已经沉淀、overlay.modal 也已经裁决——
 *   白名单比「已声明」的范围更窄，把这个正常用法误判成「类别不存在」。
 *   注意 overlay 为空（契约未裁决）时这里不多出任何取值，行为与从前一致。 */
const PAGE_TYPES = Array.isArray(CONTRACT.types) ? CONTRACT.types : [];
const OVERLAY_TYPE_KEYS = Object.keys(CONTRACT.overlay || {});
const TYPE_POOL = [...PAGE_TYPES, ...OVERLAY_TYPE_KEYS];

function discoverTemplates() {
  const out = {};
  if (!fs.existsSync(TEMPLATES_DIR)) return out;
  for (const e of fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const files = fs.readdirSync(path.join(TEMPLATES_DIR, e.name))
      .filter((f) => f.endsWith('.html') && !f.startsWith('_'))
      .map((f) => ({ key: f.replace(/\.html$/, ''), file: 'templates/' + e.name + '/' + f }))
      .sort((a, b) => a.key.localeCompare(b.key));
    if (files.length) out[e.name] = files;
  }
  return out;
}
const TEMPLATES = discoverTemplates();

/* type → 默认模板路径（该类排序后的第一个）。--template 会覆盖当前类型的取值。 */
const CONTENT_TPL = {};
for (const [type, list] of Object.entries(TEMPLATES)) CONTENT_TPL[type] = list[0].file;

/* 浮层：模板路径 + 遮罩 class + 样式提取范围，全部来自 contract.json。
 * 本系统还没沉淀某类浮层模板时跳过——它的 --overlay 会在参数校验阶段被拦下。 */
const OVERLAY_TPL = {};
const OVERLAY_SIZE = {};
for (const [kind, spec] of Object.entries(CONTRACT.overlay || {})) {
  const list = TEMPLATES[kind];
  if (!list || !list.length) continue;
  OVERLAY_TPL[kind] = {
    file: list[0].file,
    label: spec.label || kind,
    mask: spec.mask,
    needles: spec.needles || [],
    openAttr: spec.openAttr
  };
  OVERLAY_SIZE[kind] = {
    default: spec.defaultSize,
    label: Object.fromEntries(Object.entries(spec.sizes).map(([k, v]) => [k, v.label])),
    cls: Object.fromEntries(Object.entries(spec.sizes).map(([k, v]) => [k, v.cls]))
  };
}
const OVERLAY_ALIAS = CONTRACT.alias || {};
const TABS_DIR = CONTRACT.tabsDir || 'tabs';

/* 浮层「遮罩 class」与「打开方式属性」的集合，一律从 contract.json 派生。
 * 新增一类浮层（比如 popover）只需改声明，生成器这里不用动。 */
const MASK_CLASSES = [...new Set(
  Object.values(CONTRACT.overlay || {}).map((s) => s && s.mask).filter(Boolean)
)];
const OPEN_ATTRS = [...new Set(
  Object.values(CONTRACT.overlay || {}).map((s) => s && s.openAttr).filter(Boolean)
)];
/* 本包声明了哪几类浮层。空 = 契约还没裁决（引擎建包后的初始状态）。 */
const OVERLAY_KINDS = Object.keys(CONTRACT.overlay || {});

/* --overlay 的取值清单也从声明生成，不在错误信息里写死档位名 */
const OVERLAY_HELP = [
  ...Object.entries(OVERLAY_SIZE).flatMap(([k, s]) =>
    [k, ...Object.keys(s.cls).map((x) => k + ':' + x)]),
  ...Object.keys(OVERLAY_ALIAS)
].join(' | ');

/* 解析 --overlay：<类别>[:<档位>]，逗号分隔组合；别名由 contract.json 的 alias 声明 */
const rawOverlay = typeof opts.overlay === 'string' ? opts.overlay : (opts.overlay === true ? 'both' : '');
let OVERLAYS = [];
if (rawOverlay) {
  /* 契约还没裁决时 --overlay 无从谈起：遮罩类名 / 档位 / 提取范围都在 contract.json 里。
   * 这不是「参数写错」，所以给裁决步骤，而不是一句「本包可选：」。 */
  if (!OVERLAY_KINDS.length) {
    console.error('✗ 本包还没有裁决浮层契约（scripts/templates/contract.json 的 overlay 是空的）。\n');
    console.error('  浮层的遮罩类名 / 宽度档位 / 注入时要带走哪些样式规则，每个系统都不一样，');
    console.error('  只能从**本系统的设计稿或线上实测**裁决，不能从别的系统搬。\n');
    console.error('  步骤：');
    console.error('    1. 看挖掘报告第 1 节「页面结构特征」，确认本系统确实有浮层（检出弹窗 / 抽屉）');
    console.error('    2. 从设计稿量出每类浮层有哪几档宽度、遮罩用什么类名');
    console.error('    3. 把每一类写进 contract.json 的 overlay（字段含义见该文件的 _overlay_说明）');
    console.error('    4. 建 scripts/templates/<类别>/ 放模板，类名与档位与契约保持一致\n');
    console.error('  裁决流程见 scripts/templates/README.md「怎么裁决本系统的契约」；');
    console.error('  一份填满的样子见工厂包 assets/samples/contract.sample.json（只作参照，不要照抄）');
    process.exit(1);
  }
  const tokens = rawOverlay.split(',').map((s) => s.trim()).filter(Boolean)
    .reduce((acc, k) => acc.concat(OVERLAY_ALIAS[k] || [k]), []);
  const bad = [];
  const seen = new Set();
  tokens.forEach((tk) => {
    const [kind, size] = tk.split(':').map((s) => s.trim().toLowerCase());
    if (!OVERLAY_TPL[kind]) { bad.push(tk); return; }
    const spec = OVERLAY_SIZE[kind];
    const finalSize = size || spec.default;
    if (!spec.cls[finalSize]) { bad.push(tk); return; }
    const key = kind + ':' + finalSize;
    if (!seen.has(key)) { seen.add(key); OVERLAYS.push({ kind, size: finalSize }); }
  });
  if (bad.length) {
    console.error('✗ 错误的 --overlay：' + bad.join(', '));
    /* 区分「参数写错」与「本系统还没沉淀这类模板」——后者是正常状态，不是用户写错了 */
    const noTpl = [...new Set(bad.map((t) => t.split(':')[0].trim().toLowerCase())
      .filter((k) => OVERLAY_KINDS.includes(k) && !OVERLAY_TPL[k]))];
    if (noTpl.length) {
      console.error('  本包还没沉淀这类浮层模板：' + noTpl.join(' / '));
      console.error('  落位 scripts/templates/<类别>/<名字>.html；沉淀说明见 scripts/templates/README.md');
    }
    console.error('  本包可选：' + OVERLAY_HELP);
    process.exit(1);
  }
}

/* --type 白名单是**可选**的。
 * contract.json 的 types 留空 = 不设白名单，类别完全由 scripts/templates/ 下的目录名裁决
 * （建了什么目录就有什么类别）——这是建包后的初始形态，
 * 免得把别的系统的类别集当成本系统的「中后台通用类别」。
 * types 填了才额外校验，用于「还没沉淀模板但已定下要建哪几类」。 */
if (!TYPE) {
  console.error('✗ 缺少 --type（页面类别）。');
  console.error(TYPE_POOL.length
    ? '  本包 contract.json 声明的类别：' + TYPE_POOL.join(' / ')
    : '  本包没有声明类别白名单，取值 = scripts/templates/ 下的目录名（本包目前还没有任何类别目录）。');
  if (PAGE_TYPES.length && OVERLAY_TYPE_KEYS.length) {
    console.error('    （其中 ' + OVERLAY_TYPE_KEYS.join(' / ')
      + ' 是浮层类别，--type 用它们产出「独立全屏浮层页」）');
  }
  if (!TYPE_POOL.length) {
    console.error('');
    console.error('  步骤：');
    console.error('    1. 看挖掘报告第 1 节「页面结构特征」，确认本系统实际有哪几类页面');
    console.error('    2. mkdir -p scripts/templates/<类别>，按设计稿沉淀模板');
    console.error('    3. 想提前锁定清单，就把类别名写进 contract.json 的 types');
    console.error('');
    console.error('  裁决流程见 scripts/templates/README.md');
  }
  process.exit(1);
}
if (TYPE_POOL.length && !TYPE_POOL.includes(TYPE)) {
  console.error('✗ --type=' + TYPE + ' 不在本包 contract.json 声明的类别里。');
  console.error('  已声明的页面类别：' + (PAGE_TYPES.join(' / ') || '（无）'));
  if (OVERLAY_TYPE_KEYS.length) {
    console.error('  已声明的浮层类别：' + OVERLAY_TYPE_KEYS.join(' / '));
  }
  console.error('  要新增页面类别：先沉淀 scripts/templates/' + TYPE + '/，再把它加进 types；');
  console.error('  要新增浮层类别：先沉淀 scripts/templates/' + TYPE + '/，再写进 overlay 的字段；');
  console.error('  或把 types 留空，改为按目录名发现（建了什么目录就有什么类别）。');
  process.exit(1);
}

/* --template=<名字>：同一类别有多个模板时指定用哪个 */
const WANT_TEMPLATE = typeof opts.template === 'string' ? opts.template : '';
if (WANT_TEMPLATE) {
  const list = TEMPLATES[TYPE] || [];
  const hit = list.find((t) => t.key === WANT_TEMPLATE);
  if (!hit) {
    console.error('✗ --template=' + WANT_TEMPLATE + ' 在 ' + TYPE + ' 类里不存在。');
    console.error(list.length
      ? '  本类现有模板：' + list.map((t) => t.key).join(' / ')
      : '  本类还没有任何模板（scripts/templates/' + TYPE + '/ 下没有 .html）');
    process.exit(1);
  }
  CONTENT_TPL[TYPE] = hit.file;
}

/* 该类还没沉淀模板：这是「引擎不预置」的正常结果，给沉淀步骤而不是报「包不完整」 */
if (!CONTENT_TPL[TYPE]) {
  console.error('✗ 本系统还没有沉淀 ' + TYPE + ' 类的内容区模板。\n');
  console.error('  引擎不预置任何内容区模板——模板的结构与取值阶梯都必须来自本系统的设计稿。');
  console.error('  套用别的系统的模板，会让本系统的规范里凭空多出几十个「待填」条目。\n');
  console.error('  步骤：');
  console.error('    1. 看挖掘报告第 1 节「页面结构特征」，确认本系统确实有这类页面');
  console.error('    2. mkdir -p scripts/templates/' + TYPE);
  console.error('    3. cp scripts/templates/_skeleton.html scripts/templates/' + TYPE + '/<名字>.html');
  console.error('    4. 按设计稿搭结构，取值先登记进 foundation/tokens.md 再回灌 :root');
  console.error('    5. node scripts/check-tokens.js <包> --strict 退出码 0\n');
  console.error('  沉淀说明见 scripts/templates/README.md；');
  console.error('  广发的同类样例见工厂包 assets/samples/templates/' + TYPE + '/（只作参考，不要照抄）');
  process.exit(1);
}

/* --tabs 需要多标签栏模板 */
if (WITH_TABS && !(TEMPLATES[TABS_DIR] || []).length) {
  console.error('✗ 本系统还没有沉淀多标签栏模板（--tabs 需要它）。');
  console.error('  落位：scripts/templates/' + TABS_DIR + '/<名字>.html');
  console.error('  沉淀说明见 scripts/templates/README.md');
  process.exit(1);
}
if (!NAME) {
  console.error('✗ 缺少 --name（页面标题）');
  process.exit(1);
}
const IS_OVERLAY_TYPE = !!CONTRACT.overlay
  && Object.prototype.hasOwnProperty.call(CONTRACT.overlay, TYPE);
/* 登录页等「独立全屏页」类别由 contract.json 声明，不在代码里写死 */
const STANDALONE_TYPES = Array.isArray(CONTRACT.standalone) ? CONTRACT.standalone : [];
const IS_STANDALONE = IS_OVERLAY_TYPE || STANDALONE_TYPES.includes(TYPE);
const LAYOUT_NONE = LAYOUT_OPT === 'none';
const NEEDS_LAYOUT = !IS_STANDALONE && !LAYOUT_NONE;

/* 布局解析：本包有什么布局由 scripts/layout/ 决定，不在代码里写死 */
let layoutKey = LAYOUT_OPT;
if (NEEDS_LAYOUT) {
  if (!layoutKey) {
    if (LAYOUTS.length === 1) {
      layoutKey = LAYOUTS[0].key;
    } else if (LAYOUTS.length === 0) {
      console.error('✗ 本包还没有布局模板，无法拼装页面。\n');
      console.error('  布局要从**本系统的设计稿 / 线上采集**生成，不能套用别的系统——');
      console.error('  那套外壳结构在本系统没验证过，等于没有。\n');
      console.error('  步骤：');
      console.error('    1. 看挖掘报告第 2 节「布局候选」，确认本系统实际有几种外壳');
      console.error('    2. 复制 scripts/layout/_skeleton.html 为 scripts/layout/<名字>.html');
      console.error('    3. 按设计稿搭外壳，保留 ' + CONTENT_SLOT + '（可选 ' + TABS_SLOT + ' / ' + TITLE_SLOT + '）');
      console.error('    4. 取值先登记进 foundation/tokens.md，再回灌该模板的 :root\n');
      console.error('  只想先要内容区（已有项目里加页面）：加 --layout=none');
      process.exit(1);
    } else {
      console.error('✗ 本包有多个布局，请用 --layout 指定一个：');
      LAYOUTS.forEach((l) => console.error('    --layout=' + l.key + '　（' + l.file + '）'));
      console.error('  只想先要内容区：--layout=none');
      process.exit(1);
    }
  } else if (!LAYOUTS.some((l) => l.key === layoutKey)) {
    console.error('✗ 找不到布局 --layout=' + layoutKey);
    console.error(LAYOUTS.length
      ? '  本包现有布局：' + LAYOUTS.map((l) => l.key).join(' / ')
      : '  本包还没有任何布局模板（scripts/layout/ 下没有 .html）');
    console.error('  另：--layout=none 只出内容区');
    process.exit(1);
  }
}

/**
 * 模板缺失引导。
 * 正常情况下走不到这里——内容区 / 布局 / 浮层模板在参数阶段都已校验存在。
 * 真走到这里说明文件在发现之后被动了（删除、改名），给通用排查方向。
 */
function guideCreateTemplate(missing) {
  console.error('\n—— 以下模板在参数校验之后不见了 ——');
  missing.forEach((f) => console.error('    scripts/' + f));
  console.error('\n  模板落位：');
  console.error('    内容区  scripts/templates/<类别>/<名字>.html');
  console.error('    布局    scripts/layout/<名字>.html');
  console.error('  沉淀说明见 scripts/templates/README.md 与 scripts/layout/README.md');
  console.error('  自检：node <包>/scripts/check-tokens.js <包> --strict\n');
}

/* 模板存在性预检：缺模板要在参数阶段报错，不能等到生成到一半抛栈 */
const NEED_TPL = [CONTENT_TPL[TYPE]];
if (NEEDS_LAYOUT) {
  const hit = LAYOUTS.find((l) => l.key === layoutKey);
  if (hit) NEED_TPL.push(hit.file);
}
if (!IS_OVERLAY_TYPE) OVERLAYS.forEach((o) => { const t = OVERLAY_TPL[o.kind]; if (t) NEED_TPL.push(t.file); });
const MISSING = [...new Set(NEED_TPL)].filter((f) => !fs.existsSync(path.join(SCRIPTS_DIR, f)));
if (MISSING.length) {
  console.error('✗ 以下模板缺失，无法生成：');
  MISSING.forEach((f) => console.error('    scripts/' + f));
  guideCreateTemplate(MISSING);
  process.exit(1);
}

if (IS_STANDALONE) {
  if (IS_OVERLAY_TYPE && OVERLAYS.length) console.log('· --type=' + TYPE + ' 已是浮层页，--overlay 忽略（想让页面带浮层请用 --type=<普通页面类别> --overlay=' + TYPE + '）');
  if (LAYOUT_OPT) console.log('· --type=' + TYPE + ' 是独立全屏页，--layout 忽略');
  if (WITH_TABS) console.log('· 独立全屏页无多标签栏，--tabs 忽略');
}

/* ---------- HTML 拆解工具 ---------- */
function read(rel) {
  const p = path.join(SCRIPTS_DIR, rel);
  if (!fs.existsSync(p)) throw new Error('模板不存在：' + rel);
  return fs.readFileSync(p, 'utf8');
}

/**
 * 剔除「演示区」——模板里只为让人看得见而造的触发按钮 / 假数据 / 说明文字。
 *
 * 标记写成注释，生成器只按标记切段，**不做任何 HTML 解析**（不数标签、不配对）。
 * HTML 与 CSS 共用同一对标记词 `@transient-start` / `@transient-end`，
 * 只是各自包在自己语言的注释里（HTML 用 `<!-- -->`，CSS 用块注释）。
 *
 * 只在「注入宿主页」的路径上调用（内容区 → @content-slot、多标签栏 → @tabs-slot、
 * 浮层 → body 末尾）。独立全屏页（浮层类别、contract.json 的 standalone 声明的类别、--layout=none）不调用——
 * 那里演示区往往是页面上唯一可点的东西，删了就成空白页。
 *
 * 采集侧是另一套机制：给演示区根元素加 data-collect-ignore，
 * 让 collect-from-browser.js 整块跳过。两者互补，见 scripts/templates/README.md。
 */
/* 开闭标记各自允许带说明文字（`<!-- @transient-start 演示区 -->`），
 * 因为模板里几乎一定会顺手写上是干嘛的。HTML 与 CSS 两种注释形式都认。 */
const TRANSIENT_RE = /[ \t]*(?:<!--\s*@transient-start[^>]*-->|\/\*\s*@transient-start[\s\S]*?\*\/)[\s\S]*?(?:<!--\s*@transient-end[^>]*-->|\/\*\s*@transient-end[\s\S]*?\*\/)[ \t]*\r?\n?/gi;

function stripTransient(s) {
  return s.replace(TRANSIENT_RE, '');
}

/**
 * 把 HTML 注释 `<!-- … -->` 掩成**等长空白**（下标不变）。
 *
 * ★ 为什么必须做（2026-09-23，STARS 沉淀第一个浮层模板时的事故）
 *   模板的头部说明里几乎一定会提到标签名本身，例如
 *     「底部的 <script> 是通用实现：关闭图标 / 取消按钮 / Esc 关闭」
 *   而 parts() 找脚本用的是 `<script[^>]*>([\s\S]*?)<\/script>` —— 它只认
 *   「第一个 <script>」到「第一个 </script>」。注释里那个 <script> 字面量
 *   位置更靠前，于是**从注释起、直到文件真正的 </script> 为止**整段被当成脚本内容。
 *
 *   实测症状（产物 1798 行、退出码 0、所有校验全绿）：
 *     · 浮层模板的演示区、另外两个档位的遮罩块、连 `</style></head><body>` 一起，
 *       被当作「脚本」注入到宿主页 —— 宿主页里凭空多出两套弹窗和一段 HTML
 *     · `@transient` 剔除去不掉它们（它们不在被提取的那一块里，而在「脚本」里）
 *     · 生成器自带的演示入口条反而没插进去（因为 content.scripts 非空，走了别的分支）
 *   与 v1.10 的槽位事故同源：**注释里的字面量骗过了「只认第一个匹配」的解析**。
 *
 * 等长掩码保证下标 1:1 对应，因此可以拿 masked 的下标去原文里取内容。
 */
function maskHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length));
}

/** 取一份 HTML 里的内联 <script> 内容（跳过 src= 外链，跳过注释里的字面量） */
function htmlScripts(html) {
  const masked = maskHtmlComments(html);
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of masked.matchAll(re)) {
    const openEnd = masked.indexOf('>', m.index) + 1;
    out.push(html.slice(openEnd, m.index + m[0].length - '</script>'.length));
  }
  return out;
}

/** 拆出一份模板的 style / body 内层 / 脚本 */
function parts(html) {
  /* 找 style / script 一律先在**掩掉 HTML 注释**的副本上定位，再按下标切原文：
     注释里写标签名是常规说明写法，但会让「只认第一个匹配」的解析把注释之后的
     整段当成代码（见 maskHtmlComments）。掩码等长 ⇒ 下标可直接用于原文。 */
  const masked = maskHtmlComments(html);
  const styleM = masked.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const style = styleM
    ? html.slice(styleM.index + styleM[0].indexOf('>') + 1,
      styleM.index + styleM[0].length - '</style>'.length)
    : '';
  const rootM = style.match(/:root\s*\{([\s\S]*?)\}/);
  const rootCss = rootM ? rootM[0] : '';
  /* 亮色覆盖块与 :root 是**一对**：合并时要么一起搬，要么一起丢。
   * 只搬 :root 会让内容模板带进来的 Token 在亮色下沿用暗色取值 —— 见 mergeRootVars。 */
  const lightM = style.match(/html\[data-theme\s*=\s*['"]?light['"]?\]\s*\{[^{}]*\}/i);
  const lightCss = lightM ? lightM[0] : '';

  /* body 内层：按掩码串定位所有 <script> 区间，从**原文**里挖掉（注释原样保留） */
  const bodyM = masked.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  let bodyInner = '';
  if (bodyM) {
    const start = bodyM.index + bodyM[0].indexOf('>') + 1;
    const end = bodyM.index + bodyM[0].length - '</body>'.length;
    const inner = html.slice(start, end);
    const maskedInner = masked.slice(start, end);
    let i = 0;
    for (const m of maskedInner.matchAll(/<script\b[\s\S]*?<\/script>/gi)) {
      bodyInner += inner.slice(i, m.index);
      i = m.index + m[0].length;
    }
    bodyInner += inner.slice(i);
  }
  /* bodyInner 与 bodyCss 的用途都是「注入宿主页」，在这里统一剔除演示区 */
  bodyInner = stripTransient(bodyInner).trim();
  const bodyCss = stripTransient(style.replace(rootCss, '').replace(lightCss, ''));
  return { html, style, rootCss, lightCss, bodyCss, bodyInner, scripts: htmlScripts(html) };
}

/* ---------- 槽位标记（布局的三个插入点） ----------
 * ★ 为什么不能直接 String.replace(SLOT, x)：
 *   布局模板的头部注释会**示范**这三个标记的写法——_skeleton.html 就是这么写的，
 *   本包按它沉淀的布局也照抄了。而那些示范同样以 `<!-- @content-slot -->` 的
 *   字面量出现，且位置比真插入点更靠前（注释在 <style> 里，插入点在 body 里）。
 *   String.replace 只换第一个匹配 → 内容被注进注释（在 CSS 注释里等于凭空消失），
 *   真插入点原封不动留着。
 *   2026-09-23 在 STARS 外壳上实测到：@page-title 的页签标签渲染成 0×0 宽，
 *   页面上看不见页面名。同源的第二个症状更隐蔽——
 *   `layoutRaw.includes(CONTENT_SLOT)` 这个「必填」校验也会被注释骗过：
 *   布局漏写真插入点时它照样通过，然后产出没有内容槽的页面。
 *   ★ 这类错误没有任何校验项会报（[E1]–[E5]/[W1]/[I1] 都只看颜色与 Token），
 *     所以只能靠「渲染出来量几何」兜住，见 references/04-pitfalls.md。
 *
 * 规则：把 <style>…</style> 与 <script>…</script> 整段掩成**等长空白**
 * （等长是为了保持下标不变），在剩下的部分里取第一个出现。
 * 示范性引用写在 CSS/JS 注释里，落在这两类块内，因此被跳过。
 */

/** 槽位在「非 style/script 区」的首次出现下标；没有则 -1 */
function slotIndex(html, slot) {
  return maskedOutsideBlocks(html).indexOf(slot);
}

/** 把 <style>/<script> 块掩成等长空白（下标不变），供「只认正文里的标记」使用 */
function maskedOutsideBlocks(html) {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (m) => ' '.repeat(m.length))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) => ' '.repeat(m.length));
}

/** 替换槽位：只换非 style/script 区的第一个。返回 { html, ok, count } */
function replaceSlot(html, slot, replacement) {
  const masked = maskedOutsideBlocks(html);
  const first = masked.indexOf(slot);
  if (first < 0) return { html, ok: false, count: 0 };
  let count = 0;
  for (let i = masked.indexOf(slot); i >= 0; i = masked.indexOf(slot, i + slot.length)) count++;
  return {
    html: html.slice(0, first) + replacement + html.slice(first + slot.length),
    ok: true,
    count,
  };
}

/** 替换槽位并提示重复（重复 = 作者把示范性引用写到了正文里，只用第一处） */
function putSlot(html, slot, replacement, label) {
  const r = replaceSlot(html, slot, replacement);
  if (r.count > 1) {
    console.log('· 布局正文里有 ' + r.count + ' 处 ' + slot + '，' + label + '只填第一处，其余原样保留');
  }
  return r.html;
}

/* ---------- CSS 扫描基元 ----------
 * 引擎里有三处需要数花括号：splitRules（切规则）、scopeCss（切规则头/体）。
 * 它们**必须共用同一套基元**——各写各的，就会出现「修了一处、漏了另一处」，
 * 而症状是产物里混进注释碎片，没有任何校验项会报。
 *
 * 共同前提：注释与字符串里的花括号不算层级。
 * 模板的块注释里直接引用代码取证是常规写法，例如
 *   `individualStrokeWeights = {top:0,right:0,bottom:1,left:0}`
 * 为迁就解析器而禁掉这种注释，是把成本转嫁给模板作者，方向反了。
 */

/** i 处若是注释/字符串，返回跳过整段后的下标；否则原样返回 i */
function skipInert(css, i) {
  if (css[i] === '/' && css[i + 1] === '*') {
    const end = css.indexOf('*/', i + 2);
    return end < 0 ? css.length : end + 2;
  }
  if (css[i] === '"' || css[i] === "'") {
    let j = i + 1;
    while (j < css.length && css[j] !== css[i]) { if (css[j] === '\\') j++; j++; }
    return Math.min(j + 1, css.length);
  }
  return i;
}

/** i 之后第一个「有效」`{` 的下标；遇到有效 `}` 或到末尾则返回 -1 */
function nextBrace(css, i) {
  while (i < css.length) {
    const n = skipInert(css, i);
    if (n !== i) { i = n; continue; }
    if (css[i] === '{') return i;
    if (css[i] === '}') return -1;
    i++;
  }
  return -1;
}

/** open 处 `{` 的配对 `}` 下标（不含）；不配对则返回 -1 */
function matchBrace(css, open) {
  let depth = 0;
  let i = open;
  while (i < css.length) {
    const n = skipInert(css, i);
    if (n !== i) { i = n; continue; }
    if (css[i] === '{') depth++;
    else if (css[i] === '}') { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}

/**
 * 顶层 CSS 规则切分（@media 作为一整条返回，内部由 scopeCss 递归）。
 *
 * ⚠ 实测事故（2026-09-17，ZJPT 包）：旧实现逐字符数花括号、不跳过注释，
 *   而 modal 模板的 CSS 头注释里写着描边证据（两个 individualStrokeWeights
 *   对象），注释里的 `{` `}` 把层级计数带偏，一段注释尾巴被切成「规则」；
 *   该碎片的「选择器」里恰好含 needles，rulesContaining() 把它留了下来，
 *   scopeCss() 又给它加了遮罩前缀，最终产物里出现
 *   `.x-modal-mask `。不是四边框。` —— 而 E1–E5 / W1 全绿。
 */
function splitRules(css) {
  const rules = [];
  let i = 0;
  while (i < css.length) {
    const brace = nextBrace(css, i);
    if (brace < 0) break;
    const end = matchBrace(css, brace);
    if (end < 0) break;
    rules.push(css.slice(i, end + 1).trim());
    i = end + 1;
  }
  return rules;
}

const SKIP_SELECTOR = /^(\*|html|body|html\s*,\s*body|html,body)$/i;

/** 剥离 CSS 注释 */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * 取规则的选择器：先剥注释，再取 { 之前。
 * ⚠ 模板 CSS 习惯在规则前写块注释，直接 split('{')[0] 会得到
 *   "/* ===== 按钮 ===== *\/ \n .gf-btn"，注释成了选择器的一部分，
 *   精确去重（hostHasSelector）就永远匹配不上，样式被反复注入。
 *
 * ⚠ 必须先 stripComments 再 split：规则前的注释里若含花括号
 *   （`/* 证据 = {top:0} *\/`），先 split 会在注释内部断开，
 *   注释前缀就留在「选择器」里了。顺序反过来才对。
 */
function selectorOf(rule) {
  return stripComments(rule).split('{')[0].trim();
}

/** 取内容模板的样式，剔除会与布局层打架的全局选择器 */
function portableCss(css) {
  return splitRules(css)
    .filter((r) => {
      const sel = selectorOf(r);
      return sel && !SKIP_SELECTOR.test(sel);
    })
    .join('\n    ');
}

/** 选中包含指定子串的规则（用于抽取多标签栏样式） */
function rulesContaining(css, needles) {
  return splitRules(css)
    .filter((r) => needles.some((n) => selectorOf(r).includes(n)))
    .join('\n    ');
}

/** 按 <div>…</div> 深度配对，从 startIdx 起切出一个完整块 */
function extractDivBlock(html, startIdx) {
  const re = /<div\b[^>]*>|<\/div>/gi;
  re.lastIndex = startIdx;
  let depth = 0, m, end = -1;
  while ((m = re.exec(html)) !== null) {
    if (m[0].toLowerCase() === '</div>') {
      depth--;
      if (depth === 0) { end = m.index + m[0].length; break; }
    } else { depth++; }
  }
  return end < 0 ? null : html.slice(startIdx, end);
}

/** 取模板中的浮层块（遮罩 + 浮层容器）；可指定档位 class，未命中则回落第一个 */
function overlayBlock(html, maskClass, sizeClass) {
  const re = new RegExp('<div\\b[^>]*class="[^"]*' + maskClass + '[^"]*"[^>]*>', 'gi');
  const hits = [...html.matchAll(re)];
  if (!hits.length) return null;
  const blocks = hits.map((m) => extractDivBlock(html, m.index)).filter(Boolean);
  if (!sizeClass) return blocks[0];
  return blocks.find((b) => b.includes(sizeClass)) || blocks[0];
}

/**
 * 给选择器加作用域前缀（根容器自身及其变体不加）。
 * 浮层模板与布局模板的按钮语义相反，浮层样式必须锁在遮罩内，
 * 否则后注入的规则会覆盖宿主页面的组件样式。
 */
function scopeSelector(sel, scope) {
  if (!sel) return sel;
  if (sel === scope || sel.startsWith(scope + '[') || sel.startsWith(scope + '.') || sel.startsWith(scope + ' ')) return sel;
  return scope + ' ' + sel;
}

/**
 * 整段 CSS 加作用域。@media / @supports 递归处理内部，
 * @keyframes / @font-face 等原样保留（动画名必须保持全局）。
 *
 * ⚠ 切「规则头 / 规则体」必须走 nextBrace / matchBrace，不能用
 *   `css.indexOf('{', i)` + 裸计数——规则前的注释里含花括号时
 *   （`/* 证据 = {top:0} *\/`），indexOf 会在注释内部断开，
 *   注释前缀被当成选择器，scopeSelector 再给它加上遮罩前缀，
 *   产物里就出现 `.x-modal-mask `。不是四边框。` 这种碎片。
 */
function scopeCss(css, scope) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const brace = nextBrace(css, i);
    if (brace < 0) { out += css.slice(i).replace(/\s+$/, '\n'); break; }
    const head = stripComments(css.slice(i, brace)).trim();
    const end = matchBrace(css, brace);
    if (end < 0) { out += css.slice(i).replace(/\s+$/, '\n'); break; }
    const body = css.slice(brace + 1, end);
    if (/^@(media|supports)\b/i.test(head)) {
      out += head + ' {\n' + scopeCss(body, scope) + '}\n';
    } else if (head.startsWith('@')) {
      out += head + ' {' + body + '}\n';
    } else if (head) {
      const sel = head.split(',').map((s) => scopeSelector(s.trim(), scope)).join(', ');
      out += sel + ' {\n' + body.replace(/^\s+|\s+$/g, '') + '\n}\n';
    }
    i = end + 1;
  }
  return out;
}

/** 宿主 CSS 是否已定义该选择器（精确匹配，避免 .gf-btn 命中 .gf-btn__icon） */
function hostHasSelector(hostCss, sel) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[,{])\\s*' + esc + '\\s*([,{])', 'm').test(hostCss);
}

/** 只保留宿主没有的规则，避免注入后反过来覆盖宿主页面已有样式 */
function onlyMissingRules(css, hostCss) {
  return splitRules(css)
    .filter((r) => {
      const sel = selectorOf(r);
      if (!sel || SKIP_SELECTOR.test(sel)) return false;
      return !sel.split(',').map((s) => s.trim()).filter(Boolean)
        .some((s) => hostHasSelector(hostCss, s));
    })
    .join('\n    ');
}

/** 取 `:root { … }` 里的 变量名 → 值 */
function rootVarMap(css) {
  const body = css.match(/:root\s*\{([\s\S]*?)\}/)?.[1] || '';
  const m = new Map();
  for (const v of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) m.set(v[1], v[2].trim());
  return m;
}

/** 取 `html[data-theme='light'] { … }` 里的 变量名 → 值 */
function lightVarMap(css) {
  const body = css.match(/html\[data-theme\s*=\s*['"]?light['"]?\]\s*\{([^{}]*)\}/i)?.[1] || '';
  const m = new Map();
  for (const v of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) m.set(v[1], v[2].trim());
  return m;
}

/** 合并 `:root` 与亮色覆盖：只补布局层没有的
 *
 *  ★ 亮色块必须**跟着 `:root` 一起合并**。
 *    只合并 `:root` 的后果：内容模板带进来的 Token 在亮色下**静默沿用暗色取值**
 *    —— 页面看着「能切主题」，实际一半元素还是暗的。
 *    `new-page.js` 末尾的 Token 校验会报「亮色覆盖不全 [E6]」，
 *    但症状极易被误读成「校验器太严」，真因是生成器漏合并。
 *
 *    两个参数是**一对**：`contentRootCss` 与 `contentLightCss` 同进同出，
 *    不要只传一个。 */
function mergeRootVars(layoutStyle, contentRootCss, contentLightCss) {
  let out = layoutStyle;
  if (contentRootCss) {
    const defined = new Set(rootVarMap(out).keys());
    const add = [...contentRootCss.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)]
      .filter((m) => !defined.has(m[1]))
      .map((m) => `      ${m[1]}: ${m[2].trim()};`);
    if (add.length) {
      const inject = '\n      /* ---- 由内容区模板合并 ---- */\n' + add.join('\n');
      out = out.replace(/(:root\s*\{[\s\S]*?)(\n\s*\})/, `$1${inject}$2`);
    }
  }
  if (contentLightCss) {
    const have = lightVarMap(out);
    const add = [...contentLightCss.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)]
      .filter((m) => !have.has(m[1]))
      .map((m) => m[1] + ': ' + m[2].trim() + ';');
    if (add.length) {
      if (have.size) {
        out = out.replace(
          /(^[ \t]*)(html\[data-theme\s*=\s*['"]?light['"]?\]\s*\{)([^{}]*)(\n[ \t]*\})/im,
          (s, ind, open, body, close) => ind + open + body.replace(/[ \t]+$/, '')
            + '\n      /* ---- 由内容区模板合并 ---- */\n'
            + add.map((l) => '    ' + l).join('\n') + close,
        );
      } else {
        /* 布局层压根没有亮色块（旧模板）→ 在 `:root` 之后新建一个 */
        const block = "  html[data-theme='light'] {\n" + add.map((l) => '    ' + l).join('\n') + '\n  }\n';
        out = out.replace(/(:root\s*\{[\s\S]*?\}[ \t]*\n)/, `$1\n${block}`);
      }
    }
  }
  return out;
}

/* ---------- 生成 ---------- */
const content = parts(read(CONTENT_TPL[TYPE]));

let output;
let injectedContent = '';   /* 插进 @content-slot 的那段，供「演示入口」条定位 */
const used = [CONTENT_TPL[TYPE]];
let layoutFile = '';

if (IS_STANDALONE || LAYOUT_NONE) {
  /* 登录页 / 浮层页是独立全屏页；--layout=none 表示只产出内容区 */
  output = content.html;
} else {
  layoutFile = LAYOUTS.find((l) => l.key === layoutKey).file;
  const layoutRaw = read(layoutFile);
  const layoutParts = parts(layoutRaw);
  used.unshift(layoutFile);

  /* 必填校验也要走 slotIndex：用 includes 会被 <style> 里的示范性引用骗过 */
  if (slotIndex(layoutRaw, CONTENT_SLOT) < 0) {
    console.error('✗ 布局模板缺少内容插入点：' + layoutFile);
    console.error('  布局模板必须包含 ' + CONTENT_SLOT + '，业务内容会插到这里。');
    console.error('  可选 ' + TABS_SLOT + ' / ' + TITLE_SLOT + '。契约见 scripts/layout/_skeleton.html。');
    console.error('  ⚠ 插入点要写在 body 里；写在 <style>/<script> 注释里的只算示范性引用，不认。');
    process.exit(1);
  }

  output = layoutRaw;

  /* 1) 合并 :root 变量（内容模板 / 多标签栏用到、布局没有的补上）
   *    多标签栏也要并进来：它自带一批 --tab-* / --shadow-subtle 之类的 Token，
   *    布局不一定声明过。不并 = 这些 var() 引用落空，页面渲染成未定义值、
   *    校验器报 [E3]。以前布局模板恰好把它们都声明了，所以没暴露；
   *    布局改为按本系统设计稿沉淀后，这个前提不再成立。 */
  let extraRootCss = content.rootCss;
  /* 亮色覆盖块与 :root 成对合并，缺一个就会在亮色下静默沿用暗色 */
  let extraLightCss = content.lightCss;
  let navParts = null;
  let navTplFile = '';
  if (WITH_TABS && slotIndex(output, TABS_SLOT) >= 0) {
    /* 多标签栏模板同样按目录发现，不写死路径 */
    navTplFile = TEMPLATES[TABS_DIR][0].file;
    navParts = parts(read(navTplFile));
    used.push(navTplFile);
    extraRootCss += '\n' + navParts.rootCss;
    extraLightCss += '\n' + navParts.lightCss;
  }
  if (layoutParts.style) {
    output = output.replace(layoutParts.style, mergeRootVars(layoutParts.style, extraRootCss, extraLightCss));
  }

  /* 2) 内容区样式（插到 </style> 前） */
  const cssToInject = portableCss(content.bodyCss);
  output = output.replace(/(\s*)<\/style>/i,
    `\n\n    /* ============ 内容区样式（来自 ${CONTENT_TPL[TYPE]}） ============ */\n    ${cssToInject}\n  </style>`);

  /* 3) 多标签栏：布局留了 @tabs-slot 才注入。
   *    没留 = 这套外壳本来就没有多标签栏，不要硬塞一个进去。 */
  if (WITH_TABS) {
    if (navParts) {
      const navCss = portableCss(navParts.bodyCss);
      if (navCss.trim()) {
        output = output.replace(/(\s*)<\/style>/i,
          `\n\n    /* ============ 多标签栏样式（来自 ${navTplFile}） ============ */\n    ${navCss}\n  </style>`);
      }
      output = putSlot(output, TABS_SLOT, navParts.bodyInner, '多标签栏');
    } else {
      console.log('· 本布局没有 ' + TABS_SLOT + '，--tabs 忽略（这套外壳不含多标签栏）');
    }
  } else {
    output = putSlot(output, TABS_SLOT, '', '多标签栏（清空）');
  }

  /* 4) 业务内容插进 @content-slot */
  injectedContent = content.bodyInner.replace(/\n/g, '\n      ');
  output = putSlot(output, CONTENT_SLOT, injectedContent, '业务内容');

  /* 5) 页面标题插进 @page-title（布局没留该标记时只改 <title>） */
  if (slotIndex(output, TITLE_SLOT) >= 0) output = putSlot(output, TITLE_SLOT, NAME, '页面标题');

  /* 6) 内容区脚本（独立 IIFE，避免与布局脚本互相污染） */
  if (content.scripts.length) {
    const js = content.scripts.join('\n\n');
    output = output.replace(/(\s*)<\/body>/i, `\n  <script>\n${js}\n  </script>\n</body>`);
  }
}

/* ---------- 浮层骨架（--overlay）---------- */
/* 挂到页面 body 末尾：CSS 去重注入 + HTML 结构 + 通用开关脚本 */
const overlayInfo = [];
if (OVERLAYS.length && !IS_OVERLAY_TYPE) {
  OVERLAYS.forEach(({ kind, size }) => {
    const cfg = OVERLAY_TPL[kind];
    const spec = OVERLAY_SIZE[kind];
    const tpl = parts(read(cfg.file));
    used.push(cfg.file);
    const label = cfg.label;
    const sizeCls = spec.cls[size];

    /* 1) 样式：先按档位取规则，再整段锁进遮罩作用域，最后剔除宿主已有的。
     *    作用域是硬要求——浮层与布局的按钮语义相反，不隔离会污染宿主页面。
     *    模板自带的演示区样式已在 parts() 里按 @transient 标记剔除。 */
    const picked = rulesContaining(tpl.bodyCss, cfg.needles);
    /* cfg.mask 是 class 名（用于匹配 HTML），做 CSS 选择器要补上点号 */
    const scoped = scopeCss(picked, '.' + cfg.mask);
    const css = onlyMissingRules(scoped, output);
    if (css.trim()) {
      output = output.replace(/(\s*)<\/style>/i,
        `\n\n    /* ============ ${label}骨架（${spec.label[size]}，来自 ${cfg.file}） ============ */\n` +
        `    /* 已加 .${cfg.mask} 作用域：只作用于浮层内部，不污染本页面组件 */\n    ${css}\n  </style>`);
    }

    /* 2) :root 变量补齐（亮色覆盖块同步补齐） */
    output = mergeRootVars(output, tpl.rootCss, tpl.lightCss);

    /* 3) 结构：按档位取浮层块，挂到 body 末尾（演示区同样剔除） */
    const rawBlock = overlayBlock(tpl.html, cfg.mask, sizeCls);
    if (!rawBlock) throw new Error('浮层模板未找到遮罩块：' + cfg.file);
    const block = stripTransient(rawBlock);
    if (sizeCls && !block.includes(sizeCls)) {
      console.log(`· 未找到 ${label}档位 ${size}（${sizeCls}），已回落为模板首档`);
    }
    /* 标题不用在这里替换：模板里写 @@页面标题@@，最后由 fillText 统一填 */

    const idM = block.match(/\bid="([^"]+)"/);
    output = output.replace(/(\s*)<\/body>/i,
      `\n\n  <!-- ============ ${label}骨架（${spec.label[size]}）：业务替换点 ============ -->\n  ${block}\n</body>`);

    /* 4) 开关脚本：模板里是通用实现（关闭图标/取消/点遮罩/Esc），直接复用 */
    if (tpl.scripts.length) {
      output = output.replace(/(\s*)<\/body>/i, `\n  <script>\n${tpl.scripts.join('\n\n')}\n  </script>\n</body>`);
    }

    overlayInfo.push({ kind, label, size, sizeText: spec.label[size], id: idM ? idM[1] : '(未命名)', attr: cfg.openAttr });
  });
}

/* ---------- 演示入口触发条 ---------- */
/* 浮层默认 hidden，没有触发器就等于交付了一个看不见的骨架。
 * 入口条插在内容区开头，接入业务后整块删除（--no-trigger 可关闭）。
 * 按钮用自己的 .gf-overlay-demo__btn，不用宿主按钮类名——
 * 生成器不知道本包按钮类名叫什么，用了就是硬编码某个系统的知识。 */
if (overlayInfo.length && opts.trigger !== 'false' && !opts['no-trigger']) {
  const btns = overlayInfo.map((o) => `      <button type="button" class="gf-overlay-demo__btn" ${o.attr}="${o.id}">打开${o.label}（${o.sizeText}）</button>`).join('\n');
  /* data-collect-ignore：整块不参与「线上采集」。
   * 采集器读的是 computed style，本条的 em 相对单位会被算成 7px / 11.9px 这类值，
   * 混进间距与圆角候选，还会压低网格覆盖率——它是人造临时件，不是本系统的设计取值。
   * @transient 标记：整块不参与 check-tokens.js 的 [E1]–[E5] / [W1] / [I1] 判定。
   * 两个标记都要打：只打 data-collect-ignore 等于只堵了采集这一侧，
   * 校验器仍会拿这段「马上要删掉的样式」去判本包的正式约定。 */
  const bar =
    '\n      <!-- @transient-start 演示入口：接入业务后删除本块 -->\n' +
    '      <div class="gf-overlay-demo" data-collect-ignore>\n' +
    '        <span class="gf-overlay-demo__label">演示入口</span>\n' + btns + '\n' +
    '      </div>\n' +
    '      <!-- @transient-end -->\n';
  /* 优先插在内容区开头（内容区由 @content-slot 决定，与布局类名无关） */
  if (injectedContent && output.includes(injectedContent)) {
    output = output.replace(injectedContent, bar + injectedContent);
  } else {
    output = output.replace(/(<body[^>]*>)/i, `$1${bar}`);
  }
  /* ⚠ 演示入口条是生成器自带的临时件，**刻意不引用本系统任何 Token，也不用宿主按钮类名**。
   *   生成器不知道本包有哪些 Token、按钮类名叫什么——引用了就是硬编码某个系统的知识，
   *   在新包里会直接变成 [E3] 未定义引用（曾经写死 --space-3 / --color-border-strong /
   *   --radius-card / --font-size-body-sm / --color-text-tertiary，建包后必然报 5 个 E3）。
   *   这里只用相对单位 + currentColor，做到零 Token、零色值、零宿主类名依赖。 */
  const demoCss =
    '\n\n    /* @transient-start 演示入口条（接入业务后随 HTML 块一并删除） */\n' +
    '    /* 临时件，不引用本系统 Token——接入业务后整块删除，不要把它当组件样式参考。\n' +
    '     * 同时打了 data-collect-ignore 与 @transient：前者让采集器跳过、\n' +
    '     * 后者让 check-tokens.js 不拿它判本包的正式约定。 */\n' +
    '    .gf-overlay-demo {\n' +
    '      display: flex; align-items: center; gap: 0.5em; flex-wrap: wrap;\n' +
    '      margin-bottom: 1em; padding: 0.5em 0.75em;\n' +
    '      border: 1px dashed currentColor; border-radius: 0.5em; opacity: 0.75;\n' +
    '    }\n' +
    '    .gf-overlay-demo__label { font-size: 0.85em; }\n' +
    '    .gf-overlay-demo__btn {\n' +
    '      font: inherit; padding: 0.25em 0.75em; cursor: pointer;\n' +
    '      border: 1px solid currentColor; border-radius: 0.375em;\n' +
    '      background: transparent; color: inherit;\n' +
    '    }\n' +
    '    /* @transient-end */';
  output = output.replace(/(\s*)<\/style>/i, `${demoCss}\n  </style>`);
}

/* ---------- 文案替换 ---------- */
/* 模板里要填的地方写占位符，生成器不认识任何具体系统的类名：
 *   @@页面标题@@  → --name
 *   @@系统名@@    → --system，否则本包契约的 system（两处都没有则保留占位符 + 警告）
 * 布局内的文案（系统名 / 页头标题）由布局自己用 @page-title 等标记承接，
 * 生成器不碰布局的类名。
 * ⚠ 只在 HTML 注释之外替换：模板作者常把占位符写进注释当说明
 *   （「这里也可以写 @@页面标题@@」），一起替换会把说明文字改成页面名，
 *   读起来像 bug。按注释边界切成「注释段 / 非注释段」交替处理。
 * 已知良性副作用：**CSS 块注释**不在这个边界内，写在 <style> 注释里的
 *   说明文字仍会被替换（注释文案被改成系统名，不影响渲染）。
 *   不做成惰性段是权衡的结果——CSS 注释的 `/*` `*\/` 与 <script> 里的
 *   正则字面量会长得像，粗暴配对会把正文成段吞掉、静默漏替换真占位符，
 *   那个代价比「注释文案被改写」大得多。 */
const SYSTEM_FILL = SYSTEM || '@@系统名@@';
const fillPlaceholders = (html) => html
  .split(/(<!--[\s\S]*?-->)/)
  .map((seg, i) => (i % 2 === 1
    ? seg
    : seg.replace(/@@页面标题@@/g, NAME).replace(/@@系统名@@/g, SYSTEM_FILL)))
  .join('');
output = fillPlaceholders(output);
/* 标题分隔符跟着系统名走：没有系统名时不能留下「名字 - 」这样的尾巴 */
output = output.replace(/<title>[\s\S]*?<\/title>/i,
  `<title>${NAME}${SYSTEM ? ' - ' + SYSTEM : ''}</title>`);

/* ---------- 清理设计工具残留 ---------- */
/* 模板源自设计稿导出，带 data-page-node-id（校验器已豁免，但业务页无需保留） */
output = output.replace(/\s+data-page-node-id="[^"]*"/g, '');

/* ---------- 写盘 ---------- */
const outPath = path.resolve(process.cwd(), OUT);
if (fs.existsSync(outPath) && fs.statSync(outPath).isDirectory()) {
  console.error('✗ --out 指向的是目录，请带上文件名，例如：--out=design-specs/examples/交易申报记录.html');
  process.exit(1);
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, output);

const replacePoints = (output.match(/业务替换点/g) || []).length;
console.log('===== 页面生成完成 =====\n');
console.log('输出文件　　：' + path.relative(process.cwd(), outPath));
const layoutLabel = IS_STANDALONE ? '独立全屏页'
  : LAYOUT_NONE ? '仅内容区（--layout=none）'
  : layoutKey + (WITH_TABS ? '　多标签：是' : '');
console.log('页面类型　　：' + TYPE + '　布局：' + layoutLabel);
console.log('拼装模板　　：' + used.join(' + '));
if (overlayInfo.length) {
  console.log('附带浮层　　：' + overlayInfo.map((o) => `${o.label} #${o.id}（${o.sizeText}）`).join('、'));
  overlayInfo.forEach((o) => {
    console.log(`  · 打开方式：任意按钮加 ${o.attr}="${o.id}"`);
  });
  if (opts.trigger !== 'false' && !opts['no-trigger']) {
    console.log('  · 已注入「演示入口」条，接入业务后搜索「演示入口」整块删除（--no-trigger 可关闭）');
  }
}
if (IS_OVERLAY_TYPE) {
  /* 独立浮层页没有「演示入口」条，触发按钮不存在——直接认遮罩元素自己的 id。
   * 匹配式由 contract.json 的 mask / openAttr 派生，不写死具体浮层类别。 */
  const ids = [];
  const tagRe = /<[a-zA-Z][^>]*>/g;
  let tm;
  while ((tm = tagRe.exec(output))) {
    const tag = tm[0];
    const cm = /\bclass="([^"]*)"/.exec(tag);
    if (!cm) continue;
    if (!cm[1].split(/\s+/).some((c) => MASK_CLASSES.includes(c))) continue;
    const im = /\bid="([^"]+)"/.exec(tag);
    if (im) ids.push(im[1]);
  }
  if (!ids.length && OPEN_ATTRS.length) {
    const openRe = new RegExp(
      '(?:' + OPEN_ATTRS.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')="([^"]+)"', 'g');
    let om;
    while ((om = openRe.exec(output))) ids.push(om[1]);
  }
  console.log('浮层遮罩 ID ：' + ([...new Set(ids)].join('、') || '(未找到)'));
}
console.log('文件规模　　：' + output.split('\n').length + ' 行');
console.log('业务替换点　：' + replacePoints + ' 处（全局搜索「业务替换点」逐项替换）');
/* 系统名没着落时明确报警：产物里会留着 @@系统名@@，一眼能看见。
 * 不报的话使用者只会看到一页「品牌文案是占位符」的页面，不知道该怎么办。 */
if (!SYSTEM && output.includes('@@系统名@@')) {
  console.log('');
  console.log('⚠ 未确定系统名：本包 templates/contract.json 没有声明 system，也没传 --system。');
  console.log('  产物里的 @@系统名@@ 原样保留了。二选一：');
  console.log('    · 在 templates/contract.json 里加 "system": "<本系统名>"（推荐，一次配好）');
  console.log('    · 或生成时传 --system=<本系统名>');
}

/* ---------- 自动校验 ---------- */
if (DO_CHECK) {
  /* 校验范围 = 规范包 design-specs，而不是工作区根：
   * 工作区根下若并存其他包（如 design-system-factory 的引擎副本），
   * 其旧框架 Token 会被当成「本包未收编」误报 [W1]。 */
  const specRoot = path.resolve(SCRIPTS_DIR, '..');
  const targets = [{ label: '规范包', path: specRoot }];
  /* 产物落在包外时（--out=/tmp/x.html）目录扫描覆盖不到，单独校验一次 */
  if (!outPath.startsWith(specRoot + path.sep)) targets.push({ label: '输出文件', path: outPath });

  let failed = false;
  console.log('\n---- Token 校验 ----');
  for (const t of targets) {
    const res = spawnSync(process.execPath, [path.join(SCRIPTS_DIR, 'check-tokens.js'), t.path, '--strict', '--quiet'], { encoding: 'utf8' });
    /* ★ 按**形状**筛（`[E数字]` / `[W数字]`），不要手列项名。
     *   手列会在加了新检查之后静默漏掉它。实测踩到：这里原来只列了 E1/E2/E3/W1，
     *   于是「[E6] 亮色覆盖不全」报红时，生成器的输出只剩一句「校验未通过」，
     *   而四个计数**全是 0** —— 自相矛盾。读的人只会怀疑校验器太严，
     *   不会想到去翻 E6（它压根没被打印出来）。 */
    const tail = (res.stdout || '').split('\n')
      .filter((l) => /\[E\d+\]|\[W\d+\]|全部通过/.test(l));
    console.log('· ' + t.label + '：' + (tail.join(' ｜ ') || (res.stderr || '').trim() || '(无输出)'));
    if (res.status !== 0) failed = true;
  }
  if (failed) {
    console.log('\n⚠ 校验未通过，请按上方提示修正后再交付。');
    process.exit(1);
  }
}
console.log('\n下一步：替换业务字段与数据 → 跑一遍自测验收清单（scripts/README.md §4）');
