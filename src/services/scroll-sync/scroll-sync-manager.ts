import type { MarkdownPreviewPanel } from '../renderer/markdown-preview'
import * as vscode from 'vscode'

type DebugPayload = Record<string, unknown>

/**
 * 滚动同步管理器 - 基于行号的精确同步
 * 核心思想：直接使用行号同步，简化逻辑，提升性能
 * 配合 Webview 端的 Intersection Observer，实现丝滑的双向滚动同步
 */
export class ScrollSyncManager {
  private static _debugOutputChannel: vscode.OutputChannel | undefined

  private readonly _panel: MarkdownPreviewPanel
  private _disposables: vscode.Disposable[] = []
  private readonly _debugSessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  // 状态管理
  private _isSyncing: boolean = false
  private _syncSource: 'editor' | 'preview' | null = null
  private _currentLine: number = 0
  private _isEnabled: boolean = true
  private _lastEditorTopLine: number | null = null
  private _ignoreEditorScrollUntil: number = 0
  private _pendingPreviewTargetLine: number | null = null
  private _pendingEditorTopLine: number | null = null
  private _lastPreviewSyncedLine: number | null = null
  private _lastPreviewSyncSentAt: number = 0
  private _lastPreviewSync: {
    requestedLine: number
    targetLine: number | null
    receivedAt: number
    beforeTopLine: number | null
  } | undefined

  // 性能优化参数
  private readonly _SYNC_BLOCK_MS = 30 // 同步阻塞时间，防止循环
  private readonly _PREVIEW_TO_EDITOR_ECHO_BLOCK_MS = 250
  private readonly _EDITOR_TO_PREVIEW_THROTTLE_MS = 40
  private _syncTimeout: NodeJS.Timeout | null = null
  private _previewSyncTimeout: NodeJS.Timeout | null = null

  // 调试日志计数器
  private _debugCounter: number = 0
  private _debugSequence: number = 0

  constructor(panel: MarkdownPreviewPanel) {
    this._panel = panel
  }

  /**
   * 开始滚动同步
   */
  public start(): void {
    this.logConsole('[ScrollSyncManager] 初始化滚动同步管理器')
    this.setupMessageListener()
    this.setupEditorListener()
    this.logDebug('manager-start', {
      documentFileName: this._panel.currentDocument?.fileName ?? null,
      visibleEditors: vscode.window.visibleTextEditors.length,
      editor: this.getEditorSnapshot(this.getCurrentEditor()),
    })
    this.logConsole('[ScrollSyncManager] 滚动同步管理器已启动，当前状态:', {
      isEnabled: this._isEnabled,
      currentLine: this._currentLine,
    })
  }

  /**
   * 启用滚动同步
   */
  public enable(): void {
    this.logConsole('[ScrollSyncManager] 启用滚动同步')
    this._isEnabled = true
    this.logDebug('manager-enabled')
  }

  /**
   * 禁用滚动同步
   */
  public disable(): void {
    this.logConsole('[ScrollSyncManager] 禁用滚动同步')
    this._isEnabled = false
    // 清理当前状态
    this._isSyncing = false
    this._syncSource = null
    this._ignoreEditorScrollUntil = 0
    this._pendingPreviewTargetLine = null
    this._pendingEditorTopLine = null
    this.clearSyncTimeout()
    this.clearPreviewSyncTimeout()
    this.logDebug('manager-disabled')
  }

  /**
   * 检查是否启用
   */
  public isEnabled(): boolean {
    return this._isEnabled
  }

  /**
   * 更新排查日志开关
   */
  public setDebugEnabled(enabled: boolean): void {
    this.logDebug('debug-state-updated', { enabled })
  }

