# 设计系统工厂

给一套 Figma 设计规范和几个线上页面地址，产出一套**可交付的中后台设计系统技能包**：
规范文档 + HTML 模板 + Token 校验器 + 页面生成器 + 提交门禁。

引擎只给**契约骨架**：不给现成布局，不给现成的内容区模板，也不给填好的结构性契约。
这三处正是「生搬硬套」最容易发生的地方——最后两处尤其隐蔽：

- **内容区模板**：「表格就是表格」听起来很合理，但模板还带着一整套取值阶梯
  （间距档 / 色板 / 圆角档），抄过来会让你的规范里凭空多出几十个看起来很像正经条目的 Token
- **契约取值**：`contract.json` 里「有哪几类页面、浮层分几档、每档多宽」看起来像
  「中后台通用规律」，其实是某一个系统的设计决策。预置进去，你会照着改而不是去采集

---

## 你要准备什么

| 输入 | 谁提供 | 怎么给 |
| :-- | :-- | :-- |
| Figma 设计规范 | 设计师 | MCP 接入，或导出 JSON/CSV，或截图 |
| 线上产品主要界面地址 | 产品/开发 | 能打开页面的人跑一下采集脚本，导出 JSON |
| 系统名 + 类名前缀 | 你定 | 例：系统名「某某资管平台」，前缀 `am` |

**内网/需登录的页面**：Agent 打不开，不用试。让能打开的人在浏览器控制台粘贴
`scripts/collect-from-browser.js` 跑一下，会下载一个 `*-styles.json`，把它交给 Agent 即可。
脚本只读 DOM，不发请求、不改页面、不碰登录态。

**Figma 设计稿**：接上 MCP（或给一个 token）之后，节点数据要经
`scripts/collect-from-figma.js` 转成与线上同构的候选，才能喂给挖掘器——
这一步以前是断的，文档讲了怎么接、没讲接上用什么工具。顺手加 `--evidence=` 拿一份
裁决证据（外壳几何 / 浮层候选 / 页签栏候选）。

---

## 五分钟跑通

```bash
NODE=$(command -v node)
FACTORY=<本仓库的 design-system-factory 目录>

# 1. 挖掘：把采集到的线上样式 + 设计稿导出，聚合成 Token 候选
$NODE $FACTORY/scripts/mine-tokens.js \
  --online=list-styles.json,form-styles.json,detail-styles.json \
  --figma=figma-vars.json \
  --out=mining-report.md --emit-tokens=tokens.draft.md

# 2. 建包（引擎复制 + 类名前缀替换 + 文档骨架 + 用草稿预填 tokens.md）
$NODE $FACTORY/scripts/init-package.js \
  --name=某某资管平台 --prefix=am --out=./am-design-specs \
  --from-mining=tokens.draft.md

# 3. 填规范（人工，依据 mining-report.md 与 tokens.draft.md）
#    3a. 先写 am-design-specs/foundation/tokens.md（已按草稿预填候选值，逐条确认）
#    3b. 再回灌各模板 :root —— 直到 [E5] 取值待填 归零
#    3c. 按 mining-report.md 第 2 节「布局候选」沉淀 am-design-specs/scripts/layout/
#        起手用 scripts/layout/_skeleton.html，不要从别的系统的布局改
#    3d. 按 mining-report.md 第 1 节「页面结构特征」沉淀 scripts/templates/<类别>/
#        起手用 scripts/templates/_skeleton.html，不要从别的系统的模板改
#    3e. 裁决浮层契约：把本系统的类别 / 档位 / 遮罩类名写进 scripts/templates/contract.json
#    3f. 把本系统的结构级约定写进 foundation/conventions.json

# 4. 校验，退出码必须是 0
$NODE am-design-specs/scripts/check-tokens.js . --strict
```

第 3 步没有捷径。**机器能算出「#2A6CDD 出现了 47 次」，算不出「这是品牌主色」。**
语义命名必须由设计师确认——一个错的主色会顺着模板扩散到几十个页面。

**建完包 `scripts/templates/` 是空的、`contract.json` 是空契约，这是对的。**
内容区模板与结构性契约都要从设计稿沉淀与裁决，引擎不给成品——理由见下节。
此时 `new-page.js --type=list` 会报错并打印沉淀步骤、`--overlay=modal` 会报错并打印
契约裁决步骤，这是设计出来的行为，不是包坏了。

---

## 产出包里有什么

```
am-design-specs/
├── SKILL.md              包内入口（文档路由 + 强约束清单）
├── USER-SKILL.md         用户级入口（可选；装了才能在任何工作区唤起规范能力）
├── foundation/
│   ├── tokens.md         取值唯一来源（按挖掘草稿预填候选，逐条确认后定稿）
│   ├── design-sync.md    设计稿 ↔ 规范映射与同步流程
│   └── conventions.json  本系统的结构级约定（[E4] 逐条校验）
├── components/           只写实际存在的组件
├── pages/                只写实际存在的页面类型
├── examples/             标杆页
└── scripts/
    ├── check-tokens.js        Token 双向校验 + 框架约定回归
    ├── check-design-sync.js   设计稿 ↔ 规范核对（抓两个真值源的漂移）
    ├── new-page.js            一键页面生成器
    ├── install-hooks.js       提交门禁（不合规不让提交）
    ├── layout/                本系统的页面外壳（**建包时只有契约骨架，需按设计稿沉淀**）
    └── templates/             本系统的内容区模板（**建包时只有契约骨架，需按设计稿沉淀**）
        ├── contract.json      **空契约**：浮层遮罩类名 / 宽度档位 / 样式提取范围 / --type 清单的声明位
        └── <类别>/<名字>.html  目录名即 --type 取值（类别由本系统设计稿裁决，不预设）
```

---

## 目录说明

| 路径 | 给谁看 |
| :-- | :-- |
| `SKILL.md` | Agent 的工作流总控 |
| `README.md` | 本文件，给用这个工厂的人 |
| `CHANGELOG.md` | 改过什么、哪一版改的 |
| `references/01-intake.md` | 输入怎么拿（Figma 三路线 / 线上采集 / 质量自检） |
| `references/02-token-mining.md` | 候选怎么判读、命名规则、常见误判 |
| `references/03-generation.md` | 建包、填充顺序、模板沉淀（布局 + 内容区）、框架约定 |
| `references/04-pitfalls.md` | 真实事故清单，动手前值得扫一眼 |
| `references/05-source-mining.md` | **拿不到设计稿时**：前端源码怎么当第三类权威（主题配置反解 / 六个陷阱 / 怎么验证） |
| `介绍-设计系统工厂.html` | 给同事看的一页说明（版本与项数由 `[S25]` 与工厂核对） |
| `scripts/collect-from-browser.js` | 线上采集脚本（浏览器端，给能打开页面的人） |
| `scripts/collect-from-figma.js` | 设计稿采集器（Figma 节点树 → 与线上同构的候选） |
| `scripts/mine-tokens.js` | 取值挖掘器（含布局候选聚类） |
| `scripts/init-package.js` | 建包器 |
| `scripts/self-check.js` | **工厂自检**（改完工厂跑它，退出码必须 0） |
| `assets/engine/` | 待复制的引擎（4 JS + 两份契约骨架 + **空契约**；**不含成品布局、成品模板与契约取值**） |
| `assets/doc-skeletons/` | 规范文档骨架模板 |
| `assets/samples/` | 样例（conventions / 布局 / 8 类内容区模板 / **填满的 contract.json**），**只作参考，不要照抄** |
| `examples/intake.sample.json` | 人工标注兜底模板 |

---

## 常见问题

**一定要有 Figma 吗？**
不一定，但只有线上采集时，规范描述的是「现状」而不是「意图」，
历史遗留的脏值会被洗白成标准。有设计稿才能做双向核对。

**线上页面一个都打不开怎么办？**
走人工标注：截图 + 填 `examples/intake.sample.json`。
质量会下降，但比硬编一套数值强。

