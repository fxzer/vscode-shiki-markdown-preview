import type { Highlighter } from 'shiki'
import type { GroupedThemes, ThemeCache, ThemeMetadata } from '../../types/theme'
import { transformerNotationHighlight } from '@shikijs/transformers'
import { bundledThemes, createHighlighter } from 'shiki'
import * as vscode from 'vscode'
import { toCssVarsStr } from '../../utils/color-handler'
import { escapeHtml } from '../../utils/common'
import { ErrorHandler } from '../../utils/error-handler'
import { detectLanguages, isSupportedLanguage, mapLanguageToShiki } from '../../utils/language-detector'
import { generateEnhancedColors } from '../../utils/theme-enhance'
import { ConfigService } from '../config'

export class ThemeService {
  private _highlighter: Highlighter | undefined
  private _currentTheme: string
  private _loadedThemes: Set<string> = new Set<string>()
  private _loadedLanguages: Set<string> = new Set<string>()
  private _commonLanguages: string[] = ['javascript', 'typescript', 'html', 'css', 'json', 'markdown', 'python']
  private _configService: ConfigService // 配置服务实例

  // 主题缓存系统（简化版，无过期时间）
  private _themeCache: ThemeCache = {
    metadata: new Map<string, ThemeMetadata>(),
    grouped: { light: [], dark: [], all: [] },
    loaded: false,
  }

  constructor() {
    this._configService = new ConfigService() // 初始化配置服务
    this._currentTheme = this._configService.getCurrentTheme() // 使用配置服务获取当前主题
  }

  /**
   * 初始化语法高亮器，只加载当前主题和常用语言
   */
  async initializeHighlighter(): Promise<void> {
    try {
      // 首先初始化主题缓存
      if (!this._themeCache.loaded) {
        await this.discoverAndCacheThemes()
      }

      // 只预加载当前主题和常用语言
      const currentTheme = this._configService.getCurrentTheme()
      this._currentTheme = currentTheme

      const highlighter = await createHighlighter({
        themes: [currentTheme],
        langs: this._commonLanguages,
      })

      this.disposeCurrentHighlighter()
      this._highlighter = highlighter

      // 记录已加载的主题和语言
      this._loadedThemes.clear()
      this._loadedLanguages.clear()
      this._loadedThemes.add(currentTheme)
      this._commonLanguages.forEach(lang => this._loadedLanguages.add(lang))

      // 高亮器初始化完成
    }
    catch (error) {
      ErrorHandler.logError('语法高亮器初始化失败', error, 'ThemeService')
      throw error
    }
  }

  /**
   * 验证主题是否可用
   */
  isValidThemeSync(theme: string): boolean {
    return this._themeCache.loaded && this._themeCache.metadata.has(theme)
  }

  /**
   * 根据主题类型进行分组
   */
  groupThemesByType(themes: ThemeMetadata[]): GroupedThemes {
    const light = themes.filter(theme => theme.type === 'light') // 筛选亮色主题
    const dark = themes.filter(theme => theme.type === 'dark') // 筛选暗色主题

    return {
      light: this.sortThemes(light), // 排序亮色主题
      dark: this.sortThemes(dark), // 排序暗色主题
      all: this.sortThemes([...light, ...dark]), // 排序所有主题
    }
  }

  /**
   * 按显示名称排序主题
   */
  sortThemes(themes: ThemeMetadata[]): ThemeMetadata[] {
    return themes.sort((a, b) => a.displayName.localeCompare(b.displayName))
  }

  /**
   * 返回当前主题类型
   */
  getCurrentThemeType(): 'light' | 'dark' {
    try {
      // 确保主题缓存已加载
      if (!this._themeCache.loaded) {
        ErrorHandler.logWarning('主题缓存未加载，尝试同步加载', 'ThemeService')
        // 尝试同步加载主题缓存
        this.discoverAndCacheThemes().catch((error) => {
          ErrorHandler.logError('同步加载主题缓存失败', error, 'ThemeService')
        })
        return 'light'
      }

      // 获取当前主题的类型
      const themeMetadata = this._themeCache.metadata.get(this._currentTheme)
      if (!themeMetadata) {
        ErrorHandler.logWarning(`主题元数据未找到: ${this._currentTheme}`, 'ThemeService')
        return 'light'
      }

      const themeType = themeMetadata.type
      return themeType
    }
    catch (error) {
      ErrorHandler.logError('获取主题类型失败', error, 'ThemeService')
      return 'light'
    }
  }

