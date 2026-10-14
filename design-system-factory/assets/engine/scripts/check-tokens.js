#!/usr/bin/env node
/**
 * Design Token 双向对齐校验器  v2.0
 * ------------------------------------------------------------
 * 「双向」指两个方向同时校验，缺一不可：
 *
 *   正向（规范 → 交付物）：规范里定义的 Token，交付物引用时取值是否漂移
 *   反向（交付物 → 规范）：交付物里实际在用的 Token，规范是否收编、是否真的定义过
 *
 * 检查项：
 *   [E1] 硬编码色值   —— 正文出现未曾在 :root 声明的 hex / rgb 字面量
 *   [E2] 取值漂移     —— 文件 :root（及主题覆盖块）定义与 foundation/tokens.md 不一致
 *   [E3] 未定义引用   —— var(--x) 被使用，但本文件 :root 里没有定义（引用即失效）
 *   [W1] 规范未收编   —— 文件已定义并使用，但 tokens.md 中没有（潜在双源漂移）
 *   [I1] 规范未落地   —— tokens.md 有定义，但全库零使用（信息项，用于清理废 Token）
 *   [E4] 框架约定     —— 结构级回归，规则来自本包的 foundation/conventions.json
 *   [E5] 取值待填     —— :root 里取值仍为 unset（建包后尚未回灌定稿取值）
 *   [E6] 亮色覆盖不全 —— 声明了亮色块，但没覆盖全「亮色值 ≠ 暗色值」的 Token
 *
 * v1.15 新增：双主题交付物可校验（`[E6]` + `[E2]` 的主题块比对）
 *   起因是一个**方向反了**的失效：本系统的样式约定要求同一份样式写两个主题分支
 *     html[data-theme='dark'] { … }   html[data-theme='light'] { … }
 *   而原实现只把 `:root{}` 当定义块、declaredColors 也只从 :root 收集。
 *   于是亮色块里的 `--stars-color-text: #313133;` 被 [E1] 判成「硬编码色值」——
 *   **按规范做了双主题反而报错，不做才过。**
 *   现在：
 *     1. parseSpec 支持四列表格的亮色列（判别靠「第 2 格是不是色值」，无需表头标记）
 *     2. parseThemeVars 把 `[data-theme=...]` 块也认成定义块
 *     3. 主题块从正文剔除（它们是定义不是使用），其正确性由下面两项负责
 *     4. [E2] 扩展：亮色块取值比对规范的亮色列（缺列 = 两主题同值，比暗色列）
 *     5. [E6] 新增：亮色块必须覆盖本文件所有「亮色≠暗色」的 Token——
 *        漏掉的那些在亮色下会**沿用暗色取值**，页面看着能切主题、实际一半还是暗色，
 *        而这种错不报错也不崩，只会让亮色页悄悄花掉。
 *   ⚠ [E6] 只对「自己声明过亮色块」的文件生效：纯单主题交付物不受影响（向后兼容）。
 *
 * v1.15 修复（同一次改动里抓出来的第二个洞，比上面那个更隐蔽）：
 *   **起始锚用了消费式 `(?:^|[;{}])`，导致紧挨着写的第二个主题块整块被跳过。**
 *       html[data-theme='dark']  { … }
 *       html[data-theme='light'] { … }   ← 失去起始锚，被跳过
 *   连着写正是最常见的写法。后果不是「少查一点」而是**静默失效**：
 *     · themeVars.light 为空 → [E6] 的 `if (themeVars.light.size)` 守卫直接跳过覆盖检查
 *     · stripThemeBlocks 漏掉亮色块 → 亮色取值重新进入 [E1] 正文扫描 →
 *       「按规范做报错、不做才过」的假阳性原地复活
 *   改法：锚改成**零宽后行断言** `(?<=^|[;{}])`。`[^{}]*?` 本身就不跨花括号，
 *   所以约束强度不变，而上一块的 `}` 不再被吃掉。两处必须共用同一个 THEME_BLOCK_RE，
 *   口径不一致会同时产生假阳性与漏检。
 *   另：匹配前把注释掩成**等长空白**——注释里出现的 `html[data-theme='light']` 字样
 *   会把紧随其后的 `:root` 误认成亮色块，于是 :root 取值被算进亮色 → [E2] 报假漂移。
 *   等长是为了让掩码串的下标仍能用来切原文（stripThemeBlocks 走「定位在掩码串、切原文」）。
 *   这两条各有反向样例，常驻在工厂自检 [S22]。
 *
 * v2.1 新增：
 *   - 识别 JS 动态读取的 Token（getPropertyValue('--x') 及自定义封装函数），
 *     这类引用同样算「已落地」，只扫 var() 会漏判
 *   - tokens.md 用途列标注「预留 / 色板 / 暂不使用 / 不适用」的 Token
 *     单列为「已标注预留」，不计入 [I1]
 *
 * v2.2 新增 [E4] 框架结构一致性（原实现把某一套框架的类名写死在代码里）。
 *
 * v3.0 重构 [E4]：断言改为声明式，规则来自本包的 `foundation/conventions.json`。
 *   - 起因：E4 原先硬编码了 8 条某系统的类名断言（内容区 / 面包屑 / 侧栏 /
 *     收起触发器 …）。这类约定是**某一套系统的产物**，换一套系统后
 *     要么全部失效、要么拿别人的约定误报——正是「不生搬硬套」要禁止的事。
 *   - 现在校验器只提供通用断言类型（禁属性／必属性／取值白名单／必须存在的规则／
 *     首子元素／已移除 Token 复辟），具体断言由各系统自己写进 conventions.json。
 *   - conventions.json 不存在或 rules 为空 → [E4] 恒为 0，不报错（新包尚未裁决约定）。
 *   - 参考样例见工厂包 `assets/samples/conventions.sample.json`，**不要照抄**。
 *
 * v3.0 新增 [E5] 取值待填：
 *   - 模板 :root 的具体取值被中性化为 `unset`（只保留 Token 名）时，未回灌前 [E5] 会明确报数，
 *     而不是让使用者面对一屏 [E3] 未定义引用。
 *   - 两种情况会产生 unset：`--seed-templates` 带进来的模板（默认中性化），
 *     以及手工从参考样例抄过来但还没回灌取值的模板。
 *     引擎自己不带成品模板，所以刚建完包时 [E5] 通常是 0——模板沉淀出来后才会出现。
 *
 * v3.1 新增：**演示区（@transient）不参与校验**
 *   - 起因：模板里的演示区（触发按钮 / 假数据 / 说明文字）是临时件，
 *     接入业务时整块删除。生成器按 `@transient` 标记剔除它、采集器按
 *     `data-collect-ignore` 跳过它——**只有校验器还看得见它**。
 *     于是演示按钮上的 `border-radius: 0.375em` 会把本包的一条
 *     「弹窗方角无投影」约定直接判成失败：拿马上要删掉的代码判正式约定。
 *   - 现在 [E1]–[E5] / [W1] / [I1] 一律在剔除演示区后的内容上判定。
 *   - ⚠ 剔除时**按行数补空行**，保持行号不变——E1/E3 的报告要带行号，
 *     直接删行会让所有行号前移，报错指到错误的位置上。
 *   - 标记词与生成器 / 采集器共用同一对：`@transient-start` / `@transient-end`。
 *     三处必须一致，见 scripts/templates/README.md。
 *
 * v3.2 修复：**`match=contains` 的选择器边界漏掉了 `-`**
 *   - 起因：生成「列表页 + 弹窗注入」示例时 [E4] 报出 2 处假阳性——
 *     一条「弹窗本体方角无投影」的 forbid-property 约定，
 *     把 `.zjpt-modal-mask .zjpt-field__control` 的 `border-radius` 也判成了违规。
 *   - 根因：边界写的是 `\b`，而 `-` 不是词字符，
 *     所以 `.zjpt-modal\b` **会**命中 `.zjpt-modal-mask …`。
 *     `\b` 只挡住了 `__`（下划线是词字符），挡不住 BEM 的 `-` 与 `--`。
 *   - 现在用 `(?![-\w])`：后接 `-` / `_` / 词字符都不算命中。
 *   - ⚠ 这类缺陷**只在 --overlay 注入路径下才暴露**：直接校验模板是绿的，
 *     因为作用域前缀 `.zjpt-modal-mask ` 是注入时才加上去的。
 *     教训：**约定要拿「生成出来的产物」做负向测试，不能只测模板。**
 *
 * 用法：
 *   node design-specs/scripts/check-tokens.js [目标目录] [--json] [--strict] [--quiet]
 *        --json    输出机器可读 JSON
 *        --strict  把 [W1] 规范未收编 也计为失败
 *        --quiet   精简输出：只打计数，不打 [I1] 未落地 / 已标注预留清单（门禁 / CI 场景用）
 *
 * 退出码：0 = 通过；1 = 存在 E 级问题（--strict 时 W 级也计失败）
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const ROOT = path.resolve(args.find((a) => !a.startsWith('--')) || process.cwd());
const AS_JSON = args.includes('--json');
const STRICT = args.includes('--strict');
/* --quiet：门禁 / CI 场景只关心「有没有问题」，不打 I1 未落地 / 已标注预留清单 */
const QUIET = args.includes('--quiet');

