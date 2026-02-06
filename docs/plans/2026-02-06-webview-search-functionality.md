# WebView 搜索功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 WebView 中实现 Command+F / Ctrl+F 搜索功能，包括搜索框显示、关键词高亮和导航功能。

**Architecture:** 在 WebView 内部实现纯前端搜索功能，使用 TextFinder API 或自定义搜索算法。搜索 UI 固定在页面右下角，支持快捷键触发和 ESC 关闭。通过 VSCode 主题变量适配明暗主题。

**Tech Stack:**

- Vanilla JavaScript（与现有 webview 模块一致）
- CSS Custom Properties（使用现有 VSCode 主题变量）
- TreeWalker API（用于文本节点遍历和高亮）

---

## 任务概览

1. 创建搜索模块 `search-highlight.js`
2. 创建搜索框样式 `search.css`
3. 在 HTML 模板中引入搜索模块
4. 在主模块中初始化搜索功能
5. 测试搜索功能

---

### Task 1: 创建搜索核心模块

**Files:**

- Create: `src/webview/modules/search-highlight.js`

**Step 1: 创建搜索模块文件**

```javascript
/**
 * 搜索高亮模块
 * 提供在 WebView 中搜索文本并高亮匹配项的功能
 */

/**
 * 搜索高亮管理器
 */
class SearchHighlightManager {
  constructor() {
    this.searchResults = []
    this.currentMatchIndex = -1
    this.currentQuery = ''
    this.highlightedElements = []
    this.searchBox = null
    this.searchInput = null
    this.prevButton = null
    this.nextButton = null
    this.countSpan = null
    this.isVisible = false
  }

  /**
   * 初始化搜索功能
   */
  initialize() {
    this.createSearchBox()
    this.bindEvents()
  }

  /**
   * 创建搜索框 UI
   */
  createSearchBox() {
    // 检查是否已存在
    if (document.getElementById('search-highlight-box')) {
      this.searchBox = document.getElementById('search-highlight-box')
      this.searchInput = this.searchBox?.querySelector('.search-input')
      this.prevButton = this.searchBox?.querySelector('.search-prev')
      this.nextButton = this.searchBox?.querySelector('.search-next')
      this.countSpan = this.searchBox?.querySelector('.search-count')
      return
    }

    // 创建搜索框容器
    this.searchBox = document.createElement('div')
    this.searchBox.id = 'search-highlight-box'
    this.searchBox.className = 'search-highlight-box'
    this.searchBox.innerHTML = `
      <div class="search-content">
        <input type="text" class="search-input" placeholder="Search..." autocomplete="off" />
        <div class="search-controls">
          <button class="search-prev" title="Previous match (Shift+Enter)" aria-label="Previous match">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.5 8L8 4.5v7L11.5 8z"/>
            </svg>
          </button>
          <button class="search-next" title="Next match (Enter)" aria-label="Next match">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.5 8L8 11.5v-7L4.5 8z"/>
            </svg>
          </button>
          <button class="search-close" title="Close (Escape)" aria-label="Close search">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </div>
      </div>
      <span class="search-count"></span>
    `

    document.body.appendChild(this.searchBox)

    // 获取元素引用
    this.searchInput = this.searchBox.querySelector('.search-input')
    this.prevButton = this.searchBox.querySelector('.search-prev')
    this.nextButton = this.searchBox.querySelector('.search-next')
    this.closeButton = this.searchBox.querySelector('.search-close')
    this.countSpan = this.searchBox.querySelector('.search-count')
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 搜索输入事件（防抖）
    let searchTimeout = null
    this.searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout)
      searchTimeout = setTimeout(() => {
        this.performSearch()
      }, 300)
    })

    // 回车键导航
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (e.shiftKey) {
          this.navigateToPrevious()
        }
        else {
          this.navigateToNext()
        }
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
    document.addEventListener('keydown', (e) => {
      // Command+F (Mac) 或 Ctrl+F (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        this.show()
        this.searchInput.focus()
      }
    })
  }

  /**
   * 显示搜索框
   */
  show() {
    if (!this.searchBox) {
      this.createSearchBox()
    }
    this.searchBox.classList.add('visible')
    this.isVisible = true
    if (this.currentQuery) {
      this.searchInput.value = this.currentQuery
      this.performSearch()
    }
  }

  /**
   * 隐藏搜索框
   */
  hide() {
    if (this.searchBox) {
      this.searchBox.classList.remove('visible')
      this.isVisible = false
    }
    this.clearHighlights()
  }

  /**
   * 执行搜索
   */
  performSearch() {
    const query = this.searchInput.value.trim()
    this.currentQuery = query

    // 清除之前的高亮
    this.clearHighlights()

    if (!query) {
      this.updateCount()
      return
    }

    // 搜索文本节点
    const content = document.getElementById('markdown-content')
    if (!content) {
      return
    }

    this.searchResults = []
    this.currentMatchIndex = -1

    // 使用 TreeWalker 遍历文本节点
    const walker = document.createTreeWalker(
      content,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // 跳过代码块内的文本
          if (node.parentElement?.closest('pre')) {
            return NodeFilter.FILTER_REJECT
          }
          // 跳过搜索框本身
          if (node.parentElement?.closest('#search-highlight-box')) {
            return NodeFilter.FILTER_REJECT
          }
          return NodeFilter.FILTER_ACCEPT
        },
      },
    )

    const textNodes = []
    let node = walker.nextNode()
    while (node) {
      textNodes.push(node)
      node = walker.nextNode()
    }

    // 在每个文本节点中搜索
    const regex = new RegExp(this.escapeRegex(query), 'gi')
    textNodes.forEach((textNode) => {
      const text = textNode.textContent
      const matches = [...textNode.matchAll(regex)]
      if (matches.length > 0) {
        matches.forEach((match) => {
          this.searchResults.push({
            textNode,
            matchText: match[0],
            index: match.index,
          })
        })
      }
    })

    // 高亮匹配项
    this.highlightMatches()

    // 更新计数
    this.updateCount()

    // 如果有结果，导航到第一个
    if (this.searchResults.length > 0) {
      this.navigateToNext()
    }
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
  highlightMatches() {
    // 需要按节点分组处理，避免节点分裂问题
    const resultsByNode = new Map()

    this.searchResults.forEach((result, index) => {
      if (!resultsByNode.has(result.textNode)) {
        resultsByNode.set(result.textNode, [])
      }
      resultsByNode.get(result.textNode).push({ ...result, resultIndex: index })
    })

    resultsByNode.forEach((nodeResults, textNode) => {
      const parent = textNode.parentNode
      if (!parent)
        return

      // 创建文档片段
      const fragment = document.createDocumentFragment()
      let lastIndex = 0
      const text = textNode.textContent

      // 按索引排序
      nodeResults.sort((a, b) => a.index - b.index)

      nodeResults.forEach((result) => {
        // 添加匹配前的文本
        if (result.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.substring(lastIndex, result.index)))
        }

        // 创建高亮 span
        const highlight = document.createElement('span')
        highlight.className = 'search-highlight'
        highlight.textContent = result.matchText
        highlight.dataset.searchIndex = result.resultIndex.toString()
        fragment.appendChild(highlight)

        this.highlightedElements.push(highlight)

        lastIndex = result.index + result.matchText.length
      })

      // 添加剩余文本
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex)))
      }

      // 替换原文本节点
      parent.replaceChild(fragment, textNode)
    })
  }

  /**
   * 清除高亮
   */
  clearHighlights() {
    this.highlightedElements.forEach((element) => {
      const parent = element.parentNode
      if (parent) {
        // 将高亮元素替换为纯文本
        parent.replaceChild(document.createTextNode(element.textContent), element)
        // 合并相邻的文本节点
        parent.normalize()
      }
    })
    this.highlightedElements = []
    this.currentMatchIndex = -1
  }

  /**
   * 导航到下一个匹配项
   */
  navigateToNext() {
    if (this.searchResults.length === 0)
      return

    this.currentMatchIndex = (this.currentMatchIndex + 1) % this.searchResults.length
    this.scrollToMatch()
    this.updateActiveHighlight()
  }

  /**
   * 导航到上一个匹配项
   */
  navigateToPrevious() {
    if (this.searchResults.length === 0)
      return

    this.currentMatchIndex = (this.currentMatchIndex - 1 + this.searchResults.length) % this.searchResults.length
    this.scrollToMatch()
    this.updateActiveHighlight()
  }

  /**
   * 滚动到匹配项
   */
  scrollToMatch() {
    const highlightElement = document.querySelector(`[data-search-index="${this.currentMatchIndex}"]`)
    if (highlightElement) {
      highlightElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  /**
   * 更新活动高亮状态
   */
  updateActiveHighlight() {
    // 移除所有活动高亮
    document.querySelectorAll('.search-highlight.active').forEach((el) => {
      el.classList.remove('active')
    })

    // 添加当前活动高亮
    const activeElement = document.querySelector(`[data-search-index="${this.currentMatchIndex}"]`)
    if (activeElement) {
      activeElement.classList.add('active')
    }

    // 更新计数显示
    this.updateCount()
  }

  /**
   * 更新计数显示
   */
  updateCount() {
    if (this.searchResults.length === 0) {
      this.countSpan.textContent = this.currentQuery ? '0/0' : ''
    }
    else {
      this.countSpan.textContent = `${this.currentMatchIndex + 1}/${this.searchResults.length}`
    }
  }

  /**
   * 销毁搜索功能
   */
  destroy() {
    this.clearHighlights()
    if (this.searchBox && this.searchBox.parentNode) {
      this.searchBox.parentNode.removeChild(this.searchBox)
    }
    this.searchBox = null
  }
}

// 导出给外部使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SearchHighlightManager }
}
else {
  window.SearchHighlightManager = SearchHighlightManager
}
```

