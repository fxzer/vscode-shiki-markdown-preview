import * as path from 'node:path'
import * as vscode from 'vscode'
import { ErrorHandler } from './error-handler'

/**
 * 路径解析工具类
 * 提供统一的路径解析、验证和安全检查功能
 */
export class PathResolver {
  // 允许的文件扩展名
  private static readonly ALLOWED_EXTENSIONS = [
    '.md',
    '.markdown',
    '.txt',
    '.json',
    '.yaml',
    '.yml',
    '.xml',
    '.csv',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.svg',
    '.webp',
    '.mp4',
    '.webm',
    '.ogg',
    '.mov',
    '.m4v',
    '.mp3',
    '.wav',
    '.m4a',
  ]

  // 非法字符正则表达式
  private static readonly ILLEGAL_CHARS = /[<>:"|?*]/

  /**
   * 验证和规范化文件路径，防止路径遍历攻击
   * @param basePath 基础路径
   * @param relativePath 相对路径
   * @returns 规范化后的安全路径，如果路径不安全则返回 null
   */
  static validateAndResolvePath(basePath: vscode.Uri, relativePath: string): vscode.Uri | null {
    return ErrorHandler.safeExecuteSync(
      () => this._validateAndResolvePathInternal(basePath, relativePath),
      `路径验证失败: ${relativePath}`,
      'PathResolver',
      null,
    ) ?? null
  }

  /**
   * 内部路径验证和解析逻辑 - 加强安全性
   */
  private static _validateAndResolvePathInternal(basePath: vscode.Uri, relativePath: string): vscode.Uri | null {
    // 1. 基础输入验证
    if (!relativePath || typeof relativePath !== 'string') {
      ErrorHandler.logWarning('路径为空或类型错误', 'PathResolver')
      return null
    }

    // 2. 长度限制检查
    if (relativePath.length > 4096) {
      ErrorHandler.logWarning(`路径过长: ${relativePath.length} 字符`, 'PathResolver')
      return null
    }

    // 3. 解码 URL 编码的字符（安全解码）
    let decodedPath: string
    try {
      decodedPath = decodeURIComponent(relativePath)
    }
    catch {
      ErrorHandler.logWarning(`URL解码失败: ${relativePath}`, 'PathResolver')
      return null
    }

    // 4. 全面的路径遍历检查
    const dangerousPatterns = [
      /\.\./, // 上级目录
      /~/, // 用户目录
      /^\/+/, // 绝对路径
      /\\/, // Windows 路径分隔符
      /%2e%2e/i, // URL 编码的 ..
      /%2f/i, // URL 编码的 /
      /%5c/i, // URL 编码的 \
      /%7e/i, // URL 编码的 ~
      /\.\.%2f/i, // 混合编码的路径遍历
      /%2f\.\./i, // 反向路径遍历
      /\.\.\\/, // Windows 路径遍历
      /\\\.\./, // Windows 反向路径遍历
      /\.\.%5c/i, // Windows URL 编码路径遍历
      /%5c\.\./i, // Windows 反向 URL 编码路径遍历
    ]

    for (const pattern of dangerousPatterns) {
      if (pattern.test(decodedPath)) {
        ErrorHandler.logWarning(`检测到危险路径模式: ${relativePath} (模式: ${pattern})`, 'PathResolver')
        return null
      }
    }

    // 5. 检查路径是否包含非法字符
    if (this.ILLEGAL_CHARS.test(decodedPath)) {
      ErrorHandler.logWarning(`路径包含非法字符: ${relativePath}`, 'PathResolver')
      return null
    }

    // 6. 检查文件扩展名
    const fileExtension = this.getFileExtension(decodedPath)
    if (fileExtension && !this.ALLOWED_EXTENSIONS.includes(fileExtension)) {
      ErrorHandler.logWarning(`不允许的文件扩展名: ${fileExtension}`, 'PathResolver')
      return null
    }

    // 7. 使用 Node.js path 模块进行更安全的路径解析
    try {
      const basePathStr = basePath.fsPath
      const resolvedPathStr = path.resolve(basePathStr, decodedPath)
      const normalizedBasePath = path.resolve(basePathStr)
      const normalizedResolvedPath = path.resolve(resolvedPathStr)

      // 8. 确保解析后的路径仍然在基础路径下
      if (!normalizedResolvedPath.startsWith(normalizedBasePath)) {
        ErrorHandler.logWarning(`路径遍历尝试检测: ${relativePath} 解析为 ${normalizedResolvedPath}`, 'PathResolver')
        return null
      }

      // 9. 检查路径长度限制
      if (normalizedResolvedPath.length > 4096) {
        ErrorHandler.logWarning(`解析后路径过长: ${normalizedResolvedPath.length} 字符`, 'PathResolver')
        return null
      }

      return vscode.Uri.file(normalizedResolvedPath)
    }
    catch (error) {
      ErrorHandler.logError(`路径解析失败: ${relativePath}`, error, 'PathResolver')
      return null
    }
  }

  /**
   * 获取文件扩展名
   * @param filePath 文件路径
   * @returns 文件扩展名（小写）
   */
  private static getFileExtension(filePath: string): string {
    const lastDotIndex = filePath.lastIndexOf('.')
    if (lastDotIndex === -1)
      return ''
    return filePath.substring(lastDotIndex).toLowerCase()
  }

  /**
   * 解析相对路径（简化版本，用于 Markdown 渲染器）
   * @param baseDocument 基础文档
   * @param relativePath 相对路径
   * @returns 解析后的 URI 或 null
   */
  static resolveRelativePath(baseDocument: vscode.TextDocument, relativePath: string): string | null {
    return ErrorHandler.safeExecuteSync(
      () => {
        const documentDir = vscode.Uri.joinPath(baseDocument.uri, '..')
        const resolvedUri = vscode.Uri.joinPath(documentDir, relativePath)
        return resolvedUri.toString()
      },
      `相对路径解析失败: ${relativePath}`,
      'PathResolver',
      null,
    ) ?? null
  }

  /**
   * 检查文件是否存在
   * @param fileUri 文件 URI
   * @returns Promise<boolean>
   */
  static async fileExists(fileUri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(fileUri)
      return true
    }
    catch {
      return false
    }
  }