/* 目标可能是单个文件（只想校验一个页面时），也可能是目录 */
const ROOT_IS_FILE = fs.existsSync(ROOT) && fs.statSync(ROOT).isFile();

/* 规范包根目录：从目标位置向上找，支持「工作区根」「design-specs 目录」
 * 以及「包内任意子目录 / 单个文件」三种调用位置 */
function findSpecRoot(start) {
  let dir = ROOT_IS_FILE ? path.dirname(start) : start;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'foundation', 'tokens.md'))) return dir;
    if (fs.existsSync(path.join(dir, 'design-specs', 'foundation', 'tokens.md'))) return path.join(dir, 'design-specs');
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  /* 兜底：本脚本固定位于规范包 scripts/ 下，规范文件必在 ../foundation/tokens.md。
   * 场景：校验包外产物（如 new-page.js --out=/tmp/x.html）时向上查找会一路到 / 落空，
   * 曾导致「规范 Token 0」→ 全部 Token 误报 [W1] 规范未收编。 */
  const own = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(own, 'foundation', 'tokens.md'))) return own;
  return path.join(start, 'design-specs');
}
const SPEC_ROOT = findSpecRoot(ROOT);
const SPEC_TOKENS = path.join(SPEC_ROOT, 'foundation', 'tokens.md');

const SKIP_DIRS = ['node_modules', '.git', '.workbuddy-ai', 'design-specs/scripts/node_modules'];

/* 文档扫描豁免：JS 动态变量与文档占位符，不是设计 Token */
const DOC_VAR_ALLOW = new Set(['--xxx', '--count', '--n']);

/* ---------- 收集文件 ---------- */
function collect(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) { if (entry.name.endsWith(ext)) out.push(full); continue; }
    /* 自带 foundation/tokens.md 的子目录 = 另一个独立规范包（如并存的元技能引擎副本），
     * 它的 Token 属于它自己的规范，不该拿本包的规范来判「未收编」。
     * 用「是否自带规范文件」判定而非硬编码目录名，换个工作区同样成立。 */
    if (full !== SPEC_ROOT && fs.existsSync(path.join(full, 'foundation', 'tokens.md'))) continue;
    collect(full, ext, out);
  }
  return out;
}

/* ---------- 解析 tokens.md 为规范取值表 ----------
 * spec       —— 全部 Token（含尺寸/阴影/字体等非色值），用于「是否收编」判断
 * specLight  —— **亮色列**的取值，仅双主题系统才有（见下方「双主题表格格式」）
 * reserved   —— 用途列标注为「预留 / 色板 / 暂不使用 / 不适用」的 Token，
 *               属刻意保留不强制落地，不计入 [I1] 未落地
 * 取值漂移比对时另用 isColor() 过滤出色值子集
 *
 * ★ 双主题表格格式（v1.15 新增，向后兼容）
 *   单主题：| Token | 默认值 | 用途 |
 *   双主题：| Token | 暗色值 | 亮色值 | 用途 |      ← 亮色值放**第二列之后**，默认值仍是 cells[0]
 *   判别方式：`cells[1]` 是不是色值字面量。
 *   三列表格里 `cells[1]` 是用途文字（中文开头），不会误判成色值；
 *   四列表格里它就是亮色取值。**不需要在表头加标记**，也就不存在「表头写错但没人发现」。
 *
 *   ⚠ 亮色列**缺失 = 亮色与暗色同值**（如 `colorError` 两主题同值），
 *     此时亮色块不需要覆盖它——[E6] 正是按这条判的。
 */
const RESERVED_RE = /预留|色板|暂不使用|不适用|保留|废弃/;

