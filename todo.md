# Trouve-tout Code Improvements

Based on deep code analysis and LLM coding best practices from [Addy Osmani's workflow](https://medium.com/@addyosmani/my-llm-coding-workflow-going-into-2026-52fe1681325e), [MDN PWA Best Practices](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Best_practices), and [web.dev PWA Checklist](https://web.dev/articles/pwa-checklist).

---

## Priority 1: Dead Code Removal

Code left over from removed features (Add Photo, Delete Photo) that should be cleaned up.

### JavaScript (js/app.js)

- [ ] **Remove unused GitHub write functions** (~100 lines)
  - `uploadPhoto()` - line 932
  - `commitToGitHub()` - line 838
  - `fileToBase64()` - line 867
  - `getNextViewLetter()` - line 824
  - `updatePhotoSetsOnGitHub()` - line 894
  - These were for the removed "Add Photo" feature

- [ ] **Remove orphaned settings close handler** - line 1010
  - Settings modal's `.close` selector targets a removed element (replaced with `.modal-home`)

- [ ] **Remove console.log statements** (production code shouldn't log)
  - Line 81: `console.log('Loaded photosets from GitHub API')`
  - Line 88: `console.log('Loaded photosets from static file')`
  - Line 104: `console.log('Loaded inventory from GitHub API')`
  - Line 111: `console.log('Loaded inventory from static file')`

### CSS (css/style.css)

- [ ] **Remove AI suggestions styles** (~40 lines, 667-720)
  - `.ai-suggestions-*` classes - feature was removed

- [ ] **Remove pending items styles** (~50 lines, 722-779)
  - `.pending-*` classes and `#pending-items-list` - feature was removed

- [ ] **Remove photo file input styles** (lines 645-650)
  - `#photo-file-input` - feature was removed

- [ ] **Remove commit section styles** (lines 775-779)
  - `#commit-section` - feature was removed

---

## Priority 2: PWA Compliance

Issues affecting installability and offline experience.

### Manifest (manifest.json)

- [ ] **Create proper app icons**
  - Current icon is `images/1a.jpg` (a tool photo, not an app icon)
  - Need 192x192 PNG icon
  - Need 512x512 PNG icon for full PWA compliance
  - Consider a simple toolbox or magnifying glass icon

- [ ] **Add maskable icon**
  - Required for Android adaptive icons
  - Add `"purpose": "maskable"` variant

### HTML (index.html)

- [ ] **Add Apple touch icon**
  - `<link rel="apple-touch-icon" href="icon-192.png">`

- [ ] **Add theme-color meta for iOS**
  - Already present, but verify it works on iOS Safari

### Service Worker (sw.js)

- [ ] **Dynamic image caching**
  - Current: Hardcoded list of 22 image paths
  - Problem: Adding new photos requires updating sw.js
  - Solution: Use runtime caching for `/images/` paths instead of precaching

- [ ] **Add update notification**
  - Notify users when new version is available
  - Currently uses `skipWaiting()` which can cause issues

---

## Priority 3: Security

### XSS Prevention

- [ ] **Sanitize HTML in renderPhotoGrid()** - line 120
  - `photo.file`, `photo.category` inserted directly into template

- [ ] **Sanitize HTML in renderResults()** - line 436
  - `item.item`, `item.brand`, `item.model`, `item.notes` inserted into template
  - User could inject malicious content via inventory.json

- [ ] **Sanitize HTML in showItemModal()** - line 360
  - Same issue with item details

- [ ] **Sanitize HTML in renderInventoryList()** - line 284
  - Same issue with item names

**Recommendation:** Create a simple `escapeHtml()` helper:
```javascript
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
```

---

## Priority 4: Accessibility

### ARIA & Keyboard Navigation

- [ ] **Add ARIA labels to buttons**
  - Settings button: `aria-label="Open settings"`
  - Send button: `aria-label="Send message"`
  - Tab buttons: `role="tab"` and `aria-selected`

- [ ] **Modal focus management**
  - Trap focus inside open modals
  - Return focus to trigger element on close
  - Add `role="dialog"` and `aria-modal="true"`

- [ ] **Add skip link**
  - Allow keyboard users to skip to main content

- [ ] **Improve color contrast**
  - `--text-secondary: #a0a0a0` may not meet WCAG AA on dark background
  - Test with Lighthouse accessibility audit

---

## Priority 5: Code Quality

### DRY Improvements

- [ ] **Extract tab switching logic**
  - Duplicated in: `init()`, `showAllInventory()`, `goHome()`, OAuth callback
  - Create: `switchToTab(mode)` helper function

- [ ] **Extract box number parsing**
  - Pattern `item.photoSet.split('/')[0].replace(/[a-z]/g, '')` repeated 4 times
  - Create: `getBoxNumber(item)` helper

- [ ] **Consolidate modal closing**
  - Multiple patterns for closing modals
  - Standardize on `goHome()` or create `closeAllModals()`

### Error Handling

- [ ] **Add try-catch to renderPhotoGrid()**
  - If photoSets is malformed, app crashes

- [ ] **Add fallback for missing thumbnails**
  - If thumbnail doesn't exist, fall back to full-size image
  - `<img onerror="this.src=this.src.replace('/thumbs/','/');"`

- [ ] **Handle fetch failures gracefully**
  - Show user-friendly error messages instead of console errors

---

## Priority 6: Performance

### Optimization Opportunities

- [ ] **Lazy load full-size images**
  - Only load full-size when modal opens
  - Currently both are in cache, but network request can be deferred

- [ ] **Debounce category filter**
  - Currently triggers immediate search on change
  - Add same debounce as search input

- [ ] **Reduce AI context size**
  - Sending full inventory JSON (~15KB) on every query
  - Consider sending only relevant fields or summarizing

- [ ] **Add loading states**
  - Show skeleton/spinner while photos load
  - Improve perceived performance

---

## Priority 7: iOS-Specific Fixes

Per CLAUDE.md, primary testing is on Chrome for iOS.

- [ ] **Test touch events**
  - Ensure all `:active` states work on iOS
  - Some browsers need `-webkit-tap-highlight-color`

- [ ] **Test service worker update**
  - iOS Safari has quirky SW behavior
  - May need explicit refresh prompt

- [ ] **Test input focus**
  - iOS may zoom on input focus if font-size < 16px
  - Current inputs use `1rem` which should be fine

---

## Nice-to-Have

Lower priority improvements for future consideration.

- [ ] **Add offline indicator**
  - Show banner when offline
  - `navigator.onLine` + event listeners

- [ ] **Add "pull to refresh"**
  - Mobile UX pattern for syncing data

- [ ] **Keyboard shortcuts**
  - Already has arrow keys for photos
  - Add: Escape to close modals (already done), `/` to focus search

- [ ] **Dark/light mode toggle**
  - Currently dark-only
  - Could add `prefers-color-scheme` media query

- [ ] **Export inventory**
  - Download as CSV or JSON for backup

---

## Completed

Items that have already been addressed:

- [x] Add thumbnail images for faster grid loading
- [x] Add clickable header navigation
- [x] Clear AI input on page load
- [x] Add follow-up question suggestions
- [x] Make AI responses terse
- [x] Remove Add Photo functionality
- [x] Remove Delete Photo functionality