  /**
   * 强制刷新当前主题类型（用于确保获取最新值）
   */
  async refreshCurrentThemeType(): Promise<'light' | 'dark'> {
    try {
      // 确保主题缓存是最新的
      if (!this._themeCache.loaded) {
        await this.discoverAndCacheThemes()
      }

      // 重新获取当前主题（从配置中）
      const configTheme = this._configService.getCurrentTheme()
      if (configTheme !== this._currentTheme) {
        this._currentTheme = configTheme
      }

      return this.getCurrentThemeType()
    }
    catch (error) {
      ErrorHandler.logError('刷新主题类型失败', error, 'ThemeService')
      return 'light'
    }
  }

  /* 是暗黑主题 */
  isDarkTheme(themeName: string): boolean {
    return this._themeCache.metadata.get(themeName)?.type === 'dark'
  }

  /**
   * 提取主题的核心颜色信息
   * @param theme 主题名称
   * @returns 主题颜色配置对象
   */
  public getThemeColors(theme: string): any | null {
    if (!this._highlighter) {
      ErrorHandler.logWarning('语法高亮器未初始化', 'ThemeService')
      return null
    }

    try {
      const themeData = (this._highlighter as any).getTheme(theme)
      if (!themeData) {
        ErrorHandler.logWarning(`主题未找到: ${theme}`, 'ThemeService')
        return null
      }

      // 确保返回完整的颜色对象，包括 tokenColors 中的颜色
      const colors = themeData.colors || {}

      // 如果主题数据中有 tokenColors，也提取一些关键颜色
      if (themeData.tokenColors && Array.isArray(themeData.tokenColors)) {
        themeData.tokenColors.forEach((tokenColor: any) => {
          if (tokenColor.settings && tokenColor.settings.foreground) {
            // 为一些常见的 token 类型添加颜色映射
            if (tokenColor.scope && tokenColor.scope.includes('string')) {
              colors['string.foreground'] = tokenColor.settings.foreground
            }
            if (tokenColor.scope && tokenColor.scope.includes('comment')) {
              colors['comment.foreground'] = tokenColor.settings.foreground
            }
            if (tokenColor.scope && tokenColor.scope.includes('keyword')) {
              colors['keyword.foreground'] = tokenColor.settings.foreground
            }
          }
        })
      }

      return colors
    }
    catch (error) {
      ErrorHandler.logError(`主题颜色提取失败: ${theme}`, error, 'ThemeService')
      return null
    }
  }

  /**
   * 获取主题的CSS变量
   * @param theme 主题名称
   * @returns CSS变量字符串
   */
  public getCssVars(theme: string): string {
    const themeColors = this.getThemeColors(theme)
    if (!themeColors) {
      ErrorHandler.logWarning(`主题颜色未找到: ${theme}`, 'ThemeService')
      return ''
    }

    // 提取核心颜色变量（频率最高的变量）
    const coreColorNames = [
      'editor.background',
      'editor.foreground',
      'activityBar.background',
      'button.background',
      'focusBorder',
      'panel.border',
      'list.activeSelectionBackground',
      'list.hoverBackground',
      'statusBar.background',
      'titleBar.activeBackground',
      'activityBarBadge.background',
      'textLink.foreground',
      'textLink.activeForeground',
    ]

    const isDarkTheme = this.isDarkTheme(theme)
    const themeCoreCss = coreColorNames.reduce((acc, varName) => {
      let colorValue = themeColors[varName]
      if (!colorValue) {
        if (varName === 'editor.foreground') {
          colorValue = isDarkTheme ? '#ffffff' : '#000000'
        }
      }
      acc[varName] = colorValue
      return acc
    }, {} as Record<string, string>)

    const themeCoreCssVars = toCssVarsStr(themeCoreCss)
    const enhancedCssVars = generateEnhancedColors(themeCoreCss, isDarkTheme)

    return `${themeCoreCssVars} ${enhancedCssVars}`
  }

