问题总结

## 问题描述

1. 初始搜索正常：输入 "co" 时找到匹配结果并正确高亮
2. 继续输入失败：输入 "de" 变成 "code" 时，第二次搜索找到 0 个文本节点，高亮消失

## 根本原因

**问题 1：TreeWalker DOM 状态不一致**

- 在 `clearHighlightsDOM()` 执行后立即使用 TreeWalker 遍历，DOM 可能处于不稳定状态
- TreeWalker 无法正确遍历被修改后的 DOM

**问题 2：相邻文本节点未合并**

- 当 "code" 被高亮 "co" 后，DOM 变成 `<span>co</span>de`（两个节点）
- 清除高亮时只替换 `<span>` 为 "co"，剩下 "co" 和 "de" 两个相邻文本节点
- 搜索 "code" 时找不到，因为它是两个独立的节点

## 解决方案

1. **使用递归遍历代替 TreeWalker**
   - 实现 `collectTextNodes()` 方法直接遍历 DOM 树
   - 更加可靠，不受 DOM 操作顺序影响

2. **调用 document.normalize()**
   - 在 `clearHighlightsDOM()` 末尾调用 `document.normalize()`
   - 合并相邻的文本节点，确保 "co" + "de" → "code"

## Resolution

**状态：已修复 ✅**

**提交：** d430a44, [后续提交]
**日期：** 2026-02-07

**修复内容：**

- 添加 `collectTextNodes()` 递归方法遍历文本节点
- 在 `clearHighlightsDOM()` 中调用 `document.normalize()` 合并相邻节点
- 排除 SCRIPT、STYLE、NOSCRIPT、TEMPLATE、IFRAME、HEAD 等非内容标签
