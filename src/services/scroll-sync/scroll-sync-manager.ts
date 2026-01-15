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

  constructor(panel: MarkdownPreviewPanel) {
    this._panel = panel
  }

  /**
   * 开始滚动同步
   */
  public start(): void {
    this.setupMessageListener()
    this.setupEditorListener()
  }

  /**
   * 启用滚动同步
   */
  public enable(): void {
    this._isEnabled = true
  }

  /**
   * 禁用滚动同步
   */
  public disable(): void {
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
    if (!this._isEnabled)
      return
    if (editor.document !== this._panel.currentDocument)
      return
    // 如果是预览触发的同步，忽略编辑器滚动
    if (this._isSyncing && this._syncSource === 'preview')
      return

    // 获取当前可见范围的顶部行号
    const topLine = editor.visibleRanges[0].start.line

    // 如果行号没有变化，跳过同步
    if (topLine === this._currentLine)
      return

    this._currentLine = topLine
    this.syncToPreview(topLine)
  }

  /**
   * 设置消息监听器
   * 监听来自 webview 的滚动消息
   */
  private setupMessageListener(): void {
    this._disposables.push(
      this._panel.panel.webview.onDidReceiveMessage((message) => {
        const startTime = Date.now()
        if (message.command === 'previewScrolledToLine') {
          console.log(`[ScrollSyncManager] 收到滚动消息，行号: ${message.line}`)
          this.syncToEditor(message.line)
          console.log(`[ScrollSyncManager] 处理耗时: ${Date.now() - startTime}ms`)
        }
      }),
    )
  }

  /**
   * 同步到预览区
   * 发送行号到 webview，让 Intersection Observer 处理滚动
   */
  private syncToPreview(line: number): void {
    // 激活状态锁：标记为编辑器触发的同步
    this._isSyncing = true
    this._syncSource = 'editor'

    // 发送同步消息到预览区
    this._panel.panel.webview.postMessage({
      command: 'syncScrollToLine',
      line,
    })

    // 设置状态释放定时器
    this.clearSyncTimeout()
    this._syncTimeout = setTimeout(() => {
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
    
    // 如果是编辑器触发的同步，忽略
    if (this._isSyncing && this._syncSource === 'editor') {
      console.log('[ScrollSyncManager] 忽略：编辑器触发的同步')
      return
    }

    // 激活状态锁：标记为预览触发的同步
    this._isSyncing = true
    this._syncSource = 'preview'

    const editor = vscode.window.visibleTextEditors.find(
      e => e.document === this._panel.currentDocument,
    )

    if (!editor) {
      console.warn('[ScrollSyncManager] 未找到编辑器')
      this._isSyncing = false
      this._syncSource = null
      return
    }

    const lineCount = editor.document.lineCount

    // 确保行号在有效范围内
    const targetLine = Math.max(0, Math.min(line, lineCount - 1))

    try {
      // 不做任何检查，直接滚动（移除检查可以减少延迟）
      const position = new vscode.Position(targetLine, 0)
      const range = new vscode.Range(position, position)

      // 使用 AtTop 而不是 Center，减少计算开销
      editor.revealRange(range, vscode.TextEditorRevealType.AtTop)

      // 更新当前行号
      this._currentLine = targetLine
      
      console.log(`[ScrollSyncManager] 滚动到行 ${targetLine}，总耗时: ${Date.now() - startTime}ms`)
    }
    catch (error) {
      console.error('[ScrollSyncManager] 滚动失败:', error)
    }

    // 设置状态释放定时器
    this.clearSyncTimeout()
    this._syncTimeout = setTimeout(() => {
      this._isSyncing = false
      this._syncSource = null
    }, this._SYNC_BLOCK_MS)
  }

  /**
   * 停止滚动同步并清理资源
   */
  public dispose(): void {
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
