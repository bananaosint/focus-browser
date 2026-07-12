const tabsEl = document.getElementById('tabs')
const newTabBtn = document.getElementById('new-tab-btn')
const backBtn = document.getElementById('back-btn')
const forwardBtn = document.getElementById('forward-btn')
const reloadBtn = document.getElementById('reload-btn')
const addressBar = document.getElementById('address-bar')
const newGroupBtn = document.getElementById('new-group-btn')
const pomodoroBtn = document.getElementById('pomodoro-btn')
const settingsBtn = document.getElementById('settings-btn')
const readerBtn = document.getElementById('reader-btn')
const focusModeBtn = document.getElementById('focus-mode-btn')
const toastEl = document.getElementById('toast')
const workspaceBtn = document.getElementById('workspace-btn')
const launcherBtn = document.getElementById('launcher-btn')
const dashboardBtn = document.getElementById('dashboard-btn')
const aiChatBtn = document.getElementById('ai-chat-btn')
const suggestionsEl = document.getElementById('suggestions')
const heartBtn = document.getElementById('heart-btn')
const zoomBadge = document.getElementById('zoom-badge')
const findBox = document.getElementById('find-box')
const findInput = document.getElementById('find-input')
const findCount = document.getElementById('find-count')
const findPrev = document.getElementById('find-prev')
const findNext = document.getElementById('find-next')
const findClose = document.getElementById('find-close')

let currentState = { tabs: [], groups: [], activeTabId: null }
let addressBarFocused = false

// Tracks which tab ids we've already seen active, so we can tell "a brand new tab
// just became active" apart from "switched to a tab that already existed" —
// only the former should steal focus into the address bar. Seeded (not
// acted on) on the very first render so app launch doesn't yank focus.
let seenActiveTabIds = new Set()
let hasRenderedOnce = false

function isBlankUrl(url) {
  return !url || url === 'about:blank' || url.startsWith('file://')
}

