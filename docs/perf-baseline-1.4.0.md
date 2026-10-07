# 性能基线报告 (v1.4.0)

测试日期: 2026-09-19
运行环境: Node.js v26.9.0 on darwin arm64
预热次数: 3 | 测量次数: 10

## 测试结果

| 测试项 | min | median | max | mean |
|---|---|---|---|---|
| 1.1 动态 import shiki | 4.83µs | 7.17µs | 17.92µs | 9.20µs |
| 1.2 createHighlighter (1 theme + 7 langs) | 4.480ms | 5.744ms | 7.885ms | 5.777ms |
| 1.3 codeToHtml (javascript, 20 lines) | 946.83µs | 1.819ms | 2.426ms | 1.654ms |
| 1.4 codeToHtml (typescript, 80 lines) | 3.851ms | 4.704ms | 5.707ms | 4.614ms |
| 2.1 并行 import 所有 bundledThemes (≈60个) | 180.63µs | 241.75µs | 303.42µs | 240.65µs |
| 2.2 按需 import 30个主题 | 81.33µs | 83.75µs | 88.04µs | 83.86µs |
| 3.1 loadLanguage (rust, 首次) | 337.17µs | 377.50µs | 1.581ms | 497.03µs |
| 3.2 loadLanguage (python, 已加载) | 8.25µs | 9.08µs | 12.79µs | 9.23µs |
| 4.1 动态 import markdown-it | 3.08µs | 3.75µs | 6.42µs | 4.10µs |
| 4.2 创建 MarkdownIt 实例 (含 highlight 回调) | 215.46µs | 253.42µs | 379.33µs | 270.60µs |
| 4.3 md.render (简单文档, ~290行) | 12.214ms | 15.664ms | 20.987ms | 16.186ms |
| 4.4 md.render (代码块密集, ~324行) | 1.615ms | 1.922ms | 2.455ms | 1.933ms |
| 4.5 md.render (大文档, ~1570行) | 35.726ms | 41.713ms | 47.349ms | 40.285ms |
| 4.6 md.render (含 KaTeX, ~383行) | 489.04µs | 587.50µs | 717.58µs | 583.14µs |
| 5.1 hasMathExpressions (无数学公式文档) | 0.88µs | 1.21µs | 2.58µs | 1.46µs |
| 5.2 hasMathExpressions (含 KaTeX 文档) | 0.17µs | 0.29µs | 0.96µs | 0.35µs |
| 5.3 hasMathExpressions (大文档) | 3.21µs | 3.29µs | 4.08µs | 3.41µs |
| 5.4 getMathInfo (含 KaTeX 文档) | 6.04µs | 9.25µs | 88.12µs | 18.03µs |
| 6.1 detectLanguages (代码块密集文档) | 12.54µs | 13.21µs | 20.17µs | 14.02µs |
| 6.2 detectLanguages (大文档) | 11.33µs | 11.58µs | 11.96µs | 11.58µs |
| 6.3 detectLanguages (无代码块的文档) | 2.33µs | 2.42µs | 3.42µs | 2.65µs |
| 6.4 mapLanguageToShiki (10种别名) | 2.88µs | 2.96µs | 4.04µs | 3.08µs |
| 7.1 完整管线: detect + render + highlight (代码密集) | 5.121ms | 6.725ms | 9.712ms | 6.881ms |
| 7.2 完整管线: detect + render + highlight (大文档) | 35.636ms | 40.179ms | 69.460ms | 45.083ms |

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