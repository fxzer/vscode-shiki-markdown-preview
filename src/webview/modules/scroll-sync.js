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
    this.SYNC_BLOCK_MS = 120 // 同步阻塞时间，覆盖 webview 滚动事件的延迟回声
    this.SCROLL_DEBOUNCE_MS = 16 // 滚动防抖时间（约60fps）

    // 定时器
    this.syncTimeout = null
    this.scrollTimeout = null

    // 调试计数器
    this.debugCounter = 0
    this.debugSequence = 0
    this.debugSessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    this.debugEnabled = Boolean(window.scrollSyncDebug)
    this.lastScrollTop = window.pageYOffset || document.documentElement.scrollTop || 0
    this.lastSentLine = null
    this.lastCalculatedLine = null
    this.lastIntersectionAt = null
    this.scrollStopTimeout = null

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

    console.log('[Webview ScrollSync] 初始化完成，配置参数:', {
      SYNC_BLOCK_MS: this.SYNC_BLOCK_MS,
      SCROLL_DEBOUNCE_MS: this.SCROLL_DEBOUNCE_MS,
    })
    this.postDebugLog('manager-init', {
      contentHeight: document.documentElement.scrollHeight,
      viewportHeight: document.documentElement.clientHeight,
      initialScrollTop: window.pageYOffset || document.documentElement.scrollTop || 0,
      userAgent: navigator.userAgent,
    })
  }

  isDebugEnabled() {
    return Boolean(this.debugEnabled || window.scrollSyncDebug)
  }

  setDebugEnabled(enabled) {
    this.debugEnabled = Boolean(enabled)
    window.scrollSyncDebug = this.debugEnabled
    this.postDebugLog('debug-state-updated', { enabled: this.debugEnabled })
  }

  getScrollSnapshot() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0
    const scrollHeight = document.documentElement.scrollHeight || 0
    const clientHeight = document.documentElement.clientHeight || 0
    const maxScrollTop = Math.max(0, scrollHeight - clientHeight)

    return {
      scrollTop,
      scrollHeight,
      clientHeight,
      maxScrollTop,
      scrollPercent: maxScrollTop > 0 ? Number((scrollTop / maxScrollTop).toFixed(4)) : 0,
    }
  }

  getVisibleSnapshot(limit = 8) {
    return Array.from(this.visibleElements.entries())
      .map(([lineNumber, info]) => {
        const rect = info.element.getBoundingClientRect()
        return {
          lineNumber,
          ratio: Number(info.ratio.toFixed(3)),
          storedTop: Number(info.top.toFixed(2)),
          actualTop: Number(rect.top.toFixed(2)),
          actualBottom: Number(rect.bottom.toFixed(2)),
          topDrift: Number((rect.top - info.top).toFixed(2)),
          tagName: info.element.tagName,
          text: (info.element.textContent || '').trim().slice(0, 60),
        }
      })
      .sort((a, b) => a.actualTop - b.actualTop)
      .slice(0, limit)
  }

  postDebugLog(event, payload = {}) {
    if (!this.isDebugEnabled()) {
      return
    }

    const entry = {
      ts: new Date().toISOString(),
      t: Date.now(),
      perf: Number(performance.now().toFixed(2)),
      seq: ++this.debugSequence,
      side: 'webview',
      session: this.debugSessionId,
      event,
      state: {
        isEnabled: this.isEnabled,
        isSyncing: this.isSyncing,
        syncSource: this.syncSource,
        currentTopLine: this.currentTopLine,
        lastSentLine: this.lastSentLine,
        lastCalculatedLine: this.lastCalculatedLine,
        visibleCount: this.visibleElements.size,
        scroll: this.getScrollSnapshot(),
      },
      ...payload,
    }

    if (window.vscode && window.vscode.postMessage) {
      window.vscode.postMessage({
        command: 'scrollSyncDebugLog',
        payload: entry,
      })
    }
  }

  /**
   * 观察所有带 data-line 的元素
   */
  observeElements() {
    const elements = document.querySelectorAll('[data-line]')
    console.log(`[Webview ScrollSync] 开始观察元素，找到 ${elements.length} 个带 data-line 的元素`)
    this.postDebugLog('observe-elements-start', {
      elementCount: elements.length,
      firstLines: Array.from(elements)
        .slice(0, 10)
        .map(el => ({
          line: el.dataset.line,
          tagName: el.tagName,
          text: (el.textContent || '').trim().slice(0, 60),
        })),
      scroll: this.getScrollSnapshot(),
    })

    if (elements.length === 0) {
      console.warn('[Webview ScrollSync] 未找到带 data-line 属性的元素')
      this.postDebugLog('observe-elements-empty')
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
    this.lastIntersectionAt = performance.now()
    const changedEntries = []

    entries.forEach((entry) => {
      const lineNumber = Number.parseInt(entry.target.dataset.line)
      changedEntries.push({
        lineNumber,
        isIntersecting: entry.isIntersecting,
        ratio: Number(entry.intersectionRatio.toFixed(3)),
        entryTop: Number(entry.boundingClientRect.top.toFixed(2)),
        actualTop: Number(entry.target.getBoundingClientRect().top.toFixed(2)),
      })

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
    this.postDebugLog('intersection-change', {
      changedEntries,
      visibleSnapshot: this.getVisibleSnapshot(10),
      scroll: this.getScrollSnapshot(),
    })
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
    const scrollDelta = scrollTop - this.lastScrollTop
    const scrollDirection = scrollDelta > 0 ? 'down' : scrollDelta < 0 ? 'up' : 'still'
    const scrollSnapshot = this.getScrollSnapshot()
    this.lastScrollTop = scrollTop
    this.postDebugLog('preview-scroll-event', {
      scrollDelta,
      scrollDirection,
      scrollHeight,
      clientHeight,
      scroll: scrollSnapshot,
      visibleSnapshot: this.getVisibleSnapshot(8),
      msSinceLastIntersection: this.lastIntersectionAt === null
        ? null
        : Number((performance.now() - this.lastIntersectionAt).toFixed(2)),
    })

    if (this.scrollStopTimeout) {
      clearTimeout(this.scrollStopTimeout)
    }
    this.scrollStopTimeout = setTimeout(() => {
      this.postDebugLog('preview-scroll-settled', {
        scroll: this.getScrollSnapshot(),
        calculatedTopLine: this.lastCalculatedLine,
        currentTopLine: this.currentTopLine,
        visibleSnapshot: this.getVisibleSnapshot(12),
      })
    }, 120)

    if (!this.isEnabled) {
      console.log(`${logPrefix} 滚动事件被忽略: 滚动同步未启用`)
      this.postDebugLog('preview-scroll-ignored', {
        reason: 'sync-disabled',
        scroll: scrollSnapshot,
      })
      return
    }

    // 如果是编辑器触发的同步，忽略
    if (this.isSyncing && this.syncSource === 'editor') {
      console.log(`${logPrefix} 滚动事件被忽略: 正在同步中 (source=editor), 滚动位置=${scrollTop}`)
      this.postDebugLog('preview-scroll-ignored', {
        reason: 'lock-from-editor',
        scroll: scrollSnapshot,
        visibleSnapshot: this.getVisibleSnapshot(8),
      })
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
    this.postDebugLog('sync-to-editor-calculated', {
      calculatedTopLine: topLine,
      currentTopLine: this.currentTopLine,
      previousSentLine: this.lastSentLine,
      lineDeltaFromPreviousSent: topLine !== null && this.lastSentLine !== null ? topLine - this.lastSentLine : null,
      visibleSnapshot: this.getVisibleSnapshot(12),
    })

    if (topLine !== null && topLine !== this.currentTopLine) {
      this.currentTopLine = topLine
      this.sendScrollMessage(topLine)
    }
    else {
      console.log(`[Webview ScrollSync] 跳过同步: topLine=${topLine}, 理由: ${topLine === null ? '未找到可见元素' : '行号未变化'}`)
      this.postDebugLog('sync-to-editor-skipped', {
        reason: topLine === null ? 'no-visible-element' : 'line-unchanged',
        calculatedTopLine: topLine,
        currentTopLine: this.currentTopLine,
      })
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
    let firstVisibleLine = null
    let firstVisibleTop = Infinity
    let coveringTopLine = null
    let coveringTopBottom = -Infinity
    const clientHeight = document.documentElement.clientHeight

    // IntersectionObserver 给的位置可能是旧的，这里必须重新读取真实位置。
    for (const [lineNumber, info] of this.visibleElements) {
      console.log(`[Webview ScrollSync] 检查行 ${lineNumber}: top=${info.top.toFixed(2)}, ratio=${(info.ratio * 100).toFixed(1)}%`)

      if (info.top >= 0 && info.top < minTop) {
        minTop = info.top
        topLine = lineNumber
        console.log(`[Webview ScrollSync] 更新顶部行: ${lineNumber} (top=${info.top.toFixed(2)})`)
      }

      const rect = info.element.getBoundingClientRect()
      const actualTop = rect.top
      const actualBottom = rect.bottom
      info.top = actualTop
      info.bottom = actualBottom

      if (actualBottom <= 0 || actualTop >= clientHeight) {
        continue
      }

      if (actualTop >= 0 && actualTop < firstVisibleTop) {
        firstVisibleTop = actualTop
        firstVisibleLine = lineNumber
      }
      else if (actualTop < 0 && actualBottom > coveringTopBottom) {
        coveringTopBottom = actualBottom
        coveringTopLine = lineNumber
      }
    }

    const selectedLine = firstVisibleLine ?? coveringTopLine ?? topLine
    console.log(`[Webview ScrollSync] 最终返回顶部行: ${selectedLine}, 实时位置=${firstVisibleTop.toFixed(2)}, 旧位置行=${topLine}, 旧位置=${minTop.toFixed(2)}`)
    this.lastCalculatedLine = selectedLine
    this.postDebugLog('top-visible-line-calculated', {
      selectedByStoredTop: topLine,
      storedMinTop: Number(minTop.toFixed(2)),
      selectedByActualTop: firstVisibleLine,
      actualMinTop: Number(firstVisibleTop.toFixed(2)),
      selectedCoveringTop: coveringTopLine,
      selectedLine,
      selectedMismatch: topLine !== selectedLine,
      visibleSnapshot: this.getVisibleSnapshot(12),
    })
    return selectedLine
  }

  /**
   * 发送滚动消息到编辑器
   */
  sendScrollMessage(line) {
    console.log(`[Webview ScrollSync] 发送滚动消息到编辑器: 行号=${line}, 当前状态: isSyncing=${this.isSyncing}, source=${this.syncSource}`)
    this.postDebugLog('send-preview-line-to-extension-start', {
      line,
      previousSentLine: this.lastSentLine,
      lineDeltaFromPreviousSent: this.lastSentLine !== null ? line - this.lastSentLine : null,
      scroll: this.getScrollSnapshot(),
      visibleSnapshot: this.getVisibleSnapshot(12),
    })

    this.isSyncing = true
    this.syncSource = 'preview'
    this.lastSentLine = line

    if (window.vscode && window.vscode.postMessage) {
      window.vscode.postMessage({
        command: 'previewScrolledToLine',
        line,
      })
      console.log(`[Webview ScrollSync] 消息已发送: command='previewScrolledToLine', line=${line}`)
      this.postDebugLog('send-preview-line-to-extension-done', {
        line,
      })
    }
    else {
      console.error('[Webview ScrollSync] vscode API 不可用，无法发送消息')
      this.postDebugLog('send-preview-line-to-extension-failed', {
        line,
        reason: 'vscode-api-missing',
      })
    }

    // 设置状态释放定时器
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout)
    }

    this.syncTimeout = setTimeout(() => {
      console.log(`[Webview ScrollSync] 同步状态释放: ${this.SYNC_BLOCK_MS}ms 后释放预览锁`)
      this.postDebugLog('sync-lock-release', {
        releasedSource: 'preview',
        delay: this.SYNC_BLOCK_MS,
        line,
        scroll: this.getScrollSnapshot(),
      })
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
    this.postDebugLog('extension-message-received', {
      command: message.command,
      line: message.line ?? null,
      enabled: message.enabled ?? null,
    })

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
      case 'updateScrollSyncDebugState':
        this.setDebugEnabled(message.enabled)
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
  schedulePreviewPositionProbes(line, reason) {
    if (!this.isDebugEnabled()) {
      return
    }

    for (const delay of [0, 16, 50, 120, 250]) {
      setTimeout(() => {
        this.postDebugLog('preview-position-probe', {
          reason,
          delay,
          targetLine: line,
          scroll: this.getScrollSnapshot(),
          calculatedTopLine: this.lastCalculatedLine,
          currentTopLine: this.currentTopLine,
          visibleSnapshot: this.getVisibleSnapshot(12),
        })
      }, delay)
    }
  }

  findLineElement(line) {
    const exactElement = document.querySelector(`[data-line="${line}"]`)
    if (exactElement) {
      return { element: exactElement, line, exact: true }
    }

    let previous = null
    let next = null
    document.querySelectorAll('[data-line]').forEach((element) => {
      const elementLine = Number.parseInt(element.dataset.line, 10)
      if (Number.isNaN(elementLine)) {
        return
      }

      if (elementLine <= line && (!previous || elementLine > previous.line)) {
        previous = { element, line: elementLine, exact: false }
      }
      if (elementLine > line && (!next || elementLine < next.line)) {
        next = { element, line: elementLine, exact: false }
      }
    })

    return previous ?? next
  }

  scrollToLine(line) {
    const startTime = Date.now()
    console.log(`[Webview ScrollSync] 滚动到指定行: 行号=${line}, 当前状态: isSyncing=${this.isSyncing}, source=${this.syncSource}, currentTopLine=${this.currentTopLine}`)
    const beforeScroll = this.getScrollSnapshot()
    this.postDebugLog('sync-to-preview-request', {
      requestedLine: line,
      beforeScroll,
      visibleSnapshot: this.getVisibleSnapshot(12),
    })

    if (!this.isEnabled) {
      console.log('[Webview ScrollSync] 滚动被忽略: 滚动同步未启用')
      this.postDebugLog('sync-to-preview-ignored', {
        reason: 'sync-disabled',
        requestedLine: line,
      })
      return
    }

    // 如果是预览触发的同步，忽略
    if (this.isSyncing && this.syncSource === 'preview') {
      console.log(`[Webview ScrollSync] 滚动被忽略: 正在同步中 (source=preview)`)
      this.postDebugLog('sync-to-preview-ignored', {
        reason: 'lock-from-preview',
        requestedLine: line,
        beforeScroll,
      })
      return
    }

    const target = this.findLineElement(line)
    if (!target) {
      console.warn(`[Webview ScrollSync] 未找到行号 ${line} 对应的元素，可能元素已被移除或未正确标记`)
      this.postDebugLog('sync-to-preview-ignored', {
        reason: 'target-element-missing',
        requestedLine: line,
      })
      return
    }

    const element = target.element
    const rect = element.getBoundingClientRect()
    console.log(`[Webview ScrollSync] 找到元素: 请求行号=${line}, 命中行号=${target.line}, exact=${target.exact}, 位置=${rect.top.toFixed(2)}`)
    this.postDebugLog('sync-to-preview-target-found', {
      requestedLine: line,
      targetLine: target.line,
      exact: target.exact,
      targetRect: {
        top: Number(rect.top.toFixed(2)),
        bottom: Number(rect.bottom.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
      },
      beforeScroll,
    })

    this.isSyncing = true
    this.syncSource = 'editor'
    this.currentTopLine = target.line

    // 使用 scrollIntoView 滚动到元素
    // behavior: instant 避免动画延迟
    element.scrollIntoView({
      behavior: 'instant',
      block: 'start',
    })

    const elapsed = Date.now() - startTime
    console.log(`[Webview ScrollSync] 滚动完成: 行 ${line}, 耗时 ${elapsed}ms`)
    this.postDebugLog('sync-to-preview-scroll-into-view-called', {
      requestedLine: line,
      targetLine: target.line,
      exact: target.exact,
      elapsed,
      beforeScroll,
      afterScroll: this.getScrollSnapshot(),
      visibleSnapshot: this.getVisibleSnapshot(12),
    })
    this.schedulePreviewPositionProbes(line, 'after-editor-sync')

    // 设置状态释放定时器
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout)
    }

    this.syncTimeout = setTimeout(() => {
      console.log(`[Webview ScrollSync] 同步状态释放: ${this.SYNC_BLOCK_MS}ms 后释放编辑器锁`)
      this.postDebugLog('sync-lock-release', {
        releasedSource: 'editor',
        delay: this.SYNC_BLOCK_MS,
        line,
        scroll: this.getScrollSnapshot(),
      })
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
    this.postDebugLog('reobserve-elements-start', {
      visibleCountBeforeClear: this.visibleElements.size,
      scroll: this.getScrollSnapshot(),
    })
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
    this.postDebugLog('manager-enabled')
  }

  /**
   * 禁用滚动同步
   */
  disable() {
    console.log('[Webview ScrollSync] 禁用滚动同步')
    this.postDebugLog('manager-disabled')
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

    if (this.scrollStopTimeout) {
      clearTimeout(this.scrollStopTimeout)
      this.scrollStopTimeout = null
    }
  }

  /**
   * 清理资源
   */
  destroy() {
    console.log('[Webview ScrollSync] 清理资源')
    this.postDebugLog('manager-destroy')
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

    if (this.scrollStopTimeout) {
      clearTimeout(this.scrollStopTimeout)
      this.scrollStopTimeout = null
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