**Step 2: 验证文件已创建**

Run: `ls -la src/webview/modules/search-highlight.js`
Expected: File exists

**Step 3: 提交**

```bash
git add src/webview/modules/search-highlight.js
git commit -m "feat: 添加搜索高亮核心模块"
```

---

### Task 2: 创建搜索框样式

**Files:**

- Create: `src/webview/search.css`

**Step 1: 创建搜索样式文件**

```css
/* 搜索框样式 */
.search-highlight-box {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9999;
  opacity: 0;
  transform: translateY(10px);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
  pointer-events: none;
}

.search-highlight-box.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.search-content {
  background-color: var(--editor-background, var(--vscode-editor-background));
  border: 1px solid var(--markdown-blockQuote-border, var(--vscode-widget-border));
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  padding: 4px;
  gap: 4px;
}

.search-input {
  background: transparent;
  border: none;
  outline: none;
  color: var(--editor-foreground, var(--vscode-foreground));
  font-size: 14px;
  padding: 6px 10px;
  width: 200px;
  font-family: var(--font-family, var(--vscode-editor-font-family));
}

.search-input::placeholder {
  color: var(--markdown-darkened-foreground, var(--vscode-input-placeholderForeground));
}

.search-controls {
  display: flex;
  gap: 2px;
  border-left: 1px solid var(--markdown-blockQuote-border, var(--vscode-widget-border));
  padding-left: 4px;
}

.search-prev,
.search-next,
.search-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--editor-foreground, var(--vscode-foreground));
  transition: background-color 0.15s ease;
  padding: 0;
}

.search-prev:hover,
.search-next:hover,
.search-close:hover {
  background-color: var(--markdown-blockQuote-background-level1, var(--vscode-toolbar-hoverBackground));
}

.search-prev:active,
.search-next:active,
.search-close:active {
  background-color: var(--markdown-blockQuote-background-level2, var(--vscode-toolbar-activeBackground));
}

.search-count {
  position: absolute;
  top: -12px;
  right: 4px;
  background-color: var(--textLink-foreground, var(--vscode-textLink-foreground));
  color: var(--editor-background, var(--vscode-editor-background));
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 8px;
  font-weight: 600;
  white-space: nowrap;
}

/* 搜索高亮样式 */
.search-highlight {
  background-color: var(--vscode-editor-findMatchHighlightBackground, #ffe082);
  color: var(--vscode-editor-findMatchHighlightForeground, #000);
  border-radius: 2px;
  padding: 1px 0;
}

.search-highlight.active {
  background-color: var(--vscode-editor-findMatchBackground, #ffd700);
  color: var(--vscode-editor-findMatchForeground, #000);
  box-shadow: 0 0 0 2px var(--vscode-editor-findMatchBorder, #e5c100);
}

/* 暗色主题适配 */
html[data-markdown-theme-type='dark'] .search-highlight {
  background-color: var(--vscode-editor-findMatchHighlightBackground, rgba(255, 224, 130, 0.4));
}

html[data-markdown-theme-type='dark'] .search-highlight.active {
  background-color: var(--vscode-editor-findMatchBackground, rgba(255, 215, 0, 0.6));
}

/* 响应式调整 */
@media (max-width: 768px) {
  .search-highlight-box {
    right: 10px;
    bottom: 10px;
  }

  .search-input {
    width: 150px;
  }
}
```