  /**
   * 安全地打开文件
   * @param fileUri 文件 URI
   * @param viewColumn 视图列
   * @returns Promise<boolean> 是否成功打开
   */
  static async openFileSafely(fileUri: vscode.Uri, viewColumn: vscode.ViewColumn = vscode.ViewColumn.One): Promise<boolean> {
    return ErrorHandler.safeExecute(
      async () => {
        const document = await vscode.workspace.openTextDocument(fileUri)
        await vscode.window.showTextDocument(document, viewColumn)
        return true
      },
      `无法打开文件: ${fileUri.fsPath}`,
      'PathResolver',
    ) !== null
  }

  /**
   * 额外的安全检查 - 验证文件是否在允许的目录内
   * @param fileUri 文件 URI
   * @param allowedDirectories 允许的目录列表
   * @returns boolean 是否安全
   */
  static isFileInAllowedDirectories(fileUri: vscode.Uri, allowedDirectories: string[]): boolean {
    try {
      const filePath = fileUri.fsPath
      return allowedDirectories.some((allowedDir) => {
        const normalizedAllowedDir = path.resolve(allowedDir)
        const normalizedFilePath = path.resolve(filePath)
        return normalizedFilePath.startsWith(normalizedAllowedDir)
      })
    }
    catch (error) {
      ErrorHandler.logError('安全检查失败', error, 'PathResolver')
      return false
    }
  }

  /**
   * 验证文件大小是否在安全范围内
   * @param fileUri 文件 URI
   * @param maxSizeBytes 最大文件大小（字节）
   * @returns Promise<boolean> 是否安全
   */
  static async isFileSizeSafe(fileUri: vscode.Uri, maxSizeBytes: number = 10 * 1024 * 1024): Promise<boolean> {
    try {
      const stat = await vscode.workspace.fs.stat(fileUri)
      return stat.size <= maxSizeBytes
    }
    catch (error) {
      ErrorHandler.logError('文件大小检查失败', error, 'PathResolver')
      return false
    }
  }
}
