import { nanoid } from 'nanoid'
import * as vscode from 'vscode'
import { escapeHtml } from '../../utils'

export interface HTMLTemplateOptions {
  webview: vscode.Webview
  extensionUri: vscode.Uri
  content: string
  themeCSSVariables?: string
  frontMatterData?: any
  nonce?: string
  markdownThemeType?: 'light' | 'dark'
  documentWidth?: string
  fontFamily?: string
  enableScrollSync?: boolean
  enableKatex?: boolean
  expandTocByDefault?: boolean
}

export class HTMLTemplateService {
  /**
   * Generate HTML for the webview
   */
  static generateHTML(options: HTMLTemplateOptions): string {
    const {
      webview,
      extensionUri,
      content,
      themeCSSVariables = '',
      frontMatterData = {},
      nonce = nanoid(),
      markdownThemeType = 'dark',
      documentWidth = '800px',
      fontFamily = 'inherit',
      enableScrollSync = true,
      enableKatex = false,
      expandTocByDefault = false,
    } = options

    // 模块化脚本加载 - 根据设置条件性加载滚动同步脚本
    const scriptModules = [
      'utils.js',
      'syntax-highlight.js',
      'link-handler.js',
      'mermaid.min.js',
      'mermaid-renderer.js',
      ...(enableScrollSync ? ['scroll-sync.js'] : []),
      'notion-toc.js',
      'search-highlight.js',
      'main.js',
    ]

    const scriptUris = scriptModules.map(module =>
      webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src/webview/modules', module)),
    )

    const webviewCssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src/webview/style.css'))
    const searchCssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src/webview/search.css'))

    // 按需加载 KaTeX CSS - 使用本地文件
    const katexCSS = enableKatex
      ? `
                <link rel="stylesheet" href="${webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src/webview/katex.min.css'))}">`
      : ''

    return `<!DOCTYPE html>
            <html lang="en" data-markdown-theme-type="${markdownThemeType}">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}'; connect-src https:;">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${webviewCssUri}" rel="stylesheet">
                <link href="${searchCssUri}" rel="stylesheet">${katexCSS}
                <style>
                    :root {
                        ${themeCSSVariables}
                        --document-width: ${documentWidth};
                        --font-family: ${fontFamily};
                    }
                </style>
                <title>${frontMatterData?.title ? escapeHtml(frontMatterData.title) : 'Markdown Preview'}</title>
            </head>
            <body>
                <div class="container" id="markdown-content">
                    ${content}
                </div>
                
                <!-- 模块化脚本加载 - 按依赖顺序加载 -->
                ${scriptUris.map(uri => `<script nonce="${nonce}" src="${uri}"></script>`).join('\n                ')}
                
                <script nonce="${nonce}">
                    // 将 front matter 数据存储到全局变量中
                    window.frontMatterData = ${JSON.stringify(frontMatterData)};

                    // 存储目录配置
                    window.tocConfig = {
                        expandTocByDefault: ${expandTocByDefault ? 'true' : 'false'}
                    };

                    // 初始化 VS Code API
                    let vscode;
                    if (window.vscode) {
                        vscode = window.vscode;
                    } else {
                        try {
                            vscode = acquireVsCodeApi();
                            window.vscode = vscode;
                        } catch (error) {
                            console.error('Failed to acquire VS Code API in inline script:', error);
                            vscode = {
                                postMessage: () => {},
                                setState: () => {},
                                getState: () => null
                            };
                        }
                    }
                    
                    // Listen for messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'saveState':
                                // Save state to webview
                                vscode.setState(message.state || {
                                    documentUri: message.documentUri
                                });
                                break;
                            default:
                                // 将其他消息转发给主模块处理
                                if (window.handleExtensionMessage) {
                                    window.handleExtensionMessage(event);
                                }
                                break;
                        }
                    });
                    
                    // 初始化所有模块
                    if (window.initializeWebviewModules) {
                        window.initializeWebviewModules();
                    }
                    
                    // Send ready message when page loads
                    window.addEventListener('load', () => {
                        vscode.postMessage({ command: 'webviewReady' });
                    });
                </script>
            </body>
            </html>`
  }

  /**
   * Generate error HTML content
   */
  static generateErrorContent(errorMessage: string): string {
    return `<p>Error rendering markdown: ${escapeHtml(errorMessage)}</p>`
  }

  /**
   * Generate no document HTML content
   */
  static generateNoDocumentContent(): string {
    return `<div style="text-align: center; padding: 50px; color: var(--vscode-descriptionForeground);">
                <p>No document selected</p>
                <p style="font-size: 14px; margin-top: 10px;">Open a Markdown file to see the preview</p>
            </div>`
  }

  /**
   * Generate webview options
   */
  static getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
    return {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(extensionUri, 'src/webview'),
        vscode.Uri.joinPath(extensionUri, 'src/webview/modules'),
      ],
    }
  }
}
