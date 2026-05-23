// 任务复选框处理：点击预览区复选框后，通知扩展改原 Markdown。

let taskCheckboxContent = null
let delegatedTaskCheckboxChangeHandler = null

function getTaskCheckboxLine(checkbox) {
  const taskItem = checkbox.closest?.('.task-list-item')
  const lineElement = taskItem?.closest?.('[data-line]')
  const line = lineElement?.getAttribute?.('data-line')

  if (line === null || line === undefined || line === '') {
    return null
  }

  const lineNumber = Number.parseInt(line, 10)
  return Number.isFinite(lineNumber) ? lineNumber : null
}

function initializeTaskCheckboxHandling() {
  const markdownContent = document.getElementById('markdown-content')
  if (!markdownContent) {
    return
  }

  if (taskCheckboxContent && taskCheckboxContent !== markdownContent && delegatedTaskCheckboxChangeHandler) {
    taskCheckboxContent.removeEventListener('change', delegatedTaskCheckboxChangeHandler)
  }

  taskCheckboxContent = markdownContent

  if (!delegatedTaskCheckboxChangeHandler) {
    delegatedTaskCheckboxChangeHandler = (event) => {
      const checkbox = event.target?.closest?.('.task-list-item input[type="checkbox"]')
      if (!checkbox || !taskCheckboxContent?.contains(checkbox)) {
        return
      }

      const line = getTaskCheckboxLine(checkbox)
      if (line === null) {
        checkbox.checked = !checkbox.checked
        return
      }

      if (window.vscode && window.vscode.postMessage) {
        window.vscode.postMessage({
          command: 'toggleTaskCheckbox',
          line,
          checked: checkbox.checked,
        })
      }
    }
  }

  taskCheckboxContent.removeEventListener('change', delegatedTaskCheckboxChangeHandler)
  taskCheckboxContent.addEventListener('change', delegatedTaskCheckboxChangeHandler)
}

function cleanupTaskCheckboxHandling() {
  if (taskCheckboxContent && delegatedTaskCheckboxChangeHandler) {
    taskCheckboxContent.removeEventListener('change', delegatedTaskCheckboxChangeHandler)
  }
  taskCheckboxContent = null
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initializeTaskCheckboxHandling, cleanupTaskCheckboxHandling, getTaskCheckboxLine }
}
else {
  window.initializeTaskCheckboxHandling = initializeTaskCheckboxHandling
  window.cleanupTaskCheckboxHandling = cleanupTaskCheckboxHandling
}
