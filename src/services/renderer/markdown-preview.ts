import type { debounce as DebouncedFunction } from 'throttle-debounce'
import { debounce } from 'throttle-debounce'
import * as vscode from 'vscode'

import {
  ConfigService,
  HTMLTemplateService,
  StateManager,
  ThemeService,
} from '..'
import { ErrorHandler } from '../../utils/error-handler'
import { hasMathExpressions } from '../../utils/math-detector'
import { PathResolver } from '../../utils/path-resolver'
import { ScrollSyncManager } from '../scroll-sync'
import { MarkdownRenderer } from './markdown-renderer'

/**
 * Manages markdown preview webview panels
 */
export class MarkdownPreviewPanel {
  /**
   * Track the currently panel. Only allow a single panel to exist at a time.
   */
  public static currentPanel: MarkdownPreviewPanel | undefined

  public static readonly viewType = 'shikiMarkdownPreview'

  private readonly _panel: vscode.WebviewPanel
  private readonly _extensionUri: vscode.Uri
  private _disposables: vscode.Disposable[] = []

  // 服务
  private _themeService: ThemeService
  private _markdownRenderer: MarkdownRenderer
  private _stateManager: StateManager
  private _configService: ConfigService
  private _scrollSyncManager: ScrollSyncManager | undefined

  /**
   * 获取滚动同步管理器
   */
  public get scrollSyncManager(): ScrollSyncManager | undefined {
    return this._scrollSyncManager
  }

  // 状态
  private _currentDocument: vscode.TextDocument | undefined
  private _isInitialized: boolean = false
  private _lastRenderedDocumentUri: string | undefined
  private _lastRenderedDocumentVersion: number | undefined
  private _lastRenderedTheme: string | undefined
  private _lastRenderUsedKatex: boolean = false
  private _hasRenderedWebview: boolean = false
  private _isWebviewReady: boolean = false
  private _renderGeneration: number = 0
  private _isDisposed: boolean = false
  private _isThemeChanging: boolean = false

  // 初始化 Promise 相关
  private _initializationPromise: Promise<void> | undefined
  private _initializationResolve: (() => void) | undefined

  // 防抖更新内容方法
  private _debouncedUpdateContent: DebouncedFunction<(_document: vscode.TextDocument) => void> | undefined

  public static async createOrShowSlide(extensionUri: vscode.Uri, document?: vscode.TextDocument): Promise<MarkdownPreviewPanel> {
    return MarkdownPreviewPanel._createOrShow(extensionUri, vscode.ViewColumn.Beside, document)
  }

  public static async createOrShowFull(extensionUri: vscode.Uri, document?: vscode.TextDocument): Promise<MarkdownPreviewPanel> {
    return MarkdownPreviewPanel._createOrShow(extensionUri, vscode.ViewColumn.One, document)
  }

  private static async _createOrShow(extensionUri: vscode.Uri, viewColumn: vscode.ViewColumn, document?: vscode.TextDocument): Promise<MarkdownPreviewPanel> {
    if (MarkdownPreviewPanel.currentPanel) {
      MarkdownPreviewPanel.currentPanel._panel.reveal(viewColumn)
      if (document) {
        await ErrorHandler.safeExecute(
          () => MarkdownPreviewPanel.currentPanel!.updateContent(document),
          '创建或显示时内容更新失败',
          'MarkdownPreviewPanel',
        )
      }
      return MarkdownPreviewPanel.currentPanel
    }

    const panel = vscode.window.createWebviewPanel(
      MarkdownPreviewPanel.viewType,
      'Markdown Preview',
      viewColumn,
      HTMLTemplateService.getWebviewOptions(extensionUri),
    )

    const previewPanel = new MarkdownPreviewPanel(panel, extensionUri, document)
    MarkdownPreviewPanel.currentPanel = previewPanel

    // 等待面板完全初始化完成
    await previewPanel.waitForInitialization()

    return previewPanel
  }