**Step 2: 验证文件已创建**

Run: `ls -la src/webview/search.css`
Expected: File exists

**Step 3: 提交**

```bash
git add src/webview/search.css
git commit -m "feat: 添加搜索框样式"
```

---

### Task 3: 在 HTML 模板中引入搜索模块

**Files:**

- Modify: `src/services/renderer/html-template-service.ts:38-85`

**Step 1: 修改 HTML 模板服务引入搜索 CSS**

找到 `scriptModules` 数组定义（约第 38 行），在之前添加 `search.css` 引用。

修改位置：`webviewCssUri` 赋值之后（约第 54 行后）

```typescript
const webviewCssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src/webview/style.css'))
const searchCssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src/webview/search.css'))
```

然后在 `<link href="${webviewCssUri}" rel="stylesheet">` 后添加搜索 CSS 链接（约第 68 行）：

```typescript
                <link href="${webviewCssUri}" rel="stylesheet">
                <link href="${searchCssUri}" rel="stylesheet">${katexCSS}
```

**Step 2: 在脚本模块列表中添加搜索模块**

找到 `scriptModules` 数组（约第 38-48 行），在 `'main.js'` 之前添加 `'search-highlight.js'`：

```typescript
const scriptModules = [
  'utils.js',
  'syntax-highlight.js',
  'link-handler.js',
  'mermaid.min.js',
  'mermaid-renderer.js',
  ...(enableScrollSync ? ['scroll-sync.js'] : []),
  'notion-toc.js',
  'search-highlight.js',
  'main.js',
]
```