function parseSpec(file) {
  const spec = new Map();
  const specLight = new Map();
  const reserved = new Set();
  if (!fs.existsSync(file)) return { spec, specLight, reserved };
  const text = fs.readFileSync(file, 'utf8');
  for (const raw of text.split('\n')) {
    const m = /^\|\s*(--[a-z0-9-]+)\s*\|([^\n]*)$/i.exec(raw.trim());
    if (!m) continue;
    const name = m[1];
    const cells = m[2].split('|').map((c) => c.replace(/`/g, '').trim());
    const value = cells[0];
    const note = cells.slice(1).join(' ');
    if (/^(--|\|)/.test(value) || spec.has(name)) continue;
    spec.set(name, value);
    /* 亮色列：至少 3 个单元格、且第 2 个是色值 → 判定为双主题四列表格 */
    if (cells.length >= 3 && isColor(cells[1])) specLight.set(name, cells[1]);
    if (RESERVED_RE.test(note)) reserved.add(name);
  }
  return { spec, specLight, reserved };
}

/* ---------- 提取 JS 中动态读取的 Token ----------
 * 样式表里用 var(--x)，但 JS 里常通过 getPropertyValue('--x') 或自定义
 * 封装函数（如 chartToken('--chart-1')）读取。这类引用同样是「已落地」，
 * 只扫 var() 会漏判，把它们计入全库使用集合。
 */
function parseScriptTokens(raw) {
  const found = new Set();
  const scriptRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptRe.exec(raw)) !== null) {
    const refs = m[1].match(/['"](--[a-z0-9-]+)['"]/g) || [];
    refs.forEach((r) => found.add(r.replace(/['"]/g, '')));
  }
  return found;
}

/* ---------- 提取 :root 块内的自定义属性定义 ---------- */
function parseRootVars(css) {
  const vars = new Map();
  const rootRe = /:root\s*\{([\s\S]*?)\}/g;
  let m;
  while ((m = rootRe.exec(css)) !== null) {
    const varRe = /(--[a-z0-9-]+)\s*:\s*([^;}]+)[;]?/gi;
    let v;
    while ((v = varRe.exec(m[1])) !== null) vars.set(v[1], v[2].trim());
  }
  return vars;
}

/* ---------- 提取主题覆盖块内的自定义属性定义（v1.15 新增） ----------
 * ★ 为什么必须单列这一项
 *   本系统的样式约定要求同一份样式写两个主题分支：
 *       html[data-theme='dark'] { … }
 *       html[data-theme='light'] { … }
 *   而原实现只把 `:root{}` 当「定义块」。后果是**双主题交付物根本过不了校验**：
 *   亮色块里的 `--stars-color-text: #313133;` 会被 [E1] 判成「硬编码色值」——
 *   因为 declaredColors 只从 :root 收集，主题块里的取值不在白名单里。
 *   于是「按规范做了双主题」反而报错，「不做」才过——校验器把方向指反了。
 *
 * 返回 { dark: Map, light: Map }。选择器里出现 `data-theme=dark|light` 即归入对应主题。
 *
 * ★ 起始锚必须是**零宽**的 `(?<=^|[;{}])`，不能用消费式的 `(?:^|[;{}])`。
 *   消费式锚会把上一块的 `}` 吃进匹配，于是紧挨着的下一个主题块**失去起始锚、整块被跳过**：
 *       html[data-theme='dark']  { … }
 *       html[data-theme='light'] { … }   ← 被跳过
 *   而这两个块连着写正是最常见的写法。后果不是「少查一点」而是**静默失效**：
 *   themeVars.light 为空 → [E6] 的 `if (themeVars.light.size)` 守卫直接跳过覆盖检查；
 *   更糟的是 stripThemeBlocks 也漏掉亮色块 → 亮色取值重新进入 [E1] 正文扫描 →
 *   「按规范做报错、不做才过」的假阳性原地复活。
 *   零宽锚下 `[^{}]*?` 本身就不会跨过花括号，所以约束强度不变。
 *
 * ★ 匹配前先把注释掩成等长空白：注释里出现的 `html[data-theme='light']` 字样
 *   会把**紧随其后的那个块**（典型是 `:root`）误认成亮色块，
 *   于是 :root 的取值被算进亮色主题 → [E2] 报出一堆假的「取值漂移」。
 */
const THEME_SEL = '[^{}]*?\\[data-theme\\s*=\\s*[\'"]?(?:dark|light)[\'"]?\\]\\s*[^{}]*?';
const THEME_BLOCK_RE = new RegExp('(?<=^|[;{}])\\s*(' + THEME_SEL + ')\\s*\\{([^{}]*)\\}', 'g');

/* 注释 → 等长空白（保留换行）。等长是为了让「掩码串里的下标」仍能用来切原文。 */
function maskComments(css) {
  return String(css).replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, ' '));
}

function parseThemeVars(css) {
  const out = { dark: new Map(), light: new Map() };
  const masked = maskComments(css);
  const re = new RegExp(THEME_BLOCK_RE.source, 'g');
  let m;
  while ((m = re.exec(masked)) !== null) {
    const sel = m[1];
    const body = m[2];
    const theme = /data-theme\s*=\s*['"]?light/i.test(sel) ? 'light' : 'dark';
    const varRe = /(--[a-z0-9-]+)\s*:\s*([^;}]+)[;]?/gi;
    let v;
    while ((v = varRe.exec(body)) !== null) out[theme].set(v[1], v[2].trim());
  }
  return out;
}

/* ---------- 剔除主题覆盖块（定义，不是使用） ----------
 * 主题块里写的是「定义」，和 :root 一样不该参与 [E1] 正文扫描。
 * 它们的正确性由 [E2] 的亮色比对 + [E6] 覆盖完整性来管——
 * 若把主题块留在正文里靠 declaredColors 兜底，块内的**真·硬编码色值**就再也没人查了。
 * 保留换行数，行号才不会错位。
 *
 * ★ 必须与 parseThemeVars 用**同一个** THEME_BLOCK_RE：两处口径不一致时，
 *   一边认出的块另一边漏掉，就会同时出现「假阳性」和「漏检」。
 *   实现上走「在掩码串上定位、按下标切原文」，既避开注释干扰，
 *   又保证输出里原来的注释一字不动（下游还会再剥一次）。
 */
function stripThemeBlocks(css) {
  const src = String(css);
  const masked = maskComments(src);
  const re = new RegExp(THEME_BLOCK_RE.source, 'g');
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(masked)) !== null) {
    out += src.slice(last, m.index) + '\n'.repeat((m[0].match(/\n/g) || []).length);
    last = m.index + m[0].length;
  }
  return out + src.slice(last);
}

