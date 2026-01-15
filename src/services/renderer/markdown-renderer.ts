import type * as vscode from 'vscode'
import type { ThemeService } from '../theme/theme-service'
import { container } from '@mdit/plugin-container'
import { katex } from '@mdit/plugin-katex'
import matter from 'gray-matter'
import MarkdownIt from 'markdown-it'
import * as markdownItEmoji from 'markdown-it-emoji'
import markdownItFootnote from 'markdown-it-footnote'
import lazy_loading from 'markdown-it-image-lazy-loading'
import markdownItIns from 'markdown-it-ins'
import markdownItMark from 'markdown-it-mark'
import markdownItSub from 'markdown-it-sub'
import markdownItSup from 'markdown-it-sup'
import * as markdownItCheckbox from 'markdown-it-task-checkbox'
import { escapeHtml } from '../../utils/common'
import { ErrorHandler } from '../../utils/error-handler'
import { detectLanguages } from '../../utils/language-detector'
import { hasMathExpressions } from '../../utils/math-detector'
import { PathResolver } from '../../utils/path-resolver'

export class MarkdownRenderer {
  private _markdownIt: MarkdownIt | undefined
  private _themeService: ThemeService
  private _currentDocument: vscode.TextDocument | undefined
  private _katexEnabled: boolean = false

  constructor(themeService: ThemeService) {
    this._themeService = themeService
  }

  /**
   * Initialize the markdown renderer
   */
  initialize(): void {
    this._markdownIt = new MarkdownIt({
      html: true,
      xhtmlOut: true,
      breaks: false,
      linkify: true,
      typographer: true,
      highlight: (code: string, lang: string) => {
        return this.highlightCode(code, lang)
      },
    })

    // 集成图片懒加载插件
    this._markdownIt.use(lazy_loading)
    this._markdownIt.use(markdownItEmoji.full)
    this._markdownIt.use(markdownItFootnote)
    this._markdownIt.use(markdownItIns)
    this._markdownIt.use(markdownItMark)
    this._markdownIt.use(markdownItSub)
    this._markdownIt.use(markdownItSup)
    const markdownItCheckboxPlugin = (markdownItCheckbox as any).default ?? markdownItCheckbox
    this._markdownIt.use(markdownItCheckboxPlugin)

    this.setupContainerPlugins()
    this.setupCustomRules()
  }

  /**
   * 按需启用 KaTeX 数学公式支持
   * @param content markdown 内容
   */
  private enableKatexIfNeeded(content: string): void {
    if (!this._markdownIt) {
      return
    }

    const hasMath = hasMathExpressions(content)

    if (hasMath && !this._katexEnabled) {
      try {
        // 启用 KaTeX 插件 - 使用官方推荐配置
        this._markdownIt.use(katex, {
          delimiters: 'all', // 同时支持美元符号和括号语法
          allowInlineWithSpace: false, // 不允许两端带空格的内联数学
          mathFence: false, // 不将 fence 块转换为数学公式
          throwOnError: false, // 不抛出错误，而是显示错误信息
          errorColor: '#cc0000', // 错误文本颜色
          strict: false, // 不严格模式，允许一些 LaTeX 扩展
          logger: (errorCode: string, errorMsg: string) => {
            ErrorHandler.logWarning(`KaTeX 错误: ${errorCode} - ${errorMsg}`, 'MarkdownRenderer')
            return 'warn'
          },
        })

        this._katexEnabled = true
        ErrorHandler.logInfo('已启用 KaTeX 数学公式支持', 'MarkdownRenderer')
      }
      catch (error) {
        ErrorHandler.logError('启用 KaTeX 失败', error, 'MarkdownRenderer')
      }
    }
  }

