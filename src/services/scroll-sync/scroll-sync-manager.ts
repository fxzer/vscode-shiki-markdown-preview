import type { MarkdownPreviewPanel } from '../renderer/markdown-preview'
import * as vscode from 'vscode'

/**
 * 滚动同步管理器 - 基于行号的精确同步
 * 核心思想：直接使用行号同步，简化逻辑，提升性能
 * 配合 Webview 端的 Intersection Observer，实现丝滑的双向滚动同步
 */
export class ScrollSyncManager {
  private readonly _panel: MarkdownPreviewPanel
  private _disposables: vscode.Disposable[] = []

  // 状态管理
  private _isSyncing: boolean = false
  private _syncSource: 'editor' | 'preview' | null = null
  private _currentLine: number = 0
  private _isEnabled: boolean = true

  // 性能优化参数
  private readonly _SYNC_BLOCK_MS = 30 // 同步阻塞时间，防止循环
  private _syncTimeout: NodeJS.Timeout | null = null

  // 调试日志计数器
  private _debugCounter: number = 0

  constructor(panel: MarkdownPreviewPanel) {
    this._panel = panel
  }

  /**
   * 开始滚动同步
   */
  public start(): void {
    console.log('[ScrollSyncManager] 初始化滚动同步管理器')
    this.setupMessageListener()
    this.setupEditorListener()
    console.log('[ScrollSyncManager] 滚动同步管理器已启动，当前状态:', {
      isEnabled: this._isEnabled,
      currentLine: this._currentLine,
    })
  }

  /**
   * 启用滚动同步
   */
  public enable(): void {
    console.log('[ScrollSyncManager] 启用滚动同步')
    this._isEnabled = true
  }

  /**
   * 禁用滚动同步
   */
  public disable(): void {
    console.log('[ScrollSyncManager] 禁用滚动同步')
    this._isEnabled = false
    // 清理当前状态
    this._isSyncing = false
    this._syncSource = null
    this.clearSyncTimeout()
  }

  /**
   * 检查是否启用
   */
  public isEnabled(): boolean {
    return this._isEnabled
  }

