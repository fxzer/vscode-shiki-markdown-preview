// Notion风格的文档结构导航菜单
class NotionToc {
  constructor() {
    this.headers = []
    this.tocContainer = null
    this.currentActiveIndex = -1

    // 缓存DOM节点，避免重复查询
    this.lineBars = []
    this.tocItems = []

    this.observer = null
    this.isManualScrolling = false // 标志位：是否正在手动滚动

    this.init()
  }

  init() {
    try {
      this.createTocContainer()
      this.refresh() // 使用 refresh 作为统一的解析和渲染入口
      this.bindEvents()
      this.observeContentChanges()
    }
    catch (error) {
      console.error('Error in NotionToc init():', error)
    }
  }

  // 创建TOC容器
  createTocContainer() {
    this.tocContainer = document.createElement('div')
    this.tocContainer.className = 'notion-toc-container'
    this.tocContainer.innerHTML = `
      <div class="notion-toc-minimal">
        <div class="toc-lines"></div>
      </div>
      <div class="notion-toc-detailed-wrapper" style="display: none;">
        <div class="notion-toc-detailed">
          <div class="toc-items"></div>
        </div>
      </div>
    `

    document.body.appendChild(this.tocContainer)

    this.minimalView = this.tocContainer.querySelector('.notion-toc-minimal')
    this.detailedViewWrapper = this.tocContainer.querySelector('.notion-toc-detailed-wrapper')
    this.detailedView = this.tocContainer.querySelector('.notion-toc-detailed')
    this.linesContainer = this.tocContainer.querySelector('.toc-lines')
    this.itemsContainer = this.tocContainer.querySelector('.toc-items')
  }

  parseHeaders() {
    const content = document.getElementById('markdown-content')
    if (!content)
      return

    this.headers = []
    const headerElements = content.querySelectorAll('h1, h2, h3')

    headerElements.forEach((header, index) => {
      const id = header.id || `header-${index}`
      if (!header.id) {
        header.id = id
      }

      this.headers.push({
        element: header,
        id,
        level: Number.parseInt(header.tagName.charAt(1)),
        text: header.textContent.trim(),
        index, // 添加索引方便查找
      })
    })
  }

  // 渲染并缓存DOM节点
  renderToc() {
    if (!this.linesContainer || !this.itemsContainer)
      return

    // 清空内容和缓存
    this.linesContainer.innerHTML = ''
    this.itemsContainer.innerHTML = ''
    this.lineBars = []
    this.tocItems = []

    this.headers.forEach((header, index) => {
      // 渲染简约视图
      const line = document.createElement('div')
      line.className = 'toc-line'
      line.setAttribute('data-index', index)
      const lineBar = document.createElement('div')
      lineBar.className = 'toc-line-bar'
      const widthMap = { 1: 16, 2: 12, 3: 8 }
      lineBar.style.width = `${widthMap[header.level] || 8}px`
      line.appendChild(lineBar)
      this.linesContainer.appendChild(line)
      this.lineBars.push(lineBar) // 缓存节点

      // 渲染详细视图
      const item = document.createElement('div')
      const text = this.escapeHtml(header.text)
      item.className = 'toc-item'
      item.href = `#${header.id}`
      item.setAttribute('data-index', index)
      item.setAttribute('title', text)
      const indentMap = { 1: 0, 2: 16, 3: 32 }
      item.style.marginLeft = `${indentMap[header.level] || 0}px`
      item.innerHTML = `${text}`
      this.itemsContainer.appendChild(item)
      this.tocItems.push(item) // 缓存节点
    })

    this.updateActiveItem(this.currentActiveIndex)
  }

  bindEvents() {
    this.tocContainer.addEventListener('mouseenter', () => this.showDetailedView())
    this.tocContainer.addEventListener('mouseleave', () => this.hideDetailedView())

    // 详细视图的a标签会处理跳转，但为了平滑滚动，我们也需要处理
    this.itemsContainer.addEventListener('click', (e) => {
      const item = e.target.closest('.toc-item')
      if (item) {
        const index = Number.parseInt(item.getAttribute('data-index'))
        this.scrollToHeader(index)
      }
    })
  }

  showDetailedView() {
    this.minimalView.style.display = 'none'
    this.detailedViewWrapper.style.display = 'block'
  }

  hideDetailedView() {
    this.minimalView.style.display = 'block'
    this.detailedViewWrapper.style.display = 'none'
  }

  // 优化：独立的滚动到标题函数
  scrollToHeader(index) {
    if (index >= 0 && index < this.headers.length) {
      const header = this.headers[index]

      // 设置手动滚动标志
      this.isManualScrolling = true

      // 现代浏览器支持平滑滚动
      header.element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      this.updateActiveItem(index)

      // 滚动完成后重置标志
      setTimeout(() => {
        this.isManualScrolling = false
      }, 800)
    }
  }

  // 优化：使用IntersectionObserver来更新高亮
  setupIntersectionObserver() {
    if (this.observer) {
      this.observer.disconnect()
    }

    const options = {
      rootMargin: '0px 0px -80% 0px', // 视口顶部 0-20% 区域触发
      threshold: 0,
    }

    this.observer = new IntersectionObserver((entries) => {
      // 如果正在手动滚动，不更新高亮
      if (this.isManualScrolling) {
        return
      }

      // 找到所有当前在触发区域内的标题
      const visibleHeaders = entries
        .filter(entry => entry.isIntersecting)
        .map(entry => this.headers.find(h => h.element === entry.target))

      if (visibleHeaders.length > 0) {
        // 在所有可见的标题中，选择最靠前的一个
        const firstVisibleHeader = visibleHeaders.sort((a, b) => a.index - b.index)[0]
        this.updateActiveItem(firstVisibleHeader.index)
      }
    }, options)

    this.headers.forEach(header => this.observer.observe(header.element))
  }

  // 优化：更新活跃项，直接使用缓存的节点
  updateActiveItem(index) {
    if (this.currentActiveIndex === index)
      return

    // 移除旧的 active class
    if (this.currentActiveIndex !== -1) {
      if (this.lineBars[this.currentActiveIndex])
        this.lineBars[this.currentActiveIndex].classList.remove('active')
      if (this.tocItems[this.currentActiveIndex])
        this.tocItems[this.currentActiveIndex].classList.remove('active')
    }

    this.currentActiveIndex = index

    // 添加新的 active class
    if (index !== -1) {
      if (this.lineBars[index])
        this.lineBars[index].classList.add('active')
      if (this.tocItems[index])
        this.tocItems[index].classList.add('active')
    }
  }

  observeContentChanges() {
    const content = document.getElementById('markdown-content')
    if (!content)
      return

    const observer = new MutationObserver(() => {
      this.refresh()
    })

    observer.observe(content, { childList: true, subtree: true })
  }

  refresh() {
    this.parseHeaders()
    this.renderToc()
    this.setupIntersectionObserver() // 重新设置观察器
  }

  // HTML转义
  escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  destroy() {
    if (this.observer) {
      this.observer.disconnect()
    }
    if (this.tocContainer) {
      this.tocContainer.remove()
    }
  }
}

// 导出给外部使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NotionToc }
}
else {
  window.NotionToc = NotionToc
}
