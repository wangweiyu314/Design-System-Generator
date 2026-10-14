#!/usr/bin/env node
/**
 * 设计系统技能包建包器 v1.2
 * ------------------------------------------------------------
 * 把 assets/engine 下的「引擎」（脚本 + 模板契约骨架）复制成一个新技能包，
 * 并完成三件容易出错的事：
 *   1. CSS 类名前缀替换（gf- → 新前缀）——全库统一，漏一处就会样式失效
 *   2. 系统名参数化（脚本里的默认系统名、文档里的品牌词）
 *   3. 生成规范文档骨架（tokens.md / design-sync.md / conventions.json / SKILL.md / 各目录说明），
 *      可用 --from-mining 拿挖掘草稿预填 tokens.md
 *
 * 引擎**不预置布局，也不预置内容区模板**：
 *   scripts/layout/    只放契约骨架 _skeleton.html 与说明
 *   scripts/templates/ 只放契约骨架 _skeleton.html、contract.json 与说明
 * 本系统的页面外壳与内容区结构都必须按设计稿 / 线上采集沉淀。
 * 模板不只是结构，它还带着一整套取值阶梯（间距档 / 色板 / 圆角档）——
 * 从别的系统搬过来，本系统的规范里会凭空多出几十个看起来很像正经条目的「待填」。
 *
 * 用法：
 *   node init-package.js --name=<系统名> --prefix=<类名前缀> [--out=<目录>] [--force]
 *                        [--from-mining=<tokens.draft.md>] [--no-engine]
 *
 *   --name            系统中文名，写入文档与生成器默认系统名，必填
 *   --prefix          CSS 类名前缀，小写字母/数字/连字符，如 acme。必填
 *   --out             输出目录，默认 ./<prefix>-design-specs
 *   --force           目标目录非空时仍继续（会覆盖同名文件）
 *   --from-mining     挖掘草稿（mine-tokens.js --emit-tokens 的产物），用来预填 tokens.md。
 *                     草稿取值是**候选**，仍需人工确认。不写则 tokens.md 只生成空表头。
 *   --seed-templates  把一个已有目录下的模板带进 scripts/templates/。
 *                     用于迁移旧包 / 给已有实现补规范；默认会对它们做取值中性化。
 *   --keep-values     配合 --seed-templates：不做取值中性化，保留模板 :root 现值。
 *                     仅当模板**本来就是这个系统的**才用；从别的系统派生时用它 =
 *                     把别人的取值固化成本系统的规范。
 *   --no-engine       只建文档骨架，不复制引擎（用于已有实现、只想补规范的场景）
 *
 * 建包后还要人做的事（脚本做不了）：
 *   - 用 mine-tokens.js 从线上采集 + 设计稿导出里挖取值，填进 foundation/tokens.md
 *   - 按采集到的外壳指纹沉淀 scripts/layout/ 下的布局（引擎不预置）
 *   - 按实际页面类型沉淀 scripts/templates/<类别>/ 下的内容区模板（引擎不预置）
 *   - 把 tokens.md 定稿的取值回灌到 scripts/ 各模板的 :root
 *   - 按实际页面类型生成 components/ pages/ 文档与 examples/ 标杆页
 *   - 裁决本系统的结构级约定，写进 foundation/conventions.json
 *   - 跑 check-tokens.js --strict 直到退出码 0
 *
 * 退出码：0 成功；1 参数错误或目标目录冲突
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

const NAME = String(opts.name || '').trim();
const PREFIX = String(opts.prefix || '').trim().toLowerCase();
const FORCE = !!opts.force;
const WITH_ENGINE = !opts['no-engine'];
const KEEP_VALUES = !!opts['keep-values'];
const FROM_MINING = typeof opts['from-mining'] === 'string' ? opts['from-mining'] : '';
const SEED_TEMPLATES = typeof opts['seed-templates'] === 'string' ? opts['seed-templates'] : '';

if (!NAME || !PREFIX) {
  console.error('✗ 必填参数缺失。用法：');
  console.error('  node init-package.js --name=<系统名> --prefix=<类名前缀> [--out=<目录>]');
  process.exit(1);
}
if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(PREFIX)) {
  console.error('✗ --prefix 只能是小写字母开头、含数字与单个连字符的形式，例如：acme / tx-bank');
  console.error('  收到：' + PREFIX);
  process.exit(1);
}

const OUT = path.resolve(opts.out || path.join(process.cwd(), PREFIX + '-design-specs'));
const PKG = path.basename(OUT);
const FACTORY = path.resolve(__dirname, '..');

if (fs.existsSync(OUT) && fs.readdirSync(OUT).filter((f) => f !== '.DS_Store').length && !FORCE) {
  console.error('✗ 目标目录已存在且非空：' + OUT);
  console.error('  确需覆盖请加 --force，或换一个 --out');
  process.exit(1);
}

if (FROM_MINING && !fs.existsSync(path.resolve(FROM_MINING))) {
  console.error('✗ --from-mining 指向的文件不存在：' + FROM_MINING);
  console.error('  它是 mine-tokens.js --emit-tokens=<path> 的产物。');
  process.exit(1);
}
if (SEED_TEMPLATES && !fs.existsSync(path.resolve(SEED_TEMPLATES))) {
  console.error('✗ --seed-templates 指向的目录不存在：' + SEED_TEMPLATES);
  process.exit(1);
}

const DATE = new Date().toISOString().slice(0, 10);
const NODE = process.execPath;
const PREFIX_UP = PREFIX.replace(/-/g, '_').toUpperCase();

/* ---------- 文本替换规则（顺序敏感：长词在前） ---------- */
const RULES = [
  [/广发中后台系统/g, NAME],
  [/广发中后台/g, NAME],
  [/广发/g, NAME],
  [/GF_SKIP_TOKEN_CHECK/g, PREFIX_UP + '_SKIP_TOKEN_CHECK'],
  [/gf-/g, PREFIX + '-'],
  [/design-specs/g, PKG]
];

