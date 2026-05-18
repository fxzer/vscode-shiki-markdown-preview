import * as vscode from 'vscode'
import { MarkdownPreviewPanel } from './markdown-preview'

export interface WebviewState {
  documentUri: string
  theme: string
  timestamp: number
}

export class MarkdownPreviewSerializer implements vscode.WebviewPanelSerializer {
  // eslint-disable-next-line unused-imports/no-unused-vars
  constructor(private extensionUri: vscode.Uri) {}

  async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, _state: WebviewState | undefined) {
    // 设置 webview 选项
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'src/webview'),
        vscode.Uri.joinPath(this.extensionUri, 'src/webview/modules'),
      ],
    }

    // 恢复面板
    MarkdownPreviewPanel.revive(webviewPanel, this.extensionUri)

    // 智能文档恢复策略
    const documentToRestore = await this.findDocumentToRestore(_state)

    if (documentToRestore) {
      // 等待 webview 完全初始化
      await this.waitForWebviewReady(webviewPanel)

      // 更新内容
      if (MarkdownPreviewPanel.currentPanel) {
        await MarkdownPreviewPanel.currentPanel.updateContent(documentToRestore)

        // 滚动同步逻辑已移除

        // 聚焦到文档
        await vscode.window.showTextDocument(documentToRestore, vscode.ViewColumn.One)
      }
    }
  }

  /**
   * 智能文档恢复策略
   * 按优先级查找要恢复的文档：
   * 1. 活动编辑器中的 Markdown 文件
   * 2. 可见编辑器中的第一个 Markdown 文件
   * 3. 从保存的状态中恢复的文档URI
   */
  private async findDocumentToRestore(_state: WebviewState | undefined): Promise<vscode.TextDocument | undefined> {
    // 1. 优先选择活动编辑器中的 Markdown 文件
    const activeEditor = vscode.window.activeTextEditor
    if (activeEditor && activeEditor.document.languageId === 'markdown') {
      return activeEditor.document
    }

    // 2. 查找可见编辑器中的第一个 Markdown 文件
    const visibleEditors = vscode.window.visibleTextEditors
    const visibleMarkdownEditor = visibleEditors.find(editor =>
      editor.document.languageId === 'markdown',
    )
    if (visibleMarkdownEditor) {
      return visibleMarkdownEditor.document
    }

    // 3. 从保存的状态中恢复文档URI
    if (_state?.documentUri) {
      try {
        const documentUri = vscode.Uri.parse(_state.documentUri)
        const document = await vscode.workspace.openTextDocument(documentUri)
        return document
      }
      catch (error) {
        console.error('Failed to restore document from state:', error)
      }
    }

    return undefined
  }

  /**
   * 等待 webview 完全初始化
   */
  private async waitForWebviewReady(webviewPanel: vscode.WebviewPanel): Promise<void> {
    return new Promise((resolve) => {
      let isReady = false

      const disposable = webviewPanel.webview.onDidReceiveMessage((message) => {
        if (message.command === 'webviewReady' && !isReady) {
          isReady = true
          disposable.dispose()
          resolve()
        }
      })

      // 备用方案：1秒后强制继续
      setTimeout(() => {
        if (!isReady) {
          isReady = true
          disposable.dispose()
          resolve()
        }
      }, 1000)
    })
  }
}