**布局为什么要自己搭？**
因为「页面外壳长什么样」正是最不该跨系统借的东西。
抄一套别家的外壳过来，它看起来是能跑的——直到有人发现侧栏宽度、
面包屑位置、多标签行为全都不对，而那时它已经被复制进几十个页面了。
按 `mine-tokens.js` 报告第 2 节「布局候选」搭，逐套沉淀。

**内容区模板也要自己搭？「表格就是表格」不是吗？**
这句话只对了一半。**结构**确实大体相似，但模板还带着一整套**取值阶梯**——
间距档（`--space-1..16`）、色板（`--chart-1..4`）、圆角档、阴影档，
那些都是上一套系统的设计决策。抄过来的后果不是「数值不对」这么简单：
这些 Token 名会被登记进 `tokens.md`，每一条看起来都像一个正经的规范项，
没人知道它从哪来、对应本系统的哪个组件——而校验器是**绿的**，因为每条都被「登记」了。
按 `mine-tokens.js` 报告第 1 节「页面结构特征」搭，只沉淀本系统确实有的类别。

**我已经有一套实现（或旧包），能带进来吗？**
可以，用 `--seed-templates=<目录>`：它只复制**子目录**（子目录名即 `--type` 取值），
顶层散落的 .html 会跳过并提示。带进来的模板默认做**取值中性化**（`:root` 置为 `unset`），
逼你回灌本系统定稿取值；模板本来就是你自己的，加 `--keep-values` 保留现值。
⚠ 中性化只管「取值」那一层，**结构是否适用仍要人对着设计稿逐类确认**。

**生成完就完事了吗？**
没有。`check-tokens.js --strict` 退出码为 0 只是及格线。
规范要跟着设计稿升级持续维护，见产出包里的 `foundation/design-sync.md`。

**生成的页面里那些「演示入口」按钮，会污染我的采集结果吗？**
不会——但要两个标记都打全。演示区常用 `em` 写相对单位，
被采集器读成 `7px` / `11.9px` / `3.5px` 这类值，混进间距与圆角候选后
**看起来就像正经的规范取值**，而且全程不报错。

| 标记 | 管什么 |
| :-- | :-- |
| `@transient-start/end` 注释 | 注入宿主页时整段剔除 |
| `data-collect-ignore` 属性 | 采集时整块跳过 |

引擎自己注入的「演示入口」条已按此约定打好标记；**你自己的演示区要自己打**。
采集时看 `meta.elementsSkipped`——为 0 而页面上有演示区，就是漏了。
详见 `references/04-pitfalls.md` §5.8。

**图表配色采不到，算漏采吗？**
不算，这是采集器的能力边界。主流图表库（ECharts / G2 / Chart.js）把图**画在 `<canvas>` 上**，
坐标轴、网格线、系列色都不存在于 DOM 的 computed style 里——没有「漏了一处」，
是整层都读不到。表现是：采集报告里图表系列色为空，而**其它一切正常**，
很容易被当成「这个系统没图表」或者「采集脚本坏了」。

两件事必须做对：

| 要做的事 | 为什么 |
| :-- | :-- |
| 图表容器（面板 / 工具栏 / 侧栏）的 CSS **要收** | 它是普通 DOM，采得到；不收会白丢一整页的版式 |
| 图表系列色去**设计稿或图表库配置**里找，别等采集 | 采集永远给不了；硬等只会让图表相关的 Token 一直空着 |

判「到底有没有图表」不要看 `structure.charts` 就下结论——
它只认 `<canvas>` 与带图表语义的类名，是个**下限**；
真正可靠的信号是打包产物里有没有图表库（`grep -o 'echarts\|antv\|highcharts' *.js`）。
详见 `references/04-pitfalls.md` §3.11。

**改了这个工厂本身，怎么确认没改坏？**
跑 `scripts/self-check.js`，退出码必须 0。它会量「工作区 ↔ 安装副本是否一致」——
实际被加载的是安装副本，只改工作区不会生效，这是这个项目最容易踩的坑。
改完还要同步：

```bash
rsync -a --delete --exclude='.workbuddy-ai' --exclude='.DS_Store' \
  <工厂工作区目录>/ \
  ~/.workbuddy-ai/skills/design-system-factory/
```

---

版本：v1.22　最近更新：2026-10-14
