# Fix Search Highlight Bug Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the search highlight bug where continuing to type after a pause causes all highlights to disappear.

**Architecture:** Modify the TreeWalker filter in `performSearch()` to exclude non-content tags (SCRIPT, STYLE, NOSCRIPT, TEMPLATE, IFRAME) whose text content should not be highlighted.

**Tech Stack:** JavaScript (ES6+), DOM API, TreeWalker API, VSCode WebView

---

## Background

**Problem Summary:**
1. Initial search "co" works correctly: finds 24 matches and highlights them
2. Continuing to type "de" to make "code" fails: finds 0 text nodes, all highlights disappear

**Root Cause (from bugs.md analysis):**
The TreeWalker in `performSearch()` does not exclude `<SCRIPT>` tags. When the page contains inline scripts with text like "code" or "co", the TreeWalker traverses these script text nodes, and `highlightMatches()` creates highlight spans inside `<SCRIPT>` elements. This corrupts the script content and breaks subsequent searches.

**Key Evidence from logs:**
```
search-highlight.js:393 [SearchHighlight] Replacing highlight 23 text: co parent: SCRIPT
```

This shows highlights were being inserted into `<SCRIPT>` tags, which should never happen.

**Solution:**
Add `closest()` checks to exclude non-content tags in the TreeWalker's `acceptNode` filter.

---

## Task 1: Fix TreeWalker Filter to Exclude SCRIPT Tags

**Files:**
- Modify: `src/webview/modules/search-highlight.js` (performSearch function, around line 231-250)

**Step 1: Read the current performSearch function**

Run: Read the file to locate the exact lines of the TreeWalker creation

**Step 2: Add SCRIPT tag exclusion to TreeWalker filter**

Find the `acceptNode` function inside `performSearch()` and add the SCRIPT exclusion before the search text check:

```javascript
acceptNode: (node) => {
  // 排除代码块内的文本
  if (node.parentElement.closest('pre')) {
    return NodeFilter.FILTER_REJECT
  }
  // 排除搜索框内的文本
  if (node.parentElement.closest('.search-highlight-box')) {
    return NodeFilter.FILTER_REJECT
  }
  // 排除 SCRIPT、STYLE 等非内容标签内的文本
  const excludeTags = ['script', 'style', 'noscript', 'template', 'iframe', 'head', 'meta', 'link']
  if (node.parentElement.closest(excludeTags.join(','))) {
    return NodeFilter.FILTER_REJECT
  }
  // 只接受包含搜索词的文本节点
  if (node.textContent.toLowerCase().includes(query.toLowerCase())) {
    return NodeFilter.FILTER_ACCEPT
  }
  return NodeFilter.FILTER_SKIP
}
```

**Step 3: Remove debug console.log statements**

Remove or comment out all the debug `console.log()` statements that were added during debugging (lines like `[SearchHighlight] performSearch called`, etc.)

**Step 4: Compile to verify no syntax errors**

Run: `npm run compile`

Expected: No TypeScript errors

**Step 5: Commit**

```bash
git add src/webview/modules/search-highlight.js
git commit -m "fix: exclude non-content tags from search highlight

TreeWalker now excludes SCRIPT, STYLE, NOSCRIPT, TEMPLATE, IFRAME
tags to prevent highlights from being inserted into non-content
elements. This fixes the bug where continuing to type after a
pause caused all highlights to disappear."
```

---

## Task 2: Manual Testing

**Files:**
- Test: Manual testing in VSCode WebView

**Step 1: Start VSCode Extension Debug**

Run: Press `F5` in VSCode to launch the Extension Development Host

**Step 2: Open a Markdown preview**

1. Create or open a markdown file with some content
2. Open the preview panel

**Step 3: Test incremental search**

1. Press `Cmd+F` (Mac) or `Ctrl+F` (Windows) to open search
2. Type "co" and pause
3. Expected: Highlights appear for "co" matches
4. Continue typing "de" to make "code"
5. Expected: Highlights update to show "code" matches (should not disappear)

**Step 4: Verify SCRIPT tags are excluded**

1. Open browser DevTools console
2. Search for a term that might exist in inline scripts
3. Verify no highlights appear in SCRIPT elements

**Step 5: Test edge cases**

1. Empty search: Should clear all highlights
2. No matches: Should show "0/0" counter
3. Navigate with arrow keys: Up/Down should work
4. Close and reopen: Should preserve previous search state

**Step 6: Document test results**

Update `bugs.md` with test results:

```markdown
## Test Results

- [x] Initial search "co" works: PASS
- [x] Continuing to "code" works: PASS
- [x] SCRIPT tags excluded: PASS
- [x] Empty search clears highlights: PASS
- [x] Arrow key navigation works: PASS
- [x] Close/reopen preserves state: PASS

**Status:** FIXED ✅
```

---

## Task 3: Remove Debug Code (if any remaining)

**Files:**
- Modify: `src/webview/modules/search-highlight.js`

**Step 1: Search for remaining debug statements**

Search for `console.log('[SearchHighlight]` in the file

**Step 2: Remove all debug statements**

Remove any remaining debug console.log statements

**Step 3: Final compile**

Run: `npm run compile`

**Step 4: Final commit**

```bash
git add src/webview/modules/search-highlight.js
git commit -m "chore: remove debug logging from search highlight"
```

---

## Task 4: Update Documentation

**Files:**
- Modify: `bugs.md`

**Step 1: Update bugs.md with resolution**

Add to bugs.md:

```markdown
## Resolution

Fixed by excluding non-content tags (SCRIPT, STYLE, NOSCRIPT, TEMPLATE, IFRAME)
from TreeWalker traversal in performSearch().

Commit: <commit-hash>
Date: 2026-02-07
```

**Step 2: Commit documentation update**

```bash
git add bugs.md
git commit -m "docs: update bugs.md with search highlight fix resolution"
```

---

## Success Criteria

- [ ] Typing "co" then pausing, then continuing to "code" shows correct highlights
- [ ] No highlights appear in SCRIPT, STYLE, or other non-content elements
- [ ] All debug logging removed
- [ ] TypeScript compilation succeeds with no errors
- [ ] bugs.md updated with resolution

---

## Notes for Implementation

1. **Tag List:** The excludeTags array uses `closest()` with comma-separated selectors, which matches if ANY of the tags match
2. **Performance:** Using `closest()` is efficient as it stops at the first matching ancestor
3. **Future:** If other tags need exclusion, just add to the excludeTags array
