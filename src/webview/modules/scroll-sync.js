/**
 * 基于 Intersection Observer 的滚动同步管理器
 * 核心优势：
 * - 零 DOM 遍历，性能极佳
 * - 浏览器原生优化，不会触发强制同步布局
 * - 直接使用行号同步，精确且高效
 * - 代码简洁，易于维护
 */
class IntersectionBasedScrollSync {
  constructor() {
    // 跟踪当前可见的元素及其行号
    this.visibleElements = new Map()
    this.currentTopLine = 0
    
    // 状态管理
    this.isSyncing = false
    this.syncSource = null
    this.isEnabled = true
    
    // 性能优化参数
    this.SYNC_BLOCK_MS = 30 // 同步阻塞时间
    this.SCROLL_DEBOUNCE_MS = 16 // 滚动防抖时间（约60fps）
    
    // 定时器
    this.syncTimeout = null
    this.scrollTimeout = null
    
    this.init()
  }

  init() {
    // 配置 Intersection Observer
    // rootMargin 用于忽略顶部和底部 10% 的区域，只关注主要可见内容
    this.observer = new IntersectionObserver(
      this.handleIntersection.bind(this),
      {
        threshold: [0, 0.25, 0.5, 0.75, 1.0], // 多个阈值，更精确地跟踪可见性
        rootMargin: '-10% 0px -10% 0px' // 忽略边缘元素，关注核心内容
      }
    )
    
    // 等待 DOM 加载完成后观察元素
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.observeElements())
    } else {
      this.observeElements()
    }
    
    // 监听用户滚动 - 使用 passive 提升性能
    window.addEventListener('scroll', this.handleScroll.bind(this), { passive: true })
    
    // 监听来自扩展的消息
    window.addEventListener('message', this.handleMessage.bind(this))
  }

  /**
   * 观察所有带 data-line 的元素
   */
  observeElements() {
    const elements = document.querySelectorAll('[data-line]')
    if (elements.length === 0) {
      console.warn('[ScrollSync] 未找到带 data-line 属性的元素')
      return
    }
    
    elements.forEach(el => this.observer.observe(el))
    console.log(`[ScrollSync] 开始观察 ${elements.length} 个元素`)
  }

  /**
   * 处理 Intersection Observer 回调
   * 自动更新可见元素映射
   */
  handleIntersection(entries) {
    entries.forEach(entry => {
      const lineNumber = parseInt(entry.target.dataset.line)
      
      if (entry.isIntersecting) {
        // 元素进入视口
        this.visibleElements.set(lineNumber, {
          element: entry.target,
          ratio: entry.intersectionRatio,
          top: entry.boundingClientRect.top,
          bottom: entry.boundingClientRect.bottom
        })
      } else {
        // 元素离开视口
        this.visibleElements.delete(lineNumber)
      }
    })
  }

  /**
   * 处理用户滚动事件
   */
  handleScroll() {
    if (!this.isEnabled) return
    
    // 如果是编辑器触发的同步，忽略
    if (this.isSyncing && this.syncSource === 'editor') {
      return
    }
    
    // 使用 requestAnimationFrame 代替 setTimeout，性能更好
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout)
    }
    
    // 立即同步一次，然后使用防抖处理后续滚动
    if (!this.scrollTimeout) {
      this.syncScrollToEditor()
    }
    
    this.scrollTimeout = setTimeout(() => {
      this.scrollTimeout = null
      this.syncScrollToEditor()
    }, this.SCROLL_DEBOUNCE_MS)
  }

  /**
   * 同步滚动位置到编辑器
   */
  syncScrollToEditor() {
    const topLine = this.getTopVisibleLine()
    
    if (topLine !== null && topLine !== this.currentTopLine) {
      this.currentTopLine = topLine
      console.log(`[ScrollSync] 预览滚动到行 ${topLine}`)
      this.sendScrollMessage(topLine)
    }
  }

  /**
   * 获取最顶部的可见行号
   * 返回当前视口顶部最接近的元素行号
   */
  getTopVisibleLine() {
    if (this.visibleElements.size === 0) return null
    
    let topLine = null
    let minTop = Infinity
    
    // 找到距离视口顶部最近的元素
    for (const [lineNumber, info] of this.visibleElements) {
      // 只考虑在视口上半部分的元素
      if (info.top >= 0 && info.top < minTop) {
        minTop = info.top
        topLine = lineNumber
      }
    }
    
    return topLine
  }

  /**
   * 发送滚动消息到编辑器
   */
  sendScrollMessage(line) {
    this.isSyncing = true
    this.syncSource = 'preview'
    
    const startTime = performance.now()
    
    if (window.vscode && window.vscode.postMessage) {
      window.vscode.postMessage({
        command: 'previewScrolledToLine',
        line: line
      })
      console.log(`[ScrollSync] 发送消息耗时: ${(performance.now() - startTime).toFixed(2)}ms`)
    } else {
      console.error('[ScrollSync] vscode API 不可用')
    }
    
    // 设置状态释放定时器
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout)
    }
    
    this.syncTimeout = setTimeout(() => {
      this.isSyncing = false
      this.syncSource = null
    }, this.SYNC_BLOCK_MS)
  }

  /**
   * 处理来自扩展的消息
   */
  handleMessage(event) {
    const message = event.data
    
    switch (message.command) {
      case 'syncScrollToLine':
        this.scrollToLine(message.line)
        break
      case 'updateScrollSyncState':
        if (message.enabled) {
          this.enable()
        } else {
          this.disable()
        }
        break
      case 'updateContent':
        // 内容更新时重新观察元素
        this.reobserveElements()
        break
    }
  }

  /**
   * 滚动到指定行号
   */
  scrollToLine(line) {
    if (!this.isEnabled) return
    
    // 如果是预览触发的同步，忽略
    if (this.isSyncing && this.syncSource === 'preview') {
      return
    }
    
    const element = document.querySelector(`[data-line="${line}"]`)
    if (!element) {
      console.warn(`[ScrollSync] 未找到行号 ${line} 对应的元素`)
      return
    }
    
    this.isSyncing = true
    this.syncSource = 'editor'
    this.currentTopLine = line
    
    // 使用 scrollIntoView 滚动到元素
    // behavior: instant 避免动画延迟
    element.scrollIntoView({
      behavior: 'instant',
      block: 'start'
    })
    
    // 设置状态释放定时器
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout)
    }
    
    this.syncTimeout = setTimeout(() => {
      this.isSyncing = false
      this.syncSource = null
    }, this.SYNC_BLOCK_MS)
  }

  /**
   * 重新观察元素（内容更新时）
   */
  reobserveElements() {
    // 断开旧的观察
    this.observer.disconnect()
    this.visibleElements.clear()
    
    // 稍微延迟后重新观察，等待 DOM 更新完成
    setTimeout(() => {
      this.observeElements()
    }, 100)
  }

  /**
   * 启用滚动同步
   */
  enable() {
    this.isEnabled = true
    console.log('[ScrollSync] 已启用')
  }

  /**
   * 禁用滚动同步
   */
  disable() {
    this.isEnabled = false
    this.isSyncing = false
    this.syncSource = null
    
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout)
      this.syncTimeout = null
    }
    
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout)
      this.scrollTimeout = null
    }
    
    console.log('[ScrollSync] 已禁用')
  }

  /**
   * 清理资源
   */
  destroy() {
    // 断开观察器
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
    
    // 清除定时器
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout)
      this.syncTimeout = null
    }
    
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout)
      this.scrollTimeout = null
    }
    
    // 清空映射
    this.visibleElements.clear()
    
    // 重置状态
    this.isEnabled = false
    this.isSyncing = false
    this.syncSource = null
    
    console.log('[ScrollSync] 资源清理完成')
  }
}

// 导出给外部使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { IntersectionBasedScrollSync }
} else {
  window.ScrollSyncManager = IntersectionBasedScrollSync
}