function speakerSvg(muted) {
  if (muted) {
    return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M11 5L6 9H2v6h4l5 4V5zm9.07 1.93a10 10 0 0 1 0 10.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>`
  }
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M11 5L6 9H2v6h4l5 4V5zm9.07 1.93a10 10 0 0 1 0 10.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
  </svg>`
}

function render(state) {
  currentState = state
  tabsEl.innerHTML = ''

  const groupById = Object.fromEntries(state.groups.map((g) => [g.id, g]))

  state.tabs.forEach((tab) => {
    const el = document.createElement('div')
    el.className =
      'tab' + (tab.id === state.activeTabId ? ' active' : '') + (tab.frozen ? ' frozen' : '') + (tab.isIncognito ? ' incognito' : '')
    el.dataset.tabId = tab.id

    const group = tab.groupId ? groupById[tab.groupId] : null
    if (group) {
      el.style.borderTopColor = group.color
      el.title = group.name
    }
    if (tab.frozen) el.title = (el.title ? el.title + ' — ' : '') + 'Frozen (click to restore)'
    if (tab.isIncognito) el.title = (el.title ? el.title + ' — ' : '') + 'Incognito tab'

    const favicon = document.createElement('div')
    favicon.className = 'favicon'
    if (tab.isIncognito) {
      favicon.innerHTML =
        '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>'
    } else if (tab.favicon) {
      const img = document.createElement('img')
      img.src = tab.favicon
      favicon.appendChild(img)
    }

    const title = document.createElement('div')
    title.className = 'title'
    const label = tab.isLoading ? 'Loading…' : (tab.title || 'New Tab')
    title.textContent = tab.frozen ? '❄ ' + label : label

    const close = document.createElement('div')
    close.className = 'close'
    close.textContent = '✕'
    close.addEventListener('click', (e) => {
      e.stopPropagation()
      window.browserAPI.closeTab(tab.id)
    })

    el.appendChild(favicon)
    el.appendChild(title)
    el.appendChild(close)

    el.addEventListener('click', () => window.browserAPI.switchTab(tab.id))
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      // Rendered as a native OS menu (see main.js), not custom HTML — this
      // chrome UI lives in a WebContentsView that's only 76px tall, and its
      // content is physically clipped to that rectangle no matter what CSS
      // says. A native popup menu isn't bound by that.
      window.browserAPI.showTabContextMenu(tab.id, e.clientX, e.clientY)
    })

    tabsEl.appendChild(el)
  })

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
  // Driven by the *active tab*, not a fixed window-level flag — a normal
  // window can have a mix of regular and individually-opened incognito tabs
  // (see the "+" button's right-click menu), so the chrome has to reflect
  // whichever one is currently in front rather than the whole window.
  document.body.classList.toggle('incognito', !!activeTab?.isIncognito)
  if (activeTab) {
    backBtn.disabled = !activeTab.canGoBack
    forwardBtn.disabled = !activeTab.canGoForward
    if (!addressBarFocused) {
      addressBar.value = isBlankUrl(activeTab.url) ? '' : activeTab.url
    }
    readerBtn.classList.toggle('active', !!activeTab.readerActive)

    const isBookmarked = state.bookmarks && state.bookmarks.some((b) => b.url === activeTab.url)
    heartBtn.classList.toggle('favorited', isBookmarked)
    heartBtn.classList.toggle('hidden', isBlankUrl(activeTab.url))
  }

  const isNewTab = hasRenderedOnce && state.activeTabId && !seenActiveTabIds.has(state.activeTabId)
  if (state.activeTabId) {
    seenActiveTabIds.add(state.activeTabId)
  }
  hasRenderedOnce = true
  if (isNewTab) {
    const doFocus = () => {
      addressBar.focus()
      addressBar.select()
    }
    doFocus()
    setTimeout(doFocus, 50)
    setTimeout(doFocus, 150)
    setTimeout(doFocus, 400)
  }

  // Audio speaker icons for audible/muted tabs
  state.tabs.forEach((tab) => {
    if (!tab.isAudible && !tab.isMuted) return
    const tabEl = tabsEl.querySelector(`[data-tab-id="${tab.id}"]`)
    if (!tabEl || tabEl.querySelector('.tab-audio-btn')) return

    const audioBtn = document.createElement('button')
    audioBtn.className = 'tab-audio-btn'
    audioBtn.title = tab.isMuted ? 'Unmute tab' : 'Mute tab'
    audioBtn.innerHTML = speakerSvg(tab.isMuted)
    audioBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      window.browserAPI.toggleMute(tab.id)
    })
    const closeBtn = tabEl.querySelector('.close')
    if (closeBtn) tabEl.insertBefore(audioBtn, closeBtn)
    else tabEl.appendChild(audioBtn)
  })

  // Zoom badge for active tab
  updateZoomBadge()
}

window.browserAPI.onState(render)
window.browserAPI.getState().then(render)

newTabBtn.addEventListener('click', () => window.browserAPI.newTab())
newTabBtn.addEventListener('contextmenu', (e) => {
  e.preventDefault()
  // Native OS menu, same reason as the tab context menu below — this
  // chrome UI is clipped to a 76px-tall view, so a custom HTML dropdown
  // would render invisibly past that line.
  window.browserAPI.showNewTabContextMenu(e.clientX, e.clientY)
})
backBtn.addEventListener('click', () => window.browserAPI.back(currentState.activeTabId))
forwardBtn.addEventListener('click', () => window.browserAPI.forward(currentState.activeTabId))
reloadBtn.addEventListener('click', () => window.browserAPI.reload(currentState.activeTabId))

addressBar.addEventListener('focus', () => {
  addressBarFocused = true
  setTimeout(() => addressBar.select(), 0)
})
addressBar.addEventListener('blur', () => {
  addressBarFocused = false
  hideSuggestions()
})

// ---- address bar autocomplete ----
//
// The dropdown grows the chrome view's own height to fit itself
// (setChromeHeight, see tabManager.js) rather than floating over the page in
// a separate window — simpler and more predictable to build, at the cost of
// the page area visibly shrinking/shifting while suggestions are open. A
// true floating overlay (a positioned popup window layered over the page)
// would look more like a normal browser, but needs cross-window position
// math this environment has no way to visually verify; this is the
// approach that's actually been checked to behave the way the code says.
const BASE_CHROME_HEIGHT = 76 // keep in sync with CHROME_HEIGHT in main.js
let suggestions = []
let selectedIndex = -1
let searchDebounce = null

function syncChromeHeight() {
  const extra = suggestionsEl.classList.contains('hidden') ? 0 : suggestionsEl.offsetHeight + 8
  window.browserAPI.setChromeHeight(BASE_CHROME_HEIGHT + extra)
}

