# scripts/ — 引擎自带件（脚本 + 模板契约骨架）

> 本目录是**代码起步基座**：脚本 + 两份契约骨架 + 一份空契约。
> **它不带任何成品模板，也不带任何成品的结构性取值** ——
> 布局、内容区结构、浮层档位都要按本系统的设计稿 / 线上采集沉淀与裁决。
>
> 系统名：广发中后台系统　|　类名前缀：`gf-`　|　取值唯一来源：`../foundation/tokens.md`
>
> 目录说明：技能包 = `design-specs/`。脚本在 `scripts/`，规范正文在 `foundation/` `components/` `pages/`。

---

## 0. 关于本目录的「自带」与「不自带」

| 类别 | 内容 | 说明 |
| :-- | :-- | :-- |
| **自带** | 脚本（校验 / 生成 / 门禁 / 设计稿核对） | 逻辑通用，不含任何具体系统的取值 |
| **自带** | `layout/_skeleton.html`、`templates/_skeleton.html` | 契约骨架：只声明「要满足什么」，不含任何页面结构 |
| **自带** | `templates/contract.json` | 结构性契约的**声明格式**。建包时是**空契约**（`types: []`、`overlay: {}`） |
| **不自带** | `layout/` 下的页面外壳 | **必须按本系统设计稿沉淀**，见 `layout/README.md` |
| **不自带** | `templates/<类别>/` 下的内容区模板 | **必须按本系统设计稿沉淀**，见 `templates/README.md` |
| **不自带** | `contract.json` 的**取值**（有哪几类页面、浮层分几档、每档多宽） | 按本系统设计稿裁决，见 `templates/README.md`「怎么裁决本系统的契约」 |

### 为什么内容区模板也不自带

「表格就是表格、表单就是表单」听起来很合理，但它只对了一半：

- **结构**大体相似 —— 这正是最容易让人以为可以照抄的地方
- **取值阶梯**完全不是 —— 模板带着一整套间距档（`--space-1..16`）、色板（`--chart-1..4`）、
  圆角档、阴影档。这些档位是**上一套系统的设计决策**，不是通用的

照抄过来的结果：规范里凭空多出几十个 Token 条目，每一条看起来都像一个正经的规范项，
没人知道它从哪来、对应本系统的哪个组件。而校验器是**绿的** —— 因为每个条目都被「登记」了。

所以引擎只给骨架：没有结构、没有取值，只有约束。
参考样例（广发的真实模板）放在工厂包 `assets/samples/templates/`，只作参考，不参与建包。

### 为什么连契约取值也不预置

同样的道理往上推一层：`contract.json` 里「有几类页面、浮层分几档、每档多宽」也是
**某一个系统的设计决策**，不是「中后台通用规律」。预置进去，新包会照着改而不是去采集，
最后浮层模板带着一套没在设计稿上验证过的宽度档上线。

所以引擎里那份是**空契约**，只保留「字段叫什么、各自管什么」的声明格式说明。
一份填满的样子在工厂包 `assets/samples/contract.sample.json`（**只作参照，不要照抄**）。

---

## 1. 文件清单

| 文件 | 类别 | 用途 |
| :-- | :-- | :-- |
| `layout/_skeleton.html` | 契约骨架 | **不是布局**。搭本系统外壳时的起手文件 |
| `templates/_skeleton.html` | 契约骨架 | **不是模板**。搭本系统内容区模板时的起手文件 |
| `templates/contract.json` | 契约声明 | **空契约**。浮层遮罩类名 / 宽度档位 / 样式提取范围 / `--type` 取值清单的声明位，取值待本系统裁决 |
| `check-tokens.js` | 脚本 | Token **双向**对齐校验 + 框架约定回归 |
| `new-page.js` | 脚本 | 一键生成页面 / 浮层脚手架 |
| `install-hooks.js` | 脚本 | 把规范校验装进 git 提交环节 |
| `check-design-sync.js` | 脚本 | 设计稿 ↔ 规范**双向**核对 |

参考样例（**不要照抄**）：工厂包 `assets/samples/templates/` 下有广发的 8 类内容区模板，
`assets/samples/layout.sample.html` 是广发的外壳，
`assets/samples/contract.sample.json` 是广发填满的契约。
它们只回答「一类模板大概需要哪些部分」「契约填满后长什么样」，不提供起点 ——
**起点是设计稿**。