**Step 3: 运行编译验证**

Run: `npm run compile`
Expected: 编译成功，无错误

**Step 4: 提交**

```bash
git add src/services/renderer/html-template-service.ts
git commit -m "feat: 在 HTML 模板中引入搜索模块和样式"
```

---

### Task 4: 在主模块中初始化搜索功能

**Files:**

- Modify: `src/webview/modules/main.js:3-235`

**Step 1: 添加搜索管理器变量**

在文件开头 `let scrollSyncManager = null` 后添加（约第 4 行）：

```javascript
const scrollSyncManager = null
const searchHighlightManager = null
```

**Step 2: 创建初始化搜索函数**

在 `initializeScrollSync` 函数后添加（约第 29 行后）：

```javascript
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
```

**Step 3: 在主初始化函数中调用**

在 `initializeWebviewModules` 函数的 `initializeScrollSync()` 调用后添加（约第 202 行）：

```javascript
// 初始化滚动同步
initializeScrollSync()

// 初始化搜索高亮
initializeSearchHighlight()
```

**Step 4: 添加销毁处理**

在导出的对象中添加（约第 227 行后）：

```javascript
  return {
    initializeWebviewModules,
    initializeScrollSync,
    handleExtensionMessage,
    scrollSyncManager: () => scrollSyncManager,
    searchHighlightManager: () => searchHighlightManager,
  }
```

