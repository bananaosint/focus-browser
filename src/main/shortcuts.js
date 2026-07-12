// Static display data for Settings → Browser → Keyboard Shortcuts. This is the
// single source of truth for *display only* — it is NOT wired into the actual
// dispatch in handleGlobalShortcut (main.js) or attachDevToolsToggle
// (tabManager.js). If you add or change a real shortcut in either of those,
// update this list by hand so the reference page doesn't drift.
//
// UMD-lite, but in practice only required by main.js and served over IPC
// (the settings renderer is sandboxed and can't require main-process files).
const SHORTCUTS = [
  {
    group: 'Tabs & windows',
    items: [
      { keys: ['Ctrl', 'T'], action: 'New tab' },
      { keys: ['Ctrl', 'Shift', 'T'], action: 'Reopen closed tab' },
      { keys: ['Ctrl', 'W'], action: 'Close tab' },
      { keys: ['Ctrl', 'Tab'], action: 'Next tab (wraps around)' },
      { keys: ['Ctrl', '1'], action: 'Jump to tab by position (1–8)' },
      { keys: ['Ctrl', 'N'], action: 'New window' },
      { keys: ['Ctrl', 'Shift', 'N'], action: 'New incognito window' }
    ]
  },
  {
    group: 'Page & view',
    items: [
      { keys: ['Ctrl', 'F'], action: 'Find in page' },
      { keys: ['Ctrl', 'P'], action: 'Print current tab' },
      { keys: ['Ctrl', '='], action: 'Zoom in' },
      { keys: ['Ctrl', '-'], action: 'Zoom out' },
      { keys: ['Ctrl', '0'], action: 'Reset zoom' }
    ]
  },
  {
    group: 'Developer',
    items: [
      { keys: ['F12'], action: 'Toggle DevTools' },
      { keys: ['Ctrl', 'Shift', 'I'], action: 'Toggle DevTools' }
    ]
  }
]

module.exports = { SHORTCUTS }
