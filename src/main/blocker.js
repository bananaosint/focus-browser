const { webContents } = require('electron')
const { pathToFileURL } = require('url')
const path = require('path')

const BLOCKED_PAGE = pathToFileURL(path.join(__dirname, '..', 'pages', 'blocked.html')).toString()

function escapeRegex(s) {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
}

// Plain domains ("example.com") match themselves and any subdomain, same as
// every other blocker — that's what users expect when they type one entry.
// A "*" in the pattern is treated as a simple glob (not full regex): covers
// the wildcard cases people actually write (e.g. "*.tumblr.com", "old.*.io")
// without the footgun of letting user-typed regex run against every
// navigation (ReDoS, accidental catastrophic backtracking).
function hostMatchesPattern(hostname, pattern) {
  hostname = hostname.toLowerCase()
  pattern = pattern.trim().toLowerCase()
  if (!pattern) return false
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.split('*').map(escapeRegex).join('.*') + '$')
    return regex.test(hostname)
  }
  return hostname === pattern || hostname.endsWith('.' + pattern)
}

class Blocker {
  constructor(store) {
    this.store = store
    this.temporaryUnlocks = new Map() // hostname -> expiry timestamp (ms), memory-only by design
    this.onChange = null // wired by main.js to broadcast state to the settings window
    this.onBlock = null // wired by main.js to record blocked distraction attempts
  }

  get state() {
    return this.store.get('blocker')
  }

  isBlocked(urlString) {
    if (!this.state.enabled) return false

    let hostname
    try {
      hostname = new URL(urlString).hostname
    } catch {
      return false
    }
    if (!hostname) return false

    const targetHost = hostname.toLowerCase()
    for (const [unlockedHost, unlockUntil] of this.temporaryUnlocks.entries()) {
      if (Date.now() < unlockUntil) {
        if (targetHost === unlockedHost || targetHost.endsWith('.' + unlockedHost) || unlockedHost.endsWith('.' + targetHost)) {
          return false
        }
      } else {
        this.temporaryUnlocks.delete(unlockedHost)
      }
    }

    if (this.state.allowlist.some((p) => hostMatchesPattern(hostname, p))) return false
    return this.state.blocklist.some((p) => hostMatchesPattern(hostname, p))
  }

  temporarilyUnlock(hostname, minutes = 10) {
    this.temporaryUnlocks.set(hostname.toLowerCase(), Date.now() + minutes * 60_000)
  }

  setEnabled(enabled) {
    this._update({ enabled: !!enabled })
  }

  addBlock(pattern) {
    this._addPattern('blocklist', pattern)
  }

  removeBlock(pattern) {
    this._removePattern('blocklist', pattern)
  }

  addAllow(pattern) {
    this._addPattern('allowlist', pattern)
  }

  removeAllow(pattern) {
    this._removePattern('allowlist', pattern)
  }

  _addPattern(listKey, pattern) {
    const clean = pattern.trim().toLowerCase()
    if (!clean || this.state[listKey].includes(clean)) return
    this._update({ [listKey]: [...this.state[listKey], clean] })
  }

  _removePattern(listKey, pattern) {
    this._update({ [listKey]: this.state[listKey].filter((p) => p !== pattern) })
  }

  _update(patch) {
    this.store.update('blocker', patch)
    this.onChange?.(this.state)
  }

  buildBlockedPageUrl(hostname, originalUrl) {
    const u = new URL(BLOCKED_PAGE)
    u.searchParams.set('host', hostname)
    u.searchParams.set('url', originalUrl)
    return u.toString()
  }

  // Only main-frame navigations are checked. Blocking subresources too would
  // break unrelated sites that happen to embed something from a blocked
  // domain (a CDN, a share widget) — the plan asks for "redirect to a
  // blocked page", which is inherently a navigation-level action anyway.
  install(session) {
    session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
      if (details.resourceType !== 'mainFrame' || !this.isBlocked(details.url)) {
        callback({})
        return
      }
      callback({ cancel: true })
      const hostname = new URL(details.url).hostname
      this.onBlock?.(hostname)
      const wc = webContents.fromId(details.webContentsId)
      if (wc && !wc.isDestroyed()) wc.loadURL(this.buildBlockedPageUrl(hostname, details.url))
    })
  }
}

module.exports = { Blocker, hostMatchesPattern }
