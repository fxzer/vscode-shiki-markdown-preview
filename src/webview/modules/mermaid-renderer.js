/**
 * Mermaid 图表渲染模块
 * 负责在 Webview 中渲染 Mermaid 图表
 */

// Mermaid 渲染器状态
let mermaidInitialized = false
let mermaidInstance = null

/**
 * 初始化 Mermaid
 */
async function initializeMermaid() {
  if (mermaidInitialized) {
    return mermaidInstance
  }

  try {
    if (typeof window.mermaid !== 'undefined') {
      // 获取当前主题类型
      const themeType = document.documentElement.getAttribute('data-markdown-theme-type') || 'dark'

      // 根据主题类型设置 Mermaid 主题
      const mermaidTheme = themeType === 'dark' ? 'dark' : 'default'

      window.mermaid.initialize({
        startOnLoad: false,
        theme: mermaidTheme,
        securityLevel: 'strict',
        htmlLabels: false,
      })

      mermaidInitialized = true
      mermaidInstance = window.mermaid

      return mermaidInstance
    }
    else {
      throw new TypeError('Failed to load Mermaid library')
    }
  }
  catch (error) {
    console.error('Mermaid initialization failed:', error)
    throw error
  }
}

/**
 * 渲染 Mermaid 图表
 */
async function renderMermaidDiagrams() {
  try {
    // 初始化 Mermaid
    const mermaid = await initializeMermaid()

    // 查找所有 mermaid 代码块
    const mermaidCodeBlocks = document.querySelectorAll('pre code.language-mermaid')

    if (mermaidCodeBlocks.length === 0) {
      return
    }

    // 逐个渲染图表
    for (const codeBlock of mermaidCodeBlocks) {
      await renderSingleMermaidDiagram(codeBlock, mermaid)
    }

    // 替换 <pre> 节点后，滚动同步的 IntersectionObserver 已丢失对旧节点的观察，
    // 通知主模块基于新 DOM 重新挂载观察
    if (typeof window !== 'undefined' && window.reobserveScrollSyncElements) {
      window.reobserveScrollSyncElements()
    }
  }
  catch (error) {
    console.error('Mermaid diagram rendering failed:', error)
    // 不抛出错误，只是记录，让其他功能继续工作
  }
}

/**
 * 渲染单个 Mermaid 图表
 */
async function renderSingleMermaidDiagram(codeBlock, mermaid) {
  const mermaidCode = codeBlock.textContent.trim()
  const parentPre = codeBlock.parentNode

  if (!mermaidCode || !parentPre) {
    return
  }

  try {
    // 生成唯一的图表 ID
    const graphId = `mermaid-graph-${Math.random().toString(36).substring(2, 9)}`

    // 使用 Mermaid API 渲染 SVG
    const { svg } = await mermaid.render(graphId, mermaidCode)

    // 创建图表容器
    const graphContainer = document.createElement('div')
    graphContainer.className = 'mermaid-graph'
    graphContainer.innerHTML = svg

    // 保留原代码块上的 data-line 锚点，滚动同步依赖它定位
    const dataLine = parentPre.getAttribute('data-line')
    if (dataLine !== null) {
      graphContainer.setAttribute('data-line', dataLine)
    }

    // 用图表容器替换原始的代码块
    parentPre.parentNode.replaceChild(graphContainer, parentPre)
  }
  catch (error) {
    console.error('Mermaid diagram rendering failed for block:', error)

    // 渲染失败时显示错误信息
    const errorDiv = document.createElement('div')
    errorDiv.className = 'mermaid-error'
    errorDiv.innerHTML = `
      <strong>Mermaid 图表渲染失败</strong><br>
      ${escapeHtml(error.message)}
    `

    // 保留原代码块上的 data-line 锚点，滚动同步依赖它定位
    const dataLine = parentPre.getAttribute('data-line')
    if (dataLine !== null) {
      errorDiv.setAttribute('data-line', dataLine)
    }

    parentPre.parentNode.replaceChild(errorDiv, parentPre)
  }
}

/**
 * 重新初始化 Mermaid（主题切换时调用）
 */
async function reinitializeMermaid() {
  // 重置初始化状态
  mermaidInitialized = false
  mermaidInstance = null

  // 重新初始化
  await initializeMermaid()
}

/**
 * HTML 转义函数
 */
function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * 清理函数
 */
function cleanupMermaid() {
  mermaidInitialized = false
  mermaidInstance = null
}

// 导出函数供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    renderMermaidDiagrams,
    reinitializeMermaid,
    cleanupMermaid,
    initializeMermaid,
  }
}
else {
  window.renderMermaidDiagrams = renderMermaidDiagrams
  window.reinitializeMermaid = reinitializeMermaid
  window.cleanupMermaid = cleanupMermaid
  window.initializeMermaid = initializeMermaid
}
