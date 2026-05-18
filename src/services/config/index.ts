import * as vscode from 'vscode'

/**
 * 配置服务，用于管理主题配置
 */
export class ConfigService {
  private static readonly SECTION = 'shikiMarkdownPreview'

  /**
   * 获取当前主题
   */
  public getCurrentTheme(): string {
    const config = vscode.workspace.getConfiguration(ConfigService.SECTION)
    return config.get('currentTheme', 'vitesse-dark')
  }

  /**
   * 获取文档宽度
   */
  public getDocumentWidth(): string {
    const config = vscode.workspace.getConfiguration(ConfigService.SECTION)
    return config.get('documentWidth', '800px')
  }

  /**
   * 获取字体设置
   */
  public getFontFamily(): string {
    const config = vscode.workspace.getConfiguration(ConfigService.SECTION)
    const fontFamily = config.get<string>('fontFamily', 'inherit')
    return !fontFamily || fontFamily.trim() === '' ? 'inherit' : fontFamily
  }

  /**
   * 是否输出滚动同步排查日志
   */
  public getScrollSyncDebugEnabled(): boolean {
    const config = vscode.workspace.getConfiguration(ConfigService.SECTION)
    return config.get<boolean>('enableScrollSyncDebug', false)
  }

  /**
   * 更新配置
   */
  public async updateConfig(key: string, value: any, target: vscode.ConfigurationTarget): Promise<void> {
    const config = vscode.workspace.getConfiguration(ConfigService.SECTION)
    await config.update(key, value, target)
  }

  /**
   * 获取所有配置
   */
  public getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(ConfigService.SECTION)
  }
}
