// 主入口模块 - 负责初始化和协调各个功能模块

// 初始化滚动同步管理器
let scrollSyncManager = null
let searchHighlightManager = null

function scrollElementToTop(element) {
  const rect = element.getBoundingClientRect()
  const currentTop = window.pageYOffset || document.documentElement.scrollTop || 0
  window.scrollTo({
    top: Math.max(0, Math.round(currentTop + rect.top)),
    left: 0,
    behavior: 'auto',
  })
  document.documentElement.scrollLeft = 0
  if (document.body) {
    document.body.scrollLeft = 0
  }
}

/**
 * 初始化滚动同步
 */
function initializeScrollSync() {
  // 确保内容已经加载
  const content = document.getElementById('markdown-content')
  if (!content) {
    setTimeout(initializeScrollSync, 200)
    return
  }

  // 确保页面完全加载
  if (document.readyState !== 'complete') {
    setTimeout(initializeScrollSync, 100)
    return
  }

  if (scrollSyncManager) {
    scrollSyncManager.destroy()
  }

  // 使用新的基于 Intersection Observer 的滚动同步
  if (window.ScrollSyncManager) {
    scrollSyncManager = new window.ScrollSyncManager()
  }
}

/**
 * 初始化搜索高亮
 */
function initializeSearchHighlight() {
  if (searchHighlightManager) {
    return
  }

  if (window.SearchHighlightManager) {
    searchHighlightManager = new window.SearchHighlightManager()
    searchHighlightManager.initialize()
  }
}

/**
 * 处理来自扩展的消息
 */
function handleExtensionMessage(event) {
  const message = event.data
  switch (message.command) {
    case 'refreshToc':
      if (window.notionToc) {
        window.notionToc.refresh()
      }
      break
    case 'updateContent': {
      const markdownContent = document.getElementById('markdown-content')
      if (markdownContent) {
        if (searchHighlightManager) {
          searchHighlightManager.clearHighlightsDOM()
        }

        window.frontMatterData = message.frontMatterData || {}
        window.tocConfig = {
          expandTocByDefault: Boolean(message.expandTocByDefault),
        }
        if (message.markdownThemeType) {
          document.documentElement.setAttribute('data-markdown-theme-type', message.markdownThemeType)
        }

        markdownContent.innerHTML = message.content

        // 重新应用语法高亮
        if (window.applySyntaxHighlighting) {
          window.applySyntaxHighlighting()
        }

        // 重新初始化链接处理
        if (window.initializeLinkHandling) {
          window.robustInitialize(
            () => document.getElementById('markdown-content'),
            window.initializeLinkHandling,
            'Link handling reinitialization failed after content update.',
            3,
            50,
          )
        }

        // 重新初始化任务复选框处理
        if (window.initializeTaskCheckboxHandling) {
          window.robustInitialize(
            () => document.getElementById('markdown-content'),
            window.initializeTaskCheckboxHandling,
            'Task checkbox reinitialization failed after content update.',
            3,
            50,
          )
        }

        // 重新初始化NotionToc
        if (window.NotionToc) {
          window.robustInitialize(
            () => {
              const content = document.getElementById('markdown-content')
              return content && content.querySelector('h1, h2, h3')
            },
            () => {
              if (window.notionToc) {
                window.notionToc.destroy()
              }
              window.notionToc = new window.NotionToc()
            },
            'NotionToc reinitialization failed after content update.',
            5,
            100,
          )
        }

        // 重新渲染 Mermaid 图表
        if (window.renderMermaidDiagrams) {
          window.robustInitialize(
            () => document.querySelector('pre code.language-mermaid'),
            window.renderMermaidDiagrams,
            'Mermaid diagram re-rendering failed after content update.',
            3,
            100,
          )
        }

        if (searchHighlightManager && searchHighlightManager.isVisible && searchHighlightManager.currentQuery) {
          searchHighlightManager.performSearch()
        }

        requestAnimationFrame(() => {
          initializeScrollSync()
        })
      }
      break
    }
    case 'syncScrollToLine': {
      // 如果 ScrollSyncManager 已初始化，使用它处理
      if (scrollSyncManager) {
        scrollSyncManager.scrollToLine(message.line)
      }
      else {
        // 如果 ScrollSyncManager 未初始化，直接滚动到行
        const element = document.querySelector(`[data-line="${message.line}"]`)
        if (element) {
          scrollElementToTop(element)
        }
      }
      break
    }
    case 'updateScrollSyncState': {
      // 更新滚动同步状态
      if (scrollSyncManager) {
        if (message.enabled) {
          scrollSyncManager.enable()
        }
        else {
          scrollSyncManager.disable()
        }
      }
      break
    }
    case 'updateScrollSyncDebugState': {
      window.scrollSyncDebug = Boolean(message.enabled)
      if (scrollSyncManager && scrollSyncManager.setDebugEnabled) {
        scrollSyncManager.setDebugEnabled(message.enabled)
      }
      break
    }
    case 'updateDocumentWidth': {
      // 更新文档宽度CSS变量
      document.documentElement.style.setProperty('--document-width', message.width)
      break
    }
    case 'updateFontFamily': {
      // 更新字体CSS变量
      document.documentElement.style.setProperty('--font-family', message.fontFamily)
      break
    }
    case 'updateTheme': {
      // 更新主题类型属性
      document.documentElement.setAttribute('data-markdown-theme-type', message.themeType)

      // 重新初始化 Mermaid 以应用新主题
      if (window.reinitializeMermaid && window.renderMermaidDiagrams) {
        window.robustInitialize(
          () => document.querySelector('pre code.language-mermaid'),
          async () => {
            await window.reinitializeMermaid()
            await window.renderMermaidDiagrams()
          },
          'Mermaid theme reinitialization failed.',
          3,
          100,
        )
      }
      break
    }
  }
}