/* ---------- 归一化：便于比对 rgba(42, 108, 221, 0.1) 与 rgba(42,108,221,.1) ---------- */
function norm(s) {
  return String(s)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\.(\d)/g, '0.$1')
    .replace(/\b0+(\d)/g, '$1');
}

const isColor = (s) => /^(#|rgba?\()/i.test(norm(s));

/* ================================================================
 * [E4] 框架约定：声明式断言
 * ---------------------------------------------------------------
 * 校验器只提供通用断言类型；具体断言由本包的 foundation/conventions.json 声明。
 * 这里不出现任何具体系统的类名——那是各系统自己的约定，不该写死在通用校验器里。
 * 见文件头 v3.0 说明。
 */

/* 取出 <style> 内容并剥注释：注释里出现的示例选择器不应参与断言 */
function styleSheetsOf(raw) {
  const out = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(raw)) !== null) out.push(m[1]);
  return out.join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
}

/* 花括号配对解析规则块；@media / @supports 内部递归展开（其中的覆盖同样要受检），
 * @keyframes / @font-face 跳过（内部是 `0%` / `from` 这类伪选择器） */
function parseRules(css) {
  const rules = [];
  const walk = (src, prefix) => {
    let i = 0;
    while (i < src.length) {
      const open = src.indexOf('{', i);
      if (open === -1) return;
      let depth = 0, j = open;
      for (; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) break; }
      }
      const sel = src.slice(i, open).trim();
      const body = src.slice(open + 1, j);
      i = j + 1;
      if (!sel) continue;
      if (/^@(media|supports|layer|container)/i.test(sel)) { walk(body, sel + ' '); continue; }
      if (sel.startsWith('@')) continue;
      rules.push({ sel: (prefix + sel).trim(), body });
    }
  };
  walk(css, '');
  return rules;
}

const selHas = (sel, exact) => sel.split(',').some((s) => s.trim() === exact);
const rulesFor = (rules, exact) => rules.filter((r) => selHas(r.sel, exact));
/* 选择器中「包含某类」。
 *
 * ⚠ 边界不能写 `\b`：`-` 不是词字符，所以 `.zjpt-modal\b` **会**匹配到
 *   `.zjpt-modal-mask .zjpt-field__control`（`.zjpt-modal` 后面接的是 `-`）。
 *   `\b` 只挡住了 `__`（下划线是词字符），挡不住 BEM 的 `-` 与 `--` 修饰符。
 *
 *   实际后果：一条「弹窗本体方角无投影」的 forbid-property 约定，
 *   会把浮层注入后产生的后代规则（`.zjpt-modal-mask .zjpt-field__control`
 *   的 border-radius）也判成违规 —— 假阳性，而且**只在 --overlay 注入路径下出现**，
 *   直接校验模板是绿的，生成示例页才暴露。
 *
 * 所以边界用负向先行断言 `(?![-\w])`：后接 `-` / `_` / 词字符都不算命中。
 * 需要「整条选择器等于某值」的场景请用 match=exact（rulesFor），语义更明确。 */
const rulesLike = (rules, cls) =>
  rules.filter((r) => r.sel.split(',').some((s) => new RegExp(cls.replace(/\./g, '\\.') + '(?![\\w-])').test(s)));

/* 取声明值；只在本规则块内找，不跨块（跨块匹配曾导致审计误判全军覆没） */
function decl(body, prop) {
  const m = new RegExp('(?:^|[;{\\s])' + prop + '\\s*:\\s*([^;}]+)').exec(body);
  return m ? m[1].trim() : null;
}

/* 已移除 Token 表（`| --x | 取值 | v1.2 | 改用 |`），用于检测「删掉的 Token 被抄回来」 */
function parseRemoved(file) {
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^\|\s*`?(--[a-z0-9-]+)`?\s*\|\s*([^|]*?)\s*\|\s*(v[\d.]+)\s*\|\s*([^|]*?)\s*\|/i.exec(raw.trim());
    if (m) map.set(m[1], { version: m[3], use: m[4] });
  }
  return map;
}

/* ---------- 约定装载 ---------- */
/* 约定文件：<规范包>/foundation/conventions.json
 * 不存在或 rules 为空 → 不校验结构（新包在裁决阶段之前本就该是空的），不算失败。 */
function loadConventions(file) {
  if (!fs.existsSync(file)) return { rules: [], present: false };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return { rules: [], present: true, broken: e.message };
  }
  const rules = Array.isArray(data) ? data : (Array.isArray(data.rules) ? data.rules : []);
  return { rules: rules.filter((r) => r && typeof r === 'object'), present: true };
}

/* ---------- 元素规格解析 ----------
 * 规格写法与 CSS 选择器一致：`main.x-content` / `.x-breadcrumb` / `nav.x-breadcrumb`
 * 只支持「标签 + 类名」，不支持层级、伪类、属性选择器——够用且不会误判。
 * 注意与上面的 parseSpec(tokens.md) 区分：那个解析规范表格，这个解析元素选择器。 */
function parseElSpec(spec) {
  const s = String(spec || '').trim();
  const m = /^([a-z][a-z0-9-]*)?((?:\.[A-Za-z0-9_-]+)*)$/.exec(s);
  if (!m) return null;
  const classes = (m[2] || '').split('.').filter(Boolean);
  if (!m[1] && !classes.length) return null;
  return { tag: m[1] || '', classes };
}

function tagsOf(html, tag) {
  return html.match(new RegExp('<' + (tag || '[a-z][a-z0-9-]*') + '\\b[^>]*>', 'gi')) || [];
}

function tagHasClasses(tagStr, classes) {
  const cm = /class\s*=\s*"([^"]*)"/i.exec(tagStr);
  const list = cm ? cm[1].split(/\s+/).filter(Boolean) : [];
  return classes.every((c) => list.includes(c));
}

/* HTML 中是否存在符合规格的元素 */
function htmlHasSpec(html, spec) {
  const p = parseElSpec(spec);
  if (!p) return false;
  return tagsOf(html, p.tag).some((t) => tagHasClasses(t, p.classes));
}

/* 取符合规格元素的「内层 HTML」；深度配对，找不到返回 null */
function innerOf(html, spec) {
  const p = parseElSpec(spec);
  if (!p || !p.tag) return null;
  const open = new RegExp('<' + p.tag + '\\b[^>]*>', 'gi');
  const both = new RegExp('<' + p.tag + '\\b[^>]*>|</' + p.tag + '\\s*>', 'gi');
  let m;
  while ((m = open.exec(html)) !== null) {
    if (!tagHasClasses(m[0], p.classes)) continue;
    both.lastIndex = m.index;
    let depth = 0, t, end = -1;
    while ((t = both.exec(html)) !== null) {
      if (t[0].charAt(1) === '/') { depth--; if (depth === 0) { end = t.index; break; } }
      else depth++;
    }
    if (end < 0) return null;
    return html.slice(m.index + m[0].length, end);
  }
  return null;
}