> 生成器产出的页面默认落在当前工作目录；沉淀为标杆页请输出到 `../examples/` 并登记。

---

## 2. 沉淀与选型

### 2.1 布局

| 场景 | 怎么做 |
| :-- | :-- |
| **0→1 新建系统** | 先按 `layout/README.md` 从设计稿沉淀布局，再生成页面 |
| **已有项目中加页面** | **不套布局**，只生成内容区：`--layout=none`，外壳由宿主管 |
| 本系统有多种外壳 | 每种外壳一份 `<名字>.html`，生成时用 `--layout=<名字>` 指定 |

本系统到底有几种外壳，看 `mine-tokens.js` 报告第 2 节「布局候选」——
那是从线上采集的外壳指纹推出来的，不是猜的。

### 2.2 内容区模板

落位 `templates/<类别>/<名字>.html`，**目录名即 `--type` 取值**。
发现规则与布局完全一致：

| 该类模板数 | 行为 |
| :-- | :-- |
| 0 个 | `new-page.js` 报错并打印沉淀步骤（不静默退化到别的结构） |
| 1 个 | 自动用它 |
| 多个 | 必须 `--template=<名字>` 指定 |

本系统该有哪几类，看 `mine-tokens.js` 报告第 1 节「页面结构特征」+ 设计稿。
只沉淀**本系统确实有**的类别——没有仪表盘就不要建仪表盘目录，
否则等于凭空给系统加了一类页面，而它看起来像工厂要求的。

`contract.json` 的 `types` 是**可选**白名单：留空则完全按目录名发现
（建了什么目录就有什么类别），填了才额外校验。

### 2.3 浮层

浮层的档位与遮罩类名声明在 `templates/contract.json`，不在生成器里。
本系统的弹窗只有两档宽度、遮罩叫别的名字、想加一类 `popover` —— 都改 `contract.json`。

**引擎不预置浮层契约**，建包时 `overlay` 是空的。要裁决三件事：

1. **有哪几类浮层** —— 报告第 1 节的弹窗 / 抽屉信号 + 设计稿里实际画的浮层
2. **每类几档、每档多宽** —— 从设计稿量。**档位数不是通用常量**：
   有的系统只有一档确认框，有的分确认 / 表单 / 复杂三档
3. **遮罩类名 / 触发属性 / 提取范围** —— 本系统的类名与属性名，
   `needles` 从「注入宿主页时要带走哪些样式规则才不残缺」反推

裁决完写进 `contract.json`，再建 `templates/<类别>/` 放模板，两边类名与档位对齐。
完整流程见 `templates/README.md`「怎么裁决本系统的契约」。

> 广发给浮层定过一组结构约束（三段式 / `padding: 0` / Drawer 默认不出 footer…）。
> 那是**广发的设计决策**，不是中后台通用规律，所以放在样例那边：
> 见 `assets/samples/templates/README.md`「参考：广发给浮层定的结构约束」。
> 本系统的约束要自己裁决：能批量校验的写进 `../foundation/conventions.json`
> （`[E4]` 会逐条查），靠肉眼审是审不住的。

---

## 3. 使用工作流

```
1. 判类型   → 本系统已裁决的类别（contract.json 的 types，或 templates/ 下的目录名）
2. 选布局   → 本系统的布局（scripts/layout/），已有项目加页面则用 --layout=none
3. 选内容   → 本系统已沉淀的 templates/<类别>/ 模板
4. 拼装     → 用 new-page.js 一键拼装，或手工把内容区塞进布局的 <!-- @content-slot -->
5. 换业务   → 只替换「业务替换点」注释处：标题、菜单、字段、数据、提交逻辑
6. 保结构   → 关键 className、Design Token、间距节奏、交互分区一律不动
7. 跑校验   → node design-specs/scripts/check-tokens.js design-specs --strict
```

### 替换点约定

模板内所有需改位置均用注释标记，全局搜索 **`业务替换点`** 即可定位：

```html
<!-- 业务替换点：菜单分组（标题 + 菜单项 + 图标） -->
<!-- ★ 业务替换点：替换为真实接口调用 -->
```

