# Design System Factory 宣传文案

> 仓库：https://github.com/wangweiyu314/design-system-factory
> 一句话：把设计规范从「一份没人看的文档」变成「AI 能执行、门禁能拦截的约束」。

---

## 一、GitHub 仓库简介（About 一行）

**中文**：
给 AI 一套 Figma 规范 + 几个线上页面，产出一整套可执行的设计系统技能包：Token 校验器 + 页面生成器 + 提交门禁。规范不再是文档，是约束。

**英文**：
Feed it a Figma spec + a few live pages, get a full executable design-system skill package: token checker + page generator + commit gates. Specs stop being docs — they become constraints.

**英文短版**（字符数友好）：
Turn your design spec into machine-enforced constraints for AI coding agents. Token checker, page generator, commit gates.

---

## 二、社交媒体短文案

### 中文 · 朋友圈 / 微博 / 即刻

**版本 A（痛点开场）**

> 规范写了 80 页，AI 写页面时还是自己编色值、凑间距。
>
> 后来我想通了：问题不在提示词，在于规范只是一份文档——AI 读不进、读不全，写错了也没人拦。
>
> 于是我做了个「设计系统工厂」：喂给它 Figma 规范 + 几个线上页面，产出一整套机器能执行的技能包——Token 单一真值源、双向校验器、页面生成器、git 提交门禁。
>
> 硬编码色值、数值漂移？commit 阶段直接卡住。
>
> 开源了，欢迎来拍砖 👇
> https://github.com/wangweiyu314/design-system-factory

**版本 B（金句开场）**

> 「规范不需要 AI 读懂，需要 AI 违反不了。」
>
> 我把这句话做成了一个开源项目：设计系统工厂。
>
> 输入：Figma 设计规范 + 线上真实页面
> 输出：规范文档 + HTML 模板 + Token 校验器 + 页面生成器 + 提交门禁
>
> 27 项自检、8 个校验码、三道校验链路，全部开源。让你的 AI 助手第一次写页面就在规范内。

**版本 C（一句话极简）**

> 做了个开源工具：把设计规范变成 AI agent 能执行、git 能拦截的约束系统。Figma 进，技能包出。https://github.com/wangweiyu314/design-system-factory

### 英文 · X (Twitter) / LinkedIn

**Version A (pain-first thread opener)**

> Your design spec has 80 pages. Your AI agent still invents colors and eyeballs spacing.
>
> I used to blame the prompt. Then I realized: the spec is just a document. The agent can't ingest it, can't fully read it, and nothing catches violations.
>
> So I built Design System Factory — open source:
>
> 📥 In: Figma spec + live product pages
> 📦 Out: spec docs (single source of truth for tokens) + HTML templates + a bidirectional token checker + a page generator + git commit gates
>
> Hardcoded hex values and drifted numbers? Blocked at commit.
>
> https://github.com/wangweiyu314/design-system-factory

**Version B (one-liner energy)**

> "A spec doesn't need to be understood by AI. It needs to be un-violatable by AI."
>
> Design System Factory: Figma in → executable skill package out. Token checker, page generator, commit gates. 100% open source.
>
> https://github.com/wangweiyu314/design-system-factory

---

## 三、社区长帖开头（掘金 / 知乎 / V2EX 与 Reddit / HN）

### 中文（掘金 / 知乎 / V2EX）

**标题候选：**
1. 《规范写完 AI 还是不听话？我把设计规范做成了「可执行的约束」并开源了》
2. 《从 80 页规范到 git 提交门禁：让 AI 写页面第一次就在规范内（开源）》
3. 《设计系统工厂：Figma 进，AI 可执行的技能包出（Token 校验 / 页面生成 / 提交门禁）》

**开头：**

> 先说三个我真实踩过的坑：
>
> 1. 规范读不进也读不全——几十页规范塞不进上下文，AI 只看到片段，颜色间距靠猜；
> 2. 写错了没人发现——硬编码色值、数值漂移混在几百行 diff 里，CSS 不报错、页面能跑；
> 3. 没有门禁全靠自觉——prompt 里写「必须遵守规范」，AI 转头就忘。
>
> 结论：**问题不在 AI，在于规范只是一份文档。**
>
> 所以我做了一个「设计系统工厂」：输入 Figma 设计规范和线上真实页面，产出一整套技能包——Token 单一真值源、双向校验（设计稿 ↔ 代码）、11 套页面模板、一句话生成列表页/表单页/详情页，以及在 git commit 阶段直接拦截违规的 hook 门禁。
>
> 关键设计决策：引擎是中立的，不预置任何设计答案。类别、浮层档位、取值阶梯全部从你自己的设计稿里挖出来、由人裁决——避免「用一个系统的答案约束另一个系统」。
>
> 全部开源（含 27 项自检、完整踩坑记录）：https://github.com/wangweiyu314/design-system-factory

### English (Reddit r/webdev / r/Frontend, Hacker News)

**Title candidates:**
1. "Show HN: I turned my design spec into machine-enforced constraints for AI agents (open source)"
2. "Your 80-page design spec can't stop an AI agent from inventing colors. Commit gates can."

**Opening:**

> Three failure modes I kept hitting with AI coding agents:
>
> 1. **The spec doesn't fit in context.** The agent sees fragments and guesses the rest.
> 2. **Violations are invisible.** Hardcoded hex values and drifted numbers hide in large diffs — CSS doesn't error, the page renders fine.
> 3. **Nothing enforces anything.** "Follow the spec" in the prompt lasts about one turn.
>
> Conclusion: the problem isn't the AI; it's that a spec is just a document.
>
> Design System Factory takes a Figma spec + live product pages and produces an executable skill package: token single-source-of-truth docs, a bidirectional checker (design ↔ code), HTML page templates, a one-command page generator, and git hooks that block non-compliant commits.
>
> Design decision I'm proud of: the engine is neutral and ships zero design answers. Categories, overlay tiers, and value scales are all mined from *your* designs and adjudicated by a human — never copied from a reference system.
>
> Open source, with a 27-item self-check suite and a full pitfalls log: https://github.com/wangweiyu314/design-system-factory

---

## 四、Slogan 备选

| 中文 | 英文 |
| :-- | :-- |
| 规范不需要 AI 读懂，需要 AI 违反不了。 | A spec doesn't need to be understood by AI — it needs to be un-violatable. |
| 把规范从文档变成约束。 | Turn specs into constraints. |
| Figma 进，可执行的设计系统出。 | Figma in, executable design system out. |
| 让 AI 第一次写页面就在规范内。 | Ship spec-compliant pages on the first try. |
| 校验、生成、门禁，一套打包。 | Check, generate, enforce — one package. |

---

## 五、使用建议

- **即刻 / 微博 / 朋友圈**：用「二」的版本 A，配一张终端截图（check-tokens 全绿退出码 0 的画面最有说服力）。
- **X / LinkedIn**：用版本 A 发帖，版本 B 适合作为第二条跟进或回复补刀。
- **掘金 / 知乎**：用「三」的中文长帖，补上三张图：三卡点示意图、校验器输出截图、门禁拦截 commit 的截图。
- **HN**：Show HN 规则要求标题即主帖，用候选 1；首评里补一句「happy to share the pitfalls log — it's as much a part of the project as the code」。
- **发布节奏建议**：先发中文社区（掘金/即刻）收集反馈 → 修一轮 README → 再发 X + HN，避免首日多平台分散评论。
