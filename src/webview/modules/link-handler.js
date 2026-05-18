// 链接处理相关功能

let currentMarkdownContent = null
let delegatedLinkClickHandler = null

/**
 * 判断是否为相对路径的 Markdown 文件
 */
function isRelativeMarkdownFile(href) {
  const isMarkdownFile = href.toLowerCase().endsWith('.md')
  const isLocalFile = href.startsWith('/') || href.startsWith('./') || href.startsWith('../')

  return isMarkdownFile && isLocalFile
}

function decorateMarkdownLinks(markdownContent) {
  const links = markdownContent.querySelectorAll('a[href]')

  links.forEach((link) => {
    const href = link.getAttribute('href')
    if (!href || !isRelativeMarkdownFile(href)) {
      return
    }

    link.style.cursor = 'pointer'
    link.title = `点击打开文件: ${href}`
  })
}

/**
 * 初始化链接点击处理
 */
function initializeLinkHandling() {
  const markdownContent = document.getElementById('markdown-content')
  if (!markdownContent) {
    return
  }

  if (currentMarkdownContent && currentMarkdownContent !== markdownContent && delegatedLinkClickHandler) {
    currentMarkdownContent.removeEventListener('click', delegatedLinkClickHandler)
  }

  currentMarkdownContent = markdownContent

  if (!delegatedLinkClickHandler) {
    delegatedLinkClickHandler = (event) => {
      const link = event.target?.closest?.('a[href]')
      if (!link || !currentMarkdownContent?.contains(link)) {
        return
      }

      const href = link.getAttribute('href')
      if (!href || !isRelativeMarkdownFile(href)) {
        return
      }

      event.preventDefault()

      if (window.vscode && window.vscode.postMessage) {
        window.vscode.postMessage({
          command: 'openRelativeFile',
          filePath: href,
        })
      }
    }
  }

  currentMarkdownContent.removeEventListener('click', delegatedLinkClickHandler)
  currentMarkdownContent.addEventListener('click', delegatedLinkClickHandler)
  decorateMarkdownLinks(currentMarkdownContent)
}

function cleanupLinkHandling() {
  if (currentMarkdownContent && delegatedLinkClickHandler) {
    currentMarkdownContent.removeEventListener('click', delegatedLinkClickHandler)
  }
  currentMarkdownContent = null
}

// 导出给外部使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initializeLinkHandling, isRelativeMarkdownFile, cleanupLinkHandling }
}
else {
  window.initializeLinkHandling = initializeLinkHandling
  window.isRelativeMarkdownFile = isRelativeMarkdownFile
  window.cleanupLinkHandling = cleanupLinkHandling
}