  private isDebugEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('shikiMarkdownPreview')
    return config.get<boolean>('enableScrollSyncDebug', false)
  }

  private logConsole(...args: unknown[]): void {
    if (this.isDebugEnabled()) {
      console.warn(...args)
    }
  }

  private warnConsole(...args: unknown[]): void {
    if (this.isDebugEnabled()) {
      console.warn(...args)
    }
  }

  private getDebugOutputChannel(): vscode.OutputChannel {
    if (!ScrollSyncManager._debugOutputChannel) {
      ScrollSyncManager._debugOutputChannel = vscode.window.createOutputChannel('Shiki Markdown Preview Scroll Sync')
    }
    return ScrollSyncManager._debugOutputChannel
  }

  private logDebug(event: string, payload: DebugPayload = {}): void {
    if (!this.isDebugEnabled()) {
      return
    }

    const entry = {
      ts: new Date().toISOString(),
      t: Date.now(),
      seq: ++this._debugSequence,
      side: 'extension',
      session: this._debugSessionId,
      event,
      state: {
        isEnabled: this._isEnabled,
        isSyncing: this._isSyncing,
        syncSource: this._syncSource,
        currentLine: this._currentLine,
        ignoreEditorScrollForMs: Math.max(0, this._ignoreEditorScrollUntil - Date.now()),
        pendingPreviewTargetLine: this._pendingPreviewTargetLine,
        pendingEditorTopLine: this._pendingEditorTopLine,
        lastPreviewSyncedLine: this._lastPreviewSyncedLine,
      },
      ...payload,
    }

    this.getDebugOutputChannel().appendLine(JSON.stringify(entry))
  }

  private logWebviewDebug(payload: DebugPayload): void {
    if (!this.isDebugEnabled()) {
      return
    }

    this.getDebugOutputChannel().appendLine(JSON.stringify({
      ...payload,
      linkedExtensionSession: this._debugSessionId,
    }))
  }

  private getEditorSnapshot(editor: vscode.TextEditor | undefined): DebugPayload {
    if (!editor) {
      return { found: false }
    }

    const ranges = editor.visibleRanges.map(range => ({
      startLine: range.start.line,
      startCharacter: range.start.character,
      endLine: range.end.line,
      endCharacter: range.end.character,
    }))

    return {
      found: true,
      isActiveEditor: vscode.window.activeTextEditor === editor,
      documentVersion: editor.document.version,
      lineCount: editor.document.lineCount,
      topLine: ranges[0]?.startLine ?? null,
      bottomLine: ranges[0]?.endLine ?? null,
      ranges,
      selection: {
        activeLine: editor.selection.active.line,
        activeCharacter: editor.selection.active.character,
        anchorLine: editor.selection.anchor.line,
        anchorCharacter: editor.selection.anchor.character,
      },
    }
  }

  private getCurrentEditor(): vscode.TextEditor | undefined {
    return vscode.window.visibleTextEditors.find(
      e => e.document === this._panel.currentDocument,
    )
  }

  private getElapsedSincePreviewSync(): number | null {
    if (!this._lastPreviewSync) {
      return null
    }

    return Date.now() - this._lastPreviewSync.receivedAt
  }

  private shouldIgnorePreviewEcho(topLine: number | null): boolean {
    if (topLine === null) {
      return false
    }

    return Date.now() < this._ignoreEditorScrollUntil
  }

  private scheduleEditorPositionProbes(editor: vscode.TextEditor, targetLine: number, reason: string): void {
    if (!this.isDebugEnabled()) {
      return
    }

    for (const delay of [0, 16, 50, 120, 250]) {
      setTimeout(() => {
        if (editor.document !== this._panel.currentDocument) {
          this.logDebug('editor-position-probe-skipped', {
            reason,
            delay,
            targetLine,
            skippedReason: 'document-changed',
          })
          return
        }

        this.logDebug('editor-position-probe', {
          reason,
          delay,
          targetLine,
          editor: this.getEditorSnapshot(editor),
          msSincePreviewSync: this.getElapsedSincePreviewSync(),
        })
      }, delay)
    }
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
    const editorSnapshot = this.getEditorSnapshot(editor)
    const topLine = editor.visibleRanges[0]?.start.line ?? null
    const previousTopLine = this._lastEditorTopLine
    const lineDelta = topLine !== null && previousTopLine !== null ? topLine - previousTopLine : null
    this._lastEditorTopLine = topLine

    this.logDebug('editor-visible-range-change', {
      editor: editorSnapshot,
      previousTopLine,
      lineDelta,
      msSincePreviewSync: this.getElapsedSincePreviewSync(),
      lastPreviewSync: this._lastPreviewSync ?? null,
    })

    if (!this._isEnabled) {
      this.logConsole(`[ScrollSyncManager#${this._debugCounter}] 编辑器滚动被忽略: 滚动同步未启用`)
      this.logDebug('editor-scroll-ignored', {
        reason: 'sync-disabled',
        editor: editorSnapshot,
      })
      return
    }
    if (editor.document !== this._panel.currentDocument) {
      this.logConsole(`[ScrollSyncManager#${this._debugCounter}] 编辑器滚动被忽略: 文档不匹配`)
      this.logDebug('editor-scroll-ignored', {
        reason: 'document-mismatch',
        editor: editorSnapshot,
      })
      return
    }
    if (topLine === null) {
      this.logDebug('editor-scroll-ignored', {
        reason: 'no-visible-range',
        editor: editorSnapshot,
      })
      return
    }
    if (this.shouldIgnorePreviewEcho(topLine)) {
      if (this._pendingPreviewTargetLine !== null) {
        this._currentLine = this._pendingPreviewTargetLine
      }
      this.logConsole(`[ScrollSyncManager#${this._debugCounter}] 编辑器滚动被忽略: 预览同步后的延迟回声`)
      this.logDebug('editor-scroll-ignored', {
        reason: 'preview-echo-window',
        topLine,
        pendingPreviewTargetLine: this._pendingPreviewTargetLine,
        ignoreEditorScrollForMs: Math.max(0, this._ignoreEditorScrollUntil - Date.now()),
        editor: editorSnapshot,
      })
      return
    }
    // 如果是预览触发的同步，忽略编辑器滚动
    if (this._isSyncing && this._syncSource === 'preview') {
      this.logConsole(`[ScrollSyncManager#${this._debugCounter}] 编辑器滚动被忽略: 正在同步中 (source=preview)`)
      this.logDebug('editor-scroll-ignored', {
        reason: 'lock-from-preview',
        editor: editorSnapshot,
        msSincePreviewSync: this.getElapsedSincePreviewSync(),
      })
      return
    }

    this.logConsole(`[ScrollSyncManager#${this._debugCounter}] 编辑器滚动: 行 ${this._currentLine} → ${topLine}, 同步状态: isSyncing=${this._isSyncing}, source=${this._syncSource}`)
    this.logDebug('editor-scroll-accepted', {
      fromLine: this._currentLine,
      toLine: topLine,
      lineDeltaFromPreviousEditorEvent: lineDelta,
      editor: editorSnapshot,
      msSincePreviewSync: this.getElapsedSincePreviewSync(),
    })

    // 如果行号没有变化，跳过同步
    if (topLine === this._currentLine) {
      this.logConsole(`[ScrollSyncManager#${this._debugCounter}] 编辑器滚动被忽略: 行号未变化`)
      this.logDebug('editor-scroll-ignored', {
        reason: 'line-unchanged',
        topLine,
        editor: editorSnapshot,
      })
      return
    }

    this._currentLine = topLine
    this._pendingPreviewTargetLine = null
    this._ignoreEditorScrollUntil = 0
    this.scheduleSyncToPreview(topLine)
  }

  private scheduleSyncToPreview(line: number): void {
    const now = Date.now()
    const elapsedSinceLastSync = now - this._lastPreviewSyncSentAt
    const delay = Math.max(0, this._EDITOR_TO_PREVIEW_THROTTLE_MS - elapsedSinceLastSync)

    if (line === this._lastPreviewSyncedLine && this._pendingEditorTopLine === null) {
      this.logDebug('sync-to-preview-schedule-skipped', {
        reason: 'already-synced',
        line,
      })
      return
    }

    this._pendingEditorTopLine = line
    this.logDebug('sync-to-preview-scheduled', {
      line,
      delay,
      elapsedSinceLastSync,
    })

    if (this._previewSyncTimeout) {
      return
    }

    if (delay === 0) {
      this.flushPendingPreviewSync('immediate')
      return
    }

    this._previewSyncTimeout = setTimeout(() => {
      this._previewSyncTimeout = null
      this.flushPendingPreviewSync('throttled')
    }, delay)
  }

  private flushPendingPreviewSync(reason: string): void {
    if (this._previewSyncTimeout) {
      clearTimeout(this._previewSyncTimeout)
      this._previewSyncTimeout = null
    }

    const line = this._pendingEditorTopLine
    this._pendingEditorTopLine = null

    if (line === null) {
      this.logDebug('sync-to-preview-flush-skipped', {
        reason,
        skippedReason: 'no-pending-line',
      })
      return
    }

    if (line === this._lastPreviewSyncedLine) {
      this.logDebug('sync-to-preview-flush-skipped', {
        reason,
        skippedReason: 'already-synced',
        line,
      })
      return
    }

    this.logDebug('sync-to-preview-flush', {
      reason,
      line,
    })
    this.syncToPreview(line)
  }

  /**
   * 设置消息监听器
   * 监听来自 webview 的滚动消息
   */
  private setupMessageListener(): void {
    this.logConsole('[ScrollSyncManager] 设置消息监听器')
    this._disposables.push(
      this._panel.panel.webview.onDidReceiveMessage((message) => {
        this.logConsole(`[ScrollSyncManager] 收到 webview 消息:`, message)
        if (message.command === 'scrollSyncDebugLog') {
          this.logWebviewDebug(message.payload ?? {})
          return
        }

        if (message.command === 'previewScrolledToLine') {
          this.logConsole(`[ScrollSyncManager] 处理预览滚动消息: 行号=${message.line}`)
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
    this.logConsole(`[ScrollSyncManager] 同步到预览: 行号=${line}, 当前状态: isSyncing=${this._isSyncing}, source=${this._syncSource}`)
    this.logDebug('sync-to-preview-start', {
      line,
      editor: this.getEditorSnapshot(this.getCurrentEditor()),
    })

    // 激活状态锁：标记为编辑器触发的同步
    this._isSyncing = true
    this._syncSource = 'editor'

    // 发送同步消息到预览区
    const success = this._panel.panel.webview.postMessage({
      command: 'syncScrollToLine',
      line,
    })
    this.logConsole(`[ScrollSyncManager] 发送同步消息到预览: 行号=${line}, 发送结果=${success}`)
    this._lastPreviewSyncedLine = line
    this._lastPreviewSyncSentAt = Date.now()
    this.logDebug('sync-to-preview-message-sent', {
      line,
      postMessageResult: success,
    })

    // 设置状态释放定时器
    this.clearSyncTimeout()
    this._syncTimeout = setTimeout(() => {
      this.logConsole(`[ScrollSyncManager] 同步状态释放: ${this._SYNC_BLOCK_MS}ms 后释放编辑器锁`)
      this.logDebug('sync-lock-release', {
        releasedSource: 'editor',
        delay: this._SYNC_BLOCK_MS,
        line,
      })
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
    this.logConsole(`[ScrollSyncManager] 同步到编辑器: 请求行号=${line}, 当前状态: isSyncing=${this._isSyncing}, source=${this._syncSource}, currentLine=${this._currentLine}`)
    this.logDebug('sync-to-editor-request', {
      requestedLine: line,
      editorBeforeLookup: this.getEditorSnapshot(this.getCurrentEditor()),
      msSincePreviousPreviewSync: this.getElapsedSincePreviewSync(),
      lastPreviewSync: this._lastPreviewSync ?? null,
    })

    // 如果是编辑器触发的同步，忽略
    if (this._isSyncing && this._syncSource === 'editor') {
      this.logConsole(`[ScrollSyncManager] 同步到编辑器被忽略: 正在同步中 (source=editor)`)
      this.logDebug('sync-to-editor-ignored', {
        reason: 'lock-from-editor',
        requestedLine: line,
      })
      return
    }

    // 激活状态锁：标记为预览触发的同步
    this._isSyncing = true
    this._syncSource = 'preview'
    this._pendingEditorTopLine = null
    this.clearPreviewSyncTimeout()

    const editor = this.getCurrentEditor()

    if (!editor) {
      this.warnConsole('[ScrollSyncManager] 未找到编辑器，取消同步')
      this.logDebug('sync-to-editor-ignored', {
        reason: 'editor-not-found',
        requestedLine: line,
      })
      this._isSyncing = false
      this._syncSource = null
      return
    }

    const lineCount = editor.document.lineCount
    this.logConsole(`[ScrollSyncManager] 编辑器总行数: ${lineCount}`)

    // 确保行号在有效范围内
    const targetLine = Math.max(0, Math.min(line, lineCount - 1))
    this.logConsole(`[ScrollSyncManager] 目标行号: ${targetLine}`)
    const beforeReveal = this.getEditorSnapshot(editor)
    this._pendingPreviewTargetLine = targetLine
    this._ignoreEditorScrollUntil = Date.now() + this._PREVIEW_TO_EDITOR_ECHO_BLOCK_MS
    this._lastPreviewSync = {
      requestedLine: line,
      targetLine,
      receivedAt: startTime,
      beforeTopLine: typeof beforeReveal.topLine === 'number' ? beforeReveal.topLine : null,
    }
    this.logDebug('sync-to-editor-target-ready', {
      requestedLine: line,
      targetLine,
      beforeReveal,
      ignoreEditorScrollForMs: this._PREVIEW_TO_EDITOR_ECHO_BLOCK_MS,
    })

    try {
      // 不做任何检查，直接滚动（移除检查可以减少延迟）
      const position = new vscode.Position(targetLine, 0)
      const range = new vscode.Range(position, position)

      // 使用 AtTop 而不是 Center，减少计算开销
      editor.revealRange(range, vscode.TextEditorRevealType.AtTop)

      // 更新当前行号
      this._currentLine = targetLine
      this._lastPreviewSyncedLine = targetLine
      const elapsed = Date.now() - startTime
      this.logConsole(`[ScrollSyncManager] 编辑器滚动完成: 行 ${targetLine}, 耗时 ${elapsed}ms`)
      this.logDebug('editor-reveal-range-called', {
        requestedLine: line,
        targetLine,
        elapsed,
        beforeReveal,
        afterReveal: this.getEditorSnapshot(editor),
      })
      this.scheduleEditorPositionProbes(editor, targetLine, 'after-preview-sync')
    }
    catch (error) {
      console.error('[ScrollSyncManager] 滚动失败:', error)
      this.logDebug('sync-to-editor-error', {
        requestedLine: line,
        targetLine,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    // 设置状态释放定时器
    this.clearSyncTimeout()
    this._syncTimeout = setTimeout(() => {
      this.logConsole(`[ScrollSyncManager] 同步状态释放: ${this._SYNC_BLOCK_MS}ms 后释放预览锁`)
      this.logDebug('sync-lock-release', {
        releasedSource: 'preview',
        delay: this._SYNC_BLOCK_MS,
        requestedLine: line,
        targetLine,
        editor: this.getEditorSnapshot(editor),
      })
      this._isSyncing = false
      this._syncSource = null
    }, this._SYNC_BLOCK_MS)
  }

  /**
   * 停止滚动同步并清理资源
   */
  public dispose(): void {
    this.logConsole('[ScrollSyncManager] 清理资源，停止滚动同步')
    this.logDebug('manager-dispose')
    // 1. 清理所有定时器
    this.clearSyncTimeout()

    // 2. 清理所有监听器
    this._disposables.forEach((d) => {
      try {
        d.dispose()
      }
      catch (error) {
        this.warnConsole('清理监听器时出错:', error)
      }
    })
    this._disposables = []

    // 3. 重置所有状态
    this._isSyncing = false
    this._syncSource = null
    this._currentLine = 0
    this._isEnabled = false
    this._ignoreEditorScrollUntil = 0
    this._pendingPreviewTargetLine = null
    this._pendingEditorTopLine = null
    this.clearPreviewSyncTimeout()
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

  private clearPreviewSyncTimeout(): void {
    if (this._previewSyncTimeout) {
      clearTimeout(this._previewSyncTimeout)
      this._previewSyncTimeout = null
    }
  }
}