### 文案占位符约定

模板里要填页面标题的地方写 `@@页面标题@@`，系统名写 `@@系统名@@`，
生成时按 `--name` / `--system` 填进去。

**生成器不认识任何具体系统的类名** —— 它不会去猜「弹窗标题的 class 叫什么」。
没写占位符的模板不会被替换，这不是 bug，是模板没声明它要接哪个值。

### 演示区约定

只为让人看得见而造的块（触发按钮 / 假数据 / 说明文字）要打**两个**标记：

```html
<!-- @transient-start 演示用触发区（业务接入时删除） -->
<div class="demo-launch" data-collect-ignore>
  <button class="你的按钮类名" data-<类别>-open="<遮罩 id>">打开浮层</button>
</div>
<!-- @transient-end -->
```

| 标记 | 管什么 | 漏了会怎样 |
| :-- | :-- | :-- |
| `@transient-start/end`（注释） | 注入宿主页时**整段剔除** | 别人的页面里多出「当前激活标签：首页」这类演示 DOM |
| `data-collect-ignore`（属性） | 采集时**整块跳过** | 演示区的 `em` 取值（`7px` / `11.9px`）被当成你的设计取值 |

两个都要打。CSS 里的演示区样式用同款标记包在块注释里。
详见 `templates/README.md`「演示区：两种标记，两个目的」。

### 禁止改动清单

- `:root` 中的 Token **取值**（要改先改 `foundation/tokens.md`，再回灌）
- `<前缀>-` 的 className 与 BEM 命名结构
- 模板里已按本系统裁决写下的结构节奏（间距组合、固定列方案、溢出方案）
- 演示区的 `@transient` / `data-collect-ignore` 标记（删了就会漏出去）

---

## 4. 模板验收清单

搭好或改造一份模板后，逐项自检：

**通用项**（每个系统都该过）：

- [ ] `node design-specs/scripts/check-tokens.js design-specs --strict` 退出码 0
- [ ] 无 `[E5] 取值待填`——所有 `unset` 都已回灌为定稿取值
- [ ] 若本系统是双主题：无 `[E6] 亮色覆盖不全`——凡「亮色≠暗色」的 Token 都已进亮色块
      （`[E6]` 只在文件**自己声明过亮色块**时才判，单主题交付物此项天然为 0）
- [ ] 无 JS 控制台报错，内联 `<script>` 语法通过
- [ ] 无外链资源（CDN、图片、图标字体），图标全部内联 SVG
- [ ] 结构照设计稿，不是照别的系统的模板补的
- [ ] 演示区已打 `@transient` 与 `data-collect-ignore`
- [ ] 本系统的结构级约定已写进 `foundation/conventions.json`，`[E4]` 有实际规则数

**本系统自定项**（从本系统的设计稿 / 评审里长出来，逐条写进
`foundation/conventions.json` 让 `[E4]` 把关，而不是只写在这里）：

- [ ] 本系统对表格 / 表单 / 浮层 / 导航各自的结构约束，能批量校验的都已进校验器
- [ ] 本系统不接受的历史写法（如某属性禁用、某取值必须走 Token）已列成规则

> 广发那份具体的验收清单在 `assets/samples/templates/README.md`，
> 只作参照——**照抄等于把别人的设计决策当成本系统的规范**。

---

## 5. 配套脚本

| 脚本 | 用途 | 用法 |
| :-- | :-- | :-- |
| `check-tokens.js` | Token **双向**对齐校验 + 框架约定回归 + 双主题覆盖检查 | `node design-specs/scripts/check-tokens.js design-specs --strict [--json]` |
| `new-page.js` | 一键生成页面 / 浮层脚手架 | `node design-specs/scripts/new-page.js --type=<类别> --name=<页面名>` |
| `install-hooks.js` | 把规范校验装进 git 提交环节 | `node design-specs/scripts/install-hooks.js install`<br>📖 完整用法见 **[HOOKS-GUIDE.md](./HOOKS-GUIDE.md)** |
| `check-design-sync.js` | 设计稿 ↔ 规范**双向**核对（抓两个真值源的漂移） | `node design-specs/scripts/check-design-sync.js <导出文件>`<br>📖 映射与流程见 `../foundation/design-sync.md` |