/**
 * 主初始化函数
 */
function initializeWebviewModules() {
  // 检查TOC初始化条件
  const canInitToc = () => {
    const content = document.getElementById('markdown-content')
    return content && content.querySelector('h1, h2, h3')
  }

  if (window.robustInitialize && window.NotionToc) {
    window.robustInitialize(canInitToc, () => {
      window.notionToc = new window.NotionToc()
    }, 'NotionToc initialization failed: Content or headers not found.')
  }

  // 检查语法高亮初始化条件
  if (window.robustInitialize && window.applySyntaxHighlighting) {
    window.robustInitialize(
      () => document.querySelector('pre code'),
      window.applySyntaxHighlighting,
      'Syntax highlighting failed: Code blocks not found.',
    )
  }

  // 检查链接处理初始化条件
  if (window.robustInitialize && window.initializeLinkHandling) {
    window.robustInitialize(
      () => document.getElementById('markdown-content'),
      window.initializeLinkHandling,
      'Link handling initialization failed: Markdown content not found.',
    )
  }

  // 检查任务复选框处理初始化条件
  if (window.robustInitialize && window.initializeTaskCheckboxHandling) {
    window.robustInitialize(
      () => document.getElementById('markdown-content'),
      window.initializeTaskCheckboxHandling,
      'Task checkbox initialization failed: Markdown content not found.',
    )
  }

  // 初始化 Mermaid 图表渲染
  if (window.robustInitialize && window.renderMermaidDiagrams) {
    window.robustInitialize(
      () => document.querySelector('pre code.language-mermaid'),
      window.renderMermaidDiagrams,
      'Mermaid diagram rendering failed: Mermaid code blocks not found.',
    )
  }

  // 初始化滚动同步
  initializeScrollSync()

  // 初始化搜索高亮
  initializeSearchHighlight()
}

// 页面加载完成后也调用一次，确保语法高亮被应用
window.addEventListener('load', () => {
  if (window.robustInitialize && window.applySyntaxHighlighting) {
    window.robustInitialize(
      () => document.querySelector('pre code'),
      window.applySyntaxHighlighting,
      'Syntax highlighting on load failed: Code blocks not found.',
      5, // 减少重试次数，因为页面已经加载完成
      100,
    )
  }
})

// 导出给外部使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initializeWebviewModules,
    initializeScrollSync,
    handleExtensionMessage,
    scrollSyncManager: () => scrollSyncManager,
    searchHighlightManager: () => searchHighlightManager,
  }
}
else {
  window.initializeWebviewModules = initializeWebviewModules
  window.initializeScrollSync = initializeScrollSync
  window.handleExtensionMessage = handleExtensionMessage
  window.searchHighlightManager = () => searchHighlightManager
}