  /**
   * 更改当前主题并更新配置
   * 动态加载新主题
   */
  async changeTheme(theme: string): Promise<boolean> {
    if (!await this.isValidTheme(theme)) {
      ErrorHandler.showError(`无效的主题: ${theme}`)
      return false
    }

    // 如果主题未加载，先加载主题
    if (!this._loadedThemes.has(theme)) {
      try {
        await this.loadTheme(theme)
      }
      catch (error) {
        ErrorHandler.handleThemeError(error, theme, '加载')
        return false
      }
    }

    this._currentTheme = theme

    // 使用配置服务更新配置
    try {
      await this._configService.updateConfig('currentTheme', theme, vscode.ConfigurationTarget.Global)
      return true
    }
    catch (error) {
      ErrorHandler.logError('主题配置更新失败', error, 'ThemeService')
      return false
    }
  }

  /**
   * 更新主题配置
   * @param themeName 主题名称
   * @param target 配置目标
   * @returns Promise<boolean> 是否成功更新
   */
  async updateTheme(themeName: string, target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global): Promise<boolean> {
    return ErrorHandler.safeExecute(
      async () => {
        await this._configService.updateConfig('currentTheme', themeName, target)
        return true
      },
      `主题配置更新失败: ${themeName}`,
      'ThemeService',
    ) !== null
  }

  /**
   * 更新预览主题（不保存配置）
   * 动态加载预览主题
   */
  async updateThemeForPreview(theme: string): Promise<boolean> {
    if (!this.isValidTheme(theme)) {
      ErrorHandler.logWarning(`无效主题: ${theme}`, 'ThemeService')
      return false
    }

    // 如果主题未加载，先加载主题
    if (!this._loadedThemes.has(theme)) {
      try {
        await this.loadTheme(theme)
      }
      catch (error) {
        ErrorHandler.logError(`预览主题加载失败: ${theme}`, error, 'ThemeService')
        return false
      }
    }

    this._currentTheme = theme
    return true
  }

  /**
   * 主题切换后重新加载当前文档的语言
   * 解决主题切换后代码块高亮失效的问题
   */
  async reloadLanguagesAfterThemeChange(content?: string): Promise<void> {
    try {
      if (content) {
        // 如果有内容，重新预加载检测到的语言
        const detectedLanguages = detectLanguages(content)

        // 先重新加载常用语言（强制重新加载）
        for (const lang of this._commonLanguages) {
          try {
            await this.forceReloadLanguage(lang)
          }
          catch {
            ErrorHandler.logWarning(`重新加载常用语言失败: ${lang}`, 'ThemeService')
          }
        }

        // 然后加载检测到的语言（强制重新加载）
        for (const lang of detectedLanguages) {
          try {
            await this.forceReloadLanguage(lang)
          }
          catch {
            ErrorHandler.logWarning(`重新加载检测语言失败: ${lang}`, 'ThemeService')
          }
        }
      }
      else {
        // 如果没有内容，重新加载常用语言
        const commonLanguagesToReload = this._commonLanguages.filter(lang => !this._loadedLanguages.has(lang))
        if (commonLanguagesToReload.length > 0) {
          await this.preloadLanguages(commonLanguagesToReload)
        }
      }
    }
    catch (error) {
      ErrorHandler.logError('主题切换后语言重新加载失败', error, 'ThemeService')
    }
  }

  /**
   * 获取当前主题的CSS变量
   * 确保主题已加载
   */
  async getThemeCSSVariables(): Promise<string> {
    // 确保当前主题已加载
    if (!this._loadedThemes.has(this._currentTheme)) {
      try {
        await this.loadTheme(this._currentTheme)
      }
      catch (error) {
        ErrorHandler.logError(`CSS变量主题加载失败: ${this._currentTheme}`, error, 'ThemeService')
        return ''
      }
    }

    return this.getCssVars(this._currentTheme)
  }

  /**
   * 使用当前主题高亮代码（同步版本）
   * 同步高亮代码，要求主题和语言已经预加载
   */
  highlightCode(code: string, language: string, highlightLines: number[] = []): string {
    if (!this._highlighter || !language) {
      return escapeHtml(code)
    }

    try {
      // 使用语言映射，将 shell 相关语言映射到 shellscript
      const mappedLanguage = mapLanguageToShiki(language)

      // 检查主题是否已加载
      if (!this._loadedThemes.has(this._currentTheme)) {
        ErrorHandler.logWarning(`主题未加载: ${this._currentTheme}, 回退到转义HTML`, 'ThemeService')
        return escapeHtml(code)
      }

      // 检查语言是否已加载，如果未加载则尝试异步加载
      if (!this._loadedLanguages.has(mappedLanguage)) {
        ErrorHandler.logWarning(`语言未加载: ${mappedLanguage} (原始: ${language}), 尝试异步加载`, 'ThemeService')
        // 异步加载语言，但不等待结果，先返回转义HTML
        this.loadLanguage(mappedLanguage).catch((error) => {
          ErrorHandler.logError(`异步加载语言失败: ${mappedLanguage}`, error, 'ThemeService')
        })
        return escapeHtml(code)
      }

      // 准备转换器配置
      const transformers = []

      // 如果有行号高亮需求，添加行高亮转换器
      if (highlightLines.length > 0) {
        transformers.push(transformerNotationHighlight())
      }

      const highlighted = this._highlighter.codeToHtml(code, {
        lang: mappedLanguage, // 使用映射后的语言
        theme: this._currentTheme,
        transformers: transformers.length > 0 ? transformers : undefined,
      })

      // 确保返回的是字符串类型
      if (typeof highlighted === 'string') {
        // 如果有行号高亮需求，需要手动添加高亮标记
        if (highlightLines.length > 0) {
          return this.addLineHighlighting(highlighted, highlightLines)
        }
        return highlighted
      }
      else {
        ErrorHandler.logWarning(`高亮结果不是字符串: ${typeof highlighted}`, 'ThemeService')
        return escapeHtml(code)
      }
    }
    catch (error) {
      ErrorHandler.logWarning(`代码高亮失败: ${language}`, 'ThemeService')
      ErrorHandler.logError(`高亮错误详情: ${error}`, error, 'ThemeService')

      // 对于某些特殊语言，提供更好的回退处理
      const specialLanguages = ['swift', 'kotlin', 'rust', 'go', 'rs', 'cpp', 'cs', 'rb', 'vim', 'dockerfile', 'log']
      if (specialLanguages.includes(language)) {
        return this.createBasicHighlightedCode(code, language)
      }

      // 如果失败，返回简单的HTML转义代码
      return escapeHtml(code)
    }
  }

  /**
   * 为特殊语言创建基础高亮代码
   */
  private createBasicHighlightedCode(code: string, language: string): string {
    const escapedCode = escapeHtml(code)
    return `<pre><code class="language-${escapeHtml(language)}" data-lang="${escapeHtml(language)}">${escapedCode}</code></pre>`
  }

  /**
   * 智能高亮代码 - 自动处理语言加载
   * 如果语言未加载，会尝试异步加载并返回带重试机制的HTML
   */
  async smartHighlightCode(code: string, language: string, highlightLines: number[] = []): Promise<string> {
    if (!this._highlighter || !language) {
      return escapeHtml(code)
    }

    try {
      // 使用语言映射，将 shell 相关语言映射到 shellscript
      const mappedLanguage = mapLanguageToShiki(language)

      // 检查主题是否已加载
      if (!this._loadedThemes.has(this._currentTheme)) {
        ErrorHandler.logWarning(`主题未加载: ${this._currentTheme}, 回退到转义HTML`, 'ThemeService')
        return escapeHtml(code)
      }

      // 检查语言是否已加载，如果未加载则尝试加载
      if (!this._loadedLanguages.has(mappedLanguage)) {
        try {
          await this.loadLanguage(mappedLanguage)
        }
        catch (error) {
          ErrorHandler.logError(`语言加载失败: ${mappedLanguage}`, error, 'ThemeService')
          return escapeHtml(code)
        }
      }

      // 准备转换器配置
      const transformers = []

      // 如果有行号高亮需求，添加行高亮转换器
      if (highlightLines.length > 0) {
        transformers.push(transformerNotationHighlight())
      }

      const highlighted = this._highlighter.codeToHtml(code, {
        lang: mappedLanguage,
        theme: this._currentTheme,
        transformers: transformers.length > 0 ? transformers : undefined,
      })

      // 确保返回的是字符串类型
      if (typeof highlighted === 'string') {
        // 如果有行号高亮需求，需要手动添加高亮标记
        if (highlightLines.length > 0) {
          return this.addLineHighlighting(highlighted, highlightLines)
        }
        return highlighted
      }
      else {
        ErrorHandler.logWarning(`高亮结果不是字符串: ${typeof highlighted}`, 'ThemeService')
        return escapeHtml(code)
      }
    }
    catch (error) {
      ErrorHandler.logWarning(`智能代码高亮失败: ${language}`, 'ThemeService')
      ErrorHandler.logError(`智能高亮错误详情: ${error}`, error, 'ThemeService')

      // 对于某些特殊语言，提供更好的回退处理
      const specialLanguages = ['swift', 'kotlin', 'rust', 'go', 'rs', 'cpp', 'cs', 'rb', 'vim', 'dockerfile', 'log']
      if (specialLanguages.includes(language)) {
        return this.createBasicHighlightedCode(code, language)
      }

      // 如果失败，返回简单的HTML转义代码
      return escapeHtml(code)
    }
  }

