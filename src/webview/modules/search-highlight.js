/**
 * 搜索高亮管理器
 * 用于在 Markdown 预览中提供搜索和高亮功能
 */
class SearchHighlightManager {
  constructor() {
    // 搜索结果相关
    this.searchResults = []
    this.currentMatchIndex = -1
    this.currentQuery = ''
    this.highlightedElements = []

    // DOM 元素引用
    this.searchBox = null
    this.searchInput = null
    this.prevButton = null
    this.nextButton = null
    this.countSpan = null

    // 状态管理
    this.isVisible = false

    // 防抖定时器
    this.searchDebounceTimer = null
    this.SEARCH_DEBOUNCE_MS = 300

    // 中文输入法状态
    this.isComposing = false

    // 全局事件处理器引用
    this.globalKeydownHandler = null
  }

  /**
   * 初始化搜索功能
   */
  initialize() {
    // 检查是否已初始化
    if (this.searchBox) {
      console.warn('[SearchHighlight] 已经初始化，跳过')
      return
    }

    this.createSearchBox()
    this.bindEvents()
  }

  /**
   * 创建搜索框 UI
   */
  createSearchBox() {
    const box = document.createElement('div')
    box.id = 'search-highlight-box'
    box.className = 'search-highlight-box'

    // SVG 图标定义
    // 上箭头：上一个匹配
    const prevIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 10L8 6L12 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    // 下箭头：下一个匹配
    const nextIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    // 关闭按钮
    const closeIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`

    box.innerHTML = `
      <div class="search-content">
        <input type="text" class="search-input" placeholder="Search..." autocomplete="off" />
        <div class="search-controls">
          <button class="search-prev" title="Previous match (Up arrow)" aria-label="Previous match">
            ${prevIcon}
          </button>
          <button class="search-next" title="Next match (Down arrow)" aria-label="Next match">
            ${nextIcon}
          </button>
          <button class="search-close" title="Close (Escape)" aria-label="Close search">
            ${closeIcon}
          </button>
        </div>
      </div>
      <span class="search-count"></span>
    `

    document.body.appendChild(box)

    // 保存元素引用
    this.searchBox = box
    this.searchInput = box.querySelector('.search-input')
    this.prevButton = box.querySelector('.search-prev')
    this.nextButton = box.querySelector('.search-next')
    this.countSpan = box.querySelector('.search-count')
    const closeButton = box.querySelector('.search-close')
    this.closeButton = closeButton
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 中文输入法开始
    this.searchInput.addEventListener('compositionstart', () => {
      this.isComposing = true
    })

    // 中文输入法结束
    this.searchInput.addEventListener('compositionend', () => {
      this.isComposing = false
      // 清除防抖定时器，防止与 input 事件冲突
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer)
        this.searchDebounceTimer = null
      }
      // 使用 requestAnimationFrame 确保 DOM 更新后再搜索
      requestAnimationFrame(() => {
        this.performSearch()
      })
    })

    // 输入防抖（仅在非中文输入状态下触发）
    this.searchInput.addEventListener('input', () => {
      if (this.isComposing) {
        return // 中文输入过程中不触发搜索
      }
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer)
      }
      this.searchDebounceTimer = setTimeout(() => {
        this.performSearch()
      }, this.SEARCH_DEBOUNCE_MS)
    })

    // 键盘导航：上箭头上一个，下箭头/Enter 下一个
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        this.navigateToPrevious()
      }
      else if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault()
        this.navigateToNext()
      }
      else if (e.key === 'Escape') {
        this.hide()
      }
    })

    // 导航按钮
    this.prevButton.addEventListener('click', () => this.navigateToPrevious())
    this.nextButton.addEventListener('click', () => this.navigateToNext())
    this.closeButton.addEventListener('click', () => this.hide())

    // 全局快捷键
    this.globalKeydownHandler = (e) => {
      // Command+F (Mac) 或 Ctrl+F (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        this.show()
        this.searchInput.focus()
        // 如果有选中文本，自动填充
        const selection = window.getSelection()
        if (selection && selection.toString().trim()) {
          this.searchInput.value = selection.toString().trim()
          this.performSearch()
        }
      }
    }
    document.addEventListener('keydown', this.globalKeydownHandler)
  }

  /**
   * 显示搜索框
   */
  show() {
    // 先检查 DOM 中是否已存在搜索框元素（防止状态丢失）
    const existingBox = document.getElementById('search-highlight-box')
    if (existingBox) {
      // 使用已存在的元素，重新获取引用
      this.searchBox = existingBox
      this.searchInput = existingBox.querySelector('.search-input')
      this.prevButton = existingBox.querySelector('.search-prev')
      this.nextButton = existingBox.querySelector('.search-next')
      this.closeButton = existingBox.querySelector('.search-close')
      this.countSpan = existingBox.querySelector('.search-count')
    }

    if (!this.searchBox) {
      this.createSearchBox()
    }

    this.searchBox.classList.add('visible')
    this.isVisible = true

    // 如果有查询词，恢复搜索状态
    if (this.currentQuery) {
      this.searchInput.value = this.currentQuery
      // DOM 高亮已被 hide() 清除，需要重新执行搜索
      this.performSearch()
    }
  }

  /**
   * 隐藏搜索框（仅隐藏 UI，保留搜索状态）
   */
  hide() {
    if (!this.searchBox) {
      return
    }
    this.searchBox.classList.remove('visible')
    this.isVisible = false
    // 清除 DOM 高亮但不清除搜索状态，以便重新打开时恢复
    this.clearHighlightsDOM()
  }

  /**
   * 执行搜索
   */
  performSearch() {
    const query = this.searchInput.value.trim()

    // 清除之前的高亮 DOM（不清除状态）
    this.clearHighlightsDOM()

    if (!query) {
      // 输入为空时，清除所有状态
      this.searchResults = []
      this.currentMatchIndex = -1
      this.currentQuery = ''
      this.updateCount()
      return
    }

    this.currentQuery = query
    this.searchResults = []

    // 使用递归方式遍历文本节点，避免 TreeWalker 的 DOM 状态问题
    const textNodes = this.collectTextNodes(document.body, query)

    // 高亮匹配项
    this.highlightMatches(textNodes, query)
    this.updateCount()

    // 如果有匹配结果，滚动到第一个
    if (this.searchResults.length > 0) {
      this.currentMatchIndex = 0
      this.updateActiveHighlight()
      this.scrollToMatch()
    }
    else {
      this.currentMatchIndex = -1
    }
  }

  /**
   * 递归收集包含搜索词的文本节点
   * 使用递归而不是 TreeWalker，避免 DOM 状态不一致的问题
   */
  collectTextNodes(element, query) {
    const textNodes = []
    const excludeTags = ['script', 'style', 'noscript', 'template', 'iframe', 'head', 'pre']

    for (const child of element.childNodes) {
      // 跳过排除的标签
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tagName = child.tagName.toLowerCase()
        if (excludeTags.includes(tagName) || child.classList.contains('search-highlight-box')) {
          continue
        }
        // 递归遍历子元素
        textNodes.push(...this.collectTextNodes(child, query))
      }
      // 收集包含搜索词的文本节点
      else if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent.trim()
        if (text && text.toLowerCase().includes(query.toLowerCase())) {
          textNodes.push(child)
        }
      }
    }

    return textNodes
  }

  /**
   * 转义正则表达式特殊字符
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  /**
   * 高亮匹配项
   */
  highlightMatches(textNodes, query) {
    const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi')
    let globalIndex = 0

    textNodes.forEach((textNode) => {
      const text = textNode.textContent
      const matches = [...text.matchAll(regex)]

      if (matches.length === 0) {
        return
      }

      // 按文本节点分组处理，避免节点分裂
      const fragment = document.createDocumentFragment()
      let lastIndex = 0

      matches.forEach((match) => {
        // 添加匹配前的文本
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)))
        }

        // 创建高亮 span
        const highlightSpan = document.createElement('span')
        highlightSpan.className = 'search-highlight'
        highlightSpan.dataset.searchIndex = globalIndex.toString()
        highlightSpan.textContent = match[0]

        fragment.appendChild(highlightSpan)

        // 保存搜索结果引用
        this.searchResults.push({
          element: highlightSpan,
          text: match[0],
        })

        this.highlightedElements.push(highlightSpan)

        lastIndex = match.index + match[0].length
        globalIndex++
      })

      // 添加剩余文本
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)))
      }

      // 替换原文本节点
      textNode.parentNode.replaceChild(fragment, textNode)
    })
  }

  /**
   * 清除高亮（仅清除 DOM 高亮，保留搜索状态）
   */
  clearHighlightsDOM() {
    // 移除所有高亮元素的 active 类
    this.highlightedElements.forEach((el) => {
      el.classList.remove('active')
    })

    // 查找所有高亮元素
    const highlights = Array.from(document.querySelectorAll('.search-highlight'))

    // 从后往前替换，避免影响前面的元素
    for (let i = highlights.length - 1; i >= 0; i--) {
      const highlight = highlights[i]

      // 跳过搜索框内的高亮
      if (highlight.closest('.search-highlight-box')) {
        continue
      }

      // 跳过没有父节点的元素
      if (!highlight.parentNode) {
        continue
      }

      const text = highlight.textContent
      const textNode = document.createTextNode(text)
      highlight.parentNode.replaceChild(textNode, highlight)
    }

    // 合并相邻的文本节点，确保 DOM 结构一致
    document.normalize()

    // 只清除 DOM 引用，不清除搜索状态
    this.highlightedElements = []
  }

  /**
   * 清除高亮（清除 DOM 高亮和所有搜索状态）
   */
  clearHighlights() {
    this.clearHighlightsDOM()
    // 重置完整状态
    this.searchResults = []
    this.currentMatchIndex = -1
    this.currentQuery = ''
  }

  /**
   * 导航到下一个匹配
   */
  navigateToNext() {
    if (this.searchResults.length === 0) {
      return
    }

    this.currentMatchIndex = (this.currentMatchIndex + 1) % this.searchResults.length
    this.updateActiveHighlight()
    this.scrollToMatch()
    this.updateCount()
  }

  /**
   * 导航到上一个匹配
   */
  navigateToPrevious() {
    if (this.searchResults.length === 0) {
      return
    }

    this.currentMatchIndex = (this.currentMatchIndex - 1 + this.searchResults.length) % this.searchResults.length
    this.updateActiveHighlight()
    this.scrollToMatch()
    this.updateCount()
  }

  /**
   * 滚动到当前匹配项
   */
  scrollToMatch() {
    if (this.currentMatchIndex < 0 || this.currentMatchIndex >= this.searchResults.length) {
      return
    }

    const match = this.searchResults[this.currentMatchIndex]
    if (!match || !match.element) {
      return
    }

    // 使用 smooth 滚动行为
    match.element.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }

  /**
   * 更新活动高亮状态
   */
  updateActiveHighlight() {
    // 移除所有高亮元素的 active 类
    this.highlightedElements.forEach((el) => {
      el.classList.remove('active')
    })

    // 添加 active 类到当前匹配
    if (this.currentMatchIndex >= 0 && this.currentMatchIndex < this.searchResults.length) {
      const currentMatch = this.searchResults[this.currentMatchIndex]
      if (currentMatch && currentMatch.element) {
        currentMatch.element.classList.add('active')
      }
    }
  }

  /**
   * 更新计数显示
   */
  updateCount() {
    if (this.searchResults.length === 0) {
      this.countSpan.textContent = '0/0'
      return
    }

    this.countSpan.textContent = `${this.currentMatchIndex + 1}/${this.searchResults.length}`
  }

  /**
   * 销毁搜索功能
   */
  destroy() {
    // 清除防抖定时器
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer)
      this.searchDebounceTimer = null
    }

    // 移除全局事件监听器
    if (this.globalKeydownHandler) {
      document.removeEventListener('keydown', this.globalKeydownHandler)
      this.globalKeydownHandler = null
    }

    // 清除高亮
    this.clearHighlights()

    // 移除搜索框
    if (this.searchBox && this.searchBox.parentNode) {
      this.searchBox.parentNode.removeChild(this.searchBox)
    }

    // 重置状态
    this.searchBox = null
    this.searchInput = null
    this.prevButton = null
    this.nextButton = null
    this.closeButton = null
    this.countSpan = null
    this.isVisible = false
  }
}

// 导出给外部使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SearchHighlightManager }
}
else {
  window.SearchHighlightManager = SearchHighlightManager
}