  public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, document?: vscode.TextDocument) {
    MarkdownPreviewPanel.currentPanel = new MarkdownPreviewPanel(panel, extensionUri, document)
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, document?: vscode.TextDocument) {
    this._panel = panel
    this._extensionUri = extensionUri
    this._currentDocument = document

    // 初始化 Promise
    this._initializationPromise = new Promise<void>((resolve) => {
      this._initializationResolve = resolve
    })

    // 初始化防抖更新方法（300ms 延迟）
    this._debouncedUpdateContent = debounce(300, (document: vscode.TextDocument) => {
      this.updateContent(document).catch(error =>
        ErrorHandler.logError('防抖内容更新失败', error, 'MarkdownPreviewPanel'),
      )
    })

    // 初始化服务
    this._configService = new ConfigService()
    this._themeService = new ThemeService()
    this._markdownRenderer = new MarkdownRenderer(this._themeService)
    this._stateManager = new StateManager(panel)
    this._scrollSyncManager = new ScrollSyncManager(this)

    // 根据配置初始化滚动同步状态
    this.initializeScrollSyncState()

    // 发送初始滚动同步状态到webview
    this.sendScrollSyncStateToWebview()

    this.setupPanel()
    this.setupEventListeners()
    this.initializeServices()
  }

  /**
   * 初始化滚动同步状态
   */
  private initializeScrollSyncState(): void {
    const config = vscode.workspace.getConfiguration('shikiMarkdownPreview')
    const enableScrollSync = config.get<boolean>('enableScrollSync', true)

    if (enableScrollSync) {
      this._scrollSyncManager?.enable()
    }
    else {
      this._scrollSyncManager?.disable()
    }
  }

  /**
   * 发送滚动同步状态到webview
   */
  private sendScrollSyncStateToWebview(): void {
    const config = vscode.workspace.getConfiguration('shikiMarkdownPreview')
    const enableScrollSync = config.get<boolean>('enableScrollSync', true)

    this._panel.webview.postMessage({
      command: 'updateScrollSyncState',
      enabled: enableScrollSync,
    })
  }

  /**
   * 获取滚动同步设置
   */
  private getScrollSyncSetting(): boolean {
    const config = vscode.workspace.getConfiguration('shikiMarkdownPreview')
    return config.get<boolean>('enableScrollSync', true)
  }

  /**
   * 获取滚动同步排查日志设置
   */
  private getScrollSyncDebugSetting(): boolean {
    const config = vscode.workspace.getConfiguration('shikiMarkdownPreview')
    return config.get<boolean>('enableScrollSyncDebug', false)
  }

  /**
   * 获取目录展开设置
   */
  private getTocExpandSetting(): boolean {
    const config = vscode.workspace.getConfiguration('shikiMarkdownPreview')
    return config.get<boolean>('expandTocByDefault', false)
  }

  /**
   * 判断是否是会影响预览主题的配置变化
   */
  private isThemeConfigurationChange(event: vscode.ConfigurationChangeEvent): boolean {
    return event.affectsConfiguration('shikiMarkdownPreview.currentTheme')
      || event.affectsConfiguration('shikiMarkdownPreview.autoDetectColorScheme')
      || event.affectsConfiguration('shikiMarkdownPreview.preferredDarkColorTheme')
      || event.affectsConfiguration('shikiMarkdownPreview.preferredLightColorTheme')
  }

  /**
   * Set up panel configuration
   */
  private setupPanel(): void {
    // 设置面板图标
    this._panel.iconPath = vscode.Uri.joinPath(this._extensionUri, 'res/preview-icon.svg')
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // 监听面板被释放时的事件
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables)

    // 根据视图变化更新内容
    this._panel.onDidChangeViewState(
      () => {
        if (this._panel.visible && this._currentDocument) {
          // 只有在文档版本发生变化时才重新渲染，避免不必要的闪烁
          const currentVersion = this._currentDocument.version
          if (this._lastRenderedDocumentVersion !== currentVersion) {
            ErrorHandler.safeExecuteSync(
              () => this.updateContentDebounced(this._currentDocument!),
              '视图状态变化时内容更新失败',
              'MarkdownPreviewPanel',
            )
          }
        }
      },
      null,
      this._disposables,
    )

    // 监听配置变化，特别是主题变化
    vscode.workspace.onDidChangeConfiguration(
      (event) => {
        if (this.isThemeConfigurationChange(event)) {
          // 如果正在手动切换主题，跳过配置变化处理
          if (this._isThemeChanging) {
            ErrorHandler.logInfo('主题正在手动切换中，跳过配置变化处理', 'MarkdownPreviewPanel')
          }
          else {
            ErrorHandler.safeExecute(
              () => this.handleThemeChange(),
              '主题变化处理失败',
              'MarkdownPreviewPanel',
            )
          }
        }
        if (event.affectsConfiguration('shikiMarkdownPreview.documentWidth')) {
          ErrorHandler.safeExecute(
            () => this.handleDocumentWidthChange(),
            '文档宽度变化处理失败',
            'MarkdownPreviewPanel',
          )
        }
        if (event.affectsConfiguration('shikiMarkdownPreview.fontFamily')) {
          ErrorHandler.safeExecute(
            () => this.handleFontFamilyChange(),
            '字体变化处理失败',
            'MarkdownPreviewPanel',
          )
        }
      },
      null,
      this._disposables,
    )

    // 自动跟随开启后，VS Code 外观发生亮/暗变化时刷新预览主题
    vscode.window.onDidChangeActiveColorTheme(
      () => {
        if (!this._themeService.autoDetectColorSchemeEnabled) {
          return
        }

        ErrorHandler.safeExecute(
          () => this.handleThemeChange(),
          '系统外观变化处理失败',
          'MarkdownPreviewPanel',
        )
      },
      null,
      this._disposables,
    )

    // 处理来自 webview 的消息
    this._panel.webview.onDidReceiveMessage(
      message => this.handleWebviewMessage(message),
      null,
      this._disposables,
    )
  }

  /**
   * Initialize all services
   */
  private async initializeServices(): Promise<void> {
    try {
      // 初始化主题服务
      await this._themeService.initializeHighlighter()

      // 初始化 markdown 渲染器
      this._markdownRenderer.initialize()

      this._isInitialized = true

      // 设置初始内容
      if (this._currentDocument) {
        await this.updateContent(this._currentDocument)
      }
      else {
        await this.renderEmptyPanel()
      }

      // 开始定期状态保存
      this._stateManager.startPeriodicStateSave()

      // 初始化完成，resolve Promise
      if (this._initializationResolve) {
        this._initializationResolve()
        this._initializationResolve = undefined
      }

      // 启动滚动同步
      if (this._scrollSyncManager) {
        this._scrollSyncManager.start()
      }
    }
    catch (error) {
      ErrorHandler.logError('服务初始化失败', error, 'MarkdownPreviewPanel')
      ErrorHandler.safeExecute(
        () => this.showError('预览服务初始化失败'),
        '显示初始化错误失败',
        'MarkdownPreviewPanel',
      )

      // 即使初始化失败，也要 resolve Promise 以避免永久等待
      if (this._initializationResolve) {
        this._initializationResolve()
        this._initializationResolve = undefined
      }
    }
  }

  // 处理相对路径文件点击
  private async handleRelativeFileClick(filePath: string) {
    const currentDocument = this._currentDocument
    if (!currentDocument) {
      if (this._panel) {
        ErrorHandler.showError('无法获取当前文档信息')
      }
      return
    }

    // 解析相对路径
    const currentFileUri = vscode.Uri.file(currentDocument.fileName)
    const currentDir = vscode.Uri.joinPath(currentFileUri, '..')

    // 验证和解析路径
    const targetFile = PathResolver.validateAndResolvePath(currentDir, filePath)
    if (!targetFile) {
      if (this._panel) {
        ErrorHandler.showError(`无效或不安全的文件路径: ${filePath}`)
      }
      return
    }

    // 检查文件是否存在
    const fileExists = await PathResolver.fileExists(targetFile)
    if (!fileExists) {
      if (this._panel) {
        ErrorHandler.showError(`文件不存在: ${filePath}`)
      }
      return
    }

    // 安全地打开文件
    await PathResolver.openFileSafely(targetFile, vscode.ViewColumn.One)
  }

  /**
   * Handle messages from the webview
   */
  private handleWebviewMessage(message: any): void {
    switch (message.command) {
      case 'alert':
        ErrorHandler.showError(message.text)
        return

      case 'selectTheme':
        this.handleThemeSelection(message.theme)
        return

      case 'cancelThemeSelection':
        this.handleThemeSelectionCancel()
        return

      case 'openRelativeFile':
        this.handleRelativeFileClick(message.filePath)
        break

      case 'webviewReady':
        this._isWebviewReady = true
        break
    }
  }

  private async handleThemeSelection(theme: string): Promise<void> {
    this._isThemeChanging = true
    try {
      const success = await this._themeService.changeTheme(theme)
      if (success && this._currentDocument) {
        // 主题切换成功后，重新加载语言以解决代码块高亮问题
        try {
          await this._markdownRenderer.reloadLanguagesAfterThemeChange(this._currentDocument.getText())
        }
        catch (error) {
          ErrorHandler.logError('主题切换后语言重新加载失败', error, 'MarkdownPreview')
        }

        this.updateContentDebounced(this._currentDocument)
      }
    }
    finally {
      this._isThemeChanging = false
    }
  }

  /**
   * Handle theme selection cancellation
   */
  private handleThemeSelectionCancel(): void {
    if (this._currentDocument) {
      ErrorHandler.safeExecuteSync(
        () => this.updateContentDebounced(this._currentDocument!),
        '主题选择取消后内容更新失败',
        'MarkdownPreviewPanel',
      )
    }
  }

  /**
   * Update content with debouncing
   */
  public updateContentDebounced(document: vscode.TextDocument): void {
    if (!this._debouncedUpdateContent) {
      ErrorHandler.logWarning('防抖更新方法未初始化', 'MarkdownPreviewPanel')
      this.updateContent(document)
      return
    }
    this._debouncedUpdateContent(document)
  }

  /**
   * Update content with a new document - 重构版本
   */
  public async updateContent(document: vscode.TextDocument, options: { forceFullReload?: boolean } = {}): Promise<void> {
    if (!this._isInitialized) {
      ErrorHandler.logWarning('预览面板尚未初始化', 'MarkdownPreviewPanel')
      return
    }
    if (this._isDisposed) {
      return
    }

    this._currentDocument = document
    const renderGeneration = ++this._renderGeneration

    try {
      // 检查是否需要重新渲染
      if (!options.forceFullReload && !this.shouldRerender(document)) {
        return
      }

      // 渲染内容
      await this.renderContent(document, {
        forceFullReload: options.forceFullReload,
        renderGeneration,
      })

      if (this.isRenderStale(document, renderGeneration)) {
        return
      }

      // 更新状态
      this.updateRenderedState(document)
    }
    catch (error) {
      this.handleRenderError(error)
    }
  }

  /**
   * 检查是否需要重新渲染
   */
  private shouldRerender(document: vscode.TextDocument): boolean {
    const currentTheme = this._themeService.currentTheme
    const documentUri = document.uri.toString()

    return !this._hasRenderedWebview
      || this._lastRenderedDocumentUri !== documentUri
      || this._lastRenderedDocumentVersion !== document.version
      || this._lastRenderedTheme !== currentTheme
  }

  /**
   * 渲染内容到面板
   */
  private async renderContent(
    document: vscode.TextDocument,
    options: { forceFullReload?: boolean, renderGeneration?: number } = {},
  ): Promise<void> {
    const content = document.getText()
    const themeBeforeRender = this._themeService.currentTheme

    // 获取 front matter 数据
    const frontMatterData = this._markdownRenderer.getFrontMatterData(content)
    const renderedContent = await this._markdownRenderer.render(content, document)

    // 检测是否包含数学公式
    const enableKatex = hasMathExpressions(content)

    // 等待主题 CSS 变量
    const themeCSSVariables = await this._themeService.getThemeCSSVariables()

    // 获取文档宽度配置
    const documentWidth = this._configService.getDocumentWidth()
    const fontFamily = this._configService.getFontFamily()

    // 确保在渲染前获取最新的主题类型
    const currentThemeType = await this._themeService.refreshCurrentThemeType()

    if (options.renderGeneration !== undefined && this.isRenderStale(document, options.renderGeneration)) {
      return
    }

    const themeChanged = this._lastRenderedTheme !== undefined && this._lastRenderedTheme !== themeBeforeRender
    const needsFullReload = options.forceFullReload
      || !this._hasRenderedWebview
      || !this._isWebviewReady
      || this._lastRenderUsedKatex !== enableKatex
      || themeChanged

    const htmlOptions = {
      webview: this._panel.webview,
      extensionUri: this._extensionUri,
      content: renderedContent,
      themeCSSVariables,
      frontMatterData, // 传递 front matter 数据
      markdownThemeType: currentThemeType, // 传递主题类型
      documentWidth, // 传递文档宽度
      fontFamily, // 传递字体设置
      enableScrollSync: this.getScrollSyncSetting(), // 传递滚动同步设置
      enableScrollSyncDebug: this.getScrollSyncDebugSetting(), // 传递滚动同步排查日志设置
      enableKatex, // 传递 KaTeX 启用状态
      expandTocByDefault: this.getTocExpandSetting(), // 传递目录展开设置
    }

    if (needsFullReload) {
      this._isWebviewReady = false
      this._panel.webview.html = HTMLTemplateService.generateHTML(htmlOptions)
      this._hasRenderedWebview = true
    }
    else {
      const posted = await this._panel.webview.postMessage({
        command: 'updateContent',
        content: renderedContent,
        frontMatterData,
        markdownThemeType: currentThemeType,
        expandTocByDefault: this.getTocExpandSetting(),
      })

      if (!posted) {
        this._isWebviewReady = false
        this._panel.webview.html = HTMLTemplateService.generateHTML(htmlOptions)
        this._hasRenderedWebview = true
      }
    }

    this._lastRenderUsedKatex = enableKatex

    // 更新面板标题 - 优先使用 front matter 中的 title
    this.updatePanelTitle(document, frontMatterData)
  }

  private isRenderStale(document: vscode.TextDocument, renderGeneration: number): boolean {
    return this._isDisposed
      || renderGeneration !== this._renderGeneration
      || document !== this._currentDocument
  }

  /**
   * 更新面板标题
   */
  private updatePanelTitle(document: vscode.TextDocument, frontMatterData: any): void {
    const fileName = document.fileName.split('/').pop() || 'Untitled'
    const title = frontMatterData?.title || fileName
    this._panel.title = title
  }

  /**
   * 更新渲染状态
   */
  private updateRenderedState(document: vscode.TextDocument): void {
    const currentTheme = this._themeService.currentTheme

    // 保存状态
    this._stateManager.saveState(document, currentTheme)

    // 更新渲染缓存状态
    this._lastRenderedDocumentUri = document.uri.toString()
    this._lastRenderedDocumentVersion = document.version
    this._lastRenderedTheme = currentTheme
  }

  /**
   * 处理渲染错误
   */
  private handleRenderError(error: any): void {
    ErrorHandler.logError('内容更新失败', error, 'MarkdownPreviewPanel')
    ErrorHandler.safeExecute(
      () => this.showError(`预览更新失败: ${error instanceof Error ? error.message : String(error)}`),
      '显示错误消息失败',
      'MarkdownPreviewPanel',
    )
  }

  /**
   * Render empty state content when no document is available
   */
  private async renderEmptyPanel(): Promise<void> {
    const content = HTMLTemplateService.generateNoDocumentContent()
    const themeCSSVariables = await this._themeService.getThemeCSSVariables()

    // 获取文档宽度配置
    const documentWidth = this._configService.getDocumentWidth()
    const fontFamily = this._configService.getFontFamily()

    this._panel.webview.html = HTMLTemplateService.generateHTML({
      webview: this._panel.webview,
      extensionUri: this._extensionUri,
      content,
      themeCSSVariables,
      markdownThemeType: this._themeService.getCurrentThemeType(), // 传递主题类型
      documentWidth, // 传递文档宽度
      fontFamily, // 传递字体设置
      enableScrollSync: this.getScrollSyncSetting(), // 传递滚动同步设置
      enableScrollSyncDebug: this.getScrollSyncDebugSetting(), // 传递滚动同步排查日志设置
      expandTocByDefault: this.getTocExpandSetting(), // 传递目录展开设置
    })
    this._hasRenderedWebview = true
    this._isWebviewReady = false
    this._lastRenderUsedKatex = false
  }

  /**
   * Show error message in the panel
   */
  private async showError(message: string): Promise<void> {
    const content = HTMLTemplateService.generateErrorContent(message)
    const themeCSSVariables = await this._themeService.getThemeCSSVariables()

    // 获取文档宽度配置
    const documentWidth = this._configService.getDocumentWidth()
    const fontFamily = this._configService.getFontFamily()

    this._panel.webview.html = HTMLTemplateService.generateHTML({
      webview: this._panel.webview,
      extensionUri: this._extensionUri,
      content,
      themeCSSVariables,
      markdownThemeType: this._themeService.getCurrentThemeType(), // 传递主题类型
      documentWidth, // 传递文档宽度
      fontFamily, // 传递字体设置
      enableScrollSync: this.getScrollSyncSetting(), // 传递滚动同步设置
      enableScrollSyncDebug: this.getScrollSyncDebugSetting(), // 传递滚动同步排查日志设置
      expandTocByDefault: this.getTocExpandSetting(), // 传递目录展开设置
    })
    this._hasRenderedWebview = true
    this._isWebviewReady = false
    this._lastRenderUsedKatex = false
  }

  /**
   * Handle theme change
   */
  private async handleThemeChange(): Promise<void> {
    if (!this._isInitialized) {
      return
    }

    // 如果正在手动切换主题，跳过配置变化处理
    if (this._isThemeChanging) {
      return
    }

    try {
      const nextTheme = this._themeService.effectiveTheme
      if (nextTheme === this._themeService.currentTheme) {
        return
      }

      const applied = await this._themeService.applyEffectiveTheme()
      if (!applied) {
        ErrorHandler.logWarning(`主题变化处理：无法应用主题 ${nextTheme}`, 'MarkdownPreviewPanel')
        return
      }

      // 重新加载文档中使用的所有语言
      if (this._currentDocument) {
        await this._markdownRenderer.reloadLanguagesAfterThemeChange(this._currentDocument.getText())
      }

      // 更新内容以应用新主题
      if (this._currentDocument) {
        await this.updateContent(this._currentDocument, { forceFullReload: true })
      }
      else {
        await this.renderEmptyPanel()
      }
    }
    catch (error) {
      ErrorHandler.logError('主题变化处理失败', error, 'MarkdownPreviewPanel')
    }
  }

  /**
   * Handle document width change
   */
  private async handleDocumentWidthChange(): Promise<void> {
    if (!this._isInitialized) {
      return
    }

    try {
      // 获取新的文档宽度
      const documentWidth = this._configService.getDocumentWidth()

      // 向webview发送文档宽度更新消息
      this._panel.webview.postMessage({
        command: 'updateDocumentWidth',
        width: documentWidth,
      })
    }
    catch (error) {
      ErrorHandler.logError('文档宽度变化处理失败', error, 'MarkdownPreviewPanel')
    }
  }

  /**
   * Handle font family change
   */
  private async handleFontFamilyChange(): Promise<void> {
    if (!this._isInitialized) {
      return
    }

    try {
      // 获取新的字体设置
      const fontFamily = this._configService.getFontFamily()

      // 向webview发送字体更新消息
      this._panel.webview.postMessage({
        command: 'updateFontFamily',
        fontFamily,
      })
    }
    catch (error) {
      ErrorHandler.logError('字体变化处理失败', error, 'MarkdownPreviewPanel')
    }
  }

  /**
   * Dispose of the panel and services
   */
  public dispose(): void {
    if (this._isDisposed) {
      return
    }
    this._isDisposed = true
    this._renderGeneration++
    MarkdownPreviewPanel.currentPanel = undefined

    this._debouncedUpdateContent?.cancel()
    this._debouncedUpdateContent = undefined

    // 停止定期状态保存
    this._stateManager.dispose()

    // 清理滚动同步管理器
    if (this._scrollSyncManager) {
      this._scrollSyncManager.dispose()
    }

    // 清理服务
    this._themeService.dispose()
    this._markdownRenderer.dispose()

    // 清理面板
    try {
      this._panel.dispose()
    }
    catch {
      // 面板可能已经由 VS Code 释放
    }

    // 清理可释放资源
    while (this._disposables.length) {
      const disposable = this._disposables.pop()
      if (disposable) {
        disposable.dispose()
      }
    }
  }

  /**
   * Get the current document
   */
  get currentDocument(): vscode.TextDocument | undefined {
    return this._currentDocument
  }

  /**
   * Get the panel
   */
  get panel(): vscode.WebviewPanel {
    return this._panel
  }

  /**
   * Get the theme service
   */
  get themeService(): ThemeService {
    return this._themeService
  }

  /**
   * Wait for the panel to be fully initialized
   */
  private async waitForInitialization(): Promise<void> {
    if (this._initializationPromise) {
      await this._initializationPromise
    }
  }
}