  /**
   * 手动添加行高亮标记到已高亮的HTML代码中
   * @param highlightedHtml 已高亮的HTML代码
   * @param highlightLines 需要高亮的行号数组
   * @returns 添加了行高亮标记的HTML
   */
  private addLineHighlighting(highlightedHtml: string, highlightLines: number[]): string {
    try {
      // 将HTML按行分割
      const lines = highlightedHtml.split('\n')
      const highlightedLines = new Set(highlightLines)

      // 为指定行添加高亮类
      const processedLines = lines.map((line, index) => {
        const lineNumber = index + 1
        if (highlightedLines.has(lineNumber)) {
          // 查找 <span class="line"> 并添加 highlighted 类
          if (line.includes('<span class="line"')) {
            return line.replace(/<span class="line"([^>]*)>/i, '<span class="line highlighted"$1>')
          }
          // 如果行不包含 line 类，包装整个行
          else {
            return `<span class="line highlighted">${line}</span>`
          }
        }
        return line
      })

      return processedLines.join('\n')
    }
    catch {
      ErrorHandler.logWarning('行高亮标记添加失败', 'ThemeService')
      return highlightedHtml
    }
  }

  /**
   * 使用当前主题高亮代码（异步版本）
   * 异步高亮代码，会动态加载所需的主题和语言
   */
  async highlightCodeAsync(code: string, language: string): Promise<string> {
    if (!this._highlighter || !language) {
      return escapeHtml(code)
    }

    try {
      // 使用语言映射，将 shell 相关语言映射到 shellscript
      const mappedLanguage = mapLanguageToShiki(language)

      // 检查主题是否已加载
      if (!this._loadedThemes.has(this._currentTheme)) {
        await this.loadTheme(this._currentTheme)
      }

      // 检查语言是否已加载
      if (!this._loadedLanguages.has(mappedLanguage)) {
        await this.loadLanguage(mappedLanguage)
      }

      const highlighted = this._highlighter.codeToHtml(code, {
        lang: mappedLanguage,
        theme: this._currentTheme,
      })

      // 确保返回的是字符串类型
      if (typeof highlighted === 'string') {
        return highlighted
      }
      else {
        ErrorHandler.logWarning(`高亮结果不是字符串: ${typeof highlighted}`, 'ThemeService')
        return escapeHtml(code)
      }
    }
    catch {
      ErrorHandler.logWarning(`代码高亮失败: ${language}`, 'ThemeService')
      // 如果失败，返回简单的HTML转义代码
      return escapeHtml(code)
    }
  }

  /**
   * 动态加载指定的主题
   */
  private async loadTheme(theme: string): Promise<void> {
    if (!this._highlighter || this._loadedThemes.has(theme)) {
      return
    }

    try {
      // 首先验证主题是否可用
      const isValid = await this.isValidTheme(theme)
      if (!isValid) {
        throw new Error(`Theme ${theme} is not available in the discovered themes`)
      }

      // 创建一个新的高亮器实例，加载指定主题
      // 保留所有已加载的语言，避免语言丢失
      const currentLanguages = Array.from(this._loadedLanguages)
      const currentThemes = Array.from(this._loadedThemes)

      // 确保包含新主题和所有已加载的主题
      const themesToLoad = currentThemes.includes(theme) ? currentThemes : [...currentThemes, theme]

      const newHighlighter = await createHighlighter({
        themes: themesToLoad,
        langs: currentLanguages,
      })

      // 替换当前高亮器，确保主题和语言都得到保留
      this.disposeCurrentHighlighter()
      this._highlighter = newHighlighter

      // 更新已加载主题集合
      this._loadedThemes.add(theme)

      // 确保已加载语言集合保持正确
      this._loadedLanguages.clear()
      currentLanguages.forEach(lang => this._loadedLanguages.add(lang))
    }
    catch (error) {
      ErrorHandler.logError(`主题加载失败: ${theme}`, error, 'ThemeService')
      throw error
    }
  }

