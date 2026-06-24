# 性能基线报告 (v1.4.0)

测试日期: 2026-06-24
运行环境: Node.js v24.10.0 on darwin arm64
预热次数: 3 | 测量次数: 10

## 测试结果

| 测试项 | min | median | max | mean |
|---|---|---|---|---|
| 1.1 动态 import shiki | 3.79µs | 5.50µs | 17.54µs | 7.43µs |
| 1.2 createHighlighter (1 theme + 7 langs) | 4.488ms | 4.929ms | 5.654ms | 4.981ms |
| 1.3 codeToHtml (javascript, 20 lines) | 1.612ms | 1.937ms | 2.267ms | 1.892ms |
| 1.4 codeToHtml (typescript, 80 lines) | 7.020ms | 7.721ms | 8.080ms | 7.599ms |
| 2.1 并行 import 所有 bundledThemes (≈60个) | 131.67µs | 157.83µs | 226.17µs | 161.47µs |
| 2.2 按需 import 30个主题 | 57.46µs | 59.12µs | 749.08µs | 130.59µs |
| 3.1 loadLanguage (rust, 首次) | 330.17µs | 342.92µs | 374.58µs | 346.35µs |
| 3.2 loadLanguage (python, 已加载) | 7.62µs | 8.33µs | 10.63µs | 8.55µs |
| 4.1 动态 import markdown-it | 1.87µs | 2.00µs | 6.12µs | 2.43µs |
| 4.2 创建 MarkdownIt 实例 (含 highlight 回调) | 143.71µs | 160.08µs | 2.876ms | 433.64µs |
| 4.3 md.render (简单文档, ~290行) | 21.546ms | 23.064ms | 24.783ms | 23.005ms |
| 4.4 md.render (代码块密集, ~324行) | 2.712ms | 2.802ms | 2.970ms | 2.811ms |
| 4.5 md.render (大文档, ~1570行) | 53.377ms | 56.536ms | 59.124ms | 55.637ms |
| 4.6 md.render (含 KaTeX, ~383行) | 539.04µs | 572.04µs | 770.38µs | 582.05µs |
| 5.1 hasMathExpressions (无数学公式文档) | 0.83µs | 1.33µs | 2.46µs | 1.40µs |
| 5.2 hasMathExpressions (含 KaTeX 文档) | 0.17µs | 0.38µs | 0.83µs | 0.38µs |
| 5.3 hasMathExpressions (大文档) | 3.17µs | 3.21µs | 4.00µs | 3.32µs |
| 5.4 getMathInfo (含 KaTeX 文档) | 5.88µs | 8.00µs | 11.42µs | 8.12µs |
| 6.1 detectLanguages (代码块密集文档) | 13.67µs | 13.96µs | 14.54µs | 14.00µs |
| 6.2 detectLanguages (大文档) | 12.00µs | 12.17µs | 12.67µs | 12.22µs |
| 6.3 detectLanguages (无代码块的文档) | 2.50µs | 2.92µs | 7.58µs | 3.50µs |
| 6.4 mapLanguageToShiki (10种别名) | 3.12µs | 3.25µs | 9.21µs | 3.91µs |
| 7.1 完整管线: detect + render + highlight (代码密集) | 6.907ms | 7.366ms | 10.445ms | 7.721ms |
| 7.2 完整管线: detect + render + highlight (大文档) | 51.715ms | 54.201ms | 55.592ms | 53.954ms |

## 各测试文件大小
| 文件 | 大小 |
|---|---|
| 大文档 | 1571 行, 31508 字节 |
| 代码密集 | 325 行, 3940 字节 |
| 含KaTeX | 384 行, 5186 字节 |
| 简单文档 | 291 行, 7382 字节 |

## 说明
- 所有"异步"指标包含 await 时间
- markdown-it highlight 回调中使用同步 Shiki codeToHtml
- 完整管线模拟了真实场景下的 detectLanguages + loadLanguage + md.render