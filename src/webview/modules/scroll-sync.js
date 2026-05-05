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

    // 调试计数器
    this.debugCounter = 0

    console.log('[Webview ScrollSync] 初始化滚动同步管理器')
    this.init()
  }

  init() {
    console.log('[Webview ScrollSync] 开始初始化')

    // 配置 Intersection Observer
    // rootMargin 用于忽略顶部和底部 10% 的区域，只关注主要可见内容
    this.observer = new IntersectionObserver(
      this.handleIntersection.bind(this),
      {
        threshold: [0, 0.25, 0.5, 0.75, 1.0], // 多个阈值，更精确地跟踪可见性
        rootMargin: '-10% 0px -10% 0px', // 忽略边缘元素，关注核心内容
      },
    )
    console.log('[Webview ScrollSync] Intersection Observer 已配置')

    // 等待 DOM 加载完成后观察元素
    if (document.readyState === 'loading') {
      console.log('[Webview ScrollSync] DOM 尚未加载完成，等待 DOMContentLoaded')
      document.addEventListener('DOMContentLoaded', () =>
        this.observeElements())
    }
    else {
      this.observeElements()
    }

    // 监听用户滚动 - 使用 passive 提升性能
    window.addEventListener('scroll', this.handleScroll.bind(this), {
      passive: true,
    })
    console.log('[Webview ScrollSync] 滚动事件监听器已注册')

    // 监听来自扩展的消息
    window.addEventListener('message', this.handleMessage.bind(this))
    console.log('[Webview ScrollSync] 消息监听器已注册')

    console.log('[Webview ScrollSync] 初始化完成，配置参数:', {
      SYNC_BLOCK_MS: this.SYNC_BLOCK_MS,
      SCROLL_DEBOUNCE_MS: this.SCROLL_DEBOUNCE_MS,
    })
  }

  /**
   * 观察所有带 data-line 的元素
   */
  observeElements() {
    const elements = document.querySelectorAll('[data-line]')
    console.log(`[Webview ScrollSync] 开始观察元素，找到 ${elements.length} 个带 data-line 的元素`)

    if (elements.length === 0) {
      console.warn('[Webview ScrollSync] 未找到带 data-line 属性的元素')
      return
    }

    elements.forEach((el, index) => {
      this.observer.observe(el)
      if (index < 5) {
        console.log(`[Webview ScrollSync] 观察元素 ${index + 1}: data-line="${el.dataset.line}"`)
      }
    })

    if (elements.length > 5) {
      console.log(`[Webview ScrollSync] ... 以及其他 ${elements.length - 5} 个元素`)
    }
  }

  /**
   * 处理 Intersection Observer 回调
   * 自动更新可见元素映射
   */
  handleIntersection(entries) {
    this.debugCounter++
    const logPrefix = `[Webview ScrollSync#${this.debugCounter}]`

    entries.forEach((entry) => {
      const lineNumber = Number.parseInt(entry.target.dataset.line)

      if (entry.isIntersecting) {
        // 元素进入视口
        this.visibleElements.set(lineNumber, {
          element: entry.target,
          ratio: entry.intersectionRatio,
          top: entry.boundingClientRect.top,
          bottom: entry.boundingClientRect.bottom,
        })
        console.log(`${logPrefix} 元素进入视口: 行号=${lineNumber}, 可见比例=${(entry.intersectionRatio * 100).toFixed(1)}%`)
      }
      else {
        // 元素离开视口
        this.visibleElements.delete(lineNumber)
        console.log(`${logPrefix} 元素离开视口: 行号=${lineNumber}`)
      }
    })

    console.log(`${logPrefix} 当前可见元素数量: ${this.visibleElements.size}`)
  }

  /**
   * 处理用户滚动事件
   */
  handleScroll() {
    this.debugCounter++
    const logPrefix = `[Webview ScrollSync#${this.debugCounter}]`
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop
    const scrollHeight = document.documentElement.scrollHeight
    const clientHeight = document.documentElement.clientHeight

    if (!this.isEnabled) {
      console.log(`${logPrefix} 滚动事件被忽略: 滚动同步未启用`)
      return
    }

    // 如果是编辑器触发的同步，忽略
    if (this.isSyncing && this.syncSource === 'editor') {
      console.log(`${logPrefix} 滚动事件被忽略: 正在同步中 (source=editor), 滚动位置=${scrollTop}`)
      return
    }

    console.log(`${logPrefix} 用户滚动: 滚动位置=${scrollTop}, 可见元素数量=${this.visibleElements.size}, 当前顶部行=${this.currentTopLine}, isSyncing=${this.isSyncing}, source=${this.syncSource}`)

    // 使用 requestAnimationFrame 代替 setTimeout，性能更好
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout)
    }

    // 立即同步一次，然后使用防抖处理后续滚动
    if (!this.scrollTimeout) {
      console.log(`${logPrefix} 立即执行同步`)
      this.syncScrollToEditor()
    }

    this.scrollTimeout = setTimeout(() => {
      this.scrollTimeout = null
      console.log(`${logPrefix} 防抖后执行同步`)
      this.syncScrollToEditor()
    }, this.SCROLL_DEBOUNCE_MS)
  }

  /**
   * 同步滚动位置到编辑器
   */
  syncScrollToEditor() {
    const topLine = this.getTopVisibleLine()

    console.log(`[Webview ScrollSync] 尝试同步到编辑器: 计算顶部行=${topLine}, 当前顶部行=${this.currentTopLine}`)

    if (topLine !== null && topLine !== this.currentTopLine) {
      this.currentTopLine = topLine
      this.sendScrollMessage(topLine)
    }
    else {
      console.log(`[Webview ScrollSync] 跳过同步: topLine=${topLine}, 理由: ${topLine === null ? '未找到可见元素' : '行号未变化'}`)
    }
  }

  /**
   * 获取最顶部的可见行号
   * 返回当前视口顶部最接近的元素行号
   */
  getTopVisibleLine() {
    console.log(`[Webview ScrollSync] 获取顶部可见行号: 可见元素数量=${this.visibleElements.size}`)

    if (this.visibleElements.size === 0) {
      console.log('[Webview ScrollSync] 没有可见元素，返回 null')
      return null
    }

    let topLine = null
    let minTop = Infinity

    // 找到距离视口顶部最近的元素
    for (const [lineNumber, info] of this.visibleElements) {
      console.log(`[Webview ScrollSync] 检查行 ${lineNumber}: top=${info.top.toFixed(2)}, ratio=${(info.ratio * 100).toFixed(1)}%`)
      // 只考虑在视口上半部分的元素
      if (info.top >= 0 && info.top < minTop) {
        minTop = info.top
        topLine = lineNumber
        console.log(`[Webview ScrollSync] 更新顶部行: ${lineNumber} (top=${info.top.toFixed(2)})`)
      }
    }

    console.log(`[Webview ScrollSync] 最终返回顶部行: ${topLine}, minTop=${minTop.toFixed(2)}`)
    return topLine
  }

  /**
   * 发送滚动消息到编辑器
   */
  sendScrollMessage(line) {
    console.log(`[Webview ScrollSync] 发送滚动消息到编辑器: 行号=${line}, 当前状态: isSyncing=${this.isSyncing}, source=${this.syncSource}`)

    this.isSyncing = true
    this.syncSource = 'preview'

    if (window.vscode && window.vscode.postMessage) {
      window.vscode.postMessage({
        command: 'previewScrolledToLine',
        line,
      })
      console.log(`[Webview ScrollSync] 消息已发送: command='previewScrolledToLine', line=${line}`)
    }
    else {
      console.error('[Webview ScrollSync] vscode API 不可用，无法发送消息')
    }

    // 设置状态释放定时器
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout)
    }

    this.syncTimeout = setTimeout(() => {
      console.log(`[Webview ScrollSync] 同步状态释放: ${this.SYNC_BLOCK_MS}ms 后释放预览锁`)
      this.isSyncing = false
      this.syncSource = null
    }, this.SYNC_BLOCK_MS)
  }

  /**
   * 处理来自扩展的消息
   */
  handleMessage(event) {
    const message = event.data
    console.log(`[Webview ScrollSync] 收到扩展消息:`, message)

    switch (message.command) {
      case 'syncScrollToLine':
        console.log(`[Webview ScrollSync] 处理同步命令: 滚动到行 ${message.line}`)
        this.scrollToLine(message.line)
        break
      case 'updateScrollSyncState':
        console.log(`[Webview ScrollSync] 更新同步状态: enabled=${message.enabled}`)
        if (message.enabled) {
          this.enable()
        }
        else {
          this.disable()
        }
        break
      case 'updateContent':
        console.log(`[Webview ScrollSync] 内容更新，重新观察元素`)
        // 内容更新时重新观察元素
        this.reobserveElements()
        break
      default:
        console.log(`[Webview ScrollSync] 未知命令: ${message.command}`)
    }
  }

  /**
   * 滚动到指定行号
   */
  scrollToLine(line) {
    const startTime = Date.now()
    console.log(`[Webview ScrollSync] 滚动到指定行: 行号=${line}, 当前状态: isSyncing=${this.isSyncing}, source=${this.syncSource}, currentTopLine=${this.currentTopLine}`)

    if (!this.isEnabled) {
      console.log('[Webview ScrollSync] 滚动被忽略: 滚动同步未启用')
      return
    }

    // 如果是预览触发的同步，忽略
    if (this.isSyncing && this.syncSource === 'preview') {
      console.log(`[Webview ScrollSync] 滚动被忽略: 正在同步中 (source=preview)`)
      return
    }

    const element = document.querySelector(`[data-line="${line}"]`)
    if (!element) {
      console.warn(`[Webview ScrollSync] 未找到行号 ${line} 对应的元素，可能元素已被移除或未正确标记`)
      return
    }

    const rect = element.getBoundingClientRect()
    console.log(`[Webview ScrollSync] 找到元素: 行号=${line}, 位置=${rect.top.toFixed(2)}`)

    this.isSyncing = true
    this.syncSource = 'editor'
    this.currentTopLine = line

    // 使用 scrollIntoView 滚动到元素
    // behavior: instant 避免动画延迟
    element.scrollIntoView({
      behavior: 'instant',
      block: 'start',
    })

    const elapsed = Date.now() - startTime
    console.log(`[Webview ScrollSync] 滚动完成: 行 ${line}, 耗时 ${elapsed}ms`)

    // 设置状态释放定时器
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout)
    }

    this.syncTimeout = setTimeout(() => {
      console.log(`[Webview ScrollSync] 同步状态释放: ${this.SYNC_BLOCK_MS}ms 后释放编辑器锁`)
      this.isSyncing = false
      this.syncSource = null
    }, this.SYNC_BLOCK_MS)
  }

  /**
   * 重新观察元素（内容更新时）
   */
  reobserveElements() {
    console.log('[Webview ScrollSync] 重新观察元素（内容更新）')
    console.log('[Webview ScrollSync] 断开旧观察，清空可见元素映射')
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
    console.log('[Webview ScrollSync] 启用滚动同步')
    this.isEnabled = true
  }

  /**
   * 禁用滚动同步
   */
  disable() {
    console.log('[Webview ScrollSync] 禁用滚动同步')
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
  }

  /**
   * 清理资源
   */
  destroy() {
    console.log('[Webview ScrollSync] 清理资源')
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
  }
}

// 导出给外部使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { IntersectionBasedScrollSync }
}
else {
  window.ScrollSyncManager = IntersectionBasedScrollSync
}
