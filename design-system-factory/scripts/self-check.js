#!/usr/bin/env node
/**
 * 设计系统工厂自检
 * ------------------------------------------------------------
 * （本脚本不带自己的版本号 —— 以前头部写着「v1.5」，而工厂已经到 v1.15，
 *   没人知道那个 v1.5 是脚本版本还是过期的工厂版本。版本号只留在
 *   SKILL.md / README.md / CHANGELOG.md 三处，由 [S7] 核一致；
 *   检查项数量由 [S23] 核一致。少一个能漂移的数字，就少一类假信息。）
 * 这个工厂最常出的问题不是单点 bug，而是「工厂自己没人校验」：
 *   · 工作区与安装副本悄悄分叉，而实际运行的是安装副本
 *   · 文档承诺的能力代码做不到（登记了不存在的模板、写了不存在的命令）
 *   · 上游系统的产物漏进「通用引擎」（版本史、具体系统的文件名、真实色值）
 *   · 版本号各写各的，没有变更记录，出问题不知道哪次改的
 * 这些问题纸面看不出来，跑一遍才知道。本脚本就是跑这一遍。
 *
 * 用法：
 *   node scripts/self-check.js [--installed=<安装副本路径>] [--json] [--quiet]
 *
 *   --installed  安装副本路径，默认 ~/.workbuddy-ai/skills/design-system-factory
 *   --json       机器可读输出
 *   --quiet      只打失败项
 *
 * 检查项：
 *   [S1] JS 语法         —— 全库 .js 过一遍 node --check
 *   [S2] 引擎登记表       —— assets/engine/scripts/README.md 的清单与实际文件双向一致
 *   [S3] 取值纪律         —— 引擎与样例模板 :root 之外不得出现色值；同名 Token 取值须跨文件唯一
 *   [S4] 引擎不预置成品   —— layout/ 与 templates/ 只允许契约骨架；contract.json 必须是空契约
 *   [S5] 引擎文档不越界   —— 引擎 md 不得引用某个具体系统才有的下游文件
 *   [S6] 骨架占位符       —— 建包器渲染的骨架里，占位符必须都由 BASE 提供
 *   [S7] 版本一致         —— SKILL.md / README.md / CHANGELOG.md 的版本号必须一致
 *   [S8] 样例已标注       —— assets/samples/ 与 examples/ 的样例必须写明「不要照抄」
 *   [S9] 副本一致         —— 工作区与安装副本逐文件一致（工作区是权威副本）
 *   [S10] 陈旧副本        —— 提示已知的旧分支副本（不自动处理）
 *   [S11] 模板契约        —— 生成器认的 @@占位符@@ 必须在契约骨架与说明里写明
 *   [S12] 样例替换点      —— 样例模板必须能被「业务替换点」搜到
 *   [S13] 演示区标记      —— @transient 成对，且 HTML 段带 data-collect-ignore
 *   [S14] 设计锚点        —— 引擎骨架不得带具体系统的 data-page-node-id 真值
 *   [S15] CSS 切分健壮性  —— 注释/字符串里的花括号不得带偏 splitRules / scopeCss
 *   [S16] 约定匹配边界    —— contains 的选择器边界不能漏掉 `-` / `--`（BEM 假阳性）
 *   [S17] 采集口径        —— 采集器「不可见节点」判定的正反样例（判错会整体污染采样）
 *   [S18] 注释字面量      —— HTML 注释里的标签字面量不得带偏 parts()（会吞掉后半份模板）
 *   [S19] 约定类型        —— [E4] 的规则类型：文档承诺的与校验器实现的双向一致
 *   [S20] 系统名不硬编码  —— 生成器不得给某个系统的名字兜底（会静默贴错品牌文案）
 *   [S21] 结构计数口径    —— 采集器不得把 `<svg>` 图标算成图表（会凭空推断出仪表盘页）
 *   [S22] 双主题口径      —— 主题覆盖块算「定义」、亮色列靠格式自证（口径反了会假阳性）
 *   [S23] 自检项数量      —— SKILL.md 登记的「N 项检查」必须与实际项数一致
 *   [S24] 生成器并亮色块  —— `:root` 与亮色覆盖必须成对搬（只搬 `:root` → 亮色下一半是暗色）
 *   [S25] 介绍网页同步    —— 手工维护的介绍页必须与工厂同版本/同项数/同校验码集合
 *   [S26] 建包产物可移植  —— 生成器不得把绝对路径注进文档骨架（会去校验另一份旧副本）
 *   [S27] 骨架校验口径    —— 骨架 §3 复述的校验码集合与项数必须等于引擎真做的
 *
 * 退出码：0 全部通过；1 存在失败项
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const os = require('os');

const argv = process.argv.slice(2);
const opts = {};
for (const a of argv) {
  if (!a.startsWith('--')) continue;
  const idx = a.indexOf('=');
  const k = a.slice(2, idx === -1 ? undefined : idx);
  opts[k] = idx === -1 ? true : a.slice(idx + 1);
}
const AS_JSON = !!opts.json;
const QUIET = !!opts.quiet;

const FACTORY = path.resolve(__dirname, '..');
const ENGINE = path.join(FACTORY, 'assets', 'engine', 'scripts');
const SKELETONS = path.join(FACTORY, 'assets', 'doc-skeletons');
const SAMPLES = path.join(FACTORY, 'assets', 'samples');
/* 引擎不再自带成品模板，成品模板作为「参考样例」放在 samples 下。
 * S3 / S12 要跟着它们走——否则那两条检查会变成恒绿的空转。 */
const SAMPLE_TEMPLATES = path.join(SAMPLES, 'templates');
const INSTALLED = path.resolve(
  String(opts.installed || path.join(os.homedir(), '.workbuddy-ai', 'skills', 'design-system-factory'))
);
/* 已知的旧分支副本：只提示，不自动处理——删别人的目录不是自检该干的事 */
const STALE_COPIES = [
  path.join(os.homedir(), 'Documents', 'zjpt', 'design-system-factory')
];

const results = [];
const add = (id, title, ok, detail, items) =>
  results.push({ id, title, ok, detail: detail || '', items: items || [] });

/* ---------- 小工具 ---------- */
function walk(dir, filter, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.DS_Store') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, filter, out);
    else if (!filter || filter(f)) out.push(f);
  }
  return out;
}
const read = (p) => fs.readFileSync(p, 'utf8');
const rel = (p) => path.relative(FACTORY, p);

/* ================================================================
 * [S1] JS 语法
 * ================================================================ */
{
  const files = walk(FACTORY, (f) => f.endsWith('.js'));
  const bad = [];
  for (const f of files) {
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    if (r.status !== 0) bad.push(rel(f) + ' → ' + String(r.stderr).split('\n').find((l) => l.trim()) || '');
  }
  add('S1', 'JS 语法（node --check）', bad.length === 0,
    files.length + ' 个文件', bad);
}

/* ================================================================
 * [S2] 引擎登记表 ↔ 实际文件 双向一致
 * 文档承诺的能力代码必须做得到；反过来，文件存在也该被登记，
 * 否则下一个人不知道它存在。
 * 登记路径可以在引擎里，也可以指向工厂里的样例/文档——
 * 引擎 README 会引用 assets/samples/ 下的参考模板，那是合法的。
 * ================================================================ */
{
  const readme = path.join(ENGINE, 'README.md');
  const missing = [];
  const ambiguous = [];
  const unlisted = [];
  if (!fs.existsSync(readme)) {
    add('S2', '引擎登记表', false, 'assets/engine/scripts/README.md 不存在', []);
  } else {
    const text = read(readme);
    /* 清单里被反引号包起来的模板/脚本路径 */
    const listed = new Set();
    for (const m of text.matchAll(/`([a-z0-9_][a-z0-9_/-]*\.(?:html|js))`/gi)) listed.add(m[1]);
    /* 登记路径的解析根：先引擎，再工厂根（样例与文档都在工厂里） */
    const ROOTS = [ENGINE, FACTORY];
    const existsAnywhere = (p) => ROOTS.some((r) => fs.existsSync(path.join(r, p)));
    for (const p of listed) {
      if (existsAnywhere(p)) continue;
      /* 选型决策树里的表格为紧凑会用裸文件名简写（`basic-table.html`）。
       * 简写合法，但必须全库唯一——否则读者不知道该指哪个。 */
      if (!p.includes('/')) {
        /* 去重：FACTORY 是 ENGINE 的祖先，两棵树上会数到同一个文件 */
        const hits = [...new Set(ROOTS.flatMap((r) => walk(r, (f) => path.basename(f) === p)))];
        if (hits.length === 1) continue;
        if (hits.length > 1) {
          ambiguous.push(p + '（简写，全库有 ' + hits.length + ' 个同名文件，请写全路径）');
          continue;
        }
      }
      missing.push('清单里有、文件不存在：' + p);
    }
    /* 实际文件：脚本 + 契约骨架。骨架也要登记——
     * 「引擎不预置成品」的前提下，骨架就是引擎的主要内容物。 */
    const actual = walk(ENGINE, (f) => /\.(html|js)$/.test(f))
      .map((f) => path.relative(ENGINE, f));
    for (const p of actual) {
      if (!listed.has(p)) unlisted.push('文件存在、清单里没有：' + p);
    }
    add('S2', '引擎登记表双向一致', missing.length + unlisted.length + ambiguous.length === 0,
      listed.size + ' 条登记 / ' + actual.length + ' 个文件', [...missing, ...ambiguous, ...unlisted]);
  }
}

/* ================================================================
 * [S3] 取值纪律（引擎契约骨架 + 参考样例）
 * 两条断言，都在管「模板的取值该怎么写」：
 *   (a) :root 之外不得出现色值字面量。
 *       :root 外的字面量以前靠「该值在 :root 声明过」豁免，取值中性化后
 *       豁免消失——这个检查就是替代那条豁免的：不豁免，只看位置。
 *   (b) 同一 Token 跨文件取值必须一致。
 *       不一致 = 「取值唯一来源」名不副实：建包中性化会把它盖住，
 *       但用 --keep-values 建包、或直接照样例参考取值时就会分裂。
 *       真实案例：--transition-fast 在 3 个模板是 `200ms ease-in-out`、
 *       在 1 个模板是 `0.2s`（丢了缓动函数，默认从 ease-in-out 变 ease）；
 *       --font-family 有 3 种回退链（缺 DIN Alternate / 缺系统字体回退）。
 * 检查对象是**引擎契约骨架 + assets/samples/templates**：
 * 引擎已经不带成品模板了，样例是唯一还带取值的参考物——
 * 只查引擎的话这两条断言会变成恒绿的空转。
 * 取值里含分号的情况不存在（CSS 变量值不会含 `;`），按 `;` 切段即可。
 * ================================================================ */
{
  const bad = [];
  const files = [
    ...walk(ENGINE, (f) => f.endsWith('.html')),
    ...walk(SAMPLE_TEMPLATES, (f) => f.endsWith('.html'))
  ];
  const decls = new Map();   /* Token 名 → Map(取值 → [文件…]) */
  for (const f of files) {
    const raw = read(f);
    const body = raw
      .replace(/:root\s*\{[\s\S]*?\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    body.split('\n').forEach((line, i) => {
      if (/token-ignore/i.test(line)) return;
      const lits = line.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g);
      if (lits) bad.push(rel(f) + ':' + (i + 1) + '  ' + lits.join(' ') + '  ← ' + line.trim().slice(0, 70));
    });
    /* (b) 收集本文件所有 :root 块里的声明（一个文件可能有多个 :root）。
     * 按 `;` 切段而不是按行——模板里有 `--space-1: 4px; --space-2: 8px;` 这种
     * 一行多声明的压缩写法，按行解析会把后续声明吞进前一个值里。 */
    for (const blk of raw.matchAll(/:root\s*\{([\s\S]*?)\}/g)) {
      const clean = blk[1].replace(/\/\*[\s\S]*?\*\//g, '');
      for (const seg of clean.split(';')) {
        const m = /^\s*(--[a-z0-9-]+)\s*:\s*([\s\S]+?)\s*$/.exec(seg);
        if (!m) continue;
        const name = m[1], value = m[2].replace(/\s+/g, ' ').trim();
        if (!decls.has(name)) decls.set(name, new Map());
        const byVal = decls.get(name);
        if (!byVal.has(value)) byVal.set(value, []);
        byVal.get(value).push(path.basename(f));
      }
    }
  }
  for (const [name, byVal] of decls) {
    if (byVal.size <= 1) continue;
    const detail = [...byVal.entries()]
      .map(([v, fs]) => '「' + v + '」×' + fs.length + ' 文件')
      .join('　vs　');
    bad.push('同一 Token 跨文件取值不一致：' + name + '　' + detail);
  }
  add('S3', '取值纪律（:root 外无色值 / Token 取值唯一）', bad.length === 0,
    files.length + ' 个模板 / ' + decls.size + ' 个 Token 名', bad);
}

/* ================================================================
 * [S4] 引擎不预置布局、不预置内容区模板，也不预置契约取值
 * 布局要按目标系统的设计稿沉淀；内容区模板同理——
 * 模板不只是结构，它还带着一整套取值阶梯（间距档 / 色板 / 圆角档）。
 * 引擎里一旦有成品模板，派生出来的每个包都会带着别人的结构**和取值阶梯**上线，
 * 而后者看起来像一堆正经的规范条目，没人知道它从哪来。
 *   layout/    只允许 README.md + _*.html
 *   templates/ 只允许 README.md + contract.json + _*.html，且不得有类别子目录
 * 成品模板的参考副本放 assets/samples/templates/（只作参考，不参与建包）。
 *
 * 契约取值同理，而且更隐蔽：`types` 里那串类别名、`overlay` 里的档位宽度，
 * 看起来像「中后台通用规律」，其实是某一个系统的设计决策。预置进去，
 * 新包会照着改而不是去采集——所以引擎那份必须是**空契约**。
 * 本检查因此是**反向**的：一旦被填上取值就报错。
 * 一份填满的样子放 assets/samples/contract.sample.json（只作参考）。
 * ================================================================ */
{
  const bad = [];
  const checkDir = (dir, label, extraAllowed, subdirHint) => {
    if (!fs.existsSync(dir)) { bad.push(label + '/ 不存在'); return 0; }
    let skeletons = 0;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { bad.push(label + '/ 下出现了子目录：' + e.name + '（' + subdirHint + '）'); continue; }
      if (extraAllowed.includes(e.name)) continue;
      if (e.name.startsWith('_') && e.name.endsWith('.html')) { skeletons++; continue; }
      bad.push(label + '/ 下出现了成品文件：' + e.name + '（引擎只能带 _ 开头的契约骨架）');
    }
    if (!skeletons) bad.push(label + '/ 缺少契约骨架 _skeleton.html——没有它，使用者不知道要满足什么');
    return skeletons;
  };
  const nLayout = checkDir(path.join(ENGINE, 'layout'), 'layout', ['README.md'],
    '成品布局要按本系统设计稿沉淀，引擎不带');
  const nTpl = checkDir(path.join(ENGINE, 'templates'), 'templates',
    ['README.md', 'contract.json'],
    '成品模板要放 assets/samples/templates/，引擎不带');

  /* contract.json 是生成器的输入，结构错了要在工厂就发现，不能等建完包才炸。
   * 注意方向：这里查的是「**必须为空**」，不是「必须有内容」。
   * 契约的取值是某一个系统的设计决策，预置进引擎 = 让每个新包继承别人的答案。 */
  const cp = path.join(ENGINE, 'templates', 'contract.json');
  if (fs.existsSync(cp)) {
    const raw = read(cp);
    try {
      const c = JSON.parse(raw);
      if (!Array.isArray(c.types)) {
        bad.push('templates/contract.json 的 types 不是数组');
      } else if (c.types.length) {
        bad.push('templates/contract.json 的 types 预置了类别（' + c.types.join(' / ')
          + '）——引擎那份必须是空契约，类别集要由使用者按本系统设计稿裁决');
      }
      if (!c.overlay || typeof c.overlay !== 'object' || Array.isArray(c.overlay)) {
        bad.push('templates/contract.json 的 overlay 不是对象');
      } else if (Object.keys(c.overlay).length) {
        bad.push('templates/contract.json 的 overlay 预置了浮层类别（'
          + Object.keys(c.overlay).join(' / ')
          + '）——档位与遮罩类名是设计决策，引擎不能带');
      }
      if (c.alias && typeof c.alias === 'object' && Object.keys(c.alias).length) {
        bad.push('templates/contract.json 的 alias 预置了组合别名（'
          + Object.keys(c.alias).join(' / ') + '）');
      }
      if (Array.isArray(c.standalone) && c.standalone.length) {
        bad.push('templates/contract.json 的 standalone 预置了类别（' + c.standalone.join(' / ') + '）');
      }
      if (!c.tabsDir) {
        bad.push('templates/contract.json 没声明 tabsDir（多标签栏模板目录）');
      }
      /* 空契约最容易被误当成「漏填」而把说明一起删掉，
       * 所以说明必须在，而且要写清取值从哪来。 */
      if (!c._types_说明 || !c._overlay_说明) {
        bad.push('templates/contract.json 缺 _types_说明 / _overlay_说明——空契约必须解释「为什么是空的」');
      } else if (!/裁决|设计稿/.test(raw)) {
        bad.push('templates/contract.json 没写明取值从哪来（应指向本系统的设计稿 / 裁决流程）');
      }
    } catch (e) {
      bad.push('templates/contract.json 不是合法 JSON：' + e.message);
    }
  }

  add('S4', '引擎不预置布局、内容区模板与契约取值', bad.length === 0,
    nLayout + ' 份布局骨架 / ' + nTpl + ' 份模板骨架 / 空契约', bad);
}

/* ================================================================
 * [S5] 引擎文档不得引用「某个具体系统才有的」下游文件
 * 引擎是通用的；`components/layout.md`、`../examples/demo.html` 这类路径
 * 只对某一个系统成立，写进引擎就是让每个新包都指向不存在的文件。
 * ================================================================ */
{
  /* init-package.js 一定会生成的下游文件——这些引用是合法的 */
  const ALWAYS_GENERATED = new Set([
    'foundation/tokens.md', 'foundation/design-sync.md', 'foundation/conventions.json',
    'examples/README.md', 'components/README.md', 'pages/README.md',
    'scripts/README.md', 'scripts/HOOKS-GUIDE.md'
  ]);
  const bad = [];
  const files = walk(ENGINE, (f) => f.endsWith('.md'));
  for (const f of files) {
    read(f).split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/(?:\.\.\/)?((?:examples|components|pages|foundation)\/[A-Za-z0-9_.<>-]+\.(?:md|html|json))/g)) {
        const p = m[1];
        if (p.includes('<')) continue;                       /* <type>-page.md 这种占位写法是好的 */
        if (ALWAYS_GENERATED.has(p)) continue;
        /* 引擎自带的同名模板（pages/login-page.html 等）也算合法 */
        if (fs.existsSync(path.join(ENGINE, p))) continue;
        bad.push(rel(f) + ':' + (i + 1) + '  引用了 ' + p + '（本包不会生成它）');
      }
    });
  }
  add('S5', '引擎文档不引用具体系统的下游文件', bad.length === 0,
    files.length + ' 份引擎文档', bad);
}