  /**
   * 重新创建高亮器实例
   */
  private async recreateHighlighter(): Promise<void> {
    try {
      // 保留当前已加载的语言和主题
      const currentLanguages = Array.from(this._loadedLanguages)
      const currentThemes = Array.from(this._loadedThemes)

      // 创建新的高亮器实例
      const newHighlighter = await createHighlighter({
        themes: currentThemes,
        langs: currentLanguages,
      })

      // 替换当前高亮器
      this.disposeCurrentHighlighter()
      this._highlighter = newHighlighter
    }
    catch (error) {
      ErrorHandler.logError('重新创建高亮器失败', error, 'ThemeService')
      throw error
    }
  }

  /**
   * 强制重新加载语言（用于主题切换后）
   */
  private async forceReloadLanguage(language: string): Promise<void> {
    if (!this._highlighter) {
      return
    }

    try {
      // 使用语言映射，将 shell 相关语言映射到 shellscript
      const mappedLanguage = mapLanguageToShiki(language)

      // 检查语言是否受支持
      if (!isSupportedLanguage(mappedLanguage)) {
        throw new Error(`语言 ${mappedLanguage} 不受支持`)
      }

      // 强制重新加载语言到当前高亮器
      try {
        await (this._highlighter as any).loadLanguage(mappedLanguage)
        this._loadedLanguages.add(mappedLanguage)
      }
      catch {
        ErrorHandler.logWarning(`强制重新加载语言失败: ${mappedLanguage}`, 'ThemeService')

        // 如果直接加载失败，尝试重新创建高亮器实例
        try {
          await this.recreateHighlighter()
          await (this._highlighter as any).loadLanguage(mappedLanguage)
          this._loadedLanguages.add(mappedLanguage)
        }
        catch {
          ErrorHandler.logWarning(`重新创建高亮器后仍无法加载语言: ${mappedLanguage}`, 'ThemeService')
        }
      }
    }
    catch {
      ErrorHandler.logWarning(`强制重新加载语言失败: ${language}`, 'ThemeService')
    }
  }

  /**
   * 加载指定的语言
   */
  private async loadLanguage(language: string): Promise<void> {
    if (!this._highlighter || this._loadedLanguages.has(language)) {
      return
    }

    try {
      // 使用语言映射，将 shell 相关语言映射到 shellscript
      const mappedLanguage = mapLanguageToShiki(language)

      // 检查语言是否受支持
      if (!isSupportedLanguage(mappedLanguage)) {
        throw new Error(`语言 ${mappedLanguage} 不受支持`)
      }

      // 直接尝试加载语言到当前高亮器
      try {
        await (this._highlighter as any).loadLanguage(mappedLanguage)
        this._loadedLanguages.add(mappedLanguage)
      }
      catch {
        ErrorHandler.logWarning(`直接加载语言失败: ${mappedLanguage}`, 'ThemeService')

        // 如果直接加载失败，尝试重新创建高亮器实例
        try {
          const currentThemes = Array.from(this._loadedThemes)
          const currentLanguages = Array.from(this._loadedLanguages)

          // 创建包含新语言的高亮器
          const newHighlighter = await createHighlighter({
            themes: currentThemes,
            langs: [...currentLanguages, mappedLanguage],
          })

          // 替换当前高亮器
          this.disposeCurrentHighlighter()
          this._highlighter = newHighlighter
          this._loadedLanguages.add(mappedLanguage)
        }
        catch (recreateError) {
          ErrorHandler.logError(`重新创建高亮器失败: ${mappedLanguage}`, 'ThemeService')
          throw new Error(`无法加载语言 ${mappedLanguage}: ${recreateError}`)
        }
      }
    }
    catch (error) {
      ErrorHandler.logError(`语言加载失败: ${language}`, error, 'ThemeService')
      throw error
    }
  }

  get currentTheme(): string {
    return this._currentTheme
  }

  get highlighter(): Highlighter | undefined {
    return this._highlighter
  }

  /**
   * 动态发现和缓存所有可用主题
   */
  async discoverAndCacheThemes(): Promise<void> {
    try {
      // 清空现有缓存
      this._themeCache.metadata.clear()

      // 获取所有可用的主题模块
      const themeEntries = Object.entries(bundledThemes)

      // 并行加载所有主题元数据
      const themePromises = themeEntries.map(async ([_, themeImporter]) => {
        try {
          const themeModule = await themeImporter()
          const themeData = themeModule.default

          if (themeData && themeData.name) {
            const metadata: ThemeMetadata = {
              name: themeData.name,
              displayName: themeData.displayName || themeData.name,
              type: (themeData.type === 'light' ? 'light' : 'dark') as 'light' | 'dark',
            }

            this._themeCache.metadata.set(themeData.name, metadata)
            return metadata
          }
        }
        catch {
          return null
        }
      })

      const results = await Promise.allSettled(themePromises)
      const validThemes = results
        .filter((result): result is PromiseFulfilledResult<ThemeMetadata | null> =>
          result.status === 'fulfilled' && result.value !== null,
        )
        .map(result => result.value!)

      // 分组和排序
      this._themeCache.grouped = this.groupThemesByType(validThemes)
      this._themeCache.loaded = true
    }
    catch (error) {
      console.error('主题发现过程失败:', error)
      throw error
    }
  }

  /**
   * 获取缓存的主题元数据
   */
  async getCachedThemeMetadata(): Promise<ThemeMetadata[]> {
    if (!this._themeCache.loaded) {
      await this.discoverAndCacheThemes()
    }
    return this._themeCache.grouped.all
  }

  /**
   * 获取分组的主题数据
   */
  async getGroupedThemes(): Promise<GroupedThemes> {
    if (!this._themeCache.loaded) {
      await this.discoverAndCacheThemes()
    }
    return this._themeCache.grouped
  }

  /**
   * 验证主题是否可用（基于缓存）
   */
  async isValidTheme(theme: string): Promise<boolean> {
    if (!this._themeCache.loaded) {
      await this.discoverAndCacheThemes()
    }
    return this._themeCache.metadata.has(theme)
  }

  /**
   * 手动刷新主题缓存（提供外部调用）
   */
  async refreshThemeCache(): Promise<void> {
    this._themeCache.loaded = false
    await this.discoverAndCacheThemes()
  }

  /**
   * 获取所有可用主题名称（替代原来的常量）
   */
  async getAvailableThemeNames(): Promise<string[]> {
    const metadata = await this.getCachedThemeMetadata()
    return metadata.map(theme => theme.name)
  }

  /**
   * 预加载额外的语言以提升同步性能
   */
  async preloadLanguage(language: string): Promise<void> {
    if (!this._loadedLanguages.has(language)) {
      try {
        await this.loadLanguage(language)
      }
      catch {
        console.warn(`Failed to preload language: ${language}`)
      }
    }
  }

  async preloadLanguages(languages: string[]): Promise<void> {
    const promises = languages.map(lang => this.preloadLanguage(lang))
    await Promise.allSettled(promises)
  }

  /**
   * 根据 Markdown 内容按需加载语言
   * @param content Markdown 内容
   */
  async preloadLanguagesFromContent(content: string): Promise<void> {
    try {
      // 检测文档中使用的语言
      const detectedLanguages = detectLanguages(content)

      if (detectedLanguages.length === 0) {
        return
      }

      // 过滤出未加载的语言
      const unloadedLanguages = detectedLanguages.filter((lang: string) => !this._loadedLanguages.has(lang))

      if (unloadedLanguages.length === 0) {
        return
      }

      // 并行加载所有需要的语言
      await this.preloadLanguages(unloadedLanguages)
    }
    catch (error) {
      console.error('Failed to preload languages from content:', error)
    }
  }

  private disposeCurrentHighlighter(): void {
    const highlighter = this._highlighter as (Highlighter & { dispose?: () => void }) | undefined
    try {
      highlighter?.dispose?.()
    }
    catch (error) {
      ErrorHandler.logWarning(`语法高亮器释放失败: ${error instanceof Error ? error.message : String(error)}`, 'ThemeService')
    }
    this._highlighter = undefined
  }

  dispose(): void {
    this.disposeCurrentHighlighter()
    this._loadedThemes.clear()
    this._loadedLanguages.clear()
    this._themeCache.metadata.clear()
    this._themeCache.grouped = { light: [], dark: [], all: [] }
    this._themeCache.loaded = false
    this._highlighter = undefined
  }
}