function hideSuggestions() {
  suggestions = []
  selectedIndex = -1
  suggestionsEl.classList.add('hidden')
  suggestionsEl.innerHTML = ''
  syncChromeHeight()
}

function selectSuggestion(i) {
  const s = suggestions[i]
  if (!s || !currentState.activeTabId) return
  window.browserAPI.navigate(currentState.activeTabId, s.url)
  addressBar.value = s.url
  hideSuggestions()
  addressBar.blur()
}

function renderSuggestions() {
  suggestionsEl.innerHTML = ''
  if (!suggestions.length) {
    suggestionsEl.classList.add('hidden')
    syncChromeHeight()
    return
  }

  suggestions.forEach((s, i) => {
    const row = document.createElement('div')
    row.className = 'suggestion' + (i === selectedIndex ? ' selected' : '')

    const titleEl = document.createElement('div')
    titleEl.className = 's-title'
    titleEl.textContent = s.title || s.url

    const urlEl = document.createElement('div')
    urlEl.className = 's-url'
    urlEl.textContent = s.url

    row.appendChild(titleEl)
    row.appendChild(urlEl)
    // Suppresses the address bar's blur, which would otherwise fire (and
    // hide this dropdown) before the click event below gets a chance to run.
    row.addEventListener('mousedown', (e) => e.preventDefault())
    row.addEventListener('click', () => selectSuggestion(i))

    suggestionsEl.appendChild(row)
  })

  const rect = addressBar.getBoundingClientRect()
  suggestionsEl.style.left = rect.left + 'px'
  suggestionsEl.style.width = rect.width + 'px'
  suggestionsEl.style.top = rect.bottom + 4 + 'px'
  suggestionsEl.classList.remove('hidden')
  syncChromeHeight()
}

// Address bar input handling is registered below, after the suggestion helpers.
// (It needs getSearchSuggestions which is wired later.)


addressBar.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' && suggestions.length) {
    e.preventDefault()
    selectedIndex = Math.min(suggestions.length - 1, selectedIndex + 1)
    renderSuggestions()
    return
  }
  if (e.key === 'ArrowUp' && suggestions.length) {
    e.preventDefault()
    selectedIndex = Math.max(0, selectedIndex - 1)
    renderSuggestions()
    return
  }
  if (e.key === 'Escape') {
    hideSuggestions()
    return
  }
  if (e.key === 'Enter' && currentState.activeTabId) {
    if (selectedIndex >= 0) {
      selectSuggestion(selectedIndex)
    } else {
      window.browserAPI.navigate(currentState.activeTabId, addressBar.value)
      hideSuggestions()
      addressBar.blur()
    }
  }
})

// Groups the active tab immediately (same action as the right-click "New
// group from tab" item), rather than creating an empty, invisible group and
// leaving the user to find "Add to ..." on their own — an empty group has no
// tab wearing its color strip, so the original "create empty, then add"
// flow gave zero feedback that anything had happened.
newGroupBtn.addEventListener('click', async () => {
  if (!currentState.activeTabId) return
  const groupId = await window.browserAPI.createGroup()
  if (groupId) window.browserAPI.addTabToGroup(currentState.activeTabId, groupId)
})
settingsBtn.addEventListener('click', () => window.browserAPI.openSettings())
pomodoroBtn.addEventListener('click', () => {
  if (pomodoroBtn.classList.contains('alarm-ringing')) {
    stopAlarm()
  }
  window.browserAPI.openPomodoro()
})