#### 提交门禁（推荐：让约束自动生效）

`check-tokens.js` 靠自觉，`install-hooks.js` 靠流程。装好之后 `git commit` 会自动校验，
不合规直接拦下并给出行号——**从「交付前手动检查」变成「不合规则不让提交」**。

```bash
node design-specs/scripts/install-hooks.js install   # 装
node design-specs/scripts/install-hooks.js status    # 查状态 / 现在能否提交
node design-specs/scripts/install-hooks.js uninstall # 卸
```

三步上手、被拦后怎么改、紧急绕过、团队协作、CI 配合等完整说明见
**[HOOKS-GUIDE.md](./HOOKS-GUIDE.md)**。

### new-page.js 参数

```
node design-specs/scripts/new-page.js --type=<类别> --name=<页面名> [选项]

--type     页面类别，取值 = scripts/templates/ 下的目录名。
             生成器不预设任何类别——「中后台有哪几类页面」是每个系统自己的答案。
             contract.json 的 types 是可选白名单；留空则完全按目录名发现。
             某一类实际能不能用，取决于 scripts/templates/<类别>/ 下有没有模板。
             属于浮层类别的（遮罩类名在 contract.json 的 overlay 里声明）
             直接产出可独立打开的浮层演示页
--name     标题，填入 <title>、布局的 @page-title 与模板里的 @@页面标题@@
--layout   布局名 = scripts/layout/ 下的文件名（不含 .html）
             不写：本包只有一个布局时自动用它；有多个则必须指定；一个都没有会报错并给沉淀步骤
             none：只要内容区（已有项目里加页面时用）
--template 同一类别沉淀了多个模板时，指定用哪一个（不带 .html）
--tabs     把多标签栏插进布局的 <!-- @tabs-slot -->（布局没留该标记则忽略并提示）
--overlay  给页面附带浮层骨架，逗号分隔，写法 <类别>[:<档位>]
             类别、档位与组合别名全部来自 scripts/templates/contract.json
             overlay 为空时本参数不可用（先裁决契约，报错会打印步骤）
--no-trigger  不注入「演示入口」触发条
--out      输出路径  --no-check 跳过校验
--system   系统名。不传则取本包 templates/contract.json 的 system；
           两处都没有则**不兜底**，把 @@系统名@@ 留在产物里并打印警告
           （★ 引擎绝不替某个系统起名——见 CHANGELOG v1.13）
```

典型用法（`<类别>` 换成本包已沉淀的类别名）：

```bash
# 1）独立浮层演示页（浮层类别直接产出可打开的页面）
node design-specs/scripts/new-page.js --type=<浮层类别> --name=<页面名>

# 2）页面 + 浮层一次到位（可指定档位）
node design-specs/scripts/new-page.js --type=<类别> --name=<页面名> --overlay=<浮层类别>:<档位>

# 3）只出内容区（已有项目里加页面）
node design-specs/scripts/new-page.js --type=<类别> --name=<页面名> --layout=none

# 4）本系统有多种外壳时显式指定
node design-specs/scripts/new-page.js --type=<类别> --name=<页面名> --layout=<布局名>
```

**浮层接入**：生成器会打印遮罩 `id` 与触发属性名，给任意按钮加上即可打开；
关闭已内置（关闭图标 / 取消 / 点遮罩 / Esc）。
触发属性名与遮罩类名都来自 `templates/contract.json`。
默认还会注入一条「演示入口」触发条，页面一打开就能点开浮层验收，
**接入业务后搜索「演示入口」整块删除**（`--no-trigger` 可不注入）。

**⚠ 浮层样式的作用域不要去掉**：注入宿主页面的浮层 CSS 会被自动改写为
`.<遮罩类名> …`（遮罩类名来自 `templates/contract.json`）。作用是防止浮层规则反向污染宿主页面
（历史上浮层与布局的按钮语义曾相反，导致全站主按钮集体变白；语义统一后
作用域隔离仍是必要的兜底——两边同名类的取值仍可能各自演进）。