function apply(content) {
  return RULES.reduce((acc, [re, to]) => acc.replace(re, to), content);
}

const BINARY_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.zip'];

function copyDir(src, dst, stats) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) { copyDir(s, d, stats); continue; }
    const ext = path.extname(entry.name).toLowerCase();
    if (BINARY_EXT.includes(ext)) { fs.copyFileSync(s, d); stats.files++; continue; }
    const before = fs.readFileSync(s, 'utf8');
    const after = apply(before);
    fs.writeFileSync(d, after, 'utf8');
    stats.files++;
    if (before !== after) stats.replaced++;
  }
}

/* ================================================================
 * 取值中性化
 * ---------------------------------------------------------------
 * 引擎不再自带成品模板（只有契约骨架，骨架里没有取值），
 * 所以默认流程下这一段是空转——它的作用对象是 --seed-templates 带进来的模板。
 * 那些模板带着别的系统的真实取值，原样留下等于「结构抄了、数值也抄了」：
 * 页面看起来是对的，但每个数都不是本系统的。
 * 这里把 :root 的取值统一换成 `unset`，只保留 Token 名：
 *   · 页面渲染出来会明显不对（unset 不是合法色值），逼人回灌
 *   · check-tokens.js 的 [E5] 取值待填 会明确报数，退出码非 0
 *   · Token 名保留下来，tokens.md 可以直接预填，人只需填第二列
 * 取值的真值源始终是 foundation/tokens.md，模板只是它的落地。
 * --keep-values 是逃生口：模板本来就是这个系统的（已有实现补规范）时用它。
 * ================================================================ */

const ROOT_BLOCK_RE = /:root\s*\{([\s\S]*?)\}/g;
const VAR_DECL_RE = /(--[a-z0-9-]+)\s*:\s*([^;}]+)/gi;
const COMMENT_RE = /(\/\*[\s\S]*?\*\/)/;