function formatTime(ms) {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

let activeAlarmAudio = null
let lastPomodoroPhase = null

function playAlarm(file, loop = false) {
  stopAlarm()
  activeAlarmAudio = new Audio(file)
  activeAlarmAudio.volume = 0.6
  activeAlarmAudio.loop = loop
  activeAlarmAudio.play().catch((err) => console.warn("Pomodoro alarm audio play failed:", err))
}

function stopAlarm() {
  if (activeAlarmAudio) {
    activeAlarmAudio.pause()
    activeAlarmAudio.currentTime = 0
    activeAlarmAudio = null
  }
  pomodoroBtn.classList.remove('alarm-ringing')
  pomodoroBtn.title = "Focus timer"
}

function renderPomodoro(state) {
  if (lastPomodoroPhase && lastPomodoroPhase !== state.phase) {
    if (state.running) {
      if (state.phase === 'work') {
        playAlarm('./assets/break-done.mp3', true)
        pomodoroBtn.classList.add('alarm-ringing')
        pomodoroBtn.title = "Break finished! Click to dismiss alarm"
      } else {
        playAlarm('./assets/work-done.mp3', false)
      }
    } else {
      stopAlarm()
    }
  }
  lastPomodoroPhase = state.phase

  pomodoroBtn.textContent = formatTime(state.remainingMs)
  pomodoroBtn.classList.remove('phase-work', 'phase-shortBreak', 'phase-longBreak', 'running')
  pomodoroBtn.classList.add('phase-' + state.phase)
  if (state.running) pomodoroBtn.classList.add('running')
}

window.browserAPI.onPomodoroState(renderPomodoro)
window.browserAPI.getPomodoroState().then(renderPomodoro)

readerBtn.addEventListener('click', () => {
  if (currentState.activeTabId) window.browserAPI.toggleReader(currentState.activeTabId)
})

let focusModeState = { enabled: false, tabLimit: 0 }
function renderFocusMode(state) {
  focusModeState = state
  document.body.classList.toggle('focus-mode', state.enabled)
  focusModeBtn.classList.toggle('active', state.enabled)
}
focusModeBtn.addEventListener('click', () => window.browserAPI.setFocusModeEnabled(!focusModeState.enabled))

window.browserAPI.onFocusModeState(renderFocusMode)
window.browserAPI.getFocusModeState().then(renderFocusMode)

let toastTimer = null
window.browserAPI.onToast((message) => {
  clearTimeout(toastTimer)
  toastEl.textContent = message
  toastEl.classList.remove('hidden')
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 4500)
})

function renderWorkspace(state) {
  workspaceBtn.classList.toggle('active', !!state.sidebarVisible)
}
workspaceBtn.addEventListener('click', () => window.browserAPI.toggleWorkspaceSidebar())
window.browserAPI.onWorkspaceState(renderWorkspace)
window.browserAPI.getWorkspaceState().then(renderWorkspace)

function renderAiChat(state) {
  aiChatBtn.classList.toggle('active', !!state.sidebarVisible)
}
aiChatBtn.addEventListener('click', () => window.browserAPI.toggleAiChatSidebar())
window.browserAPI.onAiChatState(renderAiChat)
window.browserAPI.getAiChatState().then(renderAiChat)

// Profile list itself isn't needed here anymore — main.js builds the native
// menu straight from live profiles state when asked, so there's nothing to
// cache or go stale on this side.
launcherBtn.addEventListener('click', () => {
  const rect = launcherBtn.getBoundingClientRect()
  window.browserAPI.showLauncherMenu(rect.left, rect.bottom)
})

dashboardBtn.addEventListener('click', () => window.browserAPI.openDashboard())

// ---- toolbar button visibility ----
//
// Settings and Workspace are deliberately not in this map — always visible,
// see the "Toolbar" Settings tab for why. Everything else here is an
// optional feature button, fair game to declutter.
const TOOLBAR_BUTTON_ELS = {
  reader: readerBtn,
  group: newGroupBtn,
  focusMode: focusModeBtn,
  pomodoro: pomodoroBtn,
  launcher: launcherBtn,
  dashboard: dashboardBtn,
  aiChat: aiChatBtn
}

function applyToolbarVisibility(state) {
  Object.entries(TOOLBAR_BUTTON_ELS).forEach(([key, el]) => {
    el?.classList.toggle('toolbar-hidden', state[key] === false)
  })
}

window.browserAPI.onToolbarVisibility(applyToolbarVisibility)
window.browserAPI.getToolbarVisibility().then(applyToolbarVisibility)

heartBtn.addEventListener('click', () => {
  const activeTab = currentState.tabs.find((t) => t.id === currentState.activeTabId)
  if (!activeTab || isBlankUrl(activeTab.url)) return

  const isBookmarked = currentState.bookmarks && currentState.bookmarks.some((b) => b.url === activeTab.url)
  if (isBookmarked) {
    window.browserAPI.removeBookmark(activeTab.url)
  } else {
    window.browserAPI.addBookmark({
      url: activeTab.url,
      title: activeTab.title || activeTab.url
    })
  }
})


