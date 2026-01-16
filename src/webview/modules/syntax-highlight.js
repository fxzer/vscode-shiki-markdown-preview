// 语法高亮相关功能

/**
 * 应用语法高亮 - 主入口函数
 */
function applySyntaxHighlighting() {
  const codeBlocks = document.querySelectorAll('pre code')

  codeBlocks.forEach((codeElement) => {
    const preElement = codeElement.parentElement
    if (!codeElement || !preElement) {
      return
    }

    // 检查是否已经包裹了 wrapper
    let wrapper = preElement.parentElement
    if (!wrapper || !wrapper.classList.contains('code-block-wrapper')) {
      wrapper = document.createElement('div')
      wrapper.className = 'code-block-wrapper'
      wrapper.style.position = 'relative'

      // 插入 wrapper 并移动 preElement
      preElement.parentNode.insertBefore(wrapper, preElement)
      wrapper.appendChild(preElement)
    }

    addCopyButton(wrapper, codeElement)
    addLanguageDisplay(wrapper, codeElement)
  })
}

/**
 * 添加复制按钮
 */
function addCopyButton(wrapper, codeElement) {
  if (wrapper.querySelector('.copy-button')) {
    return
  }

  const button = document.createElement('button')
  button.className = 'copy-button'
  button.title = 'Copy code'

  // 复制图标SVG
  const copyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M15 20H5V7c0-.55-.45-1-1-1s-1 .45-1 1v13c0 1.1.9 2 2 2h10c.55 0 1-.45 1-1s-.45-1-1-1m5-4V4c0-1.1-.9-2-2-2H9c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h9c1.1 0 2-.9 2-2m-2 0H9V4h9z"/></svg>`

  // 已复制图标SVG
  const copiedIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M5 19V5v11.35v-2.125zm0 2q-.825 0-1.412-.587T3 19V5q0-.825.588-1.412T5 3h14q.825 0 1.413.588T21 5v8h-2V5H5v14h7v2zm12.35 1l-3.55-3.55l1.425-1.4l2.125 2.125l4.25-4.25L23 16.35zM8 13q.425 0 .713-.288T9 12t-.288-.712T8 11t-.712.288T7 12t.288.713T8 13m0-4q.425 0 .713-.288T9 8t-.288-.712T8 7t-.712.288T7 8t.288.713T8 9m3 4h6v-2h-6zm0-4h6V7h-6z"/></svg>`
  button.innerHTML = copyIcon
  button.addEventListener('click', async () => {
    const code = codeElement ? codeElement.textContent || '' : ''
    try {
      await navigator.clipboard.writeText(code)
      // 切换到已复制状态
      button.innerHTML = copiedIcon
      button.classList.add('copied')
      setTimeout(() => {
        // 恢复原始状态
        button.innerHTML = copyIcon
        button.classList.remove('copied')
      }, 2000)
    }
    catch (err) {
      console.error('Failed to copy text: ', err)
      // 失败状态
      button.innerHTML = copyIcon
      button.classList.add('failed')
      setTimeout(() => {
        // 恢复原始状态
        button.innerHTML = copyIcon
        button.classList.remove('failed')
      }, 2000)
    }
  })

  // preElement 不需要 relative，wrapper 已经有了
  wrapper.appendChild(button)
}

/**
 * 添加语言显示
 */
function addLanguageDisplay(wrapper, codeElement) {
  if (wrapper.querySelector('.lang')) {
    return
  }

  if (!codeElement) {
    return
  }

  const language = codeElement.getAttribute('data-lang') || ''

  // 如果找到了语言信息，创建语言显示元素
  if (language && language.trim()) {
    const langElement = document.createElement('span')
    langElement.className = 'lang'
    langElement.textContent = language.trim().toLowerCase()
    wrapper.appendChild(langElement)
  }
}

// 导出给外部使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { applySyntaxHighlighting }
}
else {
  window.applySyntaxHighlighting = applySyntaxHighlighting
}
