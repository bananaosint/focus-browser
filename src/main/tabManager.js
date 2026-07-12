const { WebContentsView } = require('electron')
const { randomUUID } = require('crypto')
const { pathToFileURL } = require('url')
const path = require('path')
const { EXTRACTION_SCRIPT, buildReaderHtml } = require('./reader')

// pathToFileURL handles Windows drive letters and backslashes correctly —
// hand-rolling "file://" + path breaks on Windows paths like C:\Users\...
const NEW_TAB_URL = pathToFileURL(path.join(__dirname, '..', 'pages', 'newtab.html')).toString()

const GROUP_COLORS = ['#6C8EBF', '#82B366', '#D6B656', '#B85450', '#9673A6', '#4C9F9F']

// Menu.setApplicationMenu(null) (see main.js) strips the default DevTools
// accelerator along with the rest of the menu, so we rewire F12 / Ctrl+Shift+I
// by hand on every webContents we create.
function attachDevToolsToggle(webContents) {
  webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') return
    const isF12 = input.key === 'F12'
    const isCtrlShiftI = input.control && input.shift && input.key.toLowerCase() === 'i'
    if (isF12 || isCtrlShiftI) webContents.toggleDevTools()
  })
}

// Browser-wide keyboard shortcuts (Ctrl+T, Ctrl+W, ...) need to work no
// matter which part of the browser currently has keyboard focus — the
// chrome toolbar, a sidebar, or a page itself (tabs load arbitrary content
// with no preload, so this is the only hook point available there anyway).
// `handler` is main.js's dispatch function; it returns true if it handled
// the input, which is what tells us to preventDefault so the keystroke
// doesn't also reach the page itself (e.g. Ctrl+W in a text field).
function attachShortcutHandler(webContents, handler) {
  if (!handler) return
  webContents.on('before-input-event', (event, input) => {
    // webContents identifies *which* window/tab the shortcut came from —
    // needed once more than one window can exist (see contextForSender in
    // main.js); a bare (input) => boolean handler has no way to know that.
    if (handler(input, webContents)) event.preventDefault()
  })
}

// Very small heuristic, same spirit as a normal browser's address bar:
// looks like a URL -> load it, otherwise treat it as a search.
function resolveInput(input, store = null) {
  const trimmed = input.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^file:\/\//i.test(trimmed)) return trimmed
  const looksLikeDomain = /^\S+\.[a-z]{2,}([/:?#].*)?$/i.test(trimmed)
  if (looksLikeDomain) return `https://${trimmed}`
  
  if (store) {
    const config = store.get('searchSettings') || { engine: 'google', customUrl: '' }
    let template = 'https://www.google.com/search?q=%s'
    if (config.engine === 'bing') {
      template = 'https://www.bing.com/search?q=%s'
    } else if (config.engine === 'duckduckgo') {
      template = 'https://duckduckgo.com/?q=%s'
    } else if (config.engine === 'custom' && config.customUrl) {
      template = config.customUrl
    }
    
    if (template.includes('%s')) {
      return template.replace('%s', encodeURIComponent(trimmed))
    }
    return template + encodeURIComponent(trimmed)
  }
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
}

class TabManager {
  constructor(win, chromeView, chromeHeight, {
    focusMode = null,
    onToast = null,
    store = null,
    history = null,
    onActiveUrlChange = null,
    onKeyboardShortcut = null,
    onTabDomReady = null,
    isIncognito = false,
    session = null,
    createIncognitoSession = null
  } = {}) {
    this.win = win
    this.chromeView = chromeView
    this.chromeHeight = chromeHeight
    this._baseChromeHeight = chromeHeight // floor for setChromeHeight()'s clamp
    this.tabs = new Map() // id -> tab record
    this.groups = new Map() // id -> { id, name, color }
    this.order = [] // tab ids, display order
    this.activeTabId = null
    this._nextGroupColor = 0
    this.focusMode = focusMode // read-only lookup for the tab-limit nudge
    this.onToast = onToast // (message) => void, surfaces a dismissible chrome toast
    this.store = store // read-only lookup for tabFreezing settings
    this.history = history // records visits for every tab's navigations (address bar autocomplete)
    this.onActiveUrlChange = onActiveUrlChange // (url) => void, drives UsageStats attention tracking
    this.onKeyboardShortcut = onKeyboardShortcut // (input) => boolean, browser-wide shortcuts (see attachShortcutHandler)
    this.onTabDomReady = onTabDomReady
    this.isIncognito = isIncognito
    this.session = session || require('electron').session.defaultSession
    // (main.js) () => Session, lazily creates and memoizes one shared
    // in-memory partition for THIS window's individually-opened incognito
    // tabs (right-click "+" → New Incognito Tab) — separate from
    // this.session/this.isIncognito, which cover a whole incognito *window*
    // (Ctrl+Shift+N) where every tab is already private by default.
    this.createIncognitoSession = createIncognitoSession

    this.sidebarView = null // left sidebar: workspace
    this.sidebarVisible = false
    this.sidebarWidth = 320

    this.rightSidebarView = null // right sidebar: AI chat
    this.rightSidebarVisible = false
    this.rightSidebarWidth = 320

    this.closedStack = [] // most-recently-closed last, for Ctrl+Shift+T; capped below

    win.on('resize', () => this.reflow())

    // Checked every minute rather than on a per-tab timer — cheap enough at
    // any realistic tab count, and one shared interval is simpler to reason
    // about than N timers that all need clearing on tab close.
    this._freezeInterval = setInterval(() => this._checkIdleTabs(), 60_000)
  }

  // ---- layout ----

  attachSidebar(view) {
    this.sidebarView = view
  }

  setSidebarVisible(visible) {
    this.sidebarVisible = !!visible
    this.reflow()
  }

  setSidebarWidth(px) {
    this.sidebarWidth = px
    this.reflow()
  }

  attachRightSidebar(view) {
    this.rightSidebarView = view
  }

  setRightSidebarVisible(visible) {
    this.rightSidebarVisible = !!visible
    this.reflow()
  }

  setRightSidebarWidth(px) {
    this.rightSidebarWidth = px
    this.reflow()
  }

  // Grows/shrinks the chrome strip itself, e.g. to fit the address bar's
  // autocomplete dropdown — its content would otherwise be clipped, since a
  // WebContentsView's rendering is bound to its own rectangle regardless of
  // CSS (the same issue the native popup menus were built to route around).
  // Clamped: the base 76px chrome height, up to +400px for a long
  // suggestion list.
  setChromeHeight(px) {
    this.chromeHeight = Math.max(this._baseChromeHeight, Math.min(px, this._baseChromeHeight + 400))
    this.reflow()
  }

  reflow() {
    const bounds = this.win.getContentBounds()
    this.chromeView.setBounds({ x: 0, y: 0, width: bounds.width, height: this.chromeHeight })

    const leftW = this.sidebarVisible ? this.sidebarWidth : 0
    const rightW = this.rightSidebarVisible ? this.rightSidebarWidth : 0
    const contentHeight = Math.max(0, bounds.height - this.chromeHeight)

    if (this.sidebarView) {
      this.sidebarView.setBounds({ x: 0, y: this.chromeHeight, width: leftW, height: contentHeight })
    }
    if (this.rightSidebarView) {
      this.rightSidebarView.setBounds({
        x: Math.max(leftW, bounds.width - rightW),
        y: this.chromeHeight,
        width: rightW,
        height: contentHeight
      })
    }

    const tabWidth = Math.max(0, bounds.width - leftW - rightW)
    for (const id of this.order) {
      const tab = this.tabs.get(id)
      if (!tab || !tab.view) continue // frozen tabs have no view to bound
      if (id === this.activeTabId) {
        tab.view.setBounds({ x: leftW, y: this.chromeHeight, width: tabWidth, height: contentHeight })
      } else {
        // Inactive tabs stay loaded (session/scroll position preserved) but
        // zero-sized, rather than being removed and recreated on switch.
        tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      }
    }
  }

  // Windows-specific Chromium compositor bug: minimizing then restoring a
  // window sometimes leaves every child WebContentsView showing nothing but
  // the BrowserWindow's own backgroundColor (a flat dark grey here) until
  // something forces a repaint. The visibility toggle re-displays whatever
  // frame a view already had composited, which is enough for most pages —
  // but some pages (the New Tab page among them) can come back from
  // 'restore' with no such frame to redisplay, so the toggle alone shows
  // nothing for those. The bounds nudge is the more forceful fallback: a
  // real, separately-rendered size change forces Chromium to lay out and
  // paint from scratch rather than reuse a cached frame — done on a short
  // timeout (not setImmediate/the same tick) so the intermediate size
  // actually gets its own paint instead of being coalesced away with the
  // one that restores it. Wired to the window's 'restore' event in main.js,
  // which also does its own top-level nudge of the OS window itself (belt
  // and suspenders — some cases need the outer window resized, not just its
  // children).
  forceRepaint() {
    const toggle = (view) => {
      if (!view) return
      view.setVisible(false)
      view.setVisible(true)
    }
    toggle(this.chromeView)
    if (this.sidebarVisible) toggle(this.sidebarView)
    if (this.rightSidebarVisible) toggle(this.rightSidebarView)

    const activeView = this.tabs.get(this.activeTabId)?.view
    toggle(activeView)
    if (activeView) {
      const bounds = activeView.getBounds()
      activeView.setBounds({ ...bounds, width: Math.max(0, bounds.width - 1) })
      setTimeout(() => activeView.setBounds(bounds), 30)
    }
  }

  // ---- tabs ----

  createTab(url = NEW_TAB_URL, { activate = true, groupId = null, incognito = this.isIncognito } = {}) {
    const id = randomUUID()
    // A whole incognito window (this.isIncognito) already uses one private
    // session for every tab — only spin up the separate per-tab partition
    // when an otherwise-normal window opens an individual incognito tab.
    const tabSession = this.isIncognito ? this.session : incognito ? this.createIncognitoSession?.() || this.session : this.session
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true, // tabs load arbitrary sites — no Node, no preload, sandboxed renderer
        session: tabSession
      }
    })
    this.win.contentView.addChildView(view)
    attachDevToolsToggle(view.webContents)
    attachShortcutHandler(view.webContents, this.onKeyboardShortcut)

    const tab = {
      id,
      view,
      groupId,
      title: 'New Tab',
      url,
      favicon: null,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      readerActive: false,
      readerOriginalUrl: null,
      frozen: false,
      scrollY: 0,
      isAudible: false,
      isMuted: false,
      lastActiveAt: Date.now(),
      isIncognito: this.isIncognito || !!incognito
    }
    this.tabs.set(id, tab)
    this.order.push(id)

    this._wireTabEvents(tab)
    view.webContents.loadURL(url)

    if (activate) {
      this.switchTab(id)
      const focusChrome = () => {
        if (this.chromeView && !this.chromeView.webContents.isDestroyed()) {
          this.chromeView.webContents.focus()
        }
      }
      focusChrome()
      setTimeout(focusChrome, 50)
      setTimeout(focusChrome, 150)
      setTimeout(focusChrome, 400)
    } else {
      this.reflow()
    }

    this._checkTabLimit()
    this.broadcastState()
    return id
  }

  // Fires once right as the tab count crosses the limit, not on every tab
  // after — a nudge, not a nag, per the plan's "gentle nudge, not a hard
  // block." Never prevents the tab from opening.
  _checkTabLimit() {
    const fm = this.focusMode?.state
    if (!fm?.enabled || !fm.tabLimit) return
    if (this.order.length === fm.tabLimit + 1) {
      this.onToast?.(`${this.order.length} tabs open — past your Focus Mode limit of ${fm.tabLimit}.`)
    }
  }

  closeTab(id) {
    const tab = this.tabs.get(id)
    if (!tab) return

    this.closedStack.push({ url: tab.url, groupId: tab.groupId })
    if (this.closedStack.length > 10) this.closedStack.shift()

    if (tab.view) {
      this.win.contentView.removeChildView(tab.view)
      const wc = tab.view.webContents
      if (!wc.isDestroyed() && typeof wc.close === 'function') wc.close()
    }

    this.tabs.delete(id)
    this.order = this.order.filter((t) => t !== id)

    if (this.activeTabId === id) {
      this.activeTabId = null
      const next = this.order[this.order.length - 1]
      if (next) {
        this.switchTab(next) // handles its own reflow + broadcast
        return
      }
      this.createTab() // never leave zero tabs open; handles its own reflow + broadcast
      return
    }

    this.reflow()
    this.broadcastState()
  }

  // Ctrl+Shift+T. Reopens as a brand new tab (fresh navigation, not restored
  // scroll/history state) — same spirit as most browsers' "reopen closed
  // tab," not a full session restore.
  reopenClosedTab() {
    const entry = this.closedStack.pop()
    if (!entry) return
    this.createTab(entry.url, { groupId: entry.groupId })
  }

  // Ctrl+Tab: wraps around past the last tab back to the first.
  switchToNextTab() {
    if (this.order.length < 2) return
    const currentIndex = this.order.indexOf(this.activeTabId)
    const nextIndex = (currentIndex + 1) % this.order.length
    this.switchTab(this.order[nextIndex])
  }

  // Ctrl+1..8: 1-indexed from the user's perspective, no-ops past the end
  // rather than wrapping or erroring.
  switchToTabIndex(index) {
    const id = this.order[index]
    if (id) this.switchTab(id)
  }

  switchTab(id) {
    const tab = this.tabs.get(id)
    if (!tab) return
    if (tab.frozen) this.thawTab(id)
    tab.lastActiveAt = Date.now()
    this.activeTabId = id
    if (!tab.isIncognito) this.onActiveUrlChange?.(tab.url)
    this.reflow()
    this.broadcastState()
  }

  getActiveUrl() {
    return this.tabs.get(this.activeTabId)?.url ?? null
  }

  isActiveTabIncognito() {
    return !!this.tabs.get(this.activeTabId)?.isIncognito
  }

  // Call when this TabManager's window closes. Only matters now that
  // TabManagers can be created and destroyed repeatedly within one app run
  // (a Ctrl+N window, then closed) — with a single lifelong instance this
  // interval never needed clearing, since the whole process exited with it.
  destroy() {
    clearInterval(this._freezeInterval)
  }

  navigate(id, input) {
    const tab = this.tabs.get(id)
    if (!tab?.view) return
    tab.view.webContents.loadURL(resolveInput(input, this.store))
  }

  goBack(id) {
    const wc = this.tabs.get(id)?.view?.webContents
    if (!wc) return
    if (wc.navigationHistory?.canGoBack()) wc.navigationHistory.goBack()
    else if (wc.canGoBack?.()) wc.goBack()
  }

  goForward(id) {
    const wc = this.tabs.get(id)?.view?.webContents
    if (!wc) return
    if (wc.navigationHistory?.canGoForward()) wc.navigationHistory.goForward()
    else if (wc.canGoForward?.()) wc.goForward()
  }

  reload(id) {
    this.tabs.get(id)?.view?.webContents.reload()
  }

  // Toggles a distraction-free view of the current page in place. Tab views
  // have no preload/IPC by design (they load untrusted content), so there's
  // no bridge to hand extracted content back through — executeJavaScript's
  // return value doesn't need one, it resolves straight in the main process.
  async toggleReaderMode(id) {
    const tab = this.tabs.get(id)
    if (!tab?.view) return // frozen tabs (never the active tab) have nothing to extract from
    const wc = tab.view.webContents

    if (tab.readerActive) {
      const restoreUrl = tab.readerOriginalUrl
      tab.readerActive = false
      tab.readerOriginalUrl = null
      if (restoreUrl) wc.loadURL(restoreUrl)
      this.broadcastState()
      return
    }

    let extracted
    try {
      extracted = await wc.executeJavaScript(EXTRACTION_SCRIPT, true)
    } catch {
      extracted = null
    }
    if (!extracted || !extracted.content) {
      this.onToast?.('Nothing readable found on this page.')
      return
    }

    const sourceUrl = wc.getURL()
    tab.readerActive = true
    tab.readerOriginalUrl = sourceUrl
    const html = buildReaderHtml(extracted.title, extracted.content, sourceUrl)
    wc.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    this.broadcastState()
  }

  // ---- freezing (Milestone 8: zero-resource tab deep freezing) ----
  //
  // A "frozen" tab has tab.view === null: its WebContentsView and the
  // Chromium renderer process behind it are fully destroyed, not just
  // hidden/backgrounded like Milestone 1's inactive-tab handling in reflow()
  // above. That's the actual memory win — a backgrounded WebContentsView
  // still holds its renderer process and everything in it; this doesn't.
  // Every other method that touches tab.view (reflow, closeTab, navigate,
  // goBack/Forward, reload, toggleReaderMode) is written to treat a null
  // view as "nothing to do here" rather than assuming it's always live.

  _checkIdleTabs() {
    const cfg = this.store?.get('tabFreezing')
    if (!cfg?.enabled) return
    const freezeAfterMs = Math.max(1, cfg.freezeAfterMin) * 60_000
    const now = Date.now()
    for (const id of this.order) {
      const tab = this.tabs.get(id)
      if (!tab || tab.frozen || id === this.activeTabId) continue
      if (now - tab.lastActiveAt > freezeAfterMs) this.freezeTab(id)
    }
  }

  // Never freezes the active tab — there's nothing to "reclaim" from the one
  // tab the user is actually looking at, and doing so would just mean an
  // unwanted reload the instant they touch it.
  freezeTab(id) {
    const tab = this.tabs.get(id)
    if (!tab || !tab.view || id === this.activeTabId) return

    const wc = tab.view.webContents
    const finishFreeze = (scrollY) => {
      const current = this.tabs.get(id)
      if (!current || !current.view) return // closed or already frozen mid-capture
      if (id === this.activeTabId) return // switched to it while the scrollY capture was in flight
      this.win.contentView.removeChildView(current.view)
      if (!wc.isDestroyed()) wc.close()
      current.view = null
      current.frozen = true
      current.scrollY = scrollY || 0
      this.broadcastState()
    }

    if (wc.isDestroyed()) {
      finishFreeze(tab.scrollY)
      return
    }

    const capture = wc.executeJavaScript('window.scrollY || document.documentElement.scrollTop || 0', true)
    const timeout = new Promise((resolve) => setTimeout(() => resolve(tab.scrollY), 1500))
    Promise.race([capture, timeout])
      .catch(() => tab.scrollY)
      .then(finishFreeze)
  }

  thawTab(id) {
    const tab = this.tabs.get(id)
    if (!tab || !tab.frozen) return

    // Same partition string is cached by Electron per-process, so this
    // recovers the exact same in-memory incognito session the tab had
    // before freezing rather than starting it over in a fresh one.
    const tabSession = this.isIncognito ? this.session : tab.isIncognito ? this.createIncognitoSession?.() || this.session : this.session
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        session: tabSession
      }
    })
    this.win.contentView.addChildView(view)
    attachDevToolsToggle(view.webContents)
    attachShortcutHandler(view.webContents, this.onKeyboardShortcut)

    tab.view = view
    tab.frozen = false
    this._wireTabEvents(tab)

    const targetScrollY = tab.scrollY || 0
    view.webContents.loadURL(tab.url)
    if (targetScrollY > 0) {
      view.webContents.once('did-finish-load', () => {
        view.webContents.executeJavaScript(`window.scrollTo(0, ${targetScrollY})`).catch(() => {})
      })
    }
  }

  // ---- groups (deliberately minimal: create, assign, remove, close) ----

  createGroup(name = 'New Group') {
    const id = randomUUID()
    const color = GROUP_COLORS[this._nextGroupColor % GROUP_COLORS.length]
    this._nextGroupColor++
    this.groups.set(id, { id, name, color })
    this.broadcastState()
    return id
  }

  addTabToGroup(tabId, groupId) {
    const tab = this.tabs.get(tabId)
    if (!tab || !this.groups.has(groupId)) return
    tab.groupId = groupId
    this.broadcastState()
  }

  removeTabFromGroup(tabId) {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    tab.groupId = null
    this.broadcastState()
  }

  closeGroup(groupId) {
    const ids = this.order.filter((id) => this.tabs.get(id)?.groupId === groupId)
    ids.forEach((id) => this.closeTab(id))
    this.groups.delete(groupId)
    this.broadcastState()
  }

  toggleMute(tabId) {
    const tab = this.tabs.get(tabId)
    if (tab && tab.view) {
      const wc = tab.view.webContents
      wc.setAudioMuted(!wc.isAudioMuted())
      this.broadcastState()
    }
  }

  // ---- events / state ----

  _wireTabEvents(tab) {
    const wc = tab.view.webContents

    // Without this, Electron's default for window.open()/target="_blank"
    // (and things like <a target="_blank">, ctrl/cmd-click, "open in new
    // window" context menu items) is to spawn a brand-new native
    // BrowserWindow outside this app's own chrome entirely — denying it here
    // and opening a real tab instead keeps every link inside the one
    // tabbed window a user expects. "background-tab" (middle-click/ctrl-click
    // on a link) opens without stealing focus, same as every other browser.
    wc.setWindowOpenHandler((details) => {
      this.createTab(details.url, {
        activate: details.disposition !== 'background-tab',
        groupId: tab.groupId,
        incognito: tab.isIncognito
      })
      return { action: 'deny' }
    })

    wc.on('dom-ready', () => {
      this.onTabDomReady?.(wc, tab.url)
    })

    wc.on('found-in-page', (event, result) => {
      if (this.chromeView && !this.chromeView.webContents.isDestroyed()) {
        this.chromeView.webContents.send('tab:foundInPageResult', {
          tabId: tab.id,
          activeMatchOrdinal: result.activeMatchOrdinal,
          matches: result.matches
        })
      }
    })
    const updateAudible = () => {
      if (wc.isDestroyed()) return
      const isAudible = wc.isCurrentlyAudible()
      if (tab.isAudible !== isAudible) {
        tab.isAudible = isAudible
        this.broadcastState()
      }
    }
    wc.on('media-started-playing', () => {
      updateAudible()
      setTimeout(updateAudible, 100)
    })
    wc.on('media-paused', () => {
      updateAudible()
      setTimeout(updateAudible, 100)
    })
    wc.on('page-title-updated', (_e, title) => {
      tab.title = title
      this.history?.updateTitle(tab.url, title)
      this.broadcastState()
    })
    wc.on('did-start-loading', () => {
      tab.isLoading = true
      this.broadcastState()
    })
    wc.on('did-stop-loading', () => {
      tab.isLoading = false
      tab.canGoBack = wc.navigationHistory?.canGoBack?.() ?? wc.canGoBack?.() ?? false
      tab.canGoForward = wc.navigationHistory?.canGoForward?.() ?? wc.canGoForward?.() ?? false
      this.broadcastState()
    })
    wc.on('did-navigate', (_e, url) => {
      tab.url = url
      // Entering reader mode: our own loadURL() call in toggleReaderMode
      // already flipped readerActive before navigating, so this is the one
      // did-navigate that's "internal" rather than the user actually going
      // somewhere — recordVisit/onActiveUrlChange both skip it, so reader
      // mode doesn't show up in history and doesn't interrupt usage-time
      // tracking of whatever site's article is being read.
      const enteringReaderMode = tab.readerActive && url.startsWith('data:text/html')
      // Leaving the data: URL we generated (address bar, back/forward, a
      // clicked link) counts as exiting reader mode.
      if (tab.readerActive && !url.startsWith('data:text/html')) {
        tab.readerActive = false
        tab.readerOriginalUrl = null
      }
      if (!enteringReaderMode) {
        if (!tab.isIncognito) this.history?.recordVisit(url)
        if (tab.id === this.activeTabId && !tab.isIncognito) this.onActiveUrlChange?.(url)
      }

      try {
        const hostname = new URL(url).hostname.toLowerCase()
        const zoomSettings = this.store?.get('zoomSettings') || { hosts: {} }
        const storedFactor = zoomSettings.hosts?.[hostname] || 1.0
        wc.setZoomFactor(storedFactor)
        
        if (this.chromeView && !this.chromeView.webContents.isDestroyed()) {
          this.chromeView.webContents.send('tab:zoomChanged', { tabId: tab.id, zoomFactor: storedFactor })
        }
      } catch {
        wc.setZoomFactor(1.0)
      }

      this.broadcastState()
    })
    wc.on('did-navigate-in-page', (_e, url) => {
      tab.url = url
      this.broadcastState()
    })
    wc.on('page-favicon-updated', (_e, favicons) => {
      tab.favicon = favicons[0] || null
      this.broadcastState()
    })
  }

  getState() {
    return {
      activeTabId: this.activeTabId,
      groups: [...this.groups.values()],
      tabs: this.order.map((id) => {
        const t = this.tabs.get(id)
        return {
          id: t.id,
          title: t.title,
          url: t.url,
          isLoading: t.isLoading,
          canGoBack: t.canGoBack,
          canGoForward: t.canGoForward,
          groupId: t.groupId,
          favicon: t.favicon,
          readerActive: t.readerActive,
          frozen: t.frozen,
          isAudible: t.isAudible || false,
          isMuted: t.view ? t.view.webContents.isAudioMuted() : false,
          isIncognito: !!t.isIncognito
        }
      }),
      bookmarks: this.store.get('bookmarks')?.list || []
    }
  }

  broadcastState() {
    if (this.chromeView.webContents.isDestroyed()) return
    this.chromeView.webContents.send('tabs:state', this.getState())
  }
}

module.exports = { TabManager, NEW_TAB_URL, attachDevToolsToggle, attachShortcutHandler, resolveInput }
