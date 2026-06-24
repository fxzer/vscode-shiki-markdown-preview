#!/usr/bin/env node

/**
 * Performance Benchmark for shiki-markdown-preview
 * 
 * Measures baseline metrics for:
 * 1. Shiki highlighter initialization (createHighlighter)
 * 2. Theme discovery / metadata loading
 * 3. Language loading
 * 4. Code highlighting (codeToHtml)
 * 5. Markdown rendering (markdown-it)
 * 6. Math expression detection
 * 7. Language detection from content
 * 8. Full pipeline (detect + render + highlight)
 * 
 * Run: node scripts/perf-benchmark.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { performance, PerformanceObserver } from 'node:perf_hooks'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ── Config ───────────────────────────────────────────────────────────
const WARMUP = 3       // warmup iterations discarded
const RUNS = 10        // measured iterations
const BIG_FILE = path.join(ROOT, 'test-md/test-performance.md')
const KATEX_FILE = path.join(ROOT, 'test-md/test-katex.md')
const CODE_FILE = path.join(ROOT, 'test-md/test-code-blocks.md')
const SIMPLE_FILE = path.join(ROOT, 'test-md/test-basic-syntax.md')

// ── Helpers ──────────────────────────────────────────────────────────
function now() { return performance.now() }

function read(file) {
  try { return readFileSync(file, 'utf-8') }
  catch { return '' }
}

function fmt(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(2)}µs`
  if (ms < 1000) return `${ms.toFixed(3)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function stats(label, samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const median = sorted[Math.floor(sorted.length / 2)]
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length
  return { label, min, max, median, mean, samples: sorted }
}

function measure(label, fn, runs = RUNS) {
  // warmup
  for (let i = 0; i < WARMUP; i++) fn()

  const samples = []
  for (let i = 0; i < runs; i++) {
    const t0 = now()
    fn()
    samples.push(now() - t0)
  }
  return stats(label, samples)
}

async function measureAsync(label, fn, runs = RUNS) {
  for (let i = 0; i < WARMUP; i++) await fn()
  const samples = []
  for (let i = 0; i < runs; i++) {
    const t0 = now()
    await fn()
    samples.push(now() - t0)
  }
  return stats(label, samples)
}

// ── Main Benchmark Runner ────────────────────────────────────────────
const results = []

function record(s) {
  results.push(s)
  console.log(`  ${s.label.padEnd(50)} min=${fmt(s.min)}  median=${fmt(s.median)}  max=${fmt(s.max)}  mean=${fmt(s.mean)}`)
}

// ══════════════════════════════════════════════════════════════════════
//  1. Shiki Highlighter Initialization
// ══════════════════════════════════════════════════════════════════════
console.log('\n📊 Shiki 高亮器初始化')
console.log('─'.repeat(80))

let shikiModule, highlighter

record(await measureAsync('1.1 动态 import shiki', async () => {
  shikiModule = await import('shiki')
}))

record(await measureAsync('1.2 createHighlighter (1 theme + 7 langs)', async () => {
  if (highlighter) {
    try { highlighter.dispose() } catch {}
  }
  highlighter = await shikiModule.createHighlighter({
    themes: ['vitesse-dark'],
    langs: ['javascript', 'typescript', 'html', 'css', 'json', 'markdown', 'python'],
  })
}))

record(await measureAsync('1.3 codeToHtml (javascript, 20 lines)', async () => {
  const code = `function fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\n\nconst result = fibonacci(10);\nconsole.log(result);\n`.repeat(2)
  highlighter.codeToHtml(code, { lang: 'javascript', theme: 'vitesse-dark' })
}))

record(await measureAsync('1.4 codeToHtml (typescript, 80 lines)', async () => {
  const code = `interface User {\n  id: number;\n  name: string;\n  email: string;\n}\n\nclass UserService {\n  private users: User[] = [];\n  \n  async findById(id: number): Promise<User | undefined> {\n    return this.users.find(u => u.id === id);\n  }\n  \n  async create(data: Omit<User, 'id'>): Promise<User> {\n    const user = { ...data, id: this.users.length + 1 };\n    this.users.push(user);\n    return user;\n  }\n}\n`.repeat(4)
  highlighter.codeToHtml(code, { lang: 'typescript', theme: 'vitesse-dark' })
}))

// ══════════════════════════════════════════════════════════════════════
//  2. Theme Discovery
// ══════════════════════════════════════════════════════════════════════
console.log('\n📊 主题发现与元数据加载')
console.log('─'.repeat(80))

record(await measureAsync('2.1 并行 import 所有 bundledThemes (≈60个)', async () => {
  const entries = Object.entries(shikiModule.bundledThemes || {})
  const promises = entries.map(async ([_, importer]) => {
    try {
      const mod = await importer()
      return mod.default?.name || null
    } catch { return null }
  })
  await Promise.allSettled(promises)
}))

// Only load 30 themes instead to be more realistic (the metadata loading is similar)
record(await measureAsync('2.2 按需 import 30个主题', async () => {
  const entries = Object.entries(shikiModule.bundledThemes || {}).slice(0, 30)
  const promises = entries.map(async ([_, importer]) => {
    try {
      const mod = await importer()
      return mod.default?.name || null
    } catch { return null }
  })
  await Promise.allSettled(promises)
}))

// ══════════════════════════════════════════════════════════════════════
//  3. Language Loading
// ══════════════════════════════════════════════════════════════════════
console.log('\n📊 语言加载')
console.log('─'.repeat(80))

record(await measureAsync('3.1 loadLanguage (rust, 首次)', async () => {
  const h = await shikiModule.createHighlighter({
    themes: ['vitesse-dark'],
    langs: ['javascript'],
  })
  try { await h.loadLanguage('rust') } catch {}
  try { h.dispose() } catch {}
}))

record(await measureAsync('3.2 loadLanguage (python, 已加载)', async () => {
  try { await highlighter.loadLanguage('python') } catch {}
}))

// ══════════════════════════════════════════════════════════════════════
//  4. Markdown Rendering
// ══════════════════════════════════════════════════════════════════════
console.log('\n📊 Markdown 渲染')
console.log('─'.repeat(80))

let markdownItModule, md

record(await measureAsync('4.1 动态 import markdown-it', async () => {
  markdownItModule = await import('markdown-it')
}))

record(await measureAsync('4.2 创建 MarkdownIt 实例 (含 highlight 回调)', async () => {
  md = markdownItModule.default({
    html: true,
    xhtmlOut: true,
    linkify: true,
    typographer: true,
    highlight: (code, lang) => {
      if (!lang || !highlighter) return `<pre><code>${code}</code></pre>`
      try {
        return highlighter.codeToHtml(code, { lang, theme: 'vitesse-dark' })
      } catch {
        return `<pre><code>${code}</code></pre>`
      }
    },
  })
}))

// Plugins
const emojiModule = await import('markdown-it-emoji')
const footnoteModule = await import('markdown-it-footnote')
md.use(emojiModule.full)
md.use(footnoteModule.default)

const simpleContent = read(SIMPLE_FILE)
const performanceContent = read(BIG_FILE)
const codeContent = read(CODE_FILE)
const katexContent = read(KATEX_FILE)

record(await measureAsync('4.3 md.render (简单文档, ~290行)', async () => {
  await md.render(simpleContent)
}))

record(await measureAsync('4.4 md.render (代码块密集, ~324行)', async () => {
  await md.render(codeContent)
}))

record(await measureAsync('4.5 md.render (大文档, ~1570行)', async () => {
  await md.render(performanceContent)
}))

record(await measureAsync('4.6 md.render (含 KaTeX, ~383行)', async () => {
  await md.render(katexContent)
}))

// ══════════════════════════════════════════════════════════════════════
//  5. Math Detection
// ══════════════════════════════════════════════════════════════════════
console.log('\n📊 数学公式检测')
console.log('─'.repeat(80))

// Import the compiled math-detector module (must compile first: npm run compile)
const mathModule = await import('../out/utils/math-detector.js')
record(measure('5.1 hasMathExpressions (无数学公式文档)', () => {
  mathModule.hasMathExpressions(simpleContent)
}))

record(measure('5.2 hasMathExpressions (含 KaTeX 文档)', () => {
  mathModule.hasMathExpressions(katexContent)
}))

record(measure('5.3 hasMathExpressions (大文档)', () => {
  mathModule.hasMathExpressions(performanceContent)
}))

record(measure('5.4 getMathInfo (含 KaTeX 文档)', () => {
  mathModule.getMathInfo(katexContent)
}))

// ══════════════════════════════════════════════════════════════════════
//  6. Language Detection
// ══════════════════════════════════════════════════════════════════════
console.log('\n📊 代码语言检测')
console.log('─'.repeat(80))

const langModule = await import('../out/utils/language-detector.js')

record(measure('6.1 detectLanguages (代码块密集文档)', () => {
  langModule.detectLanguages(codeContent)
}))

record(measure('6.2 detectLanguages (大文档)', () => {
  langModule.detectLanguages(performanceContent)
}))

record(measure('6.3 detectLanguages (无代码块的文档)', () => {
  langModule.detectLanguages(simpleContent)
}))

record(measure('6.4 mapLanguageToShiki (10种别名)', () => {
  const aliases = ['js', 'ts', 'py', 'rb', 'sh', 'c++', 'cs', 'md', 'yml', 'golang']
  aliases.forEach(a => langModule.mapLanguageToShiki(a))
}))

// ══════════════════════════════════════════════════════════════════════
//  7. Full Pipeline (realistic render)
// ══════════════════════════════════════════════════════════════════════
console.log('\n📊 完整渲染管线 (模拟真实场景)')
console.log('─'.repeat(80))

record(await measureAsync('7.1 完整管线: detect + render + highlight (代码密集)', async () => {
  const langs = langModule.detectLanguages(codeContent)
  for (const lang of langs) {
    if (highlighter) {
      try { await highlighter.loadLanguage(lang) } catch {}
    }
  }
  md.render(codeContent)
}))

record(await measureAsync('7.2 完整管线: detect + render + highlight (大文档)', async () => {
  const langs = langModule.detectLanguages(performanceContent)
  for (const lang of langs) {
    if (highlighter) {
      try { await highlighter.loadLanguage(lang) } catch {}
    }
  }
  md.render(performanceContent)
}))

// ══════════════════════════════════════════════════════════════════════
//  Summary Table
// ══════════════════════════════════════════════════════════════════════
console.log('\n\n📋 性能基准报告')
console.log('═'.repeat(80))
console.log(`  运行环境: ${process.title} ${process.version}`)
console.log(`  平台: ${process.platform} ${process.arch}`)
console.log(`  测试日期: ${new Date().toISOString().slice(0, 10)}`)
console.log(`  预热次数: ${WARMUP}  |  测量次数: ${RUNS}`)
console.log('═'.repeat(80))
console.log('')
console.log('  '.padEnd(50) + '  min       median    max       mean')
console.log('  ' + '─'.repeat(78))

for (const r of results) {
  const label = r.label.padEnd(50)
  const min = fmt(r.min).padStart(9)
  const median = fmt(r.median).padStart(9)
  const max = fmt(r.max).padStart(9)
  const mean = fmt(r.mean).padStart(9)
  console.log(`  ${label} ${min}  ${median}  ${max}  ${mean}`)
}

console.log('─'.repeat(80))
console.log('')

// Generate Markdown report
const lines = []
lines.push('# 性能基线报告 (v1.4.0)\n')
lines.push(`测试日期: ${new Date().toISOString().slice(0, 10)}`)
lines.push(`运行环境: Node.js ${process.version} on ${process.platform} ${process.arch}`)
lines.push(`预热次数: ${WARMUP} | 测量次数: ${RUNS}\n`)
lines.push('## 测试结果\n')
lines.push('| 测试项 | min | median | max | mean |')
lines.push('|---|---|---|---|---|')
for (const r of results) {
  lines.push(`| ${r.label} | ${fmt(r.min)} | ${fmt(r.median)} | ${fmt(r.max)} | ${fmt(r.mean)} |`)
}
lines.push('')
lines.push('## 各测试文件大小')
lines.push(`| 文件 | 大小 |`)
lines.push(`|---|---|`)
for (const [label, fpath] of [['大文档', BIG_FILE], ['代码密集', CODE_FILE], ['含KaTeX', KATEX_FILE], ['简单文档', SIMPLE_FILE]]) {
  const content = read(fpath)
  const lines_count = content.split('\n').length
  const bytes = content.length
  lines.push(`| ${label} | ${lines_count} 行, ${bytes} 字节 |`)
}
lines.push('')
lines.push('## 说明')
lines.push('- 所有"异步"指标包含 await 时间')
lines.push('- markdown-it highlight 回调中使用同步 Shiki codeToHtml')
lines.push('- 完整管线模拟了真实场景下的 detectLanguages + loadLanguage + md.render')

const report = lines.join('\n')
writeFileSync(path.join(ROOT, 'docs/perf-baseline-1.4.0.md'), report, 'utf-8')
console.log('📝 报告已保存到 docs/perf-baseline-1.4.0.md')