生成器的防呆：模板缺失在参数阶段就报错（不抛栈）；`--out` 指向目录会提示带文件名；
档位非法会列出本包可选值；契约为空时给裁决步骤；注入浮层时剔除宿主已有规则；
模板里的演示区按 `@transient` 标记整段剔除。

### check-design-sync.js（设计稿 ↔ 规范）

`check-tokens.js` 管的是「交付物有没有按规范写」，`check-design-sync.js` 管的是更上游的一段——
**规范里的数跟设计稿对不对得上**。设计稿和规范是两个各自演进的真值源，不同步就会漂移——
漂移不会报错，只会悄悄变成规范的一部分，等下游页面长歪了才被发现。

```bash
# 1) 设计师导出变量文件，照 design-export.sample.json / .csv 填
# 2) 跑核对
node design-specs/scripts/check-design-sync.js design-specs/scripts/design-export.sample.json

# 建议加 --strict，把「设计稿有规范无 / 规范有设计稿无」也计为失败
node design-specs/scripts/check-design-sync.js <导出文件> --strict
```

| 差异 | 含义 | 处置 |
| :-- | :-- | :-- |
| **D3 同名不同值** | **真值源冲突**（核心目标）：规范与设计稿取值不一致 | 先定哪边是「意图源」再改另一边，**禁止两边各留一个数** |
| **D1 设计稿有、规范无** | 规范未收编 | 收编进 `tokens.md`；确属色板预留则标注「预留」并指向替代 Token |
| **D2 规范有、设计稿无** | 设计稿未同步，或规范虚胖 | 补设计稿 / 按虚胖处理。局部导出时天然很长，默认只列前 12 项 |

自动识别 4 种导出形态：Figma 原生变量、Tokens Studio 嵌套、扁平 JSON、CSV/TSV。
名称配对会**逐级去掉路径前缀**去试（`global/color/primary` → `--color-primary`），
`headerHeight` 这类驼峰与 `color/primary` 这类斜杠也能命中。
`hex + opacity` 会自动合成 rgba——**填充色与不透明度分开导出**是最高频的偏差来源。

退出码 0 = 无差异；1 = 存在差异。详见 `../foundation/design-sync.md`。

### check-tokens.js 检查项

| 级别 | 项 | 含义 |
| :-- | :-- | :-- |
| E1 | 硬编码色值 | 正文出现未在 `:root`（及主题覆盖块）声明的 hex / rgb 字面量 |
| E2 | 取值漂移 | 文件 `:root` / 主题覆盖块的定义与 `foundation/tokens.md` 不一致（**规范 → 交付物**） |
| E3 | 未定义引用 | `var(任意 Token 名)` 被使用但本文件未定义（**交付物 → 规范**） |
| E4 | 框架约定 | 本系统结构级约定回归，规则来自 `foundation/conventions.json` |
| E5 | 取值待填 | `:root` 里取值仍为 `unset`（模板尚未回灌定稿取值） |
| E6 | 亮色覆盖不全 | 声明了亮色块，却没覆盖全「亮色值 ≠ 暗色值」的 Token |
| W1 | 规范未收编 | 文件已定义并使用，但 `tokens.md` 未登记（潜在双源漂移） |
| I1 | 规范未落地 | `tokens.md` 有定义但全库零使用（信息项，供清理废 Token） |

> 双向 = 既查「交付物有没有按规范写」，也查「规范有没有收全交付物在用的」。
> 只做单向会在模板里悄悄长出规范管不到的私有变量。

### 双主题：规范怎么写、交付物怎么落

本系统的样式约定可能是「同一份样式写两个主题分支」：

```css
html[data-theme='dark']  { --stars-color-text: #D7DCE0; }
html[data-theme='light'] { --stars-color-text: #313133; }
```

**规范侧**（`foundation/tokens.md`）把这类 Token 写成**四列表**，亮色列插在取值之后：

```
| Token | 暗色值 | 亮色值 | 用途 |
| :-- | :-- | :-- | :-- |
| `--stars-color-text` | `#D7DCE0` | `#313133` | 正文文字 |
```

亮色列**不需要表头标记**——判别规则是「该行至少 3 个单元格、且第 2 格是色值」。
只有两个主题**取值不同**的 Token 才需要第四列；两主题同值的仍写三列表，
这时交付物的亮色块里**不必**再写一遍（写了也不算漂移，`[E2]` 允许两值相等）。

**交付物侧**：`:root` 放暗色（主视角）取值，亮色差异放进 `[data-theme='light']` 块。
`[E1]` 把主题块也认成定义块，所以亮色值**不会被误判成硬编码**。

> ⚠ **`[E6]` 为什么必须有**：漏覆盖的 Token 在亮色下会**静默沿用暗色取值**——
> 页面能切主题、能渲染，只是那几处颜色在亮色底上依然按暗色画，一半深一半浅。
> 这类错不报错、不崩、截图粗看也像「设计如此」，只有逐 Token 对账才抓得住。
> **`[E6]` 只对「自己声明过亮色块」的文件生效**，纯单主题交付物不受影响（向后兼容）。

### check-tokens.js 的 [E4] 框架约定

E1/E2/E3/E5 只管**取值对不对**，管不了**结构对不对**。E4 补的是后者，
断言写在**本包的** `foundation/conventions.json` 里，校验器只提供通用断言类型：

| 类型 | 作用 |
| :-- | :-- |
| `forbid-removed-tokens` | 引用 `tokens.md`「已移除」表里的 Token 即报错 |
| `forbid-property` | 匹配的规则块内禁止出现某属性 |
| `require-property` | 匹配的规则块内必须声明某属性，且值匹配正则 |
| `require-value` | 属性取值必须在白名单内（未声明则不判） |
| `require-value-pattern` | 属性取值必须匹配正则（未声明则不判） |
| `require-rule` | 必须存在「选择器 + 属性匹配正则」的规则 |
| `require-first-child` | 指定子元素必须是容器的首个子元素 |

每条都可加 `when` 前置条件（`hasClass` / `cssHas` / `htmlHas`），
只在「相关元素确实存在」时才生效——这样组件片段与独立页面会自动跳过，不会误报。

`selector` 怎么匹配由 `match` 决定，三选一：

| 值 | 含义 |
| :-- | :-- |
| `exact`（默认） | 选择器**整体等于**给定值 |
| `contains` | 选择器里**出现**该类，带 `-` / `_` / 词边界（`.x-a` 不命中 `.x-a__b`） |
| `all` | **不筛选择器**，样式表里每条规则都受检（`selector` 可省略） |

`all` 是给**横切约定**用的——「间距一律走 Token」「圆角只允许 N 档」这类约束不针对某个组件，
而针对整张表；靠 `contains` 逐个类名枚举，必然漏掉后来新增的组件。

`conventions.json` 不存在或 `rules` 为空 → `[E4]` 恒为 0，不报错（新包尚未裁决约定）。
写法与类型参考见 `../foundation/conventions.json` 内的 `_类型参考`，
一份真实样例见工厂包 `assets/samples/conventions.sample.json`——**那是样例，不要照抄**。

**为什么需要它**：批量改造多个布局文件时，靠肉眼审结构约定必然漏。
例如「面包屑必须是内容区的首子元素」这类约定，漏一个文件就是该页面比别人低一截，
而 E1/E2/E3 全 0、校验器报绿。
**结论：框架约定不能只写在文档里——凡是「批量脚本可能漏掉某个文件」的约定，都应进校验器。**

### 关于 I1「未落地」

I1 不是失败项，但**不应该被无视**——它通常指向三种真实问题：

| 成因 | 表现 | 处理 |
| :-- | :-- | :-- |
| 校验器盲区 | Token 在 JS 里通过 `getPropertyValue('--x')` 读取，静态扫 `var()` 扫不到 | 校验器已支持识别 JS 动态读取 |
| 缺模板 | 规范写了尺寸 Token 但没有对应组件（如浮层尺寸） | 补模板，让 Token 真正落地 |
| 规范虚胖 | 重复定义、照抄外部技能包、色板预留档位 | 在 `tokens.md` 用途列标注「预留 / 色板 / 废弃」并指向应替代的 Token |

> **标注预留的写法**：在 `tokens.md` 用途列写「预留：……，请用 `--xxx`」。校验器识别后单列为「已标注预留」，不计入 I1。
> 这样既保留溯源价值（如对标档位），又明确了实现该用哪个 Token。