  /**
   * Set up container plugins for custom containers
   */
  private setupContainerPlugins(): void {
    if (!this._markdownIt)
      return

    // 集成自定义容器支持
    this._markdownIt.use(container, {
      name: 'info',
      marker: ':',
      validate: (params: string) => params.trim().split(' ', 2)[0] === 'info',
      openRender: () => {
        return '<div class="custom-container info">\n'
      },
      closeRender: () => {
        return '</div>\n'
      },
    })

    this._markdownIt.use(container, {
      name: 'warning',
      marker: ':',
      validate: (params: string) => params.trim().split(' ', 2)[0] === 'warning',
      openRender: () => {
        return '<div class="custom-container warning">\n'
      },
      closeRender: () => {
        return '</div>\n'
      },
    })

    this._markdownIt.use(container, {
      name: 'danger',
      marker: ':',
      validate: (params: string) => params.trim().split(' ', 2)[0] === 'danger',
      openRender: () => {
        return '<div class="custom-container danger">\n'
      },
      closeRender: () => {
        return '</div>\n'
      },
    })

    this._markdownIt.use(container, {
      name: 'tip',
      marker: ':',
      validate: (params: string) => params.trim().split(' ', 2)[0] === 'tip',
      openRender: () => {
        return '<div class="custom-container tip">\n'
      },
      closeRender: () => {
        return '</div>\n'
      },
    })

    // 集成details容器支持
    this._markdownIt.use(container, {
      name: 'details',
      marker: ':',
      validate: (params: string) => {
        // @mdit/plugin-container 的验证函数
        // 返回 true 表示接受这个容器
        return params.trim().startsWith('details')
      },
      openRender: (tokens: any[], idx: number, _options: any, _env: any, _self: any) => {
        const token = tokens[idx]
        const info = token.info.trim()

        // 默认值
        let summary = '点击展开'
        let attributes = ''
        let isOpen = false

        // 解析参数
        if (info !== 'details') {
          // 提取标题 [标题]
          const titleMatch = info.match(/^details\s*\[([^\]]+)\]/)
          if (titleMatch && titleMatch[1]) {
            summary = titleMatch[1]
          }

          // 检查是否默认展开 {open}
          if (info.includes('{open}')) {
            isOpen = true
          }

          // 提取ID #id
          const idMatch = info.match(/#([^\s{#.]+)/)
          if (idMatch) {
            attributes += ` id="${idMatch[1]}"`
          }

          // 提取类名 .class
          const classMatches = info.match(/\.([^\s{#.]+)/g)
          if (classMatches) {
            const classes = classMatches.map((match: string) => match.substring(1)).join(' ')
            attributes += ` class="${classes}"`
          }

          // 提取其他属性 {key="value"}
          const attrMatches = info.match(/\{([^}]+)\}/g)
          if (attrMatches) {
            attrMatches.forEach((match: string) => {
              const content = match.slice(1, -1) // 去掉 { 和 }
              if (content !== 'open') { // 已经处理过 open
                const parts = content.split('=')
                if (parts.length === 2) {
                  const key = parts[0].trim()
                  const value = parts[1].trim().replace(/^["']|["']$/g, '')
                  attributes += ` ${key}="${value}"`
                }
              }
            })
          }
        }

        return `<details${attributes}${isOpen ? ' open' : ''}>
<summary>${summary}</summary>
<div class="details-inner">
`
      },
      closeRender: () => {
        return `</div>
</details>
`
      },
    })
  }

  /**
   * Set up custom rendering rules for relative paths
   */
  private setupCustomRules(): void {
    if (!this._markdownIt)
      return

    this._markdownIt.renderer.rules.link_open = (tokens, idx, options, env, renderer) => {
      const token = tokens[idx]
      const hrefIndex = token.attrIndex('href')

      if (hrefIndex >= 0 && token.attrs && token.attrs[hrefIndex]) {
        const href = token.attrs[hrefIndex][1]
        // 对于锚点链接（以#开头），保持原样，不进行任何处理
        if (href.startsWith('#')) {
          // 锚点链接，保持原样
          return renderer.renderToken(tokens, idx, options)
        }
        // 对于 .md 文件，保持相对路径，不转换为绝对URI
        if (!href.startsWith('http') && !href.startsWith('data:') && !href.endsWith('.md')) {
          const resolvedUri = this._currentDocument ? PathResolver.resolveRelativePath(this._currentDocument, href) : null
          if (resolvedUri) {
            token.attrs[hrefIndex][1] = resolvedUri
          }
        }
      }

      return renderer.renderToken(tokens, idx, options)
    }

    // 为标题添加id属性，支持锚点链接
    this._markdownIt.renderer.rules.heading_open = (tokens, idx, options, env, renderer) => {
      const token = tokens[idx]
      token.tag.replace('h', '')

      // 获取标题文本内容
      let titleText = ''
      let i = idx + 1
      while (i < tokens.length && tokens[i].type !== 'heading_close') {
        if (tokens[i].type === 'inline') {
          titleText += tokens[i].content
        }
        i++
      }

      // 生成id（移除特殊字符，转换为URL友好的格式）
      const id = this.generateHeadingId(titleText)

      // 添加id属性
      const attrIndex = token.attrIndex('id')
      if (attrIndex < 0) {
        token.attrPush(['id', id])
      }
      else {
        token.attrs![attrIndex][1] = id
      }

      return renderer.renderToken(tokens, idx, options)
    }
  }

  /**
   * Highlight code using the theme service
   */
  private highlightCode(code: string, lang: string): string {
    if (!lang || !this._themeService.highlighter) {
      return `<pre><code>${escapeHtml(code)}</code></pre>`
    }

    try {
      // 解析语言标识符中的行号信息
      const { language, highlightLines } = this.parseLanguageWithHighlight(lang)

      // 使用同步版本的 highlightCode 方法，传递行号信息
      const highlighted = this._themeService.highlightCode(code, language, highlightLines)

      // 如果结果是空的，返回基本的 HTML
      if (!highlighted) {
        return `<pre><code class="language-${escapeHtml(language)}" data-lang="${escapeHtml(language)}">${escapeHtml(code)}</code></pre>`
      }

      // 确保高亮后的 HTML 包含语言信息
      // 检查是否已经包含 language- 类
      if (highlighted.includes(`class="language-${language}"`) || highlighted.includes(`class='language-${language}'`)) {
        return highlighted
      }

      // 如果没有语言类，添加它
      // 查找 <code> 标签并添加语言信息
      const codeTagRegex = /<code([^>]*)>/i
      const match = highlighted.match(codeTagRegex)

      if (match) {
        const existingAttrs = match[1] || ''
        const newAttrs = existingAttrs.includes('class=')
          ? existingAttrs.replace(/class="([^"]*)"/, `class="$1 language-${escapeHtml(language)}"`)
          : `${existingAttrs} class="language-${escapeHtml(language)}"`

        return highlighted.replace(codeTagRegex, `<code${newAttrs} data-lang="${escapeHtml(language)}">`)
      }

      // 如果无法找到 code 标签，返回原始高亮结果
      return highlighted
    }
    catch {
      ErrorHandler.logWarning(`代码高亮失败: ${lang}`, 'MarkdownRenderer')
      return `<pre><code class="language-${escapeHtml(lang)}" data-lang="${escapeHtml(lang)}">${escapeHtml(code)}</code></pre>`
    }
  }

  /**
   * 智能高亮代码 - 异步版本，自动处理语言加载
   */
  private async smartHighlightCode(code: string, lang: string): Promise<string> {
    if (!lang || !this._themeService.highlighter) {
      return `<pre><code>${escapeHtml(code)}</code></pre>`
    }

    try {
      // 解析语言标识符中的行号信息
      const { language, highlightLines } = this.parseLanguageWithHighlight(lang)

      // 使用智能高亮方法，自动处理语言加载
      const highlighted = await this._themeService.smartHighlightCode(code, language, highlightLines)

      // 如果结果是空的，返回基本的 HTML
      if (!highlighted) {
        return `<pre><code class="language-${escapeHtml(language)}" data-lang="${escapeHtml(language)}">${escapeHtml(code)}</code></pre>`
      }

      // 确保高亮后的 HTML 包含语言信息
      // 检查是否已经包含 language- 类
      if (highlighted.includes(`class="language-${language}"`) || highlighted.includes(`class='language-${language}'`)) {
        return highlighted
      }

      // 如果没有语言类，添加它
      // 查找 <code> 标签并添加语言信息
      const codeTagRegex = /<code([^>]*)>/i
      const match = highlighted.match(codeTagRegex)

      if (match) {
        const existingAttrs = match[1] || ''
        const newAttrs = existingAttrs.includes('class=')
          ? existingAttrs.replace(/class="([^"]*)"/, `class="$1 language-${escapeHtml(language)}"`)
          : `${existingAttrs} class="language-${escapeHtml(language)}"`

        return highlighted.replace(codeTagRegex, `<code${newAttrs} data-lang="${escapeHtml(language)}">`)
      }

      // 如果无法找到 code 标签，返回原始高亮结果
      return highlighted
    }
    catch {
      ErrorHandler.logWarning(`智能代码高亮失败: ${lang}`, 'MarkdownRenderer')
      return `<pre><code class="language-${escapeHtml(lang)}" data-lang="${escapeHtml(lang)}">${escapeHtml(code)}</code></pre>`
    }
  }

  /**
   * 解析语言标识符，提取语言和行号高亮信息
   * 支持格式：javascript{1,3-5} 或 javascript{1,3,4,5}
   * @param lang 语言标识符
   * @returns 解析后的语言和行号数组
   */
  private parseLanguageWithHighlight(lang: string): { language: string, highlightLines: number[] } {
    // 匹配格式：language{1,3-5} 或 language{1,3,4,5}
    const match = lang.match(/^([^{]+)(?:\{([^}]+)\})?$/)

    if (!match) {
      return { language: lang, highlightLines: [] }
    }

    const language = match[1].trim()
    const highlightSpec = match[2]

    if (!highlightSpec) {
      return { language, highlightLines: [] }
    }

    // 解析行号范围，支持：1,3-5,7,9-12
    const highlightLines: number[] = []
    const parts = highlightSpec.split(',')

    for (const part of parts) {
      const trimmedPart = part.trim()

      if (trimmedPart.includes('-')) {
        // 处理范围，如 3-5
        const [start, end] = trimmedPart.split('-').map(n => Number.parseInt(n.trim(), 10))
        if (!Number.isNaN(start) && !Number.isNaN(end) && start <= end) {
          for (let i = start; i <= end; i++) {
            highlightLines.push(i)
          }
        }
      }
      else {
        // 处理单个行号，如 1 或 7
        const lineNum = Number.parseInt(trimmedPart, 10)
        if (!Number.isNaN(lineNum)) {
          highlightLines.push(lineNum)
        }
      }
    }

    return { language, highlightLines }
  }

  /**
   * Generate heading ID from title text
   */
  private generateHeadingId(titleText: string): string {
    return titleText
      .trim()
      .toLowerCase()
      .replace(/[^\u4E00-\u9FA5a-z0-9\s-]/g, '') // 保留中文、英文、数字、空格、连字符
      .replace(/\s+/g, '-') // 空格替换为连字符
      .replace(/-+/g, '-') // 多个连字符合并为一个
      .replace(/^-|-$/g, '') // 移除首尾连字符
  }

  /**
   * Parse front matter from markdown content
   */
  parseFrontMatter(content: string): { content: string, data: any } {
    try {
      const parsed = matter(content)
      return {
        content: parsed.content, // 只使用内容部分，忽略元数据
        data: parsed.data,
      }
    }
    catch {
      ErrorHandler.logWarning('Front matter 解析失败', 'MarkdownRenderer')
      return {
        content,
        data: {},
      }
    }
  }

  /**
   * Render markdown content with reliable line number mapping for scroll sync
   * 为每个块级元素添加 data-line 属性，确保精确的滚动同步
   */
  async render(content: string, document?: vscode.TextDocument): Promise<string> {
    if (!this._markdownIt) {
      throw new Error('Markdown renderer not initialized')
    }

    if (document) {
      this._currentDocument = document
    }

    try {
      // 使用 gray-matter 分离 front matter 和内容
      const { content: markdownContent } = this.parseFrontMatter(content)

      // 按需启用 KaTeX 数学公式支持
      this.enableKatexIfNeeded(markdownContent)

      // 在渲染前检测并预加载需要的语言
      await this._preloadLanguagesForContent(content)

      // 获取所有行用于行号映射
      const lines = markdownContent.split('\n')
      let currentLine = 0

      // 保存原始渲染规则
      const originalRules = {
        heading_open: this._markdownIt.renderer.rules.heading_open,
        paragraph_open: this._markdownIt.renderer.rules.paragraph_open,
        list_item_open: this._markdownIt.renderer.rules.list_item_open,
        blockquote_open: this._markdownIt.renderer.rules.blockquote_open,
        code_block: this._markdownIt.renderer.rules.code_block,
        fence: this._markdownIt.renderer.rules.fence,
        table_open: this._markdownIt.renderer.rules.table_open,
        hr: this._markdownIt.renderer.rules.hr,
        dl_open: this._markdownIt.renderer.rules.dl_open,
        dt_open: this._markdownIt.renderer.rules.dt_open,
        dd_open: this._markdownIt.renderer.rules.dd_open,
      }

      /**
       * 为元素添加 data-line 属性的通用函数
       * 确保每个块级元素都有准确的行号映射
       */
      const addLineNumber = (tokens: any[], idx: number, options: any, env: any, renderer: any, ruleName: string) => {
        const token = tokens[idx]
        if (token && currentLine < lines.length) {
          // 找到当前 token 对应的源代码行号
          const lineNumber = this.findSourceLineNumber(tokens, idx, lines, currentLine)
          if (lineNumber !== -1) {
            token.attrSet?.('data-line', lineNumber.toString())
            currentLine = lineNumber + 1
          }
        }

        // 调用原始渲染规则
        const originalRule = originalRules[ruleName as keyof typeof originalRules]
        return originalRule ? originalRule(tokens, idx, options, env, renderer) : renderer.renderToken(tokens, idx, options)
      }

      // 覆盖各种块级元素的渲染规则以添加 data-line 属性
      this._markdownIt.renderer.rules.heading_open = (tokens, idx, options, env, renderer) =>
        addLineNumber(tokens, idx, options, env, renderer, 'heading_open')

      this._markdownIt.renderer.rules.paragraph_open = (tokens, idx, options, env, renderer) =>
        addLineNumber(tokens, idx, options, env, renderer, 'paragraph_open')

      this._markdownIt.renderer.rules.list_item_open = (tokens, idx, options, env, renderer) =>
        addLineNumber(tokens, idx, options, env, renderer, 'list_item_open')

      this._markdownIt.renderer.rules.blockquote_open = (tokens, idx, options, env, renderer) =>
        addLineNumber(tokens, idx, options, env, renderer, 'blockquote_open')

      this._markdownIt.renderer.rules.code_block = (tokens, idx, options, env, renderer) =>
        addLineNumber(tokens, idx, options, env, renderer, 'code_block')

      this._markdownIt.renderer.rules.fence = (tokens, idx, options, env, renderer) =>
        addLineNumber(tokens, idx, options, env, renderer, 'fence')

      this._markdownIt.renderer.rules.table_open = (tokens, idx, options, env, renderer) =>
        addLineNumber(tokens, idx, options, env, renderer, 'table_open')

      this._markdownIt.renderer.rules.hr = (tokens, idx, options, env, renderer) =>
        addLineNumber(tokens, idx, options, env, renderer, 'hr')

      this._markdownIt.renderer.rules.dl_open = (tokens, idx, options, env, renderer) =>
        addLineNumber(tokens, idx, options, env, renderer, 'dl_open')

      this._markdownIt.renderer.rules.dt_open = (tokens, idx, options, env, renderer) =>
        addLineNumber(tokens, idx, options, env, renderer, 'dt_open')

      this._markdownIt.renderer.rules.dd_open = (tokens, idx, options, env, renderer) =>
        addLineNumber(tokens, idx, options, env, renderer, 'dd_open')

      // 渲染 HTML
      const html = this._markdownIt.render(markdownContent)

      // 验证 data-line 属性的完整性
      this.validateLineMapping(html, lines.length)

      return html
    }
    catch (error) {
      ErrorHandler.handleRenderError(error, 'Markdown 渲染')
      throw error
    }
  }

  /**
   * Get front matter data from markdown content
   */
  getFrontMatterData(content: string): any {
    const { data } = this.parseFrontMatter(content)
    return data
  }

  /**
   * 为内容预加载需要的语言
   * @param content Markdown 内容
   */
  private async _preloadLanguagesForContent(content: string): Promise<void> {
    try {
      // 获取检测到的语言
      const languages = detectLanguages(content)

      if (languages.length === 0) {
        return
      }

      ErrorHandler.logInfo(`内容分析: ${languages.length} 种语言`, 'MarkdownRenderer')

      // 预加载检测到的语言
      await this._themeService.preloadLanguagesFromContent(content)
    }
    catch {
      ErrorHandler.logWarning('语言预加载失败', 'MarkdownRenderer')
      // 不抛出错误，继续渲染
    }
  }

  /**
   * 主题切换后重新加载语言
   * 解决主题切换后代码块高亮失效的问题
   */
  async reloadLanguagesAfterThemeChange(content: string): Promise<void> {
    try {
      await this._themeService.reloadLanguagesAfterThemeChange(content)
    }
    catch (error) {
      ErrorHandler.logError('主题切换后语言重新加载失败', error, 'MarkdownRenderer')
    }
  }

  get markdownIt(): MarkdownIt | undefined {
    return this._markdownIt
  }

  /**
   * 查找 token 对应的源代码行号
   * 通过分析 token 内容和位置来确定最准确的行号
   */
  private findSourceLineNumber(tokens: any[], tokenIdx: number, lines: string[], startLine: number): number {
    const token = tokens[tokenIdx]
    if (!token)
      return -1

    // 如果 token 已经有行号信息，直接使用
    if (token.map && token.map[0] !== undefined) {
      return token.map[0]
    }

    // 对于没有 map 信息的 token，尝试从内容匹配
    const tokenContent = this.extractTokenContent(tokens, tokenIdx)
    if (!tokenContent)
      return startLine

    // 在源代码中查找匹配的行
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line && tokenContent.includes(line)) {
        return i
      }
    }

    // 如果找不到匹配，返回当前位置
    return startLine
  }

  /**
   * 提取 token 的文本内容用于匹配
   */
  private extractTokenContent(tokens: any[], idx: number): string {
    const token = tokens[idx]
    if (!token)
      return ''

    let content = ''
    const tokenType = token.type

    // 根据 token 类型提取内容
    if (tokenType === 'heading_open') {
      // 查找对应的 heading_close 之间的内容
      for (let i = idx + 1; i < tokens.length; i++) {
        if (tokens[i].type === 'heading_close')
          break
        if (tokens[i].type === 'inline') {
          content += tokens[i].content
        }
      }
    }
    else if (tokenType === 'paragraph_open') {
      // 查找对应的 paragraph_close 之间的内容
      for (let i = idx + 1; i < tokens.length; i++) {
        if (tokens[i].type === 'paragraph_close')
          break
        if (tokens[i].type === 'inline') {
          content += tokens[i].content
        }
      }
    }
    else if (tokenType === 'list_item_open') {
      // 查找对应的 list_item_close 之间的内容
      for (let i = idx + 1; i < tokens.length; i++) {
        if (tokens[i].type === 'list_item_close')
          break
        if (tokens[i].type === 'inline') {
          content += tokens[i].content
        }
      }
    }
    else if (tokenType === 'fence') {
      // 代码块，使用语言信息和第一行代码
      content = token.info || ''
      if (token.content) {
        const firstLine = token.content.split('\n')[0]
        content += ` ${firstLine}`
      }
    }
    else if (tokenType === 'code_block') {
      // 简单代码块
      content = token.content || ''
    }

    return content.trim()
  }

  /**
   * 验证行号映射的完整性
   * 确保生成的 HTML 包含足够的 data-line 属性
   */
  private validateLineMapping(html: string, totalLines: number): void {
    // 统计 data-line 属性的数量
    const dataLineMatches = html.match(/data-line="\d+"/g)
    const dataLineCount = dataLineMatches ? dataLineMatches.length : 0

    // 记录统计信息用于调试
    if (dataLineCount < Math.max(1, totalLines * 0.1)) { // 至少应该有10%的行有映射
      console.warn(`[MarkdownRenderer] 行号映射可能不完整: ${dataLineCount} 个 data-line 属性，总共 ${totalLines} 行`)
    }
    else {
      // 行号映射完成
    }
  }

  dispose(): void {
    this._markdownIt = undefined
    this._currentDocument = undefined
  }
}