/* ================================================================
 * [S6] 骨架占位符必须都由建包器的 BASE 提供
 * 骨架只跑占位符替换、不跑前缀替换规则。写了 {{X}} 而 BASE 没提供，
 * 就会把 `{{X}}` 原样留在新包里——比写错值更难发现。
 * ================================================================ */
{
  const initSrc = read(path.join(FACTORY, 'scripts', 'init-package.js'));
  const baseBlock = /const BASE = \{([\s\S]*?)\};/.exec(initSrc);
  const provided = new Set();
  const bad = [];
  if (baseBlock) {
    /* BASE 里两种写法并存：`SYSTEM: NAME` 与 ES6 简写 `PREFIX,`。
     * 只认冒号会漏掉简写的那几个，误报「BASE 没提供」。按逗号切段再取段首标识符。 */
    for (const seg of baseBlock[1].split(',')) {
      const m = /^\s*([A-Z][A-Z0-9_]*)\s*(?::|$)/.exec(seg);
      if (m) provided.add(m[1]);
    }
  } else {
    bad.push('init-package.js 里找不到 `const BASE = {...}`，S6 无法判定');
  }
  /* S6 的结论建立在「所有 render() 都传 BASE」之上。出现例外就必须报出来，
   * 否则骨架里的 {{X}} 会静默留在新包里——这正是本检查要防的事。 */
  const oddVars = [...new Set(
    [...initSrc.matchAll(/render\(\s*'[^']*'\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g)]
      .map((m) => m[1]).filter((v) => v !== 'BASE')
  )];
  if (oddVars.length) {
    bad.push('有 render() 传的不是 BASE（' + oddVars.join(', ') + '），S6 的静态判定不成立');
  }
  /* 只有 init-package.js 用 render() 渲染的骨架才算——PAGE/COMPONENT 是人工填的 */
  const rendered = [
    'PACKAGE-SKILL.md.tpl', 'USER-SKILL.md.tpl',
    'foundation/tokens.md.tpl', 'foundation/design-sync.md.tpl',
    'foundation/conventions.json.tpl'
  ];
  let used = 0;
  for (const t of rendered) {
    const p = path.join(SKELETONS, t);
    if (!fs.existsSync(p)) { bad.push('骨架缺失：' + t); continue; }
    const text = read(p);
    for (const m of text.matchAll(/\{\{([A-Z_]+)\}\}/g)) {
      used++;
      if (!provided.has(m[1])) bad.push(t + ' 用了 {{' + m[1] + '}}，但 BASE 没提供');
    }
  }
  add('S6', '骨架占位符都有来源', bad.length === 0,
    rendered.length + ' 份骨架 / ' + used + ' 处占位符（BASE 提供 ' + provided.size + ' 个）', bad);
}

/* ================================================================
 * [S7] 版本号一致 + 有变更记录
 * 没有版本纪律，漂移与「文档承诺 ≠ 代码能力」会反复出现，
 * 而且出问题时不知道是哪次改的。
 * ================================================================ */
{
  const bad = [];
  const verOf = (p, re) => {
    if (!fs.existsSync(p)) { bad.push(path.basename(p) + ' 不存在'); return null; }
    const m = re.exec(read(p));
    if (!m) { bad.push(path.basename(p) + ' 里找不到版本号'); return null; }
    return m[1];
  };
  const vSkill = verOf(path.join(FACTORY, 'SKILL.md'), /版本：v(\d+\.\d+)/);
  const vReadme = verOf(path.join(FACTORY, 'README.md'), /版本：v(\d+\.\d+)/);
  const vLog = verOf(path.join(FACTORY, 'CHANGELOG.md'), /^##\s*v(\d+\.\d+)/m);
  if (vSkill && vReadme && vSkill !== vReadme) {
    bad.push('SKILL.md 是 v' + vSkill + '，README.md 是 v' + vReadme);
  }
  if (vSkill && vLog && vSkill !== vLog) {
    bad.push('SKILL.md 是 v' + vSkill + '，CHANGELOG.md 最新条目是 v' + vLog);
  }
  add('S7', '版本号一致且有变更记录', bad.length === 0,
    'SKILL v' + vSkill + ' / README v' + vReadme + ' / CHANGELOG v' + vLog, bad);
}

/* ================================================================
 * [S8] 样例必须自报家门
 * 工厂里的样例（conventions / 布局 / intake）都是「某一个系统」的产物。
 * 没写明「不要照抄」的样例，一定会被照抄。
 * ================================================================ */
{
  const bad = [];
  const samples = [
    ...walk(path.join(FACTORY, 'assets', 'samples'), () => true),
    ...walk(path.join(FACTORY, 'examples'), (f) => f.endsWith('.json'))
  ];
  for (const f of samples) {
    const head = read(f).slice(0, 1500);
    if (!/不要照抄|样例|sample|兜底模板/i.test(head)) {
      bad.push(rel(f) + ' 开头没有「样例/不要照抄」的说明');
    }
  }
  add('S8', '样例都标了「样例，不要照抄」', bad.length === 0, samples.length + ' 个样例', bad);
}

/* ================================================================
 * [S9] 工作区 ↔ 安装副本 逐文件一致
 * 实际被加载的是安装副本。只改工作区不会生效——
 * 这是本项目最容易踩的坑，所以每次自检都量一遍。
 * ================================================================ */
{
  if (!fs.existsSync(INSTALLED)) {
    add('S9', '工作区 ↔ 安装副本一致', true,
      '安装副本不存在（' + INSTALLED + '），跳过', []);
  } else {
    const listOf = (root) => walk(root, () => true)
      .map((f) => path.relative(root, f))
      .filter((p) => !p.startsWith('.workbuddy-ai'))
      .sort();
    const a = listOf(FACTORY);
    const b = listOf(INSTALLED);
    const bad = [];
    const onlyA = a.filter((p) => !b.includes(p));
    const onlyB = b.filter((p) => !a.includes(p));
    onlyA.forEach((p) => bad.push('只在工作区：' + p));
    onlyB.forEach((p) => bad.push('只在安装副本：' + p + '（很可能是上游已删、安装时没删掉的僵尸文件）'));
    for (const p of a.filter((x) => b.includes(x))) {
      if (!fs.readFileSync(path.join(FACTORY, p)).equals(fs.readFileSync(path.join(INSTALLED, p)))) {
        bad.push('内容不同：' + p);
      }
    }
    add('S9', '工作区 ↔ 安装副本一致', bad.length === 0,
      a.length + ' 个文件 / 安装副本 ' + b.length + ' 个', bad);
  }
}

/* ================================================================
 * [S10] 陈旧副本提示（不自动处理）
 * ================================================================ */
{
  const found = STALE_COPIES.filter((p) => fs.existsSync(p));
  add('S10', '陈旧副本检查', found.length === 0,
    found.length ? '发现 ' + found.length + ' 份旧分支副本' : '未发现已知旧副本',
    found.map((p) => p + '　← 旧分支副本，已弃用；确认无引用后清理（本脚本不自动删）'));
}

/* ================================================================
 * [S11] 模板契约：生成器认的 @@占位符@@ 必须在契约骨架与说明里写明
 * 生成器不认识任何具体系统的类名，只认占位符。占位符是**隐式接口**——
 * 生成器实现了、骨架没写，模板作者永远不会用；
 * 骨架写了、生成器没实现，模板里就会留下一个字面量 @@xxx@@。
 * 两边必须对齐，而这种事只有静态比对才发现得了。
 * 同理，骨架必须写明落位规则与「业务替换点」约定，否则契约不完整。
 * ================================================================ */
{
  const bad = [];
  const genSrc = read(path.join(ENGINE, 'new-page.js'));
  /* 生成器实际替换的占位符：`.replace(/@@名字@@/g, …)` */
  const impl = new Set([...genSrc.matchAll(/\/@@([^@\n]+)@@\//g)].map((m) => m[1]));
  const docs = ['templates/_skeleton.html', 'templates/README.md'];
  if (!impl.size) {
    bad.push('new-page.js 里找不到任何 /@@占位符@@/ —— 契约判不出来，请确认实现方式没变');
  }
  for (const d of docs) {
    const p = path.join(ENGINE, d);
    if (!fs.existsSync(p)) { bad.push(d + ' 不存在'); continue; }
    const text = read(p);
    for (const name of impl) {
      if (!text.includes('@@' + name + '@@')) {
        bad.push(d + ' 没写明 @@' + name + '@@（生成器会替换它，模板作者不知道就等于没有）');
      }
    }
  }
  const skPath = path.join(ENGINE, 'templates', '_skeleton.html');
  if (fs.existsSync(skPath)) {
    const sk = read(skPath);
    if (!/scripts\/templates\/<类别>\/<名字>\.html/.test(sk)) {
      bad.push('templates/_skeleton.html 没写明落位规则 scripts/templates/<类别>/<名字>.html');
    }
    if (!sk.includes('业务替换点')) {
      bad.push('templates/_skeleton.html 没提「业务替换点」标记约定');
    }
  }
  add('S11', '模板契约（生成器 @@占位符@@ ↔ 骨架/说明）', bad.length === 0,
    impl.size + ' 个占位符 / ' + docs.length + ' 份文档', bad);
}

/* ================================================================
 * [S12] 样例模板必须有「业务替换点」标记
 * 引擎 README §3 承诺：模板内所有需改位置均用注释标记，
 * 全局搜索「业务替换点」即可定位。样例是使用者真正会照着改的东西，
 * 承诺就要在样例上成立——曾经 4 个模板用的是朴素注释
 * （`<!-- 客户名称 -->`），搜「业务替换点」一个都搜不到，
 * 使用者会以为这些模板不需要改；生成器也报「业务替换点：0 处」。
 * 引擎已不带成品模板，这条检查跟着样例走，否则会变成恒绿的空转。
 * ================================================================ */
{
  const bad = [];
  const files = walk(SAMPLE_TEMPLATES, (f) => f.endsWith('.html'));
  for (const f of files) {
    const n = (read(f).match(/业务替换点/g) || []).length;
    if (n === 0) bad.push(rel(f) + ' 没有任何「业务替换点」标记，使用者无从下手');
  }
  add('S12', '样例模板都有「业务替换点」标记', bad.length === 0,
    files.length + ' 个样例模板', bad);
}

/* ================================================================
 * [S13] 演示区标记：@transient 成对 + HTML 段带 data-collect-ignore
 * 「临时件」会从两个方向漏出去（见 references/04-pitfalls.md §5.8）：
 *   注入宿主页   —— 靠 @transient 注释标记剔除
 *   被采集器采到 —— 靠 data-collect-ignore 属性跳过
 * 两个都要打，只打一个等于只堵了一半。这条就盯「有没有打全」。
 * ================================================================ */
{
  const bad = [];
  const HTML_MARK = /<!--\s*@transient-start[^>]*-->[\s\S]*?<!--\s*@transient-end[^>]*-->/g;
  const files = walk(SAMPLE_TEMPLATES, (f) => f.endsWith('.html'));

  for (const f of files) {
    const src = read(f);
    const starts = (src.match(/@transient-start/g) || []).length;
    const ends = (src.match(/@transient-end/g) || []).length;
    if (starts !== ends) {
      bad.push(rel(f) + ' 的 @transient 标记不成对（start ' + starts + ' / end ' + ends +
        '）——标记写错不会报错，只会静默不剔除');
    }
    for (const seg of src.match(HTML_MARK) || []) {
      /* 段里没有元素就不用采集属性（比如只写了行说明文字） */
      if (!/<[a-zA-Z/]/.test(seg.replace(/<!--[\s\S]*?-->/g, ''))) continue;
      if (!/data-collect-ignore/.test(seg)) {
        bad.push(rel(f) + ' 的 HTML 演示区没加 data-collect-ignore，采集时会被当成设计取值');
      }
    }
  }

  /* 两侧约定必须同名：属性写了没人认，等于没写 */
  const collector = read(path.join(FACTORY, 'scripts', 'collect-from-browser.js'));
  const generator = read(path.join(ENGINE, 'new-page.js'));
  if (!/data-collect-ignore/.test(collector)) {
    bad.push('collect-from-browser.js 不再认 data-collect-ignore');
  }
  if (!/data-collect-ignore/.test(generator)) {
    bad.push('new-page.js 注入的演示入口条丢了 data-collect-ignore');
  }
  if (!/stripTransient/.test(generator)) {
    bad.push('new-page.js 的 stripTransient() 不见了——@transient 标记会失效');
  }

  add('S13', '演示区标记（@transient 成对 + data-collect-ignore）', bad.length === 0,
    files.length + ' 个样例模板', bad);
}

/* ================================================================
 * [S14] 引擎骨架不带具体系统的设计锚点
 * `data-page-node-id="<id>"` 是「这块对应设计稿哪个节点」的锚点，
 * check-tokens.js 会跳过含该属性的行（不当硬编码取值查）。机制合法，
 * **但骨架不该带** —— 骨架不属于任何设计稿，带着 A 系统的节点 id 进 B 系统，
 * 只会让人以为它有出处，而它指向一个 B 系统里根本不存在的文件。
 *
 * 实测事故：引擎 `layout/_skeleton.html` 里带着 6 个上游系统的 Figma 节点 id，
 * 建包后原样进了新包。S3 查不到（不是色值）、S5 查不到（只管文档）、
 * S8 查不到（骨架不是样例）—— 三条都在它旁边，没一条管它。所以单列一条。
 * ================================================================ */
{
  const bad = [];
  const ANCHOR = /\bdata-page-node-id\s*=\s*"([^"]*)"/g;
  const files = walk(ENGINE, (f) => /\.(html|js)$/.test(f));
  for (const f of files) {
    const hits = [...read(f).matchAll(ANCHOR)].map((m) => m[1]);
    /* 文档里讲「这个属性叫什么」是合法的（值写成 <占位> 或空），
     * 带真值才是问题。真值形如 guYhBM3WnfcOoC4e6DcBQU / 1:1466。 */
    const concrete = hits.filter((v) => /^[A-Za-z0-9:_-]{4,}$/.test(v));
    if (concrete.length) {
      bad.push(rel(f) + ' 带着 ' + concrete.length + ' 个具体设计锚点 id（如 ' +
        concrete[0] + '）——骨架不属于任何设计稿，这些 id 在新包里指向不存在的文件');
    }
  }
  add('S14', '引擎骨架不带具体系统的设计锚点', bad.length === 0,
    files.length + ' 个引擎文件', bad);
}

/* ================================================================
 * [S15] CSS 切分健壮性（注释 / 字符串里的花括号）
 *
 * 引擎里数花括号的地方有两处：splitRules（切规则）、scopeCss（切规则头/体）。
 * 它们**跳过注释与字符串**这件事，是靠人记着的约定——一旦有人把它改回
 * `indexOf('{', i)` + 裸计数，症状是「产物里混进注释碎片」：
 * 生成的样式表出现 `.x-modal-mask `。不是四边框。`，而 E1–E5 / W1 全绿。
 *
 * 为什么值得单列一条：这不是「某个模板写错了」，而是**解析器把合法输入读错**。
 * 模板在块注释里引用代码取证（`individualStrokeWeights = {top:0,...}`）是常规写法，
 * 禁掉它是把成本转嫁给模板作者。要修的是解析器，所以要测解析器。
 *
 * 实测事故（2026-09-17，ZJPT 包）：modal 模板的 CSS 头注释里写了描边证据，
 * `--overlay=modal` 注入宿主页时产物样式表被截断。这条检查就是从它来的。
 *
 * 做法：把引擎里的几个纯函数抠出来，喂敌意样例，断言行为。
 * 抽不出函数 = 检查失效，直接判失败（不能静默通过）。
 * ================================================================ */
{
  const bad = [];
  const generatorSrc = read(path.join(ENGINE, 'new-page.js'));

  /** 按花括号配对抠出一个函数的完整文本（跳过字符串与注释——本检查自己也得守这条） */
  function sliceFunction(src, name) {
    const start = src.indexOf('function ' + name + '(');
    if (start < 0) return null;
    let i = src.indexOf('{', src.indexOf(')', start));
    if (i < 0) return null;
    let d = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
      if (ch === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e + 1; continue; }
      if (ch === '/' && src[i + 1] !== '/' && src[i + 1] !== '*') {
        /* 正则字面量。本配平器原先只跳过字符串，遇到**含引号的正则**
         * （`html\[data-theme\s*=\s*['"]?light['"]?\]`）会把引号当成字符串起点、
         * 一路吃到下一个引号，括号配平随之失败 → 整段函数抽不出来
         * （实测：new-page.js 的 parts() 加了一行亮色块正则，S18 立刻报「抽不出 parts」）。
         * 判据用「上一个有效字符」：正则只能出现在这些位置；不满足就不当正则，
         * 所以除法（`a / b`）不受影响。误判代价只是「多跳一段」，不会把配平带反。 */
        let p = i - 1;
        while (p >= start && /\s/.test(src[p])) p--;
        const prev = p >= start ? src[p] : '';
        if (prev === '' || '(,=:[!&|?{};+-*%~^<>'.includes(prev)) {
          let j = i + 1;
          let inCls = false;
          while (j < src.length) {
            const c = src[j];
            if (c === '\\') { j += 2; continue; }
            if (c === '\n') break;                 /* 正则不跨行 */
            if (c === '[') inCls = true;
            else if (c === ']') inCls = false;
            else if (c === '/' && !inCls) break;
            j++;
          }
          i = j + 1; continue;
        }
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        let j = i + 1;
        while (j < src.length && src[j] !== ch) { if (src[j] === '\\') j++; j++; }
        i = j + 1; continue;
      }
      if (ch === '{') d++;
      else if (ch === '}') { d--; if (d === 0) return src.slice(start, i + 1); }
      i++;
    }
    return null;
  }

  const NAMES = ['stripComments', 'skipInert', 'nextBrace', 'matchBrace', 'splitRules', 'selectorOf', 'scopeSelector', 'scopeCss'];
  const pieces = [];
  for (const n of NAMES) {
    const f = sliceFunction(generatorSrc, n);
    if (!f) bad.push('new-page.js 里抽不出 ' + n + '()——S15 无法判定，请同步更新本检查');
    else pieces.push(f);
  }

  if (pieces.length === NAMES.length) {
    let fn = null;
    try {
      fn = new Function(pieces.join('\n\n') + '\nreturn { splitRules, selectorOf, scopeCss };')();
    } catch (e) {
      bad.push('抽取出的函数无法求值：' + e.message);
    }

    if (fn) {
      /* 敌意样例：头注释里引用代码取证（就是 ZJPT 包出事的那种写法） */
      const HOSTILE = [
        '/* ============================================',
        ' * 模板头注释',
        ' *   1. 上下边线各只有一条。individualStrokeWeights = {top:0,right:0,bottom:1,left:0}',
        ' *      foot 是 {top:1,right:0,bottom:0,left:0}。不是四边框。',
        ' * ============================================ */',
        '.x-modal { display: flex; }',
        '',
        '/* 按钮 */',
        '.x-btn { height: 32px; }',
        '.x-btn--primary { background: var(--c); }',
        ''
      ].join('\n');

      const rules = fn.splitRules(HOSTILE);
      const sels = rules.map((r) => fn.selectorOf(r));
      const EXPECT = ['.x-modal', '.x-btn', '.x-btn--primary'];

      if (JSON.stringify(sels) !== JSON.stringify(EXPECT)) {
        bad.push('splitRules 切出的选择器不对：期望 ' + JSON.stringify(EXPECT) + '，实际 ' + JSON.stringify(sels));
      }
      if (sels.some((s) => /[{}]/.test(s))) {
        bad.push('有规则的选择器里含花括号——splitRules 没跳过注释里的花括号');
      }
      if (sels.some((s) => /\/\*|\*\//.test(s))) {
        bad.push('有规则的选择器里含注释标记——注释被切成了规则');
      }
      if (rules.length && !/display:\s*flex/.test(rules[0])) {
        bad.push('首条规则的规则体被注释里的花括号截断了');
      }

      /* scopeCss 是同一个坑的另一半：切规则头时若用 indexOf('{')，
       * 注释前缀会被当成选择器并被加上遮罩作用域前缀。 */
      const scoped = fn.scopeCss(HOSTILE, '.mask');
      const scopedHeads = fn.splitRules(scoped).map((r) => fn.selectorOf(r));
      if (scopedHeads.length !== 3 || !scopedHeads.every((h) => h.startsWith('.mask '))) {
        bad.push('scopeCss 结果不对：期望 3 条且都带 .mask 前缀，实际 ' + JSON.stringify(scopedHeads));
      }
      if (/[。`]/.test(scoped.replace(/\/\*[\s\S]*?\*\//g, ''))) {
        bad.push('scopeCss 产物里混进了注释碎片——切规则头时没跳过注释');
      }

      /* 字符串里的花括号同样不能计层级 */
      const strRules = fn.splitRules('.x-a { content: "{"; }\n.x-b { color: red; }');
      if (JSON.stringify(strRules.map((r) => fn.selectorOf(r))) !== JSON.stringify(['.x-a', '.x-b'])) {
        bad.push('字符串里的花括号带偏了层级计数（content: "{" 这类）');
      }

      /* @media 必须作为一整条返回，且 scopeCss 要递归进去 */
      const media = '@media (min-width: 600px) { .x-a { color: red; } }\n.x-b { color: blue; }';
      const mediaRules = fn.splitRules(media);
      if (mediaRules.length !== 2 || fn.selectorOf(mediaRules[0]) !== '@media (min-width: 600px)') {
        bad.push('@media 未被当成一整条规则返回');
      }
      if (!/@media \(min-width: 600px\) \{[\s\S]*\.m \.x-a/.test(fn.scopeCss(media, '.m'))) {
        bad.push('scopeCss 没有递归进 @media 内部');
      }
    }
  }

  add('S15', 'CSS 切分健壮性（注释/字符串里的花括号）', bad.length === 0,
    '4 组敌意样例', bad);
}

/* ================================================================
 * [S16] 约定选择器匹配的边界（`contains` 不能漏掉 `-`）
 *
 * check-tokens.js 的 [E4] 有两种选择器匹配：exact（rulesFor）与 contains（rulesLike）。
 * contains 的边界原本写成 `\b`——它只挡住了 `__`（下划线是词字符），
 * **挡不住 BEM 的 `-` 与 `--`**：`.x-modal\b` 会命中 `.x-modal-mask .x-field__control`。
 *
 * 实测事故（2026-09-17，ZJPT 包）：一条「弹窗本体方角无投影」的 forbid-property 约定，
 * 把浮层注入后产生的后代规则（`.x-modal-mask .x-field__control` 的 border-radius）
 * 也判成了违规。而且**只在 --overlay 注入路径下出现**——
 * 直接校验模板是绿的，因为作用域前缀是注入时才加上去的。
 *
 * 为什么值得单列一条：这是**断言引擎自身的缺陷**，不是某个系统的配置问题。
 * 它不报错、也不漏报，而是**假阳性**——会让人去改本来正确的模板。
 * 而且任何一种 BEM 命名的系统都会踩到。
 *
 * 做法同 S15：抠出纯函数喂样例。抽不出函数 = 检查失效，直接判失败。
 * ================================================================ */
{
  const bad = [];
  const checkerSrc = read(path.join(ENGINE, 'check-tokens.js'));

  /** 抠出 `const <name> = …;` 这条语句（引擎里这几个都是单语句箭头函数） */
  function sliceArrow(src, name) {
    const start = src.indexOf('const ' + name + ' = ');
    if (start < 0) return null;
    const end = src.indexOf(';\n', start);
    if (end < 0) return null;
    return src.slice(start, end + 1);
  }

  const NAMES = ['selHas', 'rulesFor', 'rulesLike'];
  const pieces = [];
  for (const n of NAMES) {
    const f = sliceArrow(checkerSrc, n);
    if (!f) bad.push('check-tokens.js 里抽不出 ' + n + '——S16 无法判定，请同步更新本检查');
    else pieces.push(f);
  }

  if (pieces.length === NAMES.length) {
    let fn = null;
    try {
      fn = new Function(pieces.join('\n\n') + '\nreturn { rulesLike, rulesFor };')();
    } catch (e) {
      bad.push('抽取出的函数无法求值：' + e.message);
    }

    if (fn) {
      /* 造规则：sel 是选择器文本，body 留空（S16 只关心「命中哪些」） */
      const R = (...sels) => sels.map((s) => ({ sel: s, body: '' }));
      const hit = (sels, q) => fn.rulesLike(R(...sels), q).length;

      /* ── 必须命中 ── */
      const MUST_HIT = [
        [['.x-modal'], '.x-modal', '整条选择器就是它'],
        [['.mask .x-modal'], '.x-modal', '作为后代选择器的最后一段'],
        [['.x-modal, .x-other'], '.x-modal', '逗号列表里的成员之一'],
      ];
      for (const [sels, q, why] of MUST_HIT) {
        if (hit(sels, q) !== 1) bad.push('contains 漏命中：' + why + '（' + q + ' ← ' + sels.join(' | ') + '）');
      }

      /* ── 必须不命中（就是这条检查存在的理由）── */
      const MUST_MISS = [
        [['.mask .x-modal-mask'], '.x-modal', '后接 `-`（块名是另一个类的前缀）'],
        [['.mask .x-modal--base'], '.x-modal', '后接 `--`（BEM 修饰符）'],
        [['.mask .x-modal__head'], '.x-modal', '后接 `__`（BEM 元素）'],
        [['.mask .x-field__control'], '.x-modal', '整条里根本没有该块名'],
        [['.x-modal-thing'], '.x-modal', '同一层级里的另一个类'],
      ];
      for (const [sels, q, why] of MUST_MISS) {
        if (hit(sels, q) !== 0) bad.push('contains 假阳性：' + why + '（' + q + ' ← ' + sels.join(' | ') + '）');
      }

      /* ── exact 只认整条，不受边界影响 ── */
      if (fn.rulesFor(R('.x-modal', '.mask .x-modal'), '.x-modal').length !== 1) {
        bad.push('exact 匹配（rulesFor）没有只认整条选择器');
      }
    }
  }

  add('S16', '约定选择器匹配的边界（contains 的 - / _ / 词边界）', bad.length === 0,
    '8 组样例（3 必中 / 5 必不中）', bad);
}

/* ---------------------------------------------------------------------------
 * [S17] 采集器的「不可见节点」判定
 * ---------------------------------------------------------------------------
 * 为什么要有这条（见 CHANGELOG v1.9）：采集器默认跳过不可见节点，而这个判定就是
 * 「采样口径」本身。它判错，挖掘报告的色板 / 字阶 / 字体族会整体失真，
 * 而且**不报错**：隐藏节点继承 html / body 的浏览器默认黑与 16px，
 * 会把频次第一名直接顶掉，出来是一份看起来完全正常的报告。
 *
 * 这类「引擎替使用者做判断」的地方，必须给判断本身写断言，且要有反向样例：
 * 只测「该跳的跳掉了」证明不了「不该跳的没被误跳」。
 * 判定被抽成不依赖 DOM 的纯函数 isHiddenBox，就是为了这里能真跑起来。
 */
(function checkHiddenBox() {
  const bad = [];
  const p = path.join(FACTORY, 'scripts', 'collect-from-browser.js');
  if (!fs.existsSync(p)) {
    add('S17', '采集器「不可见节点」判定', false, '找不到 collect-from-browser.js', []);
    return;
  }
  const src = fs.readFileSync(p, 'utf8');

  /* 用 indexOf 抽源码，不用正则——正则在源码里要写一长串反斜杠，太容易写错。
   * 函数体内没有嵌套花括号，所以第一个「两空格 + 右花括号」就是函数结尾；
   * 将来真加了嵌套块，抽出来会语法错误 → 这条检查报红（fail-safe，不会静默放行）。 */
  const START = 'function isHiddenBox';
  const CLOSE = '  }';
  const i0 = src.indexOf(START);
  const i1 = i0 === -1 ? -1 : src.indexOf(CLOSE, src.indexOf('return false;', i0));
  const fnSrc = i0 === -1 || i1 === -1 ? null : src.slice(i0, i1 + CLOSE.length);

  if (!fnSrc) {
    add('S17', '采集器「不可见节点」判定', false, '抽不到 isHiddenBox 源码',
      ['函数被删或改了签名 —— 采样口径失去断言，等于退回 CHANGELOG v1.9 的事故状态']);
    return;
  }
  let fn;
  try {
    fn = new Function('return (' + fnSrc + ')')();
  } catch (e) {
    add('S17', '采集器「不可见节点」判定', false, 'isHiddenBox 无法求值：' + e.message, []);
    return;
  }
  if (typeof fn !== 'function') {
    add('S17', '采集器「不可见节点」判定', false, 'isHiddenBox 不是函数', []);
    return;
  }

  const box = (w, h) => ({ width: w, height: h });
  const st = (o) => Object.assign({ display: 'block', visibility: 'visible', opacity: '1' }, o || {});

  const MUST_HIDE = [
    [st({ display: 'none' }), box(100, 40), 'display:none（antd 未激活的页签面板）'],
    [st({ visibility: 'hidden' }), box(100, 40), 'visibility:hidden'],
    [st({ visibility: 'collapse' }), box(100, 40), 'visibility:collapse（表格行折叠）'],
    [st({ opacity: '0' }), box(100, 40), 'opacity:0'],
    [st({}), box(0, 0), '零尺寸（图标雪碧图里的 symbol / path）'],
    [st({}), box(100, 0), '零高度'],
    [st({}), box(0, 40), '零宽度'],
    [null, box(10, 10), '取不到 computed style'],
  ];
  const MUST_KEEP = [
    [st({}), box(100, 40), '普通可见元素'],
    [st({ opacity: '0.5' }), box(100, 40), '半透明但可见（0.5 不能当成 0）'],
    [st({ opacity: '0.01' }), box(100, 40), '极低但非零的透明度'],
    [st({ display: 'flex' }), box(1, 1), '1x1 的可见元素（不是零尺寸）'],
  ];
  for (const [s, r, why] of MUST_HIDE) if (!fn(s, r)) bad.push('该跳没跳：' + why);
  for (const [s, r, why] of MUST_KEEP) if (fn(s, r)) bad.push('误跳（假阳性）：' + why);

  add('S17', '采集器「不可见节点」判定（该跳的跳 / 不该跳的不跳）', bad.length === 0,
    MUST_HIDE.length + ' 必跳 + ' + MUST_KEEP.length + ' 必留', bad);
})();

/**
 * [S18] HTML 注释里的标签字面量不得带偏 parts()
 *
 * 事故（2026-09-23，STARS 沉淀第一个浮层模板）：模板头注释里写了
 *   「底部的 <script> 是通用实现：关闭图标 / 取消按钮 / Esc 关闭」
 * 而 parts() 找脚本用的是「第一个开标签 → 第一个闭标签」。
 * 注释里那个字面量位置更靠前，于是**从注释起直到文件真正的闭标签**整段被当成脚本内容，
 * 产物里凭空多出浮层模板的其余内容（另外两档弹窗、演示区、连 `</style></head><body>` 一起），
 * 而 E1–E5 / W1 / I1 全绿、退出码 0。
 *
 * 判法：抠出 parts() / maskHtmlComments() / htmlScripts() 喂敌意样例，
 * 要求「注释里的字面量被跳过」「正文里的真脚本被取到」「注释本身原样保留」。
 */
(function checkCommentLiterals() {
  const bad = [];
  const generatorSrc = read('assets/engine/scripts/new-page.js');
  if (!generatorSrc) {
    add('S18', 'HTML 注释里的标签字面量不带偏解析', false, '读不到 new-page.js', []);
    return;
  }
  /* 抠函数：与 S15 同一套括号配平器 */
  const sliceFunction = (src, name) => {
    const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
    if (!m) return null;
    const start = m.index;
    let i = src.indexOf('(', start);
    let pd = 0;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === '"' || ch === "'" || ch === '`') {
        let j = i + 1;
        while (j < src.length && src[j] !== ch) { if (src[j] === '\\') j++; j++; }
        i = j; continue;
      }
      if (ch === '(') pd++;
      else if (ch === ')') { pd--; if (pd === 0) { i++; break; } }
    }
    const b = src.indexOf('{', i);
    let d = 0;
    for (let k = b; k < src.length; k++) {
      const ch = src[k];
      if (ch === '/' && src[k + 1] === '*') { const e = src.indexOf('*/', k + 2); k = e < 0 ? src.length : e + 1; continue; }
      if (ch === '/' && src[k + 1] === '/') { const e = src.indexOf('\n', k); k = e < 0 ? src.length : e + 1; continue; }
      if (ch === '/' && src[k + 1] !== '/' && src[k + 1] !== '*') {
        /* 正则字面量：与 S15 那份配平器同一处修正，理由见 S15 的注释。
         * 不认正则 → 含引号的正则会被当成字符串，parts() 直接抽不出来。 */
        let p = k - 1;
        while (p >= start && /\s/.test(src[p])) p--;
        const prev = p >= start ? src[p] : '';
        if (prev === '' || '(,=:[!&|?{};+-*%~^<>'.includes(prev)) {
          let j = k + 1;
          let inCls = false;
          while (j < src.length) {
            const c = src[j];
            if (c === '\\') { j += 2; continue; }
            if (c === '\n') break;
            if (c === '[') inCls = true;
            else if (c === ']') inCls = false;
            else if (c === '/' && !inCls) break;
            j++;
          }
          k = j + 1; continue;
        }
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        let j = k + 1;
        while (j < src.length && src[j] !== ch) { if (src[j] === '\\') j++; j++; }
        k = j; continue;
      }
      if (ch === '{') d++;
      else if (ch === '}') { d--; if (d === 0) return src.slice(start, k + 1); }
    }
    return null;
  };

  /* parts() 依赖 stripTransient，一并抠出来 */
  const NAMES = ['maskHtmlComments', 'htmlScripts', 'stripTransient', 'parts'];
  const pieces = [];
  for (const n of NAMES) {
    const f = n === 'stripTransient'
      ? (() => {
        const re = /const TRANSIENT_RE = [\s\S]*?;\n/.exec(generatorSrc);
        const fn = sliceFunction(generatorSrc, 'stripTransient');
        return re && fn ? re[0] + fn : null;
      })()
      : sliceFunction(generatorSrc, n);
    if (!f) bad.push('new-page.js 里抽不出 ' + n + '——S18 无法判定，请同步更新本检查');
    else pieces.push(f);
  }

  if (pieces.length === NAMES.length) {
    let fn = null;
    try {
      fn = new Function(pieces.join('\n\n') + '\nreturn { parts, htmlScripts, maskHtmlComments };')();
    } catch (e) {
      bad.push('抽取出的函数无法求值：' + e.message);
    }
    if (fn) {
      /* 敌意样例：注释里既有开标签字面量、也有闭标签字面量；正文里有一个真脚本 */
      const HOSTILE = [
        '<!DOCTYPE html>',
        '<html><head>',
        '<!-- ============================================',
        '     说明：底部的 <script> 是通用实现（关闭图标 / 取消按钮 / Esc）。',
        '     ⚠ 注意 </script> 这种闭标签字面量同样会骗过解析。',
        '     ============================================ -->',
        '<style>',
        '  :root { --x: 1; }',
        '  .a { color: red; }',
        '</style>',
        '</head>',
        '<body>',
        '<!-- 业务替换点：正文里的注释要原样保留 -->',
        '<div class="a">内容</div>',
        '<script>',
        '  var real = 1;',
        '</script>',
        '</body></html>',
      ].join('\n');

      const p = fn.parts(HOSTILE);

      /* 1) 脚本只应取到正文里那一个，且内容就是它 */
      if (p.scripts.length !== 1) {
        bad.push('parts().scripts 数量不对：期望 1（正文里那个），实际 ' + p.scripts.length
          + '——注释里的开标签字面量把后面的内容吞进来了');
      } else if (!/var real = 1;/.test(p.scripts[0]) || /<style>|<\/head>|<body>/.test(p.scripts[0])) {
        bad.push('取到的「脚本」内容不对（把非脚本内容也算进来了）：' + JSON.stringify(p.scripts[0].slice(0, 80)));
      }

      /* 2) bodyInner 要保留正文、挖掉脚本、保留注释 */
      if (/var real = 1;/.test(p.bodyInner)) bad.push('bodyInner 里还留着脚本内容');
      if (!/class="a"/.test(p.bodyInner)) bad.push('bodyInner 把正文一起挖掉了');
      if (!/业务替换点/.test(p.bodyInner)) bad.push('bodyInner 把正文里的注释一起挖掉了');

      /* 3) style 段只应取到真的那一段 */
      if (!/--x: 1/.test(p.style) || /<\/head>/.test(p.style)) {
        bad.push('style 段取错（把 style 之后的内容也算进来了）');
      }

      /* 4) maskHtmlComments 必须等长（下标要能直接用于原文），且掩掉注释里的字面量。
       *    样例里 <script> 出现 2 次（注释里 1 次 + 正文里 1 次），掩码后应只剩正文那 1 次。 */
      const masked = fn.maskHtmlComments(HOSTILE);
      const count = (s) => (s.match(/<script/g) || []).length;
      if (masked.length !== HOSTILE.length) {
        bad.push('maskHtmlComments 改变了长度（' + HOSTILE.length + ' → ' + masked.length + '），下标会错位');
      }
      if (count(HOSTILE) !== 2 || count(masked) !== 1) {
        bad.push('maskHtmlComments 掩码结果不对：样例里 <script 出现 ' + count(HOSTILE)
          + ' 次、掩码后 ' + count(masked) + ' 次，期望 2 → 1（注释里那次被掩掉、正文那次保留）');
      }
    }
  }

  add('S18', 'HTML 注释里的标签字面量不带偏 parts()', bad.length === 0,
    '1 组敌意样例（注释含开/闭标签字面量）', bad);
})();

/* ================================================================
 * [S19] 约定类型「文档承诺的」与「校验器实现的」双向一致
 *
 * 起因（2026-09-23，STARS 裁决 conventions.json）：本系统有几条结构约定——
 *   「间距一律走 Token，不得出现裸 px」「圆角只用两档」「表格取值走统一阶梯」——
 * 既不是有限白名单（require-value 要枚举出每一个具体取值），
 * 也不是「必须声明」（require-property 会要求每条匹配规则都写该属性）。
 * 现有类型一个都表达不了，于是给校验器加了 `require-value-pattern`。
 *
 * 加一个类型要同时改 5 处：校验器实现、引擎 README 的类型表、
 * references/03-generation.md 的类型表、文档骨架 conventions.json.tpl 的 `_类型参考`、
 * 样例 conventions.sample.json 的 `_类型参考`。
 * 漏改任意一处，使用者就会照着文档写一个校验器不认识的类型——
 * 而 `default:` 分支只报「未知的约定类型」，报错信息里不带任何指引。
 * 这正是 §3.2「文档承诺的能力，代码必须做得到」。
 *
 * 判法：从 runRule 的 switch 里抠出全部 case 类型名，
 * 与 4 处文档来源逐一比对，**双向**求差（实现有文档没写 / 文档写了实现没有），
 * 再顺带确认样例 rules 里用到的类型都是实现过的。
 */
(function checkRuleTypes() {
  const bad = [];
  const implSrc = read('assets/engine/scripts/check-tokens.js');
  if (!implSrc) { add('S19', '约定类型的文档与实现一致', false, '读不到 check-tokens.js', []); return; }

  /* 实现：runRule 的 switch 分支（只取这一段，避开文件里其它 switch） */
  const a = implSrc.indexOf('function runRule(');
  const b = implSrc.indexOf('function checkConventions(');
  if (a < 0 || b < 0 || b < a) {
    add('S19', '约定类型的文档与实现一致', false, '抠不出 runRule 区段，S19 无法判定', []);
    return;
  }
  const implemented = [...new Set(
    [...implSrc.slice(a, b).matchAll(/case '([a-z][a-z0-9-]*)':/g)].map((m) => m[1])
  )].sort();
  if (implemented.length < 3) {
    bad.push('只抠到 ' + implemented.length + ' 个类型（' + implemented.join(', ') + '），runRule 的写法可能变了，请同步更新本检查');
  }

  /* 文档来源一：markdown 里的类型表。
   * ★ 必须按表头 `| 类型 |` 定位，不能扫「所有反引号开头的表格行」——
   *   同一份文档里还有别的表（如 selector 的 match 取值表 `| exact | contains | all |`），
   *   那样会把 `all` / `contains` 当成规则类型，报出「承诺了未实现的类型」这种假阳性。
   *   实测踩到过一次：加 match 取值表后 S19 立刻误报 2 处。
   *   表头找不到 → 明确报错（不静默跳过），否则文档改名后 S19 会悄悄失去覆盖。 */
  const tableTypes = (text, label) => {
    const lines = text.split('\n');
    const i = lines.findIndex((l) => /^\|\s*类型\s*\|/.test(l.trim()));
    if (i < 0) { bad.push(label + ' 里找不到「| 类型 |」表头——S19 无法判定，请同步更新本检查'); return null; }
    const out = [];
    for (let k = i + 1; k < lines.length; k++) {
      const t = lines[k].trim();
      if (/^\|[\s:|-]+\|$/.test(t)) continue; /* 表头下的分隔行 */
      const m = /^\|\s*`([a-z][a-z0-9-]*)`\s*\|/.exec(t);
      if (!m) break;
      out.push(m[1]);
    }
    if (out.length < 2) bad.push(label + ' 的「| 类型 |」表里没读到类型行——S19 无法判定');
    return [...new Set(out)].sort();
  };
  /* 文档来源二：conventions.json 的 _类型参考（when / 公共字段 不是规则类型） */
  const refKeys = (text, label) => {
    let data = null;
    try { data = JSON.parse(text); } catch (e) { bad.push(label + ' 不是合法 JSON：' + e.message); return null; }
    const ref = data && data._类型参考;
    if (!ref) { bad.push(label + ' 里没有 _类型参考'); return null; }
    return Object.keys(ref).filter((k) => k !== 'when' && k !== '公共字段').sort();
  };

  const sources = [];
  const README = read('assets/engine/scripts/README.md');
  const GEN = read('references/03-generation.md');
  const TPL = read('assets/doc-skeletons/foundation/conventions.json.tpl');
  const SAMPLE = read('assets/samples/conventions.sample.json');

  if (README) { const t = tableTypes(README, '引擎 README'); if (t) sources.push({ label: '引擎 README 的类型表', types: t }); }
  if (GEN) { const t = tableTypes(GEN, '03-generation'); if (t) sources.push({ label: '03-generation 的类型表', types: t }); }
  if (TPL) { const k = refKeys(TPL, 'conventions.json.tpl'); if (k) sources.push({ label: 'conventions.json.tpl 的 _类型参考', types: k }); }
  if (SAMPLE) {
    const k = refKeys(SAMPLE, 'conventions.sample.json');
    if (k) sources.push({ label: 'conventions.sample.json 的 _类型参考', types: k });
    /* 样例 rules 里用到的类型也必须都实现过 */
    try {
      const used = [...new Set((JSON.parse(SAMPLE).rules || []).map((r) => r && r.type).filter(Boolean))].sort();
      const unknown = used.filter((t) => !implemented.includes(t));
      if (unknown.length) bad.push('conventions.sample.json 的 rules 用了未实现的类型：' + unknown.join(' / '));
    } catch (e) { /* JSON 合法性上面已报 */ }
  }
  if (!sources.length) bad.push('一处文档来源都没读到——S19 无法判定，请同步更新本检查');

  const diff = (x, y) => x.filter((v) => !y.includes(v));
  for (const s of sources) {
    const missing = diff(implemented, s.types);
    const extra = diff(s.types, implemented);
    if (missing.length) bad.push(s.label + ' 漏了已实现的类型：' + missing.join(' / '));
    if (extra.length) bad.push(s.label + ' 承诺了未实现的类型：' + extra.join(' / '));
  }

  add('S19', '约定类型的文档与实现一致', bad.length === 0,
    implemented.length + ' 个类型 × ' + sources.length + ' 处文档来源', bad);
})();

/* ================================================================
 * [S20] 生成器不得给「某个系统的名字」兜底
 *
 * 事故（2026-09-23，STARS 生成第一个标杆页时看截图发现）：
 *   new-page.js 里写着 `const SYSTEM = opts.system || '广发中后台系统';`
 *   ——引擎把**另一个系统**的名称写死成了默认值。
 *   后果：本包每一个不显式传 --system 的产物，顶栏品牌文案都是别人的名字。
 *   而 check-tokens / [E4] / 生成器自带的校验**全部是绿的**——
 *   它看起来就是一段正常的业务文案，没有任何校验项会去核对「品牌名对不对」。
 *
 * 判法（两条，一正一反）：
 *   正 —— 系统名必须来自「命令行参数 ∪ 本包契约」，即 opts.system || CONTRACT.system；
 *   反 —— 那一行里不得出现字符串字面量默认值。
 *
 * ⚠ 不要顺手去改 assets/engine/scripts/README.md 里的「广发」与 install-hooks.js 里的
 *   `gf-design-spec`：那两处是**建包时的字面替换源**（建包器把源系统的名字/前缀
 *   整串换成新系统的），改掉它们会让新包里的对应文案替换不出来。
 *   只有「生成器自己的默认值」这一类是必须消灭的硬编码。
 */
(function checkSystemNameDefault() {
  const bad = [];
  const src = read('assets/engine/scripts/new-page.js');
  if (!src) { add('S20', '生成器不给某个系统的名字兜底', false, '读不到 new-page.js', []); return; }

  const line = /const SYSTEM = ([^\n]*)/.exec(src);
  if (!line) {
    bad.push('new-page.js 里找不到「const SYSTEM = …」——S20 无法判定，请同步更新本检查');
  } else {
    if (!/opts\.system\s*\|\|\s*CONTRACT\.system/.test(line[1])) {
      bad.push('系统名的来源不再包含「命令行参数 ∪ 本包契约」：const SYSTEM = ' + line[1]);
    }
    const literal = /'[^']*'|"[^"]*"/.exec(line[1].replace(/\|\|\s*''\s*;?\s*$/, ''));
    if (literal) {
      bad.push('系统名默认值里出现了字符串字面量：' + line[1].trim()
        + '（引擎不得替某个系统起名，留空 + 警告才是对的）');
    }
  }
  /* 空契约里要声明这个字段，否则新包不知道有这回事 */
  const contract = read('assets/engine/scripts/templates/contract.json');
  if (contract && !/"system"\s*:/.test(contract)) {
    bad.push('引擎的空契约 templates/contract.json 里没有 system 字段——新包不会知道要填系统名');
  }
  add('S20', '生成器不给某个系统的名字兜底', bad.length === 0,
    '系统名来自 命令行参数 ∪ 本包契约，无字面量默认值', bad);
})();

/* ---------------------------------------------------------------------------
 * [S21] 采集器的「结构特征计数」口径 —— `<svg>` 不是图表
 * ---------------------------------------------------------------------------
 * 为什么要有这条（见 CHANGELOG v1.14）：`structure.charts` 原先把 `tag === 'svg'`
 * 也算进去。antd 这类图标密集的系统里每个图标都是 `<svg>`，于是 charts 数≈图标数，
 * 而 `mine-tokens.js` 用 `has('charts') → 推断 dashboard 页`——
 * 结果是在**没有图表**的系统上凭空造出一个页面类型，写进挖掘报告，
 * 再被人当成事实抄进模板契约。**全程没有任何检查项会报**：
 * 它不是「算错」，是「口径宽了一档」。
 *
 * 这类「引擎替使用者做判断」的地方，必须给判断本身写断言，且要有反向样例。
 * 计数逻辑被抽成不依赖 DOM 的纯函数 bumpStructure，就是为了这里能真跑起来。
 * 三个方向都测：`<svg>` 只进 svgIcons；`<canvas>` 与图表语义类名进 charts；
 * 普通元素两个都不进。
 */
(function checkStructureCounter() {
  const bad = [];
  const p = path.join(FACTORY, 'scripts', 'collect-from-browser.js');
  if (!fs.existsSync(p)) {
    add('S21', '采集器结构计数口径', false, '找不到 collect-from-browser.js', []);
    return;
  }
  const src = fs.readFileSync(p, 'utf8');

  /* 先咬住「没被改回旧口径」。bumpStructure 的源码断言是下面的主证据，
     这一条是防「换个写法绕过去」的兜底。 */
  if (/tag === 'svg' \|\| tag === 'canvas'/.test(src)) {
    bad.push('charts 又混计 <svg> 了（回到 v1.14 前的口径）——dashboard 推断会再次失真');
  }
  if (!/svgIcons\s*:\s*0/.test(src)) {
    bad.push('structure 字面量里没有 svgIcons: 0 —— 计数会变成 NaN');
  }

  /* bumpStructure 依赖同作用域的 looksLike，两个一起抽出来再拼成一个闭包。
     用 indexOf 而不是正则：正则在源码里要写一长串反斜杠，太容易写错。
     函数体内没有嵌套花括号，所以「两空格 + 右花括号」就是函数结尾；
     将来真加了嵌套块，抽出来会语法错误 → 这条检查报红（fail-safe，不会静默放行）。 */
  const CLOSE = '  }';
  function extract(startMark, endMark) {
    const a = src.indexOf(startMark);
    if (a === -1) return null;
    const b = src.indexOf(CLOSE, src.indexOf(endMark, a));
    return b === -1 ? null : src.slice(a, b + CLOSE.length);
  }
  const lkSrc = extract('function looksLike', 'return re.test');
  const bsSrc = extract('function bumpStructure', 'structure.tags++');

  if (!lkSrc || !bsSrc) {
    add('S21', '采集器结构计数口径', false, '抽不到 looksLike / bumpStructure 源码',
      ['函数被删或改了签名 —— 结构计数口径失去断言，等于退回 CHANGELOG v1.14 的缺陷状态']);
    return;
  }

  let fn;
  try {
    fn = new Function('return (function(){' + lkSrc + '\n' + bsSrc + '\nreturn bumpStructure;})()')();
  } catch (e) {
    add('S21', '采集器结构计数口径', false, 'bumpStructure 无法求值：' + e.message, []);
    return;
  }
  if (typeof fn !== 'function') {
    add('S21', '采集器结构计数口径', false, 'bumpStructure 不是函数', []);
    return;
  }

  const el = (tagName, cls) => ({ tagName, id: '', getAttribute: (k) => (k === 'class' ? (cls || '') : null) });
  const fresh = () => ({
    sidebar: 0, header: 0, footer: 0, tables: 0, forms: 0, buttons: 0, inputs: 0,
    paginations: 0, modals: 0, drawers: 0, tabs: 0, charts: 0, svgIcons: 0, cards: 0, tags: 0,
  });
  const run = (tagName, cls) => {
    const s = fresh();
    fn(s, el(tagName, cls), tagName);
    return s;
  };

  /* 该进 charts 的：图表载体与图表语义类名 */
  const MUST_BE_CHART = [
    ['canvas', '', '<canvas>：图表的真正载体'],
    ['div', 'chartWrap', '类名含 chart（ECharts 容器常见写法）'],
    ['div', 'echarts-container', '类名含 echarts'],
    ['div', 'graph', '类名含 graph'],
  ];
  /* 该只进 svgIcons 的：图标。这一组就是本条的由来。 */
  const MUST_BE_SVG_ONLY = [
    ['svg', 'anticon', 'antd 图标：<svg class="anticon">（旧口径会把它算成图表）'],
    ['svg', 'icon', '普通图标'],
    ['svg', '', '无类名的 <svg>'],
  ];
  /* 两个都不该进的：反向样例 */
  const MUST_BE_NEITHER = [
    ['div', 'box', '普通 div'],
    ['span', 'anticon', '带图标类名的 <span>（不是 svg，也不是图表）'],
    ['header', 'ant-layout-header', '页头'],
  ];

  for (const [t, c, why] of MUST_BE_CHART) {
    const s = run(t, c);
    if (s.charts !== 1) bad.push('该算图表没算：' + why);
    if (s.svgIcons !== 0) bad.push('非 svg 却计了 svgIcons：' + why);
  }
  for (const [t, c, why] of MUST_BE_SVG_ONLY) {
    const s = run(t, c);
    if (s.svgIcons !== 1) bad.push('该算图标没算：' + why);
    if (s.charts !== 0) bad.push('★ 图标被算成图表（v1.14 的缺陷复发）：' + why);
  }
  for (const [t, c, why] of MUST_BE_NEITHER) {
    const s = run(t, c);
    if (s.charts !== 0 || s.svgIcons !== 0) bad.push('误判成图表 / 图标：' + why);
  }

  const total = MUST_BE_CHART.length + MUST_BE_SVG_ONLY.length + MUST_BE_NEITHER.length;
  add('S21', '采集器结构计数口径（<svg> 不是图表）', bad.length === 0,
    MUST_BE_CHART.length + ' 必算图表 + ' + MUST_BE_SVG_ONLY.length + ' 必算图标 + '
      + MUST_BE_NEITHER.length + ' 必不算（共 ' + total + ' 组）', bad);
})();

/* ================================================================
 * [S22] 双主题口径：主题覆盖块算「定义」，亮色列靠格式自证
 * ---------------------------------------------------------------------------
 * 为什么要有这条（见 CHANGELOG v1.15）：校验器原先把 `:root{}` 当**唯一**的定义块，
 * 于是照规范写的 `html[data-theme='light'] { … }` 里每一行都被 [E1] 判成硬编码——
 * **按规范做报错、不做才过**。这类「口径反了」的缺陷表现为**假阳性**，
 * 而假阳性最容易被误当成「是我写错了」，于是没人去改校验器。
 *
 * 这是引擎「替使用者做判断」的地方，必须给判断本身写断言，且要有**反向样例**：
 * 同一个只在主题块里出现的 Token，用「只认 :root」的旧口径必须**判不出**，
 * 用新口径必须**判得出**——只断言后者证明不了修好了什么（旧口径也能绿）。
 *
 * 另外两条不变量也在这里守：
 *   1. 剔除主题块必须**保持行数**（E1/E3 要报行号，删行会让所有行号前移）
 *   2. 剔除时不得吃掉**紧随其后的规则**（正则的 `(^|[;{}])` 起始锚就是为这个）
 */
(function checkThemeParsing() {
  const bad = [];
  const p = path.join(ENGINE, 'check-tokens.js');
  if (!fs.existsSync(p)) {
    add('S22', '双主题口径（主题块算定义 / 亮色列自证）', false, '找不到 check-tokens.js', []);
    return;
  }
  const src = fs.readFileSync(p, 'utf8');

  /* 用 indexOf 抽源码，不用正则（同 S17 的理由：正则在源码里要写一长串反斜杠）。
   * 每段以「两空格 + 右花括号」或行尾为界；抽不到就报红，不静默放行。 */
  const eol = (i) => src.indexOf('\n', i);
  /* ⚠ 返回的是「含闭括号」的下标 —— 直接 indexOf('\n}\n') 得到的是换行位置，
   * slice 到那里会把 `}` 切掉，抽出来的函数体没有闭合括号 → 求值即语法错误。 */
  const fnEnd = (i) => {
    const j = src.indexOf('\n}\n', i);
    return j === -1 ? -1 : j + 2;
  };
  const cut = (anchor, ender) => {
    const i = src.indexOf(anchor);
    if (i === -1) return null;
    const j = ender(i);
    return j === -1 ? null : src.slice(i, j);
  };
  const pieces = [
    ['RESERVED_RE', cut('const RESERVED_RE', eol)],
    ['parseSpec', cut('function parseSpec', fnEnd)],
    ['THEME_SEL/parseThemeVars/stripThemeBlocks',
      cut('const THEME_SEL', (i) => fnEnd(src.indexOf('function stripThemeBlocks', i)))],
    ['norm', cut('function norm', fnEnd)],
    ['isColor', cut('const isColor', eol)],
  ];
  const missing = pieces.filter(([, s]) => !s).map(([n]) => n);
  if (missing.length) {
    add('S22', '双主题口径（主题块算定义 / 亮色列自证）', false,
      '抽不到源码段：' + missing.join(' / '),
      ['函数被改名或删除了 —— 双主题口径失去断言，等于退回 v1.15 之前的假阳性状态']);
    return;
  }

  let api;
  try {
    api = new Function('fs',
      pieces.map(([, s]) => s).join('\n')
        + '\nreturn { parseSpec, parseThemeVars, stripThemeBlocks };')(fs);
  } catch (e) {
    add('S22', '双主题口径（主题块算定义 / 亮色列自证）', false, '无法求值：' + e.message, []);
    return;
  }

  /* ---------- ① 主题块必须被认成定义块 ---------- */
  const CSS = [
    ':root { --stars-color-primary: #49A0F7; }',
    "",
    "html[data-theme='dark']  { --stars-color-text: #D7DCE0; }",
    'html[data-theme="light"] { --stars-color-text: #313133; --stars-color-primary: #2A6CDD; }',
    '[data-theme=dark] { --stars-color-bg: #1A202E; }',
    '',
    '/* 只在亮色块里出现的 Token —— 旧口径（只认 :root）判不出它 */',
    "html[data-theme='light'] .card { --stars-color-surface: #FFFFFF; }",
    '',
    'body { background: var(--stars-color-text); }',
    '.footer { color: var(--stars-color-text); }',
  ].join('\n');

  let tv;
  try {
    tv = api.parseThemeVars(CSS);
  } catch (e) {
    bad.push('parseThemeVars 抛异常：' + e.message);
    add('S22', '双主题口径（主题块算定义 / 亮色列自证）', false, '求值后调用失败', bad);
    return;
  }

  const MUST_FIND = [
    ['light', '--stars-color-text', '#313133', "html[data-theme='light'] 单引号"],
    ['light', '--stars-color-primary', '#2A6CDD', '亮色块里覆盖主色'],
    ['light', '--stars-color-surface', '#FFFFFF', '选择器带后代（`… .card`）'],
    ['dark', '--stars-color-text', '#D7DCE0', "html[data-theme='dark'] 单引号"],
    ['dark', '--stars-color-bg', '#1A202E', '[data-theme=dark] 无引号无 html 前缀'],
  ];
  for (const [theme, name, want, why] of MUST_FIND) {
    if (!tv[theme].has(name)) bad.push('该认出没认出：' + why + ' → ' + name);
    else if (tv[theme].get(name) !== want) {
      bad.push('取值认错：' + why + ' → ' + name + ' 得到 ' + JSON.stringify(tv[theme].get(name))
        + '，期望 ' + JSON.stringify(want));
    }
  }
  if (tv.dark.has('--stars-color-primary')) {
    /* :root 里的 --stars-color-primary 是全局基线，不该被算进 dark 主题块 */
    bad.push('反向污染：:root 的 Token 被算进了 dark 主题块（dark 块里不该有 --stars-color-primary）');
  }

  /* ---------- ② 反向样例：旧口径必须判不出 ---------- */
  const rootOnly = new Set();
  const rootRe = /:root\s*\{([^}]*)\}/g;
  let rm;
  while ((rm = rootRe.exec(CSS)) !== null) {
    const vr = /(--[a-z0-9-]+)\s*:/gi;
    let v;
    while ((v = vr.exec(rm[1])) !== null) rootOnly.add(v[1]);
  }
  if (rootOnly.has('--stars-color-surface')) {
    bad.push('反向样例失效：--stars-color-surface 不该出现在「只认 :root」的集合里');
  }
  if (!tv.light.has('--stars-color-surface')) {
    bad.push('★ 反向样例失效：新口径也没认出 --stars-color-surface，本测试证明不了修复有效');
  }
  /* 反向样例二：紧挨着写的第二个主题块。
   * 消费式起始锚（`(?:^|[;{}])`）会把上一块的 `}` 吃掉，导致这一块整块被跳过——
   * 而它正是最常见的写法。这里断言「连着写也必须都认出」，
   * 也就是把那条旧锚钉死。 */
  const ADJACENT = [
    ":root { --a: #111; }",
    "html[data-theme='dark'] { --b: #222; }",
    "html[data-theme='light'] { --c: #333; }",
  ].join('\n');
  const tv2 = api.parseThemeVars(ADJACENT);
  if (tv2.dark.get('--b') !== '#222') {
    bad.push('★ 紧挨着写的暗色块被漏掉（消费式起始锚的旧缺陷复发）');
  }
  if (tv2.light.get('--c') !== '#333') {
    bad.push('★ 紧挨着写的亮色块被漏掉 —— 亮色覆盖检查会静默跳过，等于 v1.15 白改');
  }

  /* 反向样例三：注释里的 data-theme 字样不得把后面的块据为己有。
   * 不掩注释时，SEL 的惰性前缀会把注释连同 `:root` 的选择器一起吃掉，
   * 于是 :root 的取值被算成亮色取值 → [E2] 报出一堆假的「取值漂移」。 */
  const COMMENTED = [
    "/* 浅色：html[data-theme='light'] 这样覆盖 */",
    ':root { --stars-color-primary: #49A0F7; }',
    '',
    "html[data-theme='light'] { --stars-color-text: #313133; }",
  ].join('\n');
  const tv3 = api.parseThemeVars(COMMENTED);
  if (tv3.light.has('--stars-color-primary')) {
    bad.push('★ 注释里的 data-theme 字样把 :root 的取值误算进了亮色主题（[E2] 会报假漂移）');
  }
  if (tv3.light.get('--stars-color-text') !== '#313133') {
    bad.push('注释掩码误伤了紧随其后的真主题块（该认的没认出来）');
  }
  if (!api.stripThemeBlocks(COMMENTED).includes(':root')) {
    bad.push('★ 注释干扰导致 stripThemeBlocks 误删了 :root 块');
  }

  /* ---------- ③ stripThemeBlocks：不吃后续规则、保持行数 ---------- */
  const stripped = api.stripThemeBlocks(CSS);
  if (/data-theme/.test(stripped)) bad.push('stripThemeBlocks 没剔干净：输出里仍有 data-theme');
  if (stripped.split('\n').length !== CSS.split('\n').length) {
    bad.push('★ 行数变了（' + stripped.split('\n').length + ' vs ' + CSS.split('\n').length
      + '）—— E1/E3 报的行号会整体前移，指向错误的位置');
  }
  if (!stripped.includes(':root')) bad.push('stripThemeBlocks 误删了 :root 块');
  if (!stripped.includes('body {')) bad.push('★ stripThemeBlocks 吃掉了紧随主题块之后的规则');
  if (!stripped.includes('.footer {') || !stripped.includes('var(--stars-color-text)')) {
    bad.push('stripThemeBlocks 吃掉了主题块之后的正文（var 引用应当保留）');
  }

  /* ---------- ④ parseSpec：亮色列靠格式自证，不靠表头标记 ---------- */
  let tmp = null;
  /* 计数要在 try 外声明：try 块内的 const 出了块就没了，
   * 而末尾的 add(...) 还要用它拼说明文字（`MUST_NOT_HAVE_LIGHT` 写在 try 里会 ReferenceError）。 */
  let nSpecMust = 0, nSpecMustNot = 0;
  try {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsf-s22-'));
    const specFile = path.join(tmp, 'tokens.md');
    fs.writeFileSync(specFile, [
      '| Token | 暗色值 | 亮色值 | 用途 |',
      '|-------|--------|--------|------|',
      '| --stars-color-text | #D7DCE0 | #313133 | 正文文字 |',
      '| --stars-color-error | #FF4E4E |  | 错误，两主题同值 |',
      '| --stars-color-up | #FF4E4E | #FF4E4E | 涨，两主题同值（写了也不算漂移） |',
      '| --stars-space-2 | 8px | 8px | 间距，第 2 格不是色值 |',
      '| --stars-color-primary | #49A0F7 | 品牌主色 |',
      '',
      '| Token | 默认值 | 用途 |',
      '|-------|--------|------|',
      '| --stars-radius-1 | 2px | 圆角 |',
    ].join('\n'), 'utf8');

    const r = api.parseSpec(specFile);
    const MUST_HAVE_LIGHT = ['--stars-color-text', '--stars-color-up'];
    const MUST_NOT_HAVE_LIGHT = [
      ['--stars-color-error', '亮色列留空 = 两主题同值，不该登记亮色列'],
      ['--stars-space-2', '★ 第 2 格不是色值（8px）却被当成亮色列'],
      ['--stars-color-primary', '普通三列表不该产生亮色列'],
      ['--stars-radius-1', '普通三列表不该产生亮色列'],
    ];
    nSpecMust = MUST_HAVE_LIGHT.length;
    nSpecMustNot = MUST_NOT_HAVE_LIGHT.length;
    for (const n of MUST_HAVE_LIGHT) if (!r.specLight.has(n)) bad.push('该登记亮色列没登记：' + n);
    for (const [n, why] of MUST_NOT_HAVE_LIGHT) if (r.specLight.has(n)) bad.push(why + ' → ' + n);
    if (r.specLight.get('--stars-color-text') !== '#313133') {
      bad.push('亮色列取错：--stars-color-text 得到 ' + JSON.stringify(r.specLight.get('--stars-color-text')));
    }
    if (r.spec.get('--stars-color-text') !== '#D7DCE0') {
      bad.push('暗色列应仍是第 1 格：--stars-color-text 得到 ' + JSON.stringify(r.spec.get('--stars-color-text')));
    }
    if (r.spec.size !== 6) bad.push('Token 收全性：期望 6 个，实得 ' + r.spec.size);
  } catch (e) {
    bad.push('parseSpec 段抛异常：' + e.message);
  } finally {
    if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* 清理失败不影响判定 */ } }
  }

  add('S22', '双主题口径（主题块算定义 / 亮色列自证 / 剔除保持行数）', bad.length === 0,
    MUST_FIND.length + ' 组必认 + ' + nSpecMust + ' 组必登记亮色 + ' + nSpecMustNot + ' 组必不登记'
      + ' + 3 组反向样例（旧口径判不出 / 相邻块不漏 / 注释不越界）+ 4 项不变量', bad);
})();

