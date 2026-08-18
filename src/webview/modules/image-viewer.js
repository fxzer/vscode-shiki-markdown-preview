// 大图查看器模块 - 支持点击图片弹窗遮罩查看大图、放大/缩小/旋转/还原尺寸4个控制按钮及百分比展示

let activeOverlay = null
let currentScale = 1
let currentRotation = 0
let translateX = 0
let translateY = 0
let isDragging = false
let dragStartX = 0
let dragStartY = 0
let startTranslateX = 0
let startTranslateY = 0

// SVG 图标定义
const ICONS = {
  zoomOut: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>',
  zoomIn: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>',
  rotate: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>',
  reset: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>',
  close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
}

/**
 * 确保遮罩层 DOM 已创建并挂载
 */
function getOrCreateOverlay() {
  if (activeOverlay) {
    return activeOverlay
  }

  let overlay = document.getElementById('image-viewer-overlay')
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = 'image-viewer-overlay'
    overlay.className = 'image-viewer-overlay'
    overlay.setAttribute('aria-hidden', 'true')
    overlay.innerHTML = `
      <div class="image-viewer-backdrop"></div>
      <button class="image-viewer-close-btn" type="button" title="关闭 (Esc)">
        ${ICONS.close}
      </button>
      <div class="image-viewer-viewport">
        <img class="image-viewer-img" src="" alt="" draggable="false" />
      </div>
      <div class="image-viewer-toolbar">
        <button class="image-viewer-btn zoom-out-btn" type="button" title="缩小 (- 或 滚轮向下)">
          ${ICONS.zoomOut}
        </button>
        <span class="image-viewer-percentage" title="当前缩放比（点击还原）">100%</span>
        <button class="image-viewer-btn zoom-in-btn" type="button" title="放大 (+ 或 滚轮向上)">
          ${ICONS.zoomIn}
        </button>
        <span class="image-viewer-divider"></span>
        <button class="image-viewer-btn rotate-btn" type="button" title="顺时针旋转90° (R)">
          ${ICONS.rotate}
        </button>
        <button class="image-viewer-btn reset-btn" type="button" title="还原尺寸 (Space 或 双击)">
          ${ICONS.reset}
        </button>
      </div>
    `
    document.body.appendChild(overlay)
    bindOverlayEvents(overlay)
  }

  activeOverlay = overlay
  return overlay
}

/**
 * 更新图片变换与百分比显示
 */
