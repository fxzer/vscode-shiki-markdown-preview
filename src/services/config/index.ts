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
   * 是否跟随 VS Code 当前亮色/暗色外观切换主题
   */
  public getAutoDetectColorSchemeEnabled(): boolean {
    const config = vscode.workspace.getConfiguration(ConfigService.SECTION)
    return config.get<boolean>('autoDetectColorScheme', false)
  }

  /**
   * 获取暗色外观下偏好的预览主题
   */
  public getPreferredDarkColorTheme(): string {
    const config = vscode.workspace.getConfiguration(ConfigService.SECTION)
    return config.get('preferredDarkColorTheme', 'vitesse-dark')
  }

  /**
   * 获取亮色外观下偏好的预览主题
   */
  public getPreferredLightColorTheme(): string {
    const config = vscode.workspace.getConfiguration(ConfigService.SECTION)
    return config.get('preferredLightColorTheme', 'vitesse-light')
  }

  /**
   * 获取 VS Code 当前外观是亮色还是暗色
   */
  public getActiveColorScheme(): 'light' | 'dark' {
    switch (vscode.window.activeColorTheme.kind) {
      case vscode.ColorThemeKind.Light:
      case vscode.ColorThemeKind.HighContrastLight:
        return 'light'
      case vscode.ColorThemeKind.Dark:
      case vscode.ColorThemeKind.HighContrast:
      default:
        return 'dark'
    }
  }

  /**
   * 获取当前真正应该生效的预览主题
   */
  public getEffectiveTheme(): string {
    if (!this.getAutoDetectColorSchemeEnabled()) {
      return this.getCurrentTheme()
    }

    return this.getActiveColorScheme() === 'dark'
      ? this.getPreferredDarkColorTheme()
      : this.getPreferredLightColorTheme()
  }

  /**
   * 主题选择器确认后应该写入哪个配置项
   */
  public getThemeSelectionConfigKey(): 'currentTheme' | 'preferredDarkColorTheme' | 'preferredLightColorTheme' {
    if (!this.getAutoDetectColorSchemeEnabled()) {
      return 'currentTheme'
    }

    return this.getActiveColorScheme() === 'dark'
      ? 'preferredDarkColorTheme'
      : 'preferredLightColorTheme'
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
