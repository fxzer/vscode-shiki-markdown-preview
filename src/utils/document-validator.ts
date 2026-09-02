import * as vscode from 'vscode'
import { ErrorHandler } from './error-handler'

/**
 * 文档验证工具类
 * 提供统一的文档验证和检查功能
 */
export class DocumentValidator {
  /**
   * 检查编辑器是否为 Markdown 文档
   * @param editor 文本编辑器
   * @returns 是否为 Markdown 文档
   */
  static isMarkdownEditor(editor?: vscode.TextEditor): boolean {
    return editor?.document.languageId === 'markdown'
  }

  /**
   * 检查文档是否为 Markdown 文档
   * @param document 文本文档
   * @returns 是否为 Markdown 文档
   */
  static isMarkdownDocument(document?: vscode.TextDocument): boolean {
    return document?.languageId === 'markdown'
  }

  /**
   * 获取当前活动的 Markdown 编辑器
   * @returns 活动的 Markdown 编辑器或 undefined
   */
  static getActiveMarkdownEditor(): vscode.TextEditor | undefined {
    const activeEditor = vscode.window.activeTextEditor
    return this.isMarkdownEditor(activeEditor) ? activeEditor : undefined
  }

  /**
   * 获取当前活动的 Markdown 文档
   * @returns 活动的 Markdown 文档或 undefined
   */
  static getActiveMarkdownDocument(): vscode.TextDocument | undefined {
    const activeEditor = this.getActiveMarkdownEditor()
    return activeEditor?.document
  }

  /**
   * 验证并获取 Markdown 文档，如果无效则显示提示
   * @param document 要验证的文档（可选）
   * @param showMessage 是否显示提示消息
   * @returns 有效的 Markdown 文档或 undefined
   */
  static validateMarkdownDocument(
    document?: vscode.TextDocument,
    showMessage: boolean = true,
  ): vscode.TextDocument | undefined {
    const targetDocument = document || this.getActiveMarkdownDocument()

    if (!targetDocument) {
      if (showMessage) {
        ErrorHandler.showInfo('请先打开一个 Markdown 文件')
      }
      return undefined
    }

    if (!this.isMarkdownDocument(targetDocument)) {
      if (showMessage) {
        ErrorHandler.showInfo('请先打开一个 Markdown 文件')
      }
      return undefined
    }

    return targetDocument
  }

  /**
   * 根据命令触发位置验证并获取 Markdown 文档
   * @param resourceUri 编辑器标题栏或资源管理器传入的资源 URI
   * @param showMessage 是否显示提示消息
   * @returns 有效的 Markdown 文档或 undefined
   */
  static async validateMarkdownResource(
    resourceUri?: vscode.Uri,
    showMessage: boolean = true,
  ): Promise<vscode.TextDocument | undefined> {
    if (!resourceUri) {
      return this.validateMarkdownDocument(undefined, showMessage)
    }

    try {
      const document = await vscode.workspace.openTextDocument(resourceUri)
      return this.validateMarkdownDocument(document, showMessage)
    }
    catch {
      if (showMessage) {
        ErrorHandler.showInfo('请先打开一个 Markdown 文件')
      }
      return undefined
    }
  }

  /**
   * 检查文档是否有未保存的更改
   * @param document 文档
   * @returns 是否有未保存的更改
   */
  static hasUnsavedChanges(document?: vscode.TextDocument): boolean {
    if (!document)
      return false
    return document.isDirty
  }
}