function updateTransform(withTransition = true) {
  if (!activeOverlay)
    return

  const img = activeOverlay.querySelector('.image-viewer-img')
  const percentageLabel = activeOverlay.querySelector('.image-viewer-percentage')

  if (img) {
    if (withTransition) {
      img.classList.remove('is-dragging')
    }
    else {
      img.classList.add('is-dragging')
    }
    img.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${currentScale}) rotate(${currentRotation}deg)`
  }

  if (percentageLabel) {
    percentageLabel.textContent = `${Math.round(currentScale * 100)}%`
  }
}

/**
 * 放大图片 (+25%)
 */
function zoomIn() {
  if (currentScale < 10) {
    currentScale = Math.min(10, Math.round((currentScale + 0.25) * 100) / 100)
    updateTransform(true)
  }
}

/**
 * 缩小图片 (-25%)
 */
function zoomOut() {
  if (currentScale > 0.1) {
    currentScale = Math.max(0.1, Math.round((currentScale - 0.25) * 100) / 100)
    updateTransform(true)
  }
}

/**
 * 顺时针旋转 90 度
 */
function rotate() {
  currentRotation = (currentRotation + 90) % 360
  updateTransform(true)
}

/**
 * 还原原始尺寸与位置
 */
function reset() {
  currentScale = 1
  currentRotation = 0
  translateX = 0
  translateY = 0
  updateTransform(true)
}

/**
 * 打开图片查看器
 */
function openImageViewer(src, alt = '') {
  if (!src)
    return

  const overlay = getOrCreateOverlay()
  const img = overlay.querySelector('.image-viewer-img')

  // 重置状态
  currentScale = 1
  currentRotation = 0
  translateX = 0
  translateY = 0
  isDragging = false

  img.src = src
  img.alt = alt
  updateTransform(false)

  overlay.classList.add('is-open')
  overlay.setAttribute('aria-hidden', 'false')
  document.body.classList.add('image-viewer-locked')

  // 绑定全局键盘监听
  window.addEventListener('keydown', handleKeydown)
}

/**
 * 关闭图片查看器
 */
function closeImageViewer() {
  if (!activeOverlay)
    return

  activeOverlay.classList.remove('is-open')
  activeOverlay.setAttribute('aria-hidden', 'true')
  document.body.classList.remove('image-viewer-locked')

  const img = activeOverlay.querySelector('.image-viewer-img')
  if (img) {
    img.src = ''
  }

  window.removeEventListener('keydown', handleKeydown)
}

/**
 * 键盘快捷键处理
 */
function handleKeydown(event) {
  if (!activeOverlay || !activeOverlay.classList.contains('is-open'))
    return

  switch (event.key) {
    case 'Escape':
      event.preventDefault()
      closeImageViewer()
      break
    case '+':
    case '=':
      event.preventDefault()
      zoomIn()
      break
    case '-':
    case '_':
      event.preventDefault()
      zoomOut()
      break
    case 'r':
    case 'R':
      event.preventDefault()
      rotate()
      break
    case ' ':
    case '0':
      event.preventDefault()
      reset()
      break
  }
}

/**
 * 绑定遮罩层及其子元素的所有交互事件
 */
function bindOverlayEvents(overlay) {
  const backdrop = overlay.querySelector('.image-viewer-backdrop')
  const closeBtn = overlay.querySelector('.image-viewer-close-btn')
  const viewport = overlay.querySelector('.image-viewer-viewport')
  const img = overlay.querySelector('.image-viewer-img')
  const zoomInBtn = overlay.querySelector('.zoom-in-btn')
  const zoomOutBtn = overlay.querySelector('.zoom-out-btn')
  const rotateBtn = overlay.querySelector('.rotate-btn')
  const resetBtn = overlay.querySelector('.reset-btn')
  const percentageLabel = overlay.querySelector('.image-viewer-percentage')

  // 关闭事件
  backdrop.addEventListener('click', closeImageViewer)
  closeBtn.addEventListener('click', closeImageViewer)

  // 4个按钮事件
  zoomInBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    zoomIn()
  })
  zoomOutBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    zoomOut()
  })
  rotateBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    rotate()
  })
  resetBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    reset()
  })
  percentageLabel.addEventListener('click', (e) => {
    e.stopPropagation()
    reset()
  })

  // 双击图片切换 100% / 200%
  img.addEventListener('dblclick', (e) => {
    e.stopPropagation()
    if (Math.abs(currentScale - 1) < 0.05) {
      currentScale = 2
    }
    else {
      currentScale = 1
      translateX = 0
      translateY = 0
    }
    updateTransform(true)
  })

  // 鼠标滚轮缩放
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault()
    if (e.deltaY < 0) {
      // 向上滚 -> 放大
      currentScale = Math.min(10, Math.round((currentScale + 0.15) * 100) / 100)
    }
    else {
      // 向下滚 -> 缩小
      currentScale = Math.max(0.1, Math.round((currentScale - 0.15) * 100) / 100)
    }
    updateTransform(true)
  }, { passive: false })

  // 鼠标拖拽平移
  viewport.addEventListener('mousedown', (e) => {
    // 仅响应鼠标左键
    if (e.button !== 0)
      return
    // 如果点击的是工具栏或关闭按钮，不触发拖拽
    if (e.target.closest('.image-viewer-toolbar') || e.target.closest('.image-viewer-close-btn')) {
      return
    }

    isDragging = true
    dragStartX = e.clientX
    dragStartY = e.clientY
    startTranslateX = translateX
    startTranslateY = translateY

    viewport.classList.add('is-panning')
    updateTransform(false)
    e.preventDefault()
  })

  window.addEventListener('mousemove', (e) => {
    if (!isDragging)
      return

    const deltaX = e.clientX - dragStartX
    const deltaY = e.clientY - dragStartY
    translateX = startTranslateX + deltaX
    translateY = startTranslateY + deltaY

    updateTransform(false)
  })

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false
      viewport.classList.remove('is-panning')
      updateTransform(true)
    }
  })
}

/**
 * 初始化文章内部图片的点击监听
 */
function initializeImageViewer() {
  const markdownContent = document.getElementById('markdown-content')
  if (!markdownContent) {
    return
  }

  // 使用事件委托，监听 markdown 内容区域内所有 img 标签的点击
  markdownContent.removeEventListener('click', handleImageClick)
  markdownContent.addEventListener('click', handleImageClick)
}

function handleImageClick(event) {
  const target = event.target
  if (target && target.tagName === 'IMG') {
    // 排除如果图片处于链接内且用户有意点击链接的情况（可允许打开，但通常点击图片就是看图）
    const link = target.closest('a')
    if (link) {
      // 如果外层有链接，优先预览大图，阻止跳转
      event.preventDefault()
      event.stopPropagation()
    }

    const src = target.getAttribute('src') || target.src
    const alt = target.getAttribute('alt') || ''
    if (src) {
      openImageViewer(src, alt)
    }
  }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initializeImageViewer,
    openImageViewer,
    closeImageViewer,
    zoomIn,
    zoomOut,
    rotate,
    reset,
  }
}
else {
  window.initializeImageViewer = initializeImageViewer
  window.openImageViewer = openImageViewer
  window.closeImageViewer = closeImageViewer
}