// ---- zoom badge ----

let currentZoomFactor = 1.0

function updateZoomBadge() {
  if (Math.abs(currentZoomFactor - 1.0) < 0.01) {
    zoomBadge.classList.add('hidden')
  } else {
    const pct = Math.round(currentZoomFactor * 100)
    zoomBadge.textContent = `${pct}%`
    zoomBadge.classList.remove('hidden')
  }
}

zoomBadge.addEventListener('click', () => {
  if (currentState.activeTabId) {
    window.browserAPI.resetZoom(currentState.activeTabId)
    currentZoomFactor = 1.0
    updateZoomBadge()
  }
})

window.browserAPI.onZoomChanged(({ tabId, zoomFactor }) => {
  if (tabId === currentState.activeTabId) {
    currentZoomFactor = zoomFactor
    updateZoomBadge()
  }
})

// ---- find in page ----

let findOpen = false

function openFind() {
  if (findOpen) {
    findInput.select()
    return
  }
  findOpen = true
  findBox.classList.remove('hidden')
  findInput.value = ''
  findCount.textContent = ''
  findInput.focus()
}

function closeFind() {
  if (!findOpen) return
  findOpen = false
  findBox.classList.add('hidden')
  findInput.value = ''
  findCount.textContent = ''
  if (currentState.activeTabId) {
    window.browserAPI.stopFindInPage(currentState.activeTabId, 'clearSelection')
  }
}

function doFind(forward = true) {
  const text = findInput.value.trim()
  if (!text || !currentState.activeTabId) return
  window.browserAPI.findInPage(currentState.activeTabId, text, {
    forward,
    findNext: true,
    matchCase: false
  })
}

findInput.addEventListener('input', () => {
  const text = findInput.value.trim()
  if (!text || !currentState.activeTabId) {
    findCount.textContent = ''
    return
  }
  window.browserAPI.findInPage(currentState.activeTabId, text, {
    forward: true,
    findNext: false,
    matchCase: false
  })
})

findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    doFind(!e.shiftKey)
  } else if (e.key === 'Escape') {
    closeFind()
  }
})

findPrev.addEventListener('click', () => doFind(false))
findNext.addEventListener('click', () => doFind(true))
findClose.addEventListener('click', closeFind)

window.browserAPI.onFindInPageResult(({ tabId, activeMatchOrdinal, matches }) => {
  if (tabId === currentState.activeTabId) {
    findCount.textContent = matches > 0 ? `${activeMatchOrdinal} of ${matches}` : 'No results'
    findCount.style.color = matches === 0 ? '#e07070' : '#8f9096'
  }
})

window.browserAPI.onFindInPageToggle(() => {
  if (findOpen) {
    closeFind()
  } else {
    openFind()
  }
})

// ---- address bar suggestions (history + search engine autocomplete) ----
//
// Merges browsing history matches with live Google Suggest completions.
// History hits show first with their page title; search completions after.

addressBar.addEventListener('input', () => {
  clearTimeout(searchDebounce)
  const q = addressBar.value.trim()
  if (!q) {
    hideSuggestions()
    return
  }
  searchDebounce = setTimeout(async () => {
    const [historySuggestions, searchSuggestions] = await Promise.all([
      window.browserAPI.searchHistory(q),
      window.browserAPI.getSearchSuggestions(q).catch(() => [])
    ])

    // Merge: history first, then search completions not already in history
    const historyUrls = new Set(historySuggestions.map(s => s.url))
    const searchEntries = searchSuggestions
      .filter(text => !historyUrls.has(text))
      .slice(0, 5)
      .map(text => ({ title: text, url: text, isSearch: true }))

    suggestions = [...historySuggestions, ...searchEntries].slice(0, 8)
    selectedIndex = -1
    renderSuggestions()
  }, 100)
})

// ---- incognito styling ----
//
// The body.incognito class itself is driven per-render from the *active
// tab* (see render() above) so it also covers individually-opened
// incognito tabs in an otherwise normal window. This event only fires once,
// for a whole incognito window (Ctrl+Shift+N) — it just sets the window
// title, since every tab in that window is private anyway.

window.browserAPI.onIncognito((isIncognito) => {
  if (isIncognito) {
    document.title = 'Focus Browser — Incognito'
  }
})