  /**
   * 设置编辑器监听器
   */
  private setupEditorListener(): void {
    this._disposables.push(
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        if (event.textEditor.document === this._panel.currentDocument) {
          this.handleEditorScroll(event.textEditor)
        }
      }),
    )
  }

  /**
   * 处理编辑器滚动事件
   * 简化版本：直接使用行号，无需复杂的百分比计算
   */
  private handleEditorScroll(editor: vscode.TextEditor): void {
    this._debugCounter++

    if (!this._isEnabled) {
      console.log(`[ScrollSyncManager#${this._debugCounter}] 编辑器滚动被忽略: 滚动同步未启用`)
      return
    }
    if (editor.document !== this._panel.currentDocument) {
      console.log(`[ScrollSyncManager#${this._debugCounter}] 编辑器滚动被忽略: 文档不匹配`)
      return
    }
    // 如果是预览触发的同步，忽略编辑器滚动
    if (this._isSyncing && this._syncSource === 'preview') {
      console.log(`[ScrollSyncManager#${this._debugCounter}] 编辑器滚动被忽略: 正在同步中 (source=preview)`)
      return
    }

    // 获取当前可见范围的顶部行号
    const topLine = editor.visibleRanges[0].start.line

    console.log(`[ScrollSyncManager#${this._debugCounter}] 编辑器滚动: 行 ${this._currentLine} → ${topLine}, 同步状态: isSyncing=${this._isSyncing}, source=${this._syncSource}`)

    // 如果行号没有变化，跳过同步
    if (topLine === this._currentLine) {
      console.log(`[ScrollSyncManager#${this._debugCounter}] 编辑器滚动被忽略: 行号未变化`)
      return
    }

    this._currentLine = topLine
    this.syncToPreview(topLine)
  }

  /**
   * 设置消息监听器
   * 监听来自 webview 的滚动消息
   */
  private setupMessageListener(): void {
    console.log('[ScrollSyncManager] 设置消息监听器')
    this._disposables.push(
      this._panel.panel.webview.onDidReceiveMessage((message) => {
        console.log(`[ScrollSyncManager] 收到 webview 消息:`, message)
        if (message.command === 'previewScrolledToLine') {
          console.log(`[ScrollSyncManager] 处理预览滚动消息: 行号=${message.line}`)
          this.syncToEditor(message.line)
        }
      }),
    )
  }

  /**
   * 同步到预览区
   * 发送行号到 webview，让 Intersection Observer 处理滚动
   */
  private syncToPreview(line: number): void {
    console.log(`[ScrollSyncManager] 同步到预览: 行号=${line}, 当前状态: isSyncing=${this._isSyncing}, source=${this._syncSource}`)

    // 激活状态锁：标记为编辑器触发的同步
    this._isSyncing = true
    this._syncSource = 'editor'

    // 发送同步消息到预览区
    const success = this._panel.panel.webview.postMessage({
      command: 'syncScrollToLine',
      line,
    })
    console.log(`[ScrollSyncManager] 发送同步消息到预览: 行号=${line}, 发送结果=${success}`)

    // 设置状态释放定时器
    this.clearSyncTimeout()
    this._syncTimeout = setTimeout(() => {
      console.log(`[ScrollSyncManager] 同步状态释放: ${this._SYNC_BLOCK_MS}ms 后释放编辑器锁`)
      this._isSyncing = false
      this._syncSource = null
    }, this._SYNC_BLOCK_MS)
  }

  /**
   * 同步到编辑器
   * 根据 webview 发来的行号直接定位
   */
  private async syncToEditor(line: number): Promise<void> {
    const startTime = Date.now()
    console.log(`[ScrollSyncManager] 同步到编辑器: 请求行号=${line}, 当前状态: isSyncing=${this._isSyncing}, source=${this._syncSource}, currentLine=${this._currentLine}`)

    // 如果是编辑器触发的同步，忽略
    if (this._isSyncing && this._syncSource === 'editor') {
      console.log(`[ScrollSyncManager] 同步到编辑器被忽略: 正在同步中 (source=editor)`)
      return
    }

    // 激活状态锁：标记为预览触发的同步
    this._isSyncing = true
    this._syncSource = 'preview'

    const editor = vscode.window.visibleTextEditors.find(
      e => e.document === this._panel.currentDocument,
    )

    if (!editor) {
      console.warn('[ScrollSyncManager] 未找到编辑器，取消同步')
      this._isSyncing = false
      this._syncSource = null
      return
    }

    const lineCount = editor.document.lineCount
    console.log(`[ScrollSyncManager] 编辑器总行数: ${lineCount}`)

    // 确保行号在有效范围内
    const targetLine = Math.max(0, Math.min(line, lineCount - 1))
    console.log(`[ScrollSyncManager] 目标行号: ${targetLine}`)

    try {
      // 不做任何检查，直接滚动（移除检查可以减少延迟）
      const position = new vscode.Position(targetLine, 0)
      const range = new vscode.Range(position, position)

      // 使用 AtTop 而不是 Center，减少计算开销
      editor.revealRange(range, vscode.TextEditorRevealType.AtTop)

      // 更新当前行号
      this._currentLine = targetLine
      const elapsed = Date.now() - startTime
      console.log(`[ScrollSyncManager] 编辑器滚动完成: 行 ${targetLine}, 耗时 ${elapsed}ms`)
    }
    catch (error) {
      console.error('[ScrollSyncManager] 滚动失败:', error)
    }

    // 设置状态释放定时器
    this.clearSyncTimeout()
    this._syncTimeout = setTimeout(() => {
      console.log(`[ScrollSyncManager] 同步状态释放: ${this._SYNC_BLOCK_MS}ms 后释放预览锁`)
      this._isSyncing = false
      this._syncSource = null
    }, this._SYNC_BLOCK_MS)
  }

  /**
   * 停止滚动同步并清理资源
   */
  public dispose(): void {
    console.log('[ScrollSyncManager] 清理资源，停止滚动同步')
    // 1. 清理所有定时器
    this.clearSyncTimeout()

    // 2. 清理所有监听器
    this._disposables.forEach((d) => {
      try {
        d.dispose()
      }
      catch (error) {
        console.warn('清理监听器时出错:', error)
      }
    })
    this._disposables = []

    // 3. 重置所有状态
    this._isSyncing = false
    this._syncSource = null
    this._currentLine = 0
    this._isEnabled = false
  }

  /**
   * 清理同步定时器
   */
  private clearSyncTimeout(): void {
    if (this._syncTimeout) {
      clearTimeout(this._syncTimeout)
      this._syncTimeout = null
    }
  }
}