/* 剥掉注释后逐条取声明：注释里出现的 `--x: y` 是说明文字，不是取值 */
function rootVarsOf(html) {
  const found = new Map();
  let block;
  ROOT_BLOCK_RE.lastIndex = 0;
  while ((block = ROOT_BLOCK_RE.exec(html)) !== null) {
    const body = block[1].replace(/\/\*[\s\S]*?\*\//g, '');
    let v;
    VAR_DECL_RE.lastIndex = 0;
    while ((v = VAR_DECL_RE.exec(body)) !== null) {
      const name = v[1];
      const value = v[2].trim();
      if (!found.has(name)) found.set(name, value);
    }
  }
  return found;
}

/* 把 :root 块的取值换成 unset；注释整段原样保留 */
function neutralizeRootValues(html) {
  return html.replace(ROOT_BLOCK_RE, (whole, body) => {
    const rebuilt = body
      .split(COMMENT_RE)
      .map((seg, i) => (i % 2 === 1
        ? seg
        /* 取值部分不含 `;`（正则止于分号前），所以这里不补分号，否则会出 `unset;;` */
        : seg.replace(VAR_DECL_RE, (m, name) => name + ': unset')))
      .join('');
    return ':root {' + rebuilt + '}';
  });
}

function walkHtml(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

/* ---------- 骨架填充 ---------- */
function render(tplRel, vars) {
  const p = path.join(FACTORY, 'assets', 'doc-skeletons', tplRel);
  if (!fs.existsSync(p)) throw new Error('骨架模板缺失：' + tplRel);
  let t = fs.readFileSync(p, 'utf8');
  for (const [k, v] of Object.entries(vars)) {
    t = t.split('{{' + k + '}}').join(v);
  }
  return t;
}

/* 注意：doc-skeletons 只跑 render()（替换 {{占位符}}），不跑 apply() 的 RULES。
 * 所以骨架里凡是需要按前缀变形的字面量（如紧急绕过的环境变量名），
 * 必须写成 {{PREFIX_UP}} 这类占位符，不能指望 RULES 去替换它。 */
/* ★ 刻意**不**把 SPEC_ROOT / WORKDIR / NODE 注进文档骨架。
 *   它们都是绝对路径，注进去等于让每个新包一出生就不可移植：
 *     ① 拷给同事后指向不存在的位置；
 *     ② 更糟的是——若那个路径上恰好还有一份旧副本，包内脚本会去校验**旧那份**，
 *        而输出一切正常（「假通过」比报错难查，见 references/04-pitfalls.md §3.15）。
 *   文档骨架改写成「本包所在目录（即本文件 SKILL.md 的上一级）」+「`which node`」，
 *   包内脚本一律 `path.join(__dirname, '..')` 自定位。
 *   `NODE` 只用于**控制台提示**（那里给出可复制的具体路径是有用的）。
 *   `[S26]` 守着这条：真跑一次建包，产物里不许出现绝对路径。 */
const BASE = {
  SYSTEM: NAME, PREFIX, PREFIX_UP, PACKAGE: PKG, DATE
};

/* ---------- tokens.md 预填 ----------
 * 预填来源按优先级取两路：
 *   1. --from-mining 的挖掘草稿 —— 取值来自**本系统**的采集 / 设计稿，首选
 *   2. --seed-templates 带进来的模板 :root —— 次选（默认已被中性化成 unset）
 * 两路都没有时只生成空表头 + 填写提示。这是**正常状态**：
 * 引擎不预置内容区模板，也就没有 Token 名可以预填。
 * 分组按 Token 名推断（bucketOf），分错不影响功能，只是不好看。 */
const TOKEN_SECTIONS = [
  ['## 颜色变量', 'color'],
  ['## 间距变量', 'space'],
  ['## 圆角变量', 'radius'],
  ['## 阴影变量', 'shadow'],
  ['## 字体变量', 'font'],
  ['## 布局与组件尺寸 Token', 'size'],
  ['## 过渡与层级 Token', 'misc']
];

function bucketOf(name) {
  const n = name.replace(/^--/, '');
  if (/color|shadow-color|fill|bg/.test(n)) return 'color';
  if (/font|line-height|letter-spacing/.test(n)) return 'font';
  if (/^(space|gap|padding|margin)/.test(n)) return 'space';
  if (/radius/.test(n)) return 'radius';
  if (/shadow/.test(n)) return 'shadow';
  if (/^(z-|duration|ease|transition|opacity|blur)/.test(n)) return 'misc';
  return 'size';
}

/* 解析 mine-tokens.js --emit-tokens 的草稿：`| --name | 值 | 用途 |`
 * ⚠ 名字里必须有字母：表格分隔行 `|-------|--------|------|` 也会满足
 *   `--[a-z0-9-]+`（全是连字符），不挡住就会解析出一个叫 `-------` 的 Token。 */
function parseMiningDraft(file) {
  const out = new Map();
  const text = fs.readFileSync(path.resolve(file), 'utf8');
  for (const line of text.split('\n')) {
    const m = /^\|\s*(--[a-z][a-z0-9-]*)\s*\|([^|]*)\|([^|]*)\|/i.exec(line.trim());
    if (!m) continue;
    const name = m[1].trim();
    if (out.has(name)) continue;
    out.set(name, { value: m[2].trim(), note: m[3].trim() });
  }
  return out;
}

const NOTE_FROM_TEMPLATE_KEEP = '模板现值（未中性化），请按设计稿确认';
const NOTE_FROM_TEMPLATE_NEUTRAL =
  '待填：按设计稿 / 线上实测取值，写进本表后再回灌模板 :root';
/* 空小节提示。注意：用途列不能出现「预留 / 色板 / 暂不使用 / 不适用 / 保留 / 废弃」，
 * 那几个词会被校验器判为「刻意不落地」，从而不计入 [I1] 未落地。 */
const EMPTY_SECTION_HINT =
  '> 本小节还没有 Token。取值唯一来源是设计稿 / 线上采集——'
  + '跑 `mine-tokens.js --emit-tokens` 生成草稿，建包时用 `--from-mining` 预填，或手工收编。';

function fillTokenTables(md, prefill) {
  const byBucket = new Map();
  for (const name of [...prefill.keys()].sort()) {
    const b = bucketOf(name);
    if (!byBucket.has(b)) byBucket.set(b, []);
    byBucket.get(b).push(name);
  }
  const out = [];
  let cur = null;
  for (const line of md.split('\n')) {
    const sec = TOKEN_SECTIONS.find(([title]) => line.trim() === title);
    if (sec) { cur = sec[1]; out.push(line); continue; }
    if (/^##\s/.test(line)) cur = null;
    if (cur && line.trim() === '|  |  |  |') {
      const list = byBucket.get(cur) || [];
      if (!list.length) { out.push(line); out.push(''); out.push(EMPTY_SECTION_HINT); continue; }
      list.forEach((n) => {
        const row = prefill.get(n) || {};
        /* 第二列写 `--` 而不是留空：校验器只跳过 `--`，留空会被当成「取值是空串」 */
        const value = row.value || '--';
        /* 用途列里的 `|` 会把表格切坏，一律降级成 `/` */
        const note = (row.note || NOTE_FROM_TEMPLATE_NEUTRAL).replace(/\|/g, '/');
        out.push('| ' + n + ' | ' + value + ' | ' + note + ' |');
      });
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

/* ---------- 执行 ---------- */
console.log('· 建包：' + OUT);
console.log('  系统名：' + NAME + '　类名前缀：' + PREFIX + '-');
if (FROM_MINING) console.log('  · tokens.md 预填来源：' + FROM_MINING);
if (SEED_TEMPLATES) console.log('  · 带入模板：' + SEED_TEMPLATES
  + (KEEP_VALUES ? '（保留现值）' : '（取值将中性化）'));

fs.mkdirSync(OUT, { recursive: true });
['foundation', 'components', 'pages', 'examples', 'scripts'].forEach((d) =>
  fs.mkdirSync(path.join(OUT, d), { recursive: true })
);

let stats = { files: 0, replaced: 0 };
if (WITH_ENGINE) {
  copyDir(path.join(FACTORY, 'assets', 'engine', 'scripts'), path.join(OUT, 'scripts'), stats);
  console.log('· 引擎复制完成：' + stats.files + ' 个文件，其中 ' + stats.replaced + ' 个做了前缀/系统名替换');
  console.log('  布局与内容区模板只复制了契约骨架（layout/_skeleton.html、templates/_skeleton.html）——');
  console.log('  引擎不预置成品，本系统的外壳与内容区结构要按设计稿 / 线上采集沉淀。');
}

/* --seed-templates：把一个已有目录下的模板带进 scripts/templates/
 * 只复制**子目录**——子目录名就是 --type 取值，那是模板的落位。
 * 顶层散落的 .html 没有类别归属，跳过并报出来，不猜。
 * 顶层基础设施文件（README.md / contract.json / _skeleton.html）也不复制：
 * 本包的契约说明与骨架以引擎那份为准，不能被来源目录覆盖掉。 */
if (SEED_TEMPLATES && WITH_ENGINE) {
  const src = path.resolve(SEED_TEMPLATES);
  const dest = path.join(OUT, 'scripts', 'templates');
  const cats = [];
  const loose = [];
  let copied = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    if (entry.isDirectory()) {
      const before = stats.files;
      copyDir(path.join(src, entry.name), path.join(dest, entry.name), stats);
      copied += stats.files - before;
      cats.push(entry.name);
    } else if (entry.name.endsWith('.html') && !entry.name.startsWith('_')) {
      loose.push(entry.name);
    }
  }
  console.log('· 已带入模板 ' + copied + ' 个文件 → scripts/templates/'
    + (cats.length ? '（类别：' + cats.join(' / ') + '）' : ''));
  console.log('  来源：' + src);
  console.log('  它们的结构没有经过本系统设计稿验证，逐类确认后再用。');
  if (loose.length) {
    console.log('  ⚠ 顶层这 ' + loose.length + ' 个 .html 没有类别归属，已跳过：' + loose.join(' / '));
    console.log('    请放进 scripts/templates/<类别>/ 再复制——目录名即 --type 取值。');
  }
  if (!cats.length && !loose.length) console.log('  ⚠ 来源目录里没有任何子目录，什么都没带进来。');
}

/* ---------- 取值中性化 + 收集模板里的 Token 名 ---------- */
/* templateTokens: name → Set(出现过的取值)，同时用于 tokens.md 预填与取值冲突报告 */
const templateTokens = new Map();
if (WITH_ENGINE) {
  const tplFiles = walkHtml(path.join(OUT, 'scripts'));
  let neutralized = 0;
  for (const f of tplFiles) {
    const raw = fs.readFileSync(f, 'utf8');
    const vars = rootVarsOf(raw);
    for (const [name, value] of vars) {
      if (!templateTokens.has(name)) templateTokens.set(name, new Set());
      templateTokens.get(name).add(value);
    }
    if (!KEEP_VALUES) {
      const next = neutralizeRootValues(raw);
      if (next !== raw) { fs.writeFileSync(f, next, 'utf8'); neutralized++; }
    }
  }
  const total = templateTokens.size;
  if (!total) {
    console.log('· 取值中性化：scripts/ 下只有契约骨架，没有取值需要中性化（预期状态）');
    console.log('  沉淀模板时把用到的取值先登记进 foundation/tokens.md，再回灌模板 :root。');
  } else if (KEEP_VALUES) {
    console.log('· 取值保留：' + tplFiles.length + ' 个模板、' + total + ' 个 Token 名（未中性化）');
  } else {
    console.log('· 取值中性化：' + neutralized + ' 个模板的 :root 取值已置为 unset，保留 ' + total + ' 个 Token 名');
    console.log('  回灌方式：填好 foundation/tokens.md 后，把取值写回各模板 :root，直到 [E5] 归零');
  }
  /* 跨模板同名校值不一致 = 已经存在的双源漂移，建包时就该看见。
   * 比对前先归一化空白 / 0px / 前导点小数，否则 `0 2px 8px rgba(0,0,0,.1)`
   * 与 `0px 2px 8px rgba(0, 0, 0, 0.1)` 会被当成两个不同的值，全是噪音。
   * 单位差异（200ms vs 0.2s）刻意**不**归一化——那往往是真的不一致。 */
  const normVal = (v) => v.replace(/\s+/g, ' ').trim().toLowerCase()
    .replace(/\s*,\s*/g, ',')
    .replace(/(^|[\s,(])0px\b/g, '$10')
    .replace(/(^|[\s,(])\.(\d)/g, '$10.$2');
  const conflicts = [...templateTokens]
    .map(([name, set]) => [name, new Set([...set].map(normVal)), set])
    .filter(([, normed]) => normed.size > 1);
  if (conflicts.length) {
    console.log('  ⚠ 以下 Token 在不同模板里取值不一致（' + conflicts.length + ' 个），建包前应先统一：');
    conflicts.slice(0, 8).forEach(([name, , raw]) =>
      console.log('      ' + name + ' → ' + [...raw].join(' / ')));
    if (conflicts.length > 8) console.log('      …另有 ' + (conflicts.length - 8) + ' 个');
  }
}

/* ---------- tokens.md 预填来源 ----------
 * 挖掘草稿优先：它的取值来自本系统的采集 / 设计稿。
 * 模板里多出来的 Token 名一并补进去，不静默丢。 */
const prefill = new Map();
let prefillFrom = '';
if (FROM_MINING) {
  const draft = parseMiningDraft(FROM_MINING);
  for (const [name, row] of draft) {
    prefill.set(name, {
      value: row.value,
      note: '**待转正**（挖掘草稿）：' + (row.note || '取值待人工确认')
    });
  }
  const fromDraft = prefill.size;
  const onlyTemplate = [...templateTokens.keys()].filter((n) => !prefill.has(n));
  onlyTemplate.forEach((n) => prefill.set(n, {
    value: KEEP_VALUES ? [...templateTokens.get(n)][0] : '--',
    note: '待填：模板 :root 里有、挖掘草稿里没有，需人工裁决是否收编'
  }));
  prefillFrom = '挖掘草稿 ' + FROM_MINING + '（' + fromDraft + ' 行候选'
    + (onlyTemplate.length ? '，另补模板独有 ' + onlyTemplate.length + ' 个' : '') + '）';
  if (onlyTemplate.length) {
    console.log('· 模板里另有 ' + onlyTemplate.length + ' 个 Token 名未出现在草稿中，已一并列进 tokens.md：');
    onlyTemplate.slice(0, 6).forEach((n) => console.log('      ' + n));
    if (onlyTemplate.length > 6) console.log('      …另有 ' + (onlyTemplate.length - 6) + ' 个');
  }
} else if (templateTokens.size) {
  for (const [name, set] of templateTokens) {
    prefill.set(name, {
      value: KEEP_VALUES ? [...set][0] : '--',
      note: KEEP_VALUES ? NOTE_FROM_TEMPLATE_KEEP : NOTE_FROM_TEMPLATE_NEUTRAL
    });
  }
  prefillFrom = '模板 :root（' + prefill.size + ' 个 Token 名）';
}

/* 规范文档骨架 */
const tokensMd = fillTokenTables(render('foundation/tokens.md.tpl', BASE), prefill);
console.log('· foundation/tokens.md：' + (prefillFrom
  ? '已按 ' + prefillFrom + '预填'
  : '空骨架——引擎不预置模板，没有 Token 名可预填；'
    + '跑 mine-tokens.js 生成草稿，再带 --from-mining 重跑即可预填'));
fs.writeFileSync(path.join(OUT, 'foundation', 'tokens.md'), tokensMd, 'utf8');
fs.writeFileSync(path.join(OUT, 'foundation', 'design-sync.md'), render('foundation/design-sync.md.tpl', BASE), 'utf8');
fs.writeFileSync(path.join(OUT, 'foundation', 'conventions.json'), render('foundation/conventions.json.tpl', BASE), 'utf8');
fs.writeFileSync(path.join(OUT, 'SKILL.md'), render('PACKAGE-SKILL.md.tpl', BASE), 'utf8');
/* 用户级入口：包内入口写全，这份只留「怎么找到包 / 怎么生成 / 怎么校验」。
 * 装到 ~/.workbuddy-ai/skills/<prefix>-design-system/SKILL.md 后可在任意工作区唤起。
 * 放在包根而不是 scripts/ 下——它是一份入口文档，不是引擎件。 */
fs.writeFileSync(path.join(OUT, 'USER-SKILL.md'), render('USER-SKILL.md.tpl', BASE), 'utf8');

/* 目录说明：告诉下一个接手的人这里该放什么、按什么标准写 */
fs.writeFileSync(path.join(OUT, 'foundation', 'README.md'),
  '# foundation/\n\n取值唯一来源是 `tokens.md`。其余按实际需要补充（颜色 / 字体 / 间距 / 阴影 / 图标 / 设计稿映射）。\n\n' +
  '规则：\n\n- 任何数值只在 `tokens.md` 登记一次，其它文件一律写「见 `tokens.md` §X」，不抄数值\n' +
  '- `design-sync.md` 是流程文档，已预置，按设计稿分组补充映射表即可\n' +
  '- `conventions.json` 放本系统的**结构级约定**（`[E4]` 会逐条校验）。空着不是错，\n' +
  '  但凡是「批量改模板时可能漏掉某个文件」的约定，都应该写进来——靠肉眼审是审不住的\n', 'utf8');

fs.writeFileSync(path.join(OUT, 'components', 'README.md'),
  '# components/\n\n只写实际存在的组件，不写理论组件。\n\n' +
  '每个组件一份 md，骨架见工厂包 `assets/doc-skeletons/COMPONENT.md.tpl`。\n' +
  '取值一律引用 Token，禁止裸数值。\n', 'utf8');

fs.writeFileSync(path.join(OUT, 'pages', 'README.md'),
  '# pages/\n\n按线上产品实际存在的页面类型建文档，骨架见工厂包 `assets/doc-skeletons/PAGE.md.tpl`。\n\n' +
  '页面类型清单不要预先写死——由 `mine-tokens.js` 的结构特征汇总推断，再人工确认。\n', 'utf8');

fs.writeFileSync(path.join(OUT, 'examples', 'README.md'),
  '# examples/\n\n标杆页 = 「这类页面长什么样」的唯一参考答案。\n\n' +
  '生成方式：用 `scripts/new-page.js` 生成骨架，再填入真实业务文案与数据。\n' +
  '改规范或模板后，标杆页就是回归验证的基线。\n', 'utf8');

/* ---------- 收尾提示 ---------- */
console.log('');
console.log('✓ 包已建好：' + OUT);
console.log('');
console.log('接下来（脚本做不了，必须人做）：');
console.log('  1. 采集：让能打开线上页面的人跑 scripts/collect-from-browser.js，拿到 *-styles.json');
console.log('     页面打不开、设计稿也导不出时走人工标注：照 examples/intake.sample.json 填一份。');
console.log('  2. 挖掘：' + NODE + ' ' + path.join(FACTORY, 'scripts', 'mine-tokens.js') + ' \\');
console.log('             --online=<采集JSON> --figma=<设计稿导出> --intake=<人工标注> \\');
console.log('             --emit-tokens=tokens.draft.md');
console.log('     三路数据源至少要有一路；报告第 2 节「布局候选」会告诉你本系统实际有几种页面外壳。');
console.log('  3. 沉淀布局：引擎不预置布局——外壳要按设计稿/线上实测搭，不能套别的系统。');
console.log('     步骤见 ' + PKG + '/scripts/layout/README.md，起手文件 scripts/layout/_skeleton.html。');
console.log('     搭完保留三个插入点标记（' + '@content-slot 必填、@tabs-slot / @page-title 选填）。');
console.log('     已有项目里加页面、不需要外壳时用 --layout=none。');
console.log('  4. 沉淀内容区模板：引擎同样不预置——「列表页长什么样」的答案只在本系统设计稿里。');
console.log('     步骤见 ' + PKG + '/scripts/templates/README.md，起手文件 scripts/templates/_skeleton.html。');
console.log('     落位 scripts/templates/<类别>/<名字>.html，目录名即 --type 取值。');
console.log('     浮层的遮罩类名 / 宽度档位 / 样式提取范围改 scripts/templates/contract.json，不要改生成器。');
console.log('  5. 定稿取值：把候选值确认后填进 ' + PKG + '/foundation/tokens.md，再回灌各模板 :root。');
if (prefillFrom) {
  console.log('     模板 :root 的取值' + (KEEP_VALUES ? '未做中性化（--keep-values）' : '已置为 unset')
    + '，tokens.md 已按 ' + prefillFrom + '预填。');
} else {
  console.log('     tokens.md 目前是空骨架——先跑第 2 步拿到草稿，再带 --from-mining=<草稿> --force 重跑一次。');
}
console.log('  6. 裁决约定：本系统的结构级约定写进 ' + PKG + '/foundation/conventions.json（[E4] 会逐条校验）。');
console.log('     样例见工厂包 assets/samples/conventions.sample.json——样例，不要照抄。');
console.log('  7. 补文档：按实际页面类型生成 components/ pages/ 文档与 examples/ 标杆页');
console.log('  8. 校验：' + NODE + ' "' + OUT + '/scripts/check-tokens.js" "' + OUT + '" --strict');
console.log('     扫描根是**包本身**（' + PKG + '），不是它的上一级——取上一级会在两种情形下出错：');
console.log('       ① 包被装到 ~/.workbuddy-ai/skills/ 之后，上一级是 skills/，会去扫别的技能包；');
console.log('       ② 工作区里放着一份没跟着改的旧页面，会报出一堆与交付物无关的 [E2]。');
console.log('     要把包外的页面也一起扫，就把第二个路径换成那个目录。');
console.log('     退出码必须是 0 才能交付。模板里还留着 unset 取值时 [E5] 取值待填 会报数，这是预期的——');
console.log('     把 tokens.md 的取值回灌进模板 :root，E5 归零即通过。');
console.log('');
console.log('可选：想让本系统的规范能力在**任意工作区**都能唤起（不必先 cd 到包目录），');
console.log('      把包根的 USER-SKILL.md 复制过去：');
console.log('        mkdir -p ~/.workbuddy-ai/skills/' + PREFIX + '-design-system');
console.log('        cp ' + PKG + '/USER-SKILL.md ~/.workbuddy-ai/skills/' + PREFIX + '-design-system/SKILL.md');
process.exit(0);