/* ================================================================
 * [S23] 「N 项检查」这个数与实际检查项数一致
 * ---------------------------------------------------------------------------
 * 为什么要有这条：`SKILL.md` §8 写着一行「N 项检查」并逐个点名。
 * 它长期停在 **17**，而实际已经有 **21** 项——三个版本没人发现，
 * 因为**没有任何东西把这两个数绑在一起**。
 * 「文档承诺的能力，代码必须做得到」是双向的：文档说少了，
 * 读者就以为工厂只管这些，于是新加的检查等于没加。
 *
 * 这里只绑**数量**（逐项点名无法机械核对，改名/换措辞都会误报），
 * 但数量对不上就说明有人加了检查却没登记，或登记了却没加。
 */
(function checkSelfCheckCount() {
  const bad = [];
  const selfPath = path.join(FACTORY, 'scripts', 'self-check.js');
  const skillPath = path.join(FACTORY, 'SKILL.md');
  if (!fs.existsSync(selfPath) || !fs.existsSync(skillPath)) {
    add('S23', '自检项数量与 SKILL.md 登记一致', false, '找不到 self-check.js 或 SKILL.md', []);
    return;
  }
  /* 只数 `add('Sxx'` 调用，不数头部注释里的 `[Sxx]` 清单——
   * 注释是叙述，调用才是实际生效的检查项。同一个 id 会被 add 多次
   * （早退分支各一次 + 正常收尾一次），所以要去重。 */
  const selfSrc = fs.readFileSync(selfPath, 'utf8');
  const ids = new Set();
  for (const m of selfSrc.matchAll(/add\('(S\d+)'/g)) ids.add(m[1]);
  const actual = ids.size;

  const skill = fs.readFileSync(skillPath, 'utf8');
  const m = /^(\d+)\s*项检查/m.exec(skill);
  if (!m) {
    bad.push('SKILL.md 里找不到「N 项检查」这一行（改了措辞就要同步改本检查的锚点）');
  } else if (Number(m[1]) !== actual) {
    bad.push('SKILL.md 写「' + m[1] + ' 项检查」，实际 ' + actual + ' 项'
      + '（差 ' + (actual - Number(m[1])) + ' 项）—— 加了检查没登记，或登记了没加');
  }

  /* 顺带核对头部注释清单：漏登记的检查在「有哪些项」这件事上会隐身。
   * ⚠ 只认**清单行**（` *   [Sxx] 标题`），不能用 `header.includes('[Sxx]')`——
   *   头部正文里顺口提到某个编号（例如「检查项数量由 [S23] 核一致」）也会命中，
   *   于是「把清单行删掉」测不出来（实测踩过：删了清单行，检查照样绿）。
   *   断言要写**形状**（清单行的格式）而不是「字符串出现过」。 */
  const h0 = selfSrc.indexOf('/**');
  const h1 = h0 === -1 ? -1 : selfSrc.indexOf('*/', h0);
  const header = h0 === -1 || h1 === -1 ? '' : selfSrc.slice(h0, h1);
  const listed = new Set();
  for (const m of header.matchAll(/^[ \t]*\*[ \t]+\[(S\d+)\]/gm)) listed.add(m[1]);
  const missingInHeader = [...ids].filter((id) => !listed.has(id));
  if (missingInHeader.length) {
    bad.push('头部清单里没有：' + missingInHeader.join('、') + '（读者看不到这一项的存在）');
  }
  const extraInHeader = [...listed].filter((id) => !ids.has(id));
  if (extraInHeader.length) {
    bad.push('头部清单里有、但代码里没有：' + extraInHeader.join('、') + '（登记了却没实现）');
  }

  add('S23', '自检项数量与 SKILL.md 登记一致', bad.length === 0,
    '实际 ' + actual + ' 项 / SKILL.md 登记 ' + (m ? m[1] : '?') + ' 项', bad);
})();

/* ---------- [S24] 生成器合并亮色块 ----------
 * ★ 为什么单开一项
 *   双主题系统里 `:root` 与 `html[data-theme='light']` 是**一对**。
 *   `new-page.js` 原来只把内容模板的 `:root` 并进布局，亮色块不并 ——
 *   于是内容模板带进来的 Token 在亮色下**静默沿用暗色取值**：
 *   页面看着「能切主题」，实际有一半元素还是暗的。
 *
 *   症状是 `new-page.js` 末尾报「⚠ 校验未通过」，但逐项计数（E1/E2/E3/W1）**全是 0** ——
 *   真正报红的是 `[E6] 亮色覆盖不全`，而那一行在生成器的输出里根本没打印。
 *   极易被误读成「校验器太严」，真因在生成器。所以必须在这里钉住。
 *
 * ★ 两个方向都断言
 *   · 新口径：布局与内容模板的亮色覆盖必须**并集**进产物
 *   · 旧口径：把亮色分支摘掉（改回只并 `:root`）后必须**并不出**内容的亮色覆盖
 *     否则这条检查证明不了任何事 —— 旧实现也能绿。
 */
(function checkLightMerge() {
  const bad = [];
  const p = path.join(ENGINE, 'new-page.js');
  if (!fs.existsSync(p)) {
    add('S24', '生成器合并亮色块（:root 与亮色覆盖成对搬）', false, '找不到 new-page.js', []);
    return;
  }
  const src = fs.readFileSync(p, 'utf8');

  /* 抽源码：用 indexOf 定位，不用正则（正则在源码里要写一长串反斜杠）。
   * ⚠ `fnEnd` 必须返回**含闭括号**的下标：indexOf('\n}\n') 拿到的是换行位置，
   *   slice 到那里会把 `}` 切掉，抽出来的函数体没有闭合括号 → 求值即语法错误。 */
  const eol = (i) => src.indexOf('\n', i);
  const fnEnd = (i) => {
    const j = src.indexOf('\n}\n', i);
    return j === -1 ? -1 : j + 2;
  };
  const cut = (anchor, ender) => {
    const i = src.indexOf(anchor);
    if (i === -1) return null;
    const j = ender(i);
    return j === -1 ? null : src.slice(i, j);
  };
  const pieces = [
    ['rootVarMap', cut('function rootVarMap', fnEnd)],
    ['lightVarMap', cut('function lightVarMap', fnEnd)],
    ['mergeRootVars', cut('function mergeRootVars', fnEnd)],
  ];
  const missing = pieces.filter(([, s]) => !s).map(([n]) => n);
  if (missing.length) {
    add('S24', '生成器合并亮色块（:root 与亮色覆盖成对搬）', false,
      '抽不到源码段：' + missing.join(' / '),
      ['函数被改名或删除了 —— 亮色合并失去断言，等于退回「亮色下一半是暗色」的状态']);
    return;
  }

  let api;
  try {
    api = new Function(pieces.map(([, s]) => s).join('\n')
      + '\nreturn { rootVarMap, lightVarMap, mergeRootVars };')();
  } catch (e) {
    add('S24', '生成器合并亮色块（:root 与亮色覆盖成对搬）', false, '无法求值：' + e.message, []);
    return;
  }
  if (typeof api.mergeRootVars !== 'function') {
    add('S24', '生成器合并亮色块（:root 与亮色覆盖成对搬）', false, 'mergeRootVars 不是函数', []);
    return;
  }

  /* 夹具：布局与内容模板各有 `:root` + 亮色块，内容模板多一个 `--b`。
   * 内容的亮色块里 `--a` 与布局**同值**（应判为「已有」不重复插），`--b` 是新增。 */
  const LAYOUT = [
    '  :root {',
    '    --a: 1;',
    '  }',
    '',
    "  html[data-theme='light'] {",
    '    --a: 1L;',
    '  }',
    '',
    '  .x { color: var(--a); }',
    '',
  ].join('\n');
  const C_ROOT = '  :root {\n    --a: 1;\n    --b: 2;\n  }\n';
  const C_LIGHT = "  html[data-theme='light'] {\n    --a: 1L;\n    --b: 2L;\n  }\n";
  const LAYOUT_NOLIGHT = '  :root {\n    --a: 1;\n  }\n\n  .x { color: var(--a); }\n';

  const countOf = (s, sub) => s.split(sub).length - 1;
  const lightBodyOf = (s) => {
    const m = /html\[data-theme\s*=\s*['"]?light['"]?\]\s*\{([^{}]*)\}/i.exec(s);
    return m ? m[1] : null;
  };

  /* 1) 函数签名：三个参数（`:root` 一份、亮色覆盖一份，成对） */
  if (api.mergeRootVars.length !== 3) {
    bad.push('mergeRootVars 参数个数 = ' + api.mergeRootVars.length + '，应为 3'
      + '（layoutStyle / contentRootCss / contentLightCss）');
  }

  /* 2) 调用点必须传满三个参数。漏传就是「亮色块没并进去」的最常见形态。 */
  for (const m of src.matchAll(/mergeRootVars\(([^)]*)\)/g)) {
    if (m[1].split(',').length !== 3) {
      bad.push('调用点只传了 ' + m[1].split(',').length + ' 个参数：mergeRootVars(' + m[1] + ')');
    }
  }

  /* 3) 新口径：亮色覆盖必须并集进产物 */
  const merged = api.mergeRootVars(LAYOUT, C_ROOT, C_LIGHT);
  if (!/--b:\s*2;/.test(merged)) bad.push('内容模板的 :root 变量 --b 没并进产物');
  const lightBody = lightBodyOf(merged);
  if (lightBody === null) {
    bad.push('产物里找不到亮色块');
  } else {
    if (!/--b:\s*2L;/.test(lightBody)) {
      bad.push('内容模板的亮色覆盖 --b: 2L 没并进亮色块（这正是缺陷本身）');
    }
    if (!/--a:\s*1L;/.test(lightBody)) bad.push('布局原有的亮色覆盖 --a 被吃掉了');
    if (countOf(lightBody, '--a:') !== 1) {
      bad.push('--a 在亮色块里出现 ' + countOf(lightBody, '--a:') + ' 次，应只 1 次（去重失败）');
    }
    if (countOf(merged, "html[data-theme='light']") !== 1) {
      bad.push('亮色块被拆成了多个（应为 1 个）');
    }
  }
  if (!/\.x\s*\{/.test(merged)) bad.push('合并时吃掉了紧随其后的规则 .x');

  /* 4) 布局没有亮色块时，必须新建一个（旧模板兼容路径） */
  const merged2 = api.mergeRootVars(LAYOUT_NOLIGHT, C_ROOT, C_LIGHT);
  const lightBody2 = lightBodyOf(merged2);
  if (lightBody2 === null) {
    bad.push('布局没有亮色块时，没有新建（旧模板会静默失去亮色覆盖）');
  } else if (!/--b:\s*2L;/.test(lightBody2)) {
    bad.push('新建的亮色块里没有内容模板的覆盖 --b: 2L');
  }

  /* 5) ★ 反向：把亮色分支摘掉（退回「只并 :root」的旧实现），必须**并不出** --b: 2L。
   *    这一条是整项检查的意义所在 —— 少了它，旧实现也能通过第 3 条以外的大部分断言。 */
  const patched = src.replace('if (contentLightCss) {', 'if (false) {');
  if (patched === src) {
    bad.push('反向样例注入失败：源码里找不到 `if (contentLightCss) {`'
      + '（破坏脚本自己没匹配上，等于没测）');
  } else {
    let oldApi = null;
    try {
      const oldPieces = [
        cut('function rootVarMap', fnEnd),
        cut('function lightVarMap', fnEnd),
        (() => {
          const i = patched.indexOf('function mergeRootVars');
          const j = patched.indexOf('\n}\n', i);
          return i === -1 || j === -1 ? null : patched.slice(i, j + 2);
        })(),
      ];
      if (oldPieces.every(Boolean)) {
        oldApi = new Function(oldPieces.join('\n') + '\nreturn { mergeRootVars };')();
      }
    } catch (e) { oldApi = null; }
    if (!oldApi) {
      bad.push('反向样例无法求值（旧实现抽不出来）');
    } else {
      const oldOut = oldApi.mergeRootVars(LAYOUT, C_ROOT, C_LIGHT);
      const oldBody = lightBodyOf(oldOut);
      if (oldBody !== null && /--b:\s*2L;/.test(oldBody)) {
        bad.push('反向样例失效：只并 :root 的旧实现竟然也并进了 --b: 2L'
          + '（说明这条断言分辨不出新旧口径）');
      }
    }
  }

  add('S24', '生成器合并亮色块（:root 与亮色覆盖成对搬）', bad.length === 0,
    '3 个函数 + 5 项不变量 + 1 组反向样例', bad);
})();

/* ---------- [S25] 介绍网页与工厂同步 ----------
 * ★ 为什么单开一项
 *   `介绍-设计系统工厂.html` 是给同事看的**第一份**材料，也是全厂唯一一份
 *   **纯手工维护**的描述性产物。工厂从 v1.0 走到 v1.15，这一页一直写着
 *   「v1.0 / 七项校验 / 3 个脚本」——15 个版本没人发现，
 *   因为**没有任何东西把它和工厂绑在一起**。
 *
 *   它和 `[S23]` 是同一族：**凡是能漂移的数字，都要绑住。**
 *   `[S23]` 绑的是「自检项数」，这里绑的是「版本 / 更新日期 / 校验码集合」。
 *   区别在于 `[S23]` 的双方都是机器产物，而这里有一方是人手写的——
 *   人手写的那一方，漂移概率高一个量级。
 *
 * 断言（全部按**形状**取，不按「字符串出现过」）：
 *   1. 页面版本号 = `SKILL.md` 末尾的版本号
 *   2. 页面的「N 项自检」= self-check 实际项数（与 `[S23]` 同一口径）
 *   3. 页面的「最近更新」= `SKILL.md` 末尾的日期
 *   4. 页面列出的校验码集合 = `check-tokens.js` 头部登记的集合（双向，不多不少）
 */
(function checkIntroPage() {
  const bad = [];
  const introPath = path.join(FACTORY, '介绍-设计系统工厂.html');
  const skillPath = path.join(FACTORY, 'SKILL.md');
  const selfPath = path.join(FACTORY, 'scripts', 'self-check.js');
  const chkPath = path.join(FACTORY, 'assets', 'engine', 'scripts', 'check-tokens.js');
  for (const p of [introPath, skillPath, selfPath, chkPath]) {
    if (!fs.existsSync(p)) {
      add('S25', '介绍网页与工厂同步', false, '找不到 ' + path.relative(FACTORY, p), []);
      return;
    }
  }
  const intro = fs.readFileSync(introPath, 'utf8');
  const skill = fs.readFileSync(skillPath, 'utf8');
  const selfSrc = fs.readFileSync(selfPath, 'utf8');
  const chkSrc = fs.readFileSync(chkPath, 'utf8');

  /* ---- 工厂侧取值 ---- */
  const vm = /版本：(v[\d.]+)/.exec(skill);
  const dm = /最近更新：([\d-]+)/.exec(skill);
  const ids = new Set();
  for (const m of selfSrc.matchAll(/add\('(S\d+)'/g)) ids.add(m[1]);
  const count = ids.size;

  /* ---- 页面侧取值 ---- */
  const iv = /v\d+\.\d+(?:\.\d+)?/.exec(intro);
  const ic = /(\d+)\s*项自检/.exec(intro);
  const idm = /最近更新[：:]\s*([\d-]+)/.exec(intro);

  if (!vm) {
    bad.push('SKILL.md 末尾找不到「版本：vX.Y」—— 改了措辞就要同步改本检查的锚点');
  } else if (!iv) {
    bad.push('介绍页里找不到版本号（形如 `v1.15`）');
  } else if (iv[0] !== vm[1]) {
    bad.push('介绍页写 ' + iv[0] + '，工厂是 ' + vm[1] + '（介绍页手工维护，最容易漂）');
  }

  if (!ic) bad.push('介绍页里找不到「N 项自检」—— 自检项数要能在页面上看到');
  else if (Number(ic[1]) !== count) bad.push('介绍页写「' + ic[1] + ' 项自检」，实际 ' + count + ' 项');

  if (!dm) bad.push('SKILL.md 末尾找不到「最近更新：YYYY-MM-DD」');
  else if (!idm) bad.push('介绍页里找不到「最近更新：YYYY-MM-DD」');
  else if (idm[1] !== dm[1]) bad.push('介绍页写「最近更新：' + idm[1] + '」，工厂是 ' + dm[1]);

  /* ---- 校验码集合：双向比对 ----
   * 引擎侧锚点是头部那几行清单（` *   [E1] 硬编码色值`）。
   * ⚠ 不能用「整个文件里出现过 E1」当锚——变量名、注释正文都会命中。
   * 页面侧只扫 `<code>…</code>` 的内容，同样是为了避开 `data-page-node-id`
   * 这类随机串（`cnvRowE4` 里就有个 E4，扫全文会误判成「页面讲了这个」）。 */
  const engineCodes = new Set();
  for (const m of chkSrc.matchAll(/^[ \t]*\*[ \t]+\[([EWI]\d)\][ \t]+\S/gm)) engineCodes.add(m[1]);
  const pageCodes = new Set();
  for (const cm of intro.matchAll(/<code[^>]*>([\s\S]*?)<\/code>/g)) {
    for (const m of cm[1].matchAll(/\b([EWI]\d)\b/g)) pageCodes.add(m[1]);
  }
  const missing = [...engineCodes].filter((c) => !pageCodes.has(c)).sort();
  const phantom = [...pageCodes].filter((c) => !engineCodes.has(c)).sort();
  if (!engineCodes.size) {
    bad.push('从 check-tokens.js 头部抽不出校验码清单（锚点失效，等于没测）');
  }
  if (missing.length) bad.push('介绍页没讲这些校验项：' + missing.join('、') + '（读者会以为没查）');
  if (phantom.length) bad.push('介绍页讲了、校验器没有：' + phantom.join('、') + '（承诺了做不到的能力）');

  /* ---- ★ 反向样例 ----
   * 把介绍页的版本号改回 `v1.0`，本检查必须报出。
   * 一次就绿的检查必须反向验证——否则「没报」既可能是页面真的对，
   * 也可能是锚点写错、永远匹配不上。两种情形在输出里长得一模一样。 */
  if (!bad.length) {
    const broken = intro.replace(/v\d+\.\d+(?:\.\d+)?/, 'v1.0');
    if (broken === intro) {
      bad.push('反向样例注入失败：介绍页里找不到可替换的版本号（破坏脚本自己没匹配上，等于没测）');
    } else {
      const bv = /v\d+\.\d+(?:\.\d+)?/.exec(broken);
      if (vm && bv && bv[0] === vm[1]) {
        bad.push('反向样例失效：版本号改成 v1.0 后仍被判为一致（这条断言分辨不出新旧）');
      }
    }
  }

  add('S25', '介绍网页与工厂同步（版本 / 项数 / 日期 / 校验码集合）', bad.length === 0,
    '4 项比对 + ' + engineCodes.size + ' 个校验码双向核对 + 1 组反向样例', bad);
})();

/* ---------- [S26] 建包产物可移植（不含绝对路径） ----------
 * ★ 为什么单开一项
 *   `init-package.js` 原先把 `SPEC_ROOT` / `WORKDIR` / `NODE` **三个绝对路径**
 *   直接注进文档骨架。于是每个新包一出生就不可移植，而且是**最坏的那种不可移植**：
 *
 *     · 拷给同事 → 指向不存在的位置（这个还算好的，至少会报错）；
 *     · 若那个路径上恰好还有一份**旧副本** → 包内脚本会去校验旧那份，
 *       打印「全部通过」，而它看的不是眼前这个包。
 *
 *   实测踩到：一个包的 16 个 `tools/*.js` 写死了另一个目录，而那个目录确实存在。
 *   **假通过比报错难查**，因为输出里没有任何异常信号。
 *
 *   这条和 `[S20]`（生成器不给系统名兜底）是同一类：**生成器自己的默认值**
 *   会被复制进每一个新包，所以硬编码在生成器里代价最高、也最该被机器守住。
 *   （引擎 README 里的「广发」、`install-hooks.js` 里的 `gf-design-spec` 不能动——
 *    那是建包时的**字面替换源**；只有生成器自己的默认值必须消灭。）
 *
 * 断言
 *   1. 真跑一次建包，产物里**任何文件**都不含绝对路径（Unix `/…` 与 Windows `X:\`）
 *   2. 控制台给出的校验命令，扫描根是**包本身**而不是它的上一级
 *   3. ★ 反向样例：在**影子工厂**里把绝对路径注回骨架，断言 1 必须报出
 *      （用影子工厂而不是直接改真骨架——自检崩在半路不该留下一个坏骨架）
 */
(function checkGeneratedPortability() {
  const bad = [];
  const init = path.join(FACTORY, 'scripts', 'init-package.js');
  const tplDir = path.join(SKELETONS);
  if (!fs.existsSync(init)) {
    add('S26', '建包产物可移植（不含绝对路径）', false, '找不到 scripts/init-package.js', []);
    return;
  }

  /* 绝对路径的判据。
   * ⚠ 第一版写成「看起来像 /… 的串」，结果把**正则字面量**全算进来了
   *   （`.replace(/-+/g, '-')`、`style.match(/html\[…/)`），报出一堆假的。
   *   和 `[S22]` 的亮色列一样：**口径宽一档不算「算错」，所以没人报**，
   *   而真问题会淹在里面。
   *
   * 现在只认四类**确定是绝对路径**的形态：
   *   ① 本次建包用的那个临时目录（精确串，零假阳性）
   *   ② `/Users/<真实用户名>/`（排除 `/Users/.../` 这种占位写法）
   *   ③ Windows 盘符路径 `C:\…`
   *   ④ `SPEC_ROOT = /…` / `WORKDIR = …` / `NODE = …` 这类**赋值给绝对路径**
   *      —— 这正是当初那个缺陷的形态，也是反向样例要命中的那条
   */
  function absHits(text, tmpDir) {
    const hits = [];
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const RULES = [
      new RegExp(esc(tmpDir)),
      /\/Users\/(?!\.\.\.)[A-Za-z0-9._-]+\//,
      /[A-Za-z]:[\\/][A-Za-z0-9._-]+[\\/]/,
      /^[ \t]*(SPEC_ROOT|WORKDIR|NODE)[ \t]*=[ \t]*(\/|[A-Za-z]:[\\/])/m,
    ];
    for (const line of text.split('\n')) {
      if (RULES.some((r) => r.test(line))) hits.push(line.trim().slice(0, 120));
    }
    return hits;
  }
  const absIn = (text, tmpDir) => absHits(text, tmpDir);

  /* ---- 1) 真跑一次建包 ---- */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsf-s26-'));
  let out = '';
  try {
    const pkgDir = path.join(tmp, 'probe-design-specs');
    const r = spawnSync(process.execPath, [init, '--name=自检用系统', '--prefix=probe', '--out=' + pkgDir],
      { encoding: 'utf8', cwd: tmp });
    out = (r.stdout || '') + (r.stderr || '');
    if (r.status !== 0) {
      bad.push('建包失败（退出码 ' + r.status + '）：' + out.split('\n').slice(-3).join(' / '));
    } else {
      const files = [];
      (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (/\.(md|js|cjs|json|html|css|txt|yml|yaml)$/.test(e.name)) files.push(p);
        }
      })(pkgDir);
      for (const f of files) {
        const hits = absIn(fs.readFileSync(f, 'utf8'), tmp);
        if (hits.length) {
          bad.push('产物含绝对路径：' + path.relative(pkgDir, f) + '（' + hits.length + ' 行）'
            + '　例：' + hits[0]);
        }
      }
      if (!files.length) bad.push('产物里一个待查文件都没有（锚点失效，等于没测）');
    }

    /* ---- 2) 扫描根是包本身 ---- */
    const m = /check-tokens\.js"?\s+"?([^"\s]+)"?\s+--strict/.exec(out);
    if (!m) {
      bad.push('控制台输出里找不到校验命令（改了措辞就要同步改本检查的锚点）');
    } else {
      const scanRoot = m[1];
      const expect = path.join(tmp, 'probe-design-specs');
      if (path.resolve(scanRoot) !== path.resolve(expect)) {
        bad.push('校验命令的扫描根是 ' + scanRoot + '，应为包本身 ' + expect
          + '（取上一级会去扫别的技能包 / 扫到工作区里的旧页面）');
      }
    }

    /* ---- 3) ★ 反向样例：影子工厂里把绝对路径注回骨架 ---- */
    const shadow = path.join(tmp, 'shadow-factory');
    fs.mkdirSync(path.join(shadow, 'scripts'), { recursive: true });
    fs.copyFileSync(init, path.join(shadow, 'scripts', 'init-package.js'));
    fs.cpSync(path.join(FACTORY, 'assets'), path.join(shadow, 'assets'), { recursive: true });
    const tpl = path.join(shadow, 'assets', 'doc-skeletons', 'PACKAGE-SKILL.md.tpl');
    const origTpl = fs.readFileSync(tpl, 'utf8');
    const patchedTpl = origTpl.replace(/^SPEC_ROOT = .*$/m, 'SPEC_ROOT = /opt/some/abs/path');
    if (patchedTpl === origTpl) {
      bad.push('反向样例注入失败：骨架里找不到 `SPEC_ROOT = …` 这一行'
        + '（破坏脚本自己没匹配上，等于没测）');
    } else {
      fs.writeFileSync(tpl, patchedTpl);
      const pkg2 = path.join(tmp, 'shadow-out');
      const r2 = spawnSync(process.execPath, [path.join(shadow, 'scripts', 'init-package.js'),
        '--name=自检用系统', '--prefix=shadow', '--out=' + pkg2], { encoding: 'utf8', cwd: tmp });
      const shadowSkill = path.join(pkg2, 'SKILL.md');
      if (r2.status !== 0 || !fs.existsSync(shadowSkill)) {
        bad.push('反向样例失效：影子工厂建包没成功，无法验证这条断言会不会红');
      } else if (!absIn(fs.readFileSync(shadowSkill, 'utf8'), tmp).length) {
        bad.push('反向样例失效：把绝对路径注回骨架后，产物仍被判为「无绝对路径」'
          + '（这条断言分辨不出新旧）');
      }
    }
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* 清理失败不影响判定 */ }
  }

  add('S26', '建包产物可移植（不含绝对路径）', bad.length === 0,
    '真跑 1 次建包 + 逐文件扫绝对路径 + 扫描根比对 + 1 组影子工厂反向样例', bad);
})();

/* ================================================================
 * [S27] 文档骨架的校验口径与引擎同步（校验码集合 / 项数）
 * ----------------------------------------------------------------
 * ★ 为什么单开一项
 *   `assets/doc-skeletons/PACKAGE-SKILL.md.tpl` 的「交付前必跑」一节，
 *   会把校验码（E1…E6 / W1 / I1）与项数**复述一遍**给新包的使用者看。
 *   这份复述此前**没有任何检查守着**：
 *     · `[S23]` 守的是工厂 SKILL.md 自己登记的自检项数；
 *     · `[S25]` 守的是介绍网页；
 *     · `[S26]` 守的是绝对路径。
 *   三处都不覆盖它——于是「引擎加了 `[E6]`、骨架也改了，
 *   但**按旧骨架生成的那个包**一路带着『七项检查：E1…E5 / W1 / I1』
 *   进了交付 zip」。事后是在「包能不能整体拷走」那一轮里偶然翻出来的，
 *   不是被检查抓到的。只要骨架没人守，同一个洞会在下一版重开。
 *
 * ★ 判据
 *   ① 校验码集合**双向**：骨架讲了引擎没有的 → 承诺做不到；
 *      引擎有骨架没讲的 → 新包的使用者以为没查这一项。
 *   ② 项数声明「N 项检查」——**中文数字也要认**，骨架写的是「八项检查」。
 *   ③ 反向样例：把骨架 §3 里的 `E6` 抹掉必须报出。一次就绿的检查
 *      必须能自证会报，否则「没报」既可能是骨架真的对，也可能是锚点失效。
 * ================================================================ */
{
  const bad = [];
  const TPL = path.join(SKELETONS, 'PACKAGE-SKILL.md.tpl');
  const CHK = path.join(FACTORY, 'assets', 'engine', 'scripts', 'check-tokens.js');

  const engineCodes = new Set();
  if (!fs.existsSync(CHK)) {
    bad.push('找不到 assets/engine/scripts/check-tokens.js');
  } else {
    for (const m of read(CHK).matchAll(/^[ \t]*\*[ \t]+\[([EWI]\d)\][ \t]+\S/gm)) engineCodes.add(m[1]);
    if (!engineCodes.size) bad.push('从引擎头部抽不出校验码清单（锚点失效，等于没测）');
  }

  /* 骨架里对应的是「## 3. 交付前必跑」一节 */
  const H2 = '## 3. 交付前必跑';
  let section = '';
  if (!fs.existsSync(TPL)) {
    bad.push('找不到 PACKAGE-SKILL.md.tpl');
  } else {
    const tpl = read(TPL);
    const i = tpl.indexOf(H2);
    if (i < 0) {
      bad.push('骨架里找不到「' + H2 + '」一节（改了标题就要同步改本检查的锚点）');
    } else {
      const rest = tpl.slice(i + H2.length);
      const j = rest.indexOf('\n## ');
      section = j < 0 ? rest : rest.slice(0, j);
    }
  }

  /* 抽成纯函数，让反向样例**复用同一套判断**——
   * 另写一份判断的话，那份错了也不会被发现。 */
  const diff = (text) => {
    const doc = new Set([...text.matchAll(/\b([EWI]\d)\b/g)].map((m) => m[1]));
    return {
      missing: [...engineCodes].filter((c) => !doc.has(c)).sort(),
      phantom: [...doc].filter((c) => !engineCodes.has(c)).sort(),
    };
  };

  const d = diff(section);
  if (d.missing.length) {
    bad.push('骨架 §3 没讲这些校验项：' + d.missing.join('、') + '（新包的使用者会以为没查）');
  }
  if (d.phantom.length) {
    bad.push('骨架 §3 讲了、引擎没有：' + d.phantom.join('、') + '（承诺了做不到的能力）');
  }

  const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const cn2num = (s) => {
    if (/^\d+$/.test(s)) return Number(s);
    if (s === '十') return 10;
    if (s.length === 2 && s[0] === '十') return 10 + (CN[s[1]] || NaN);
    if (s.length === 2 && s[1] === '十') return (CN[s[0]] || NaN) * 10;
    return CN[s] || NaN;
  };
  const cm = /([0-9]+|[一二三四五六七八九十]+)\s*项检查/.exec(section);
  if (!cm) {
    bad.push('骨架 §3 里找不到「N 项检查」——项数要能在文档里看到');
  } else if (cn2num(cm[1]) !== engineCodes.size) {
    bad.push('骨架 §3 写「' + cm[1] + '项检查」（= ' + cn2num(cm[1]) + '），引擎实际 '
      + engineCodes.size + ' 项');
  }

  /* ★ 反向样例：只在其他项全绿时跑。
   *   文档真坏时（比如 E6 已被抹掉）注入也会失败，会多出一句误导性的二次信息，
   *   让人以为是检查自己出了问题。 */
  if (!bad.length) {
    const broken = section.replace(/\bE6\b/, 'X9');
    if (broken === section) {
      bad.push('反向样例注入失败：骨架 §3 里找不到 `E6` 可替换（破坏脚本自己没匹配上，等于没测）');
    } else if (!diff(broken).missing.includes('E6')) {
      bad.push('反向样例失效：把骨架 §3 的 E6 抹掉后仍未被判为「没讲」（这条断言分辨不出新旧）');
    }
  }

  add('S27', '文档骨架的校验口径与引擎同步（校验码集合 / 项数）', bad.length === 0,
    engineCodes.size + ' 个校验码双向核对 + 项数声明（含中文数字）+ 1 组反向样例', bad);
}

/* ---------- 输出 ---------- */
const failed = results.filter((r) => !r.ok);
const ok = failed.length === 0;

if (AS_JSON) {
  console.log(JSON.stringify({ factory: FACTORY, installed: INSTALLED, pass: ok, results }, null, 2));
  process.exit(ok ? 0 : 1);
}

const L = (s) => console.log(s);
L('===== 设计系统工厂自检 =====\n');
L('工厂根目录　：' + FACTORY);
L('安装副本　　：' + (fs.existsSync(INSTALLED) ? INSTALLED : '(不存在，跳过 S9)'));
L('');
for (const r of results) {
  if (QUIET && r.ok) continue;
  L((r.ok ? '  ✓ ' : '  ✗ ') + '[' + r.id + '] ' + r.title + '　' + r.detail);
  r.items.forEach((it) => L('        · ' + it));
}
L('');
L('----');
L('检查项　　：' + results.length);
L('通过　　　：' + (results.length - failed.length));
L('失败　　　：' + failed.length);
L('');
if (!ok) {
  L('说明：工作区是权威副本。改完先在工作区实测，再同步到安装副本：');
  L('  rsync -a --delete --exclude=\'.workbuddy-ai\' --exclude=\'.DS_Store\' \\');
  L('    ' + FACTORY + '/ ' + INSTALLED + '/');
}
process.exit(ok ? 0 : 1);
