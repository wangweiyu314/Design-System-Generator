{
  "_说明": [
    "{{SYSTEM}} 的框架约定。check-tokens.js 的 [E4] 逐条校验交付物，规则为空则 [E4] 恒为 0。",
    "这些约定必须来自本系统的设计稿 / 线上实测 / 人工裁决——",
    "从别的系统抄来的约定在这套系统里没验证过，等于没有，更糟的是会让人误以为已经处理过。",
    "写法：每条规则一个对象，字段见下面「_类型参考」。",
    "只写「批量脚本可能漏掉某个文件」这类结构级约定——",
    "凡是能靠 E1/E2/E3/E5 查出来的取值问题，不要写进这里。"
  ],
  "_类型参考": {
    "forbid-removed-tokens": "引用 tokens.md「已移除」表里的 Token 即报错。字段：无",
    "forbid-property": "匹配的规则块内禁止出现某属性。字段：selector / match(exact|contains|all) / property(数组)",
    "require-property": "匹配的规则块内必须声明某属性且值匹配正则。字段：selector / match / property(对象：属性→正则)",
    "require-value": "属性取值必须在白名单内（未声明则不判）。字段：selector / match / property(数组) / allow(数组) / fallback(简写属性名)",
    "require-value-pattern": "属性取值必须匹配正则（未声明则不判）。字段：selector / match / property(数组) / pattern(正则字符串) / allow(数组，可选，命中即放行) / fallback(简写属性名)",
    "require-rule": "必须存在「选择器 + 属性匹配正则」的规则。字段：selector / property / matchValue(正则字符串)",
    "require-first-child": "指定子元素必须是容器的首个子元素。字段：container(如 main.x-content) / child(如 nav.x-breadcrumb)",
    "when": "前置条件，不满足则跳过该条：hasClass(HTML 中该类存在) / cssHas(样式表中该选择器存在) / htmlHas(HTML 中含该子串)",
    "公共字段": "id(显示用编号) / reason(这条约定为什么存在，会打进报错信息)"
  },
  "version": 1,
  "system": "{{SYSTEM}}",
  "decidedAt": "{{DATE}}",
  "rules": []
}
