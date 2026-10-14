---
name: "{{PREFIX}}-design-system"
description: "{{SYSTEM}} 设计规范与前端交付能力。当用户要求生成、构建、修改、复刻或评审 {{SYSTEM}} 的网页、页面、UI 组件或前端界面，或询问其设计规范取值（颜色、字体、间距、圆角、阴影、Token、图标、组件规格、页面布局）时使用。"
agent_created: true
---

# {{SYSTEM}} 设计系统 — 交付能力入口

> **这是「用户级入口」，不是包内入口。** 包内入口是 `{{PACKAGE}}/SKILL.md`，两者分工不同：
> 包内那份写全（目录结构 / 文档路由 / 强约束），这份只留「怎么找到包、怎么生成、怎么校验」。
>
> **安装方式**（可选）：把本文件复制成
> `~/.workbuddy-ai/skills/{{PREFIX}}-design-system/SKILL.md`，
> 就能在**任意工作区**里唤起 {{SYSTEM}} 的规范能力，不必先 cd 到包目录。
>
> ```bash
> mkdir -p ~/.workbuddy-ai/skills/{{PREFIX}}-design-system
> cp "$SPEC_ROOT/USER-SKILL.md" ~/.workbuddy-ai/skills/{{PREFIX}}-design-system/SKILL.md
> ```
>
> 不装也不影响使用——直接读 `{{PACKAGE}}/SKILL.md` 同样能拿到全部信息。

> **本 Skill 是入口，不是规范副本。**
> 规范正文唯一来源在 `SPEC_ROOT`（见下），任何取值都必须回源查询——本文件刻意不含任何规范数值。

## 0. 路径

```
SPEC_ROOT = 本包所在目录（即本文件 `SKILL.md` 的上一级）
NODE      = 你机器上的 node（`which node`）
```

> **刻意不写绝对路径**——本包要能整体拷给同事、放在任何目录下都照常工作。
> 包内脚本用 `__dirname/..` 自己定位包根。

## 1. 两条铁律

1. **回源再动手**：任何数值先查 `foundation/tokens.md`，禁止凭记忆。
2. **模板起步**：`scripts/templates/<类别>/` 下有本系统已沉淀的模板，复制改造比手写更快也更不容易违规。
   该目录为空 = 本系统还没沉淀过模板，按 `scripts/templates/README.md` 从设计稿搭，不要从别的系统抄。

## 2. 一键生成

```bash
cd "$SPEC_ROOT/.."
$NODE "$SPEC_ROOT/scripts/new-page.js" --type=list --name=<页面名>
```

## 3. 交付前必跑

```bash
$NODE "$SPEC_ROOT/scripts/check-tokens.js" "$SPEC_ROOT" --strict
```

退出码必须为 0。**扫描根是包本身，不是它的上一级**（理由见包内 `SKILL.md` §3）。

## 4. 文档路由

先读 `{{PACKAGE}}/SKILL.md` 定位唯一一个最相关子文档；`foundation/tokens.md` 与 `scripts/` 模板属公共资源，可附加读取。

---

初始化时间：{{DATE}}