以及 else 分支（约第 235 行后）：

```javascript
window.initializeWebviewModules = initializeWebviewModules
window.initializeScrollSync = initializeScrollSync
window.handleExtensionMessage = handleExtensionMessage
window.searchHighlightManager = () => searchHighlightManager
```

**Step 5: 复制资源到输出目录**

Run: `npm run copy-assets`
Expected: 搜索模块和样式被复制到 `out/webview/`

**Step 6: 提交**

```bash
git add src/webview/modules/main.js
git commit -m "feat: 在主模块中初始化搜索高亮功能"
```

---

### Task 5: 测试搜索功能

**Files:**

- No files created/modified

**Step 1: 编译扩展**

Run: `npm run compile`
Expected: 编译成功，无 TypeScript 错误

**Step 2: 复制资源**

Run: `npm run copy-assets`
Expected: 静态资源复制成功

**Step 3: 在 VS Code 中测试**

手动测试步骤：

1. 按 F5 启动扩展开发主机
2. 打开一个 Markdown 文件，输入一些内容
3. 按 Command+F（Mac）或 Ctrl+F（Windows/Linux）
4. 验证搜索框出现在右下角
5. 输入搜索关键词，验证高亮显示
6. 使用 Enter/Shift+Enter 或导航按钮验证跳转
7. 按 ESC 验证搜索框关闭
8. 验证暗色/亮色主题切换时搜索框样式正确

**Step 4: 验证搜索计数**

Run: 在搜索框输入关键词，确认显示 "1/N" 格式的计数

Expected: 搜索计数正确显示

**Step 5: 验证代码块不搜索**

Run: 搜索代码块中的内容（如函数名）

Expected: 代码块内的内容不被搜索/高亮

**Step 6: 提交（如果测试通过）**

```bash
git commit --allow-empty -m "test: 验证搜索功能测试通过"
```

---

## 测试清单

- [ ] 搜索框在 Command+F / Ctrl+F 时显示
- [ ] 搜索输入后 300ms 防抖后执行搜索
- [ ] 搜索结果正确高亮显示
- [ ] 当前匹配项有特殊高亮样式
- [ ] 按 Enter 导航到下一个匹配
- [ ] 按 Shift+Enter 导航到上一个匹配
- [ ] 点击导航按钮正常工作
- [ ] 搜索计数正确显示 "当前/总数"
- [ ] 按 ESC 关闭搜索框
- [ ] 点击关闭按钮关闭搜索框
- [ ] 代码块内容不被搜索
- [ ] 搜索框不会在代码块上显示
- [ ] 暗色主题下样式正确
- [ ] 亮色主题下样式正确
- [ ] 搜索框关闭时高亮被清除
- [ ] 多次打开/关闭搜索框正常工作
- [ ] 无结果时显示 "0/0"

---

## 实施注意事项

1. **CSP 策略**：HTML 模板已有 CSP 设置，内联脚本使用 nonce，新增模块通过外部文件加载，符合 CSP 要求。

2. **搜索性能**：使用 300ms 防抖避免频繁搜索，TreeWalker 遍历文本节点高效。

3. **代码块排除**：通过 `closest('pre')` 跳过代码块内的文本节点，避免高亮代码内容。

4. **主题适配**：使用 VSCode 主题变量 `--vscode-editor-findMatchBackground` 等，自动适配主题变化。

5. **状态管理**：`currentMatchIndex` 和 `searchResults` 在模块内部维护，不需要扩展端通信。