/* ---------- when 前置条件 ----------
 * 断言只在「相关元素确实存在」时才生效，否则换个系统的文件会被大量误报。
 *   hasClass —— HTML 中出现该类
 *   cssHas   —— 样式表中出现该选择器（带词边界，`.x-a` 不匹配 `.x-a__b`）
 *   htmlHas  —— HTML 中出现该子串
 * 三者同时给出时取「与」。 */
function whenOk(when, ctx) {
  if (!when) return true;
  if (when.hasClass && !htmlHasSpec(ctx.html, '.' + when.hasClass)) return false;
  if (when.cssHas) {
    const re = new RegExp(when.cssHas.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    if (!re.test(ctx.css)) return false;
  }
  if (when.htmlHas && !ctx.html.includes(when.htmlHas)) return false;
  return true;
}

/* ---------- 断言执行 ----------
 * 通用类型（具体约定写在 conventions.json 里）：
 *   forbid-removed-tokens  引用 tokens.md「已移除」表中的 Token
 *   forbid-property        匹配的规则块内禁止出现某属性
 *   require-property       匹配的规则块内必须声明某属性，且值匹配正则
 *   require-value          属性取值必须在 allow 白名单内（未声明则不判）
 *   require-value-pattern  属性取值必须匹配 pattern 正则（未声明则不判）
 *   require-rule           必须存在「选择器 + 属性匹配正则」的规则
 *   require-first-child    指定子元素必须是容器的首个子元素
 *
 * selector 的匹配方式（rule.match）：
 *   exact（默认）—— 选择器**整体等于**给定值
 *   contains      —— 选择器里**出现**该类，带 `-` / `_` / 词边界（`.x-a` 不命中 `.x-a__b`）
 *   all           —— **不筛选择器**，样式表里每条规则都受检，selector 可省略
 *
 *   `all` 是给**横切约定**用的：「间距一律走 Token」「圆角只允许 N 档」这类约束
 *   不针对某个组件，而针对整张表。靠 `contains` 逐个类名枚举必然漏掉新组件。
 * 返回 [{ code, msg }] */
function runRule(rule, ctx) {
  const bad = [];
  const code = 'E4-' + (rule.id || rule.type);
  const push = (detail) => bad.push({ code, msg: (rule.reason ? rule.reason + '：' : '') + detail });
  const pick = (sel) => (rule.match === 'all' ? ctx.rules
    : rule.match === 'contains' ? rulesLike(ctx.rules, sel) : rulesFor(ctx.rules, sel));

  switch (rule.type) {
    case 'forbid-removed-tokens': {
      for (const [name, info] of ctx.removed) {
        if (ctx.css.includes(name) || ctx.html.includes(name)) {
          push('引用了 ' + info.version + ' 已移除的 ' + name + '，改用：' + info.use);
        }
      }
      break;
    }
    case 'forbid-property': {
      for (const r of pick(rule.selector)) {
        for (const prop of [].concat(rule.property || [])) {
          const v = decl(r.body, prop);
          if (v) push(r.sel + ' 禁止 ' + prop + '，当前：' + v);
        }
      }
      break;
    }
    case 'require-property': {
      const props = rule.property || {};
      const list = Array.isArray(props) ? props.map((p) => [p, '.*']) : Object.entries(props);
      for (const r of pick(rule.selector)) {
        for (const [prop, re] of list) {
          const v = decl(r.body, prop);
          if (!v) push(r.sel + ' 必须声明 ' + prop);
          else if (re !== '.*' && !new RegExp(re).test(v)) push(r.sel + ' 的 ' + prop + ' 必须匹配 /' + re + '/，当前：' + v);
        }
      }
      break;
    }
    case 'require-value': {
      const allow = (rule.allow || []).map((a) => norm(a));
      for (const r of pick(rule.selector)) {
        for (const prop of [].concat(rule.property || [])) {
          let v = decl(r.body, prop);
          if (!v && rule.fallback) {
            const fb = decl(r.body, rule.fallback);
            if (fb) v = fb.split(/\s+/)[0];
          }
          if (!v) continue; /* 没声明就不管：本类型只管「写了的值对不对」 */
          if (!allow.includes(norm(v))) {
            push(r.sel + ' 的 ' + prop + ' 取值不在允许集内，当前：' + v + '（允许：' + (rule.allow || []).join(' / ') + '）');
          }
        }
      }
      break;
    }
    case 'require-value-pattern': {
      /* 「属性若声明，取值必须匹配 pattern」。
       * 与 require-value 的分工：那里是**有限白名单**（枚举得出具体取值），
       * 这里是**正则**（描述一个取值族），例如
       *   「间距必须走 --stars-* Token，不得出现裸 px」
       *   「圆角只允许 var(--stars-radius-*)」
       * 两者都是「未声明则不判」——只管写了的值对不对，不管有没有写。
       * allow 可选：先比白名单，命中即放行（给 0 / auto / inherit 这类合法例外留口子）。 */
      const re = new RegExp(rule.pattern || '.*');
      const allow = (rule.allow || []).map((a) => norm(a));
      for (const r of pick(rule.selector)) {
        for (const prop of [].concat(rule.property || [])) {
          let v = decl(r.body, prop);
          if (!v && rule.fallback) {
            const fb = decl(r.body, rule.fallback);
            if (fb) v = fb.split(/\s+/)[0];
          }
          if (!v) continue;
          if (allow.length && allow.includes(norm(v))) continue;
          if (!re.test(v)) {
            push(r.sel + ' 的 ' + prop + ' 必须匹配 /' + (rule.pattern || '.*') + '/，当前：' + v);
          }
        }
      }
      break;
    }
    case 'require-rule': {
      const re = new RegExp(rule.matchValue || '.*');
      const hit = pick(rule.selector).some((r) => {
        const v = decl(r.body, rule.property);
        return v && re.test(v);
      });
      if (!hit) push('缺少规则 ' + rule.selector + ' { ' + rule.property + ': /' + (rule.matchValue || '.*') + '/ }');
      break;
    }
    case 'require-first-child': {
      const inner = innerOf(ctx.html, rule.container);
      if (inner === null) { push('找不到容器 ' + rule.container); break; }
      const t = inner.trim();
      const head = t.slice(0, t.indexOf('>') + 1);
      const cp = parseElSpec(rule.child) || { tag: '' };
      const tagOk = new RegExp('^<' + (cp.tag || '[a-z][a-z0-9-]*') + '\\b', 'i').test(t);
      if (!tagOk || !htmlHasSpec(head, rule.child)) {
        push(rule.child + ' 必须是 ' + rule.container + ' 的首子元素，当前首元素：'
          + t.slice(0, 56).replace(/\s+/g, ' ') + '…');
      }
      break;
    }
    default:
      push('未知的约定类型：' + rule.type);
  }
  return bad;
}

function checkConventions(raw, conventions) {
  const css = styleSheetsOf(raw);
  if (!css.trim() || !conventions.rules.length) return [];
  const rules = parseRules(css);
  /* 注释里出现的示例选择器不参与断言 */
  const html = raw.replace(/<!--[\s\S]*?-->/g, '');
  const ctx = { css, rules, html, removed: conventions.removed || new Map() };
  const bad = [];
  for (const rule of conventions.rules) {
    if (!rule || !rule.type) continue;
    if (!whenOk(rule.when, ctx)) continue;
    bad.push(...runRule(rule, ctx));
  }
  return bad;
}

/* ---------- 主流程 ---------- */
const { spec, specLight, reserved } = parseSpec(SPEC_TOKENS);
/* 传文件时只扫该文件；传目录时递归扫（原行为不变） */
const ROOT_EXT = path.extname(ROOT).toLowerCase();
const htmlFiles = ROOT_IS_FILE ? (ROOT_EXT === '.html' ? [ROOT] : []) : collect(ROOT, '.html');
const mdFiles = ROOT_IS_FILE ? (ROOT_EXT === '.md' ? [ROOT] : []) : collect(SPEC_ROOT, '.md');

const usedAcrossAll = new Set(); // 全库实际引用过的 Token（用于 I1）
const issues = [];              // 逐文件问题
let e1 = 0, e2 = 0, e3 = 0, e4 = 0, e5 = 0, e6 = 0, w1 = 0;
/* 已移除 Token 表：用于检测「删掉的 Token 被抄回来」 */
const removed = parseRemoved(SPEC_TOKENS);

/* 框架约定：来自本包的 foundation/conventions.json（缺失/为空则不校验结构） */
const CONVENTIONS_FILE = path.join(SPEC_ROOT, 'foundation', 'conventions.json');
const conventions = loadConventions(CONVENTIONS_FILE);
conventions.removed = removed;
if (conventions.broken) {
  console.error('⚠ conventions.json 不是合法 JSON，[E4] 已跳过：' + conventions.broken);
}

/* ---------- 演示区（临时件）剔除 ----------
 * 演示区是「只为让人看得见」而造的触发按钮 / 假数据 / 说明文字，
 * 接入业务时整块删除。三个消费方都要认这对标记，缺一个就等于只堵了一半：
 *   生成器 new-page.js       —— 注入宿主页时整段剔除
 *   采集器 collect-from-browser.js —— 按 data-collect-ignore 整块跳过
 *   校验器 check-tokens.js   —— 本函数，判定 [E1]–[E5] / [W1] / [I1] 前剔除
 *
 * ⚠ 按行数补空行，**不是直接删**：E1/E3 的报告要带行号，
 *   删行会让后面所有行号前移，报错指到错误的位置。
 *   实测事故：modal 模板演示按钮的 border-radius 把「弹窗方角无投影」判成失败。
 */
const TRANSIENT_RE = /[ \t]*(?:<!--\s*@transient-start[^>]*-->|\/\*\s*@transient-start[\s\S]*?\*\/)[\s\S]*?(?:<!--\s*@transient-end[^>]*-->|\/\*\s*@transient-end[\s\S]*?\*\/)[ \t]*\r?\n?/gi;

function stripTransient(s) {
  const keepLines = (m) => '\n'.repeat((m.match(/\n/g) || []).length);
  return s
    /* 外部设计编辑器（Ardot 等）打开/保存文件时，会把运行时 style/script 持久化进页面：
     * id 形如 `__dm_no_drag_style__` / `__dm_bindable_badge_style__`，内容含 `#0088ff`
     * 这类高亮色与 data-sp-bindable 描边规则。既不是作者写的、也不受本包规范管辖，
     * 却会让文件凭空报 [E1]。约定：id 以双下划线开头者视为外部运行时，扫描前整体剔除。
     * 同样按行数补空行，保持后续行号不变。 */
    .replace(/<style[^>]*\bid="__[^"]*"[^>]*>[\s\S]*?<\/style>/gi, keepLines)
    .replace(/<script[^>]*\bid="__[^"]*"[^>]*>[\s\S]*?<\/script>/gi, keepLines)
    .replace(TRANSIENT_RE, keepLines);
}

for (const file of htmlFiles) {
  /* 先剔演示区：临时件不参与任何判定，但保留行号 */
  const raw = stripTransient(fs.readFileSync(file, 'utf8'));
  const rel = path.relative(ROOT, file) || file;

  const rootVars = parseRootVars(raw);
  /* 主题覆盖块里的定义（v1.15）。它和 :root 一样是「定义」不是「使用」，
   * 所以既要从正文里剔除，又要参与 [E2] 取值比对与 [E6] 覆盖完整性检查。 */
  const themeVars = parseThemeVars(raw);
  // 本文件 :root 已声明的颜色字面量集合（用于判断硬编码是否属已声明值）
  const declaredColors = new Set(
    [...rootVars.values()].filter(isColor).map(norm)
  );

  // 剔除 :root 块、主题覆盖块与注释后再扫描正文
  const body = stripThemeBlocks(raw)
    .replace(/:root\s*\{[\s\S]*?\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const hardcodes = [];
  const undefinedRefs = new Map();

  /* JS 动态读取的 Token 视同已使用（计入全库，但不参与 E3 定义检查） */
  parseScriptTokens(raw).forEach((t) => usedAcrossAll.add(t));

  body.split('\n').forEach((rawLine, idx) => {
    const no = idx + 1;
    if (/^\s*<!--/.test(rawLine)) return;
    /* 外部编辑器（Ardot 等）会往开标签注入 data-page-node-id，内联 SVG 带 xmlns。
     * 只剥掉属性本身再继续扫，**不能整行跳过**——整行跳过等于 E1/E3 在这类文件上失效，
     * 校验器照样报绿，但那一行其实什么也没查。 */
    const line = rawLine
      .replace(/ data-page-node-id="[^"]*"/g, '')
      .replace(/ xmlns="[^"]*"/g, '');
    if (/token-ignore/i.test(line)) return; // 显式豁免：行内含 token-ignore

    /* [E3] var() 引用是否在本文件定义过 */
    const varRefs = line.match(/var\(\s*(--[a-z0-9-]+)/gi) || [];
    for (const ref of varRefs) {
      const name = ref.replace(/var\(\s*/i, '');
      usedAcrossAll.add(name);
      if (!rootVars.has(name)) {
        if (!undefinedRefs.has(name)) undefinedRefs.set(name, []);
        undefinedRefs.get(name).push(no);
      }
    }

    /* [E1] 硬编码色值 */
    const literals = line.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g);
    if (!literals) return;
    for (const lit of literals) {
      if (!declaredColors.has(norm(lit))) {
        hardcodes.push({ line: no, value: lit, text: line.trim().slice(0, 110) });
      }
    }
  });

  /* [E2] 正向：取值漂移 */
  const drifts = [];
  /* [W1] 反向：规范未收编 */
  const unregistered = [];
  /* [E5] 取值待填：模板 :root 的取值被中性化成 unset，回灌定稿取值前一直是这个状态。
   * 这类 Token 不计入 [W1]——它还不是「规范没收编的私有 Token」，只是「还没填」。 */
  const unfilled = [];
  for (const [name, value] of rootVars) {
    if (/^unset$/i.test(String(value).trim())) { unfilled.push(name); continue; }
    if (spec.has(name)) {
      if (isColor(value) && norm(spec.get(name)) !== norm(value)) {
        drifts.push({ name, file: value, spec: spec.get(name) });
      }
    } else {
      unregistered.push({ name, value });
    }
  }

  /* [E2] 主题覆盖块的取值比对（v1.15）
   *   暗色块 → 比规范的暗色列；亮色块 → 比规范的亮色列（没有亮色列 = 两主题同值，比暗色列）。
   *   ★ 这一步是双主题交付物唯一能验到「亮色取值对不对」的地方——
   *     只把主题块从正文剔除、不做比对的话，亮色块写成什么都算过。 */
  const themeDrifts = [];
  for (const theme of ['dark', 'light']) {
    for (const [name, value] of themeVars[theme]) {
      if (!spec.has(name)) {
        unregistered.push({ name, value, theme });
        continue;
      }
      if (!isColor(value)) continue; // 非色值（或 var() 引用）不参与色值比对
      const expect = theme === 'light'
        ? (specLight.has(name) ? specLight.get(name) : spec.get(name))
        : spec.get(name);
      if (norm(expect) !== norm(value)) {
        themeDrifts.push({ name, theme, file: value, spec: expect });
      }
    }
  }

  /* [E6] 亮色覆盖完整性（v1.15）
   *   声明了亮色块的文件，必须覆盖**本文件所有「亮色值 ≠ 暗色值」的 Token**。
   *   否则那些 Token 在亮色下会沿用暗色取值——页面看起来「能切主题」，
   *   实际有一半元素还是暗色。这种错**不会报错也不会崩**，只会让亮色页悄悄花掉。
   *   只对「规范里真有亮色列」的 Token 提要求：规范没给亮色值的，就是两主题同值，不强制覆盖。
   *
   *   暗色基线取 `:root ∪ 暗色主题块`（后者覆盖前者）。规范推荐把暗色放 `:root`，
   *   但也允许全写进 `html[data-theme='dark']`；只认 `:root` 会让后一种写法下
   *   missingLight 恒为空 —— 亮色覆盖检查**静默失效**，比报错更难发现。 */
  const darkBase = new Map([...rootVars, ...themeVars.dark]);
  const missingLight = [];
  if (themeVars.light.size) {
    for (const [name, darkValue] of darkBase) {
      if (!specLight.has(name)) continue;
      const lightValue = specLight.get(name);
      if (!isColor(darkValue) || !isColor(lightValue)) continue;
      if (norm(lightValue) === norm(darkValue)) continue; // 两主题同值，无需覆盖
      if (!themeVars.light.has(name)) missingLight.push(name);
    }
  }

  e1 += hardcodes.length;
  e2 += drifts.length + themeDrifts.length;
  e3 += undefinedRefs.size;
  e5 += unfilled.length;
  e6 += missingLight.length;
  w1 += unregistered.length;

  /* [E4] 框架约定（规则来自本包 foundation/conventions.json） */
  const struct = checkConventions(raw, conventions);
  e4 += struct.length;

  if (hardcodes.length || drifts.length || themeDrifts.length || undefinedRefs.size
      || unregistered.length || struct.length || unfilled.length || missingLight.length) {
    /* 只在主题覆盖块里声明过的 Token —— [E3] 报「未定义引用」时用来给出成因提示。
     * 这类误会的成因是「把暗色基线写进了 `html[data-theme='dark']` 而不是 `:root`」，
     * 而 [E3] 只把 `:root` 当定义。提示不改变判定，只把查错方向指出来。 */
    const onlyInTheme = [...undefinedRefs.keys()]
      .filter((n) => !rootVars.has(n) && (themeVars.dark.has(n) || themeVars.light.has(n)));
    issues.push({
      file: rel, hardcodes, drifts, themeDrifts, undefinedRefs: [...undefinedRefs],
      unregistered, structure: struct, unfilled, missingLight, onlyInTheme
    });
  }
}

/* ---------- [I1] 规范已定义但全库零使用 ---------- */
const unusedAll = [...spec.keys()].filter((t) => !usedAcrossAll.has(t));
const unused = unusedAll.filter((t) => !reserved.has(t));
const unusedReserved = unusedAll.filter((t) => reserved.has(t));

/* ---------- 规范文档内部一致性：md 中引用的 Token 是否都已收编 ---------- */
const docOrphans = new Map();
for (const md of mdFiles) {
  if (path.basename(md) === 'tokens.md') continue;
  const text = fs.readFileSync(md, 'utf8');
  const refs = text.match(/var\(\s*(--[a-z0-9-]+)/gi) || [];
  const set = new Set(refs.map((r) => r.replace(/var\(\s*/i, '')));
  for (const t of set) {
    if (DOC_VAR_ALLOW.has(t)) continue;
    if (!spec.has(t) && !docOrphans.has(t)) {
      docOrphans.set(t, []);
      usedAcrossAll.add(t);
    }
    if (!spec.has(t)) docOrphans.get(t).push(path.basename(md));
  }
}

/* ---------- 输出 ---------- */
const ok = e1 + e2 + e3 + e4 + e5 + e6 === 0 && (!STRICT || w1 === 0);

if (AS_JSON) {
  console.log(JSON.stringify({
    scanned: htmlFiles.length,
    specTokens: spec.size,
    conventions: {
      file: path.relative(ROOT, CONVENTIONS_FILE),
      present: conventions.present,
      ruleCount: conventions.rules.length
    },
    summary: {
      hardcode: e1, drift: e2, undefinedRef: e3, convention: e4, unfilled: e5,
      lightCoverage: e6, themeLightTokens: specLight.size,
      unregistered: w1, unusedSpecToken: unused.length, unusedReserved: unusedReserved.length
    },
    issues,
    unusedSpecTokens: unused,
    unusedReservedTokens: unusedReserved,
    docOrphanTokens: [...docOrphans].map(([token, files]) => ({ token, files: [...new Set(files)] })),
    pass: ok
  }, null, 2));
  process.exit(ok ? 0 : 1);
}

const L = (s) => console.log(s);
L('===== Design Token 双向对齐校验 =====\n');
L((ROOT_IS_FILE ? '扫描文件　　：' : '扫描目录　　：') + ROOT);
L('HTML 文件　 ：' + htmlFiles.length);
L('规范 Token　：' + spec.size + '（来源 ' + path.relative(ROOT, SPEC_TOKENS) + '）'
  + (specLight.size ? '　其中双主题色 ' + specLight.size + ' 个（有独立亮色取值）' : ''));
L('框架约定　　：' + (conventions.present
  ? conventions.rules.length + ' 条（来源 ' + path.relative(ROOT, CONVENTIONS_FILE) + '）'
  : '未定义（' + path.relative(ROOT, CONVENTIONS_FILE) + ' 不存在，[E4] 跳过）') + '\n');

if (issues.length) {
  for (const it of issues) {
    L('---- ' + it.file + ' ----');
    if (it.drifts.length) {
      L('  [E2] Token 取值偏离规范（正向）');
      it.drifts.forEach((d) => L('       ' + d.name + '：文件=' + d.file + '　规范=' + d.spec));
    }
    if (it.themeDrifts && it.themeDrifts.length) {
      L('  [E2] 主题覆盖块取值偏离规范（' + it.themeDrifts.length + ' 处）');
      it.themeDrifts.forEach((d) => L('       [' + d.theme + '] ' + d.name + '：文件=' + d.file + '　规范=' + d.spec));
    }
    if (it.missingLight && it.missingLight.length) {
      L('  [E6] 亮色覆盖不全 ' + it.missingLight.length + ' 个（这些 Token 在亮色下会沿用暗色取值）');
      it.missingLight.slice(0, 10).forEach((t) => L('       ' + t));
      if (it.missingLight.length > 10) L('       …另有 ' + (it.missingLight.length - 10) + ' 个');
    }
    if (it.undefinedRefs.length) {
      L('  [E3] 引用了未定义的 Token（反向）');
      it.undefinedRefs.forEach(([name, lines]) =>
        L('       ' + name + '　行：' + lines.slice(0, 6).join(',') + (lines.length > 6 ? '…' : '')));
      if (it.onlyInTheme && it.onlyInTheme.length) {
        L('       ⚠ 其中 ' + it.onlyInTheme.length + ' 个只在主题覆盖块里声明过：'
          + it.onlyInTheme.slice(0, 6).join('、')
          + (it.onlyInTheme.length > 6 ? '…' : ''));
        L('         [E3] 只把 `:root` 当定义块。若本系统把暗色基线写在'
          + " `html[data-theme='dark']`，应改为写在 `:root` 里——"
          + '否则这些 Token 在未标注主题时是取不到的。');
      }
    }
    if (it.hardcodes.length) {
      L('  [E1] 硬编码色值 ' + it.hardcodes.length + ' 处');
      it.hardcodes.forEach((h) => L('       L' + h.line + '　' + h.value + '　' + h.text));
    }
    if (it.unregistered.length) {
      L('  [W1] 规范未收编的 Token ' + it.unregistered.length + ' 个（反向）');
      it.unregistered.forEach((u) => L('       ' + u.name + ' = ' + u.value));
    }
    if (it.structure && it.structure.length) {
      L('  [E4] 违反本系统框架约定 ' + it.structure.length + ' 处');
      it.structure.forEach((s) => L('       ' + s.code + '　' + s.msg));
    }
    if (it.unfilled && it.unfilled.length) {
      L('  [E5] 取值待填 ' + it.unfilled.length + ' 个 Token（回灌 foundation/tokens.md 定稿取值后消除）');
      if (!QUIET) {
        it.unfilled.slice(0, 8).forEach((t) => L('       ' + t));
        if (it.unfilled.length > 8) L('       …另有 ' + (it.unfilled.length - 8) + ' 个');
      }
    }
    L('');
  }
} else {
  L('结果：全部通过 —— 无硬编码、无取值漂移、无未定义引用、无待填取值、无亮色覆盖缺口、无框架约定回归。\n');
}

L('----');
L('硬编码色值 [E1]　　　：' + e1);
L('取值漂移　 [E2]　　　：' + e2);
L('未定义引用 [E3]　　　：' + e3);
L('框架约定　 [E4]　　　：' + e4 + (conventions.present && conventions.rules.length ? '' : '（本包未定义约定，跳过）'));
L('取值待填　 [E5]　　　：' + e5);
L('亮色覆盖　 [E6]　　　：' + e6 + (specLight.size ? '' : '（本包规范无亮色列，[E6] 不适用）'));
L('规范未收编 [W1]　　　：' + w1 + (STRICT ? '（strict 模式计为失败）' : '（提示项）'));
L('规范未落地 [I1]　　　：' + unused.length + ' 个 Token 全库零使用');
if (unused.length && !QUIET) {
  [...unused].sort().forEach((t) => L('       ' + t + ' = ' + spec.get(t)));
}
if (unusedReserved.length) {
  L('其中已标注预留　　　：' + unusedReserved.length + ' 个（色板/预留，不要求落地）');
  /* --quiet 只保留计数，不打清单：门禁 / CI 场景这些纯信息项全是噪音 */
  if (!QUIET) [...unusedReserved].sort().forEach((t) => L('       ' + t + ' = ' + spec.get(t)));
}
if (docOrphans.size) {
  L('规范文档未收编引用　　：' + docOrphans.size + ' 个 Token 在 .md 中出现但未登记');
  [...docOrphans].slice(0, 12).forEach(([t, files]) => L('       ' + t + '　← ' + [...new Set(files)].join(', ')));
}
L('\n说明：图表数据驱动配色属数据而非样式，如需豁免在行尾加 /* token-ignore */。');
process.exit(ok ? 0 : 1);
