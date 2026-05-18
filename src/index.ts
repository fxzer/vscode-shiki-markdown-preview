import * as vscode from 'vscode'
import { ConfigService, MarkdownPreviewPanel, MarkdownPreviewSerializer, showThemePicker } from './services'
import { DocumentValidator, ErrorHandler } from './utils'

export function activate(context: vscode.ExtensionContext) {
  console.log('Shiki Markdown Preview is activating...')

  const configService = new ConfigService()

  // 首次安装时显示 Cursor 图标配置提示
  const iconVisibilityHintShown = context.globalState.get<boolean>('iconVisibilityHintShown', false)
  if (!iconVisibilityHintShown) {
    // 延迟显示，避免干扰启动体验
    setTimeout(() => {
      vscode.window.showInformationMessage(
        'Shiki Markdown Preview 已安装！如果在编辑器标题栏没有看到预览图标（在 Cursor 中可能需要额外配置），请点击编辑器标题栏右上角的三个点菜单 (...) → Configure Icon Visibility → 勾选 "Shiki Markdown Preview" 图标选项。',
        '知道了',
      ).then(() => {
        context.globalState.update('iconVisibilityHintShown', true)
      })
    }, 2000)
  }

  console.log('Shiki Markdown Preview commands registered successfully!')
  // 注册 markdown 预览命令 - 侧边预览 (ViewColumn.Two)
  context.subscriptions.push(
    vscode.commands.registerCommand('shikiMarkdownPreview.openPreviewSlide', () => {
      console.log('Command executed: shikiMarkdownPreview.openPreviewSlide')
      const markdownDocument = DocumentValidator.validateMarkdownDocument()
      if (markdownDocument) {
        MarkdownPreviewPanel.createOrShowSlide(context.extensionUri, markdownDocument)
      }
    }),
  )

  // 注册 markdown 预览命令 - 全屏预览 (ViewColumn.One)
  context.subscriptions.push(
    vscode.commands.registerCommand('shikiMarkdownPreview.openPreviewFull', () => {
      const markdownDocument = DocumentValidator.validateMarkdownDocument()
      if (markdownDocument) {
        MarkdownPreviewPanel.createOrShowFull(context.extensionUri, markdownDocument)
      }
    }),
  )

  // 注册主题选择命令
  context.subscriptions.push(
    vscode.commands.registerCommand('shikiMarkdownPreview.selectTheme', async () => {
      // 优先检查预览面板是否存在
      if (MarkdownPreviewPanel.currentPanel) {
        // 如果预览面板存在，直接显示主题选择器
        await ErrorHandler.safeExecute(
          () => showThemePicker(MarkdownPreviewPanel.currentPanel!, configService.getCurrentTheme()),
          '主题选择器打开失败',
          'Extension',
        )
        return
      }

      // 如果预览面板不存在，检查当前活动编辑器
      const markdownDocument = DocumentValidator.validateMarkdownDocument()
      if (!markdownDocument)
        return

      // 创建预览窗口并等待其完全初始化
      await MarkdownPreviewPanel.createOrShowSlide(context.extensionUri, markdownDocument)

      if (MarkdownPreviewPanel.currentPanel) {
        await ErrorHandler.safeExecute(
          () => showThemePicker(MarkdownPreviewPanel.currentPanel!, configService.getCurrentTheme()),
          '主题选择器打开失败',
          'Extension',
        )
      }
    }),
  )

  // 注册编辑器变更监听器，用于自动刷新
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (MarkdownPreviewPanel.currentPanel
        && event.document === MarkdownPreviewPanel.currentPanel.currentDocument) {
        ErrorHandler.safeExecuteSync(
          () => MarkdownPreviewPanel.currentPanel!.updateContentDebounced(event.document),
          '文档内容更新失败',
          'Extension',
        )
      }
    }),
  )

  // 注册活动编辑器变更监听器
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (DocumentValidator.isMarkdownEditor(editor) && MarkdownPreviewPanel.currentPanel) {
        // 只有在切换到不同的 markdown 文件时才更新预览
        const currentDocument = MarkdownPreviewPanel.currentPanel.currentDocument
        if (!currentDocument || editor!.document !== currentDocument) {
          ErrorHandler.safeExecuteSync(
            () => MarkdownPreviewPanel.currentPanel!.updateContentDebounced(editor!.document),
            '活动编辑器内容更新失败',
            'Extension',
          )
        }
      }
    }),
  )

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      // 检查是否是我们扩展的配置发生了变化
      if (event.affectsConfiguration('shikiMarkdownPreview.currentTheme')) {
        if (MarkdownPreviewPanel.currentPanel) {
          // 使用配置服务获取新的主题设置
          const newTheme = configService.getCurrentTheme()
          const currentTheme = MarkdownPreviewPanel.currentPanel.themeService.currentTheme

          // 如果主题没有实际变化，跳过更新
          if (newTheme === currentTheme) {
            return
          }

          // 实时更新预览主题
          const themeService = MarkdownPreviewPanel.currentPanel.themeService
          const success = await ErrorHandler.safeExecute(
            () => themeService.updateThemeForPreview(newTheme),
            `主题预览更新失败: ${newTheme}`,
            'Extension',
          )

          if (success) {
            const currentDocument = MarkdownPreviewPanel.currentPanel.currentDocument
            if (currentDocument) {
              ErrorHandler.safeExecuteSync(
                () => MarkdownPreviewPanel.currentPanel!.updateContentDebounced(currentDocument),
                '主题更新后内容刷新失败',
                'Extension',
              )
            }
          }

          // 显示通知
          ErrorHandler.showInfo(`主题已更改为: ${newTheme}`)
        }
      }

      // 检查滚动同步设置是否发生变化
      if (event.affectsConfiguration('shikiMarkdownPreview.enableScrollSync')) {
        if (MarkdownPreviewPanel.currentPanel) {
          const config = vscode.workspace.getConfiguration('shikiMarkdownPreview')
          const enableScrollSync = config.get<boolean>('enableScrollSync', true)

          if (MarkdownPreviewPanel.currentPanel.scrollSyncManager) {
            if (enableScrollSync) {
              MarkdownPreviewPanel.currentPanel.scrollSyncManager.enable()
            }
            else {
              MarkdownPreviewPanel.currentPanel.scrollSyncManager.disable()
            }
          }

          // 通知webview更新滚动同步状态
          MarkdownPreviewPanel.currentPanel.panel.webview.postMessage({
            command: 'updateScrollSyncState',
            enabled: enableScrollSync,
          })
        }
      }

      if (event.affectsConfiguration('shikiMarkdownPreview.enableScrollSyncDebug')) {
        if (MarkdownPreviewPanel.currentPanel) {
          const enableScrollSyncDebug = configService.getScrollSyncDebugEnabled()
          MarkdownPreviewPanel.currentPanel.scrollSyncManager?.setDebugEnabled(enableScrollSyncDebug)
          MarkdownPreviewPanel.currentPanel.panel.webview.postMessage({
            command: 'updateScrollSyncDebugState',
            enabled: enableScrollSyncDebug,
          })
        }
      }
    }),
  )

  // 注册 webview 序列化器
  if (vscode.window.registerWebviewPanelSerializer) {
    const serializer = new MarkdownPreviewSerializer(context.extensionUri)
    context.subscriptions.push(
      vscode.window.registerWebviewPanelSerializer(MarkdownPreviewPanel.viewType, serializer),
    )
  }
}

export function deactivate() {
  // 如需要，清理资源
}
