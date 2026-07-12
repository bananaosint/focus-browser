const CHECKPOINT_MS = 60_000 // periodic flush so a long session isn't lost if the app dies uncleanly
const MIN_TRACKED_MS = 1000 // ignore sub-second blips from rapid tab switching

function trackableHostname(url) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.hostname
  } catch {
    return null
  }
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10) // YYYY-MM-DD
}

// Attention time, not "tab was open" time: only counts while a site's tab is
// the active one AND the window has focus. Switching away, backgrounding the
// app, or the tab not being a real http(s) page (newtab, blocked page,
// reader mode's data: URL) all stop the clock. No idle detection beyond
// that — leaving the window focused on a tab while away from the keyboard
// still counts, same as most simple time trackers without OS-level idle
// hooks.
class UsageStats {
  constructor(store) {
    this.store = store
    this.current = null // { hostname, startedAt }
    this._checkpointInterval = setInterval(() => this.checkpoint(), CHECKPOINT_MS)
  }

  get state() {
    return this.store.get('usageStats')
  }

  startTracking(url) {
    const hostname = trackableHostname(url)
    if (this.current?.hostname === hostname) return // same site still active, nothing to restart
    this.stopTracking()
    if (!hostname) return
    this.current = { hostname, startedAt: Date.now() }
  }

  stopTracking() {
    if (!this.current) return
    this._flush()
    this.current = null
  }

  checkpoint() {
    if (!this.current) return
    this._flush()
    this.current.startedAt = Date.now()
  }

  _flush() {
    const elapsed = Date.now() - this.current.startedAt
    if (elapsed < MIN_TRACKED_MS) return
    const days = { ...this.state.days }
    const key = dayKey()
    days[key] = { ...(days[key] || {}) }
    days[key][this.current.hostname] = (days[key][this.current.hostname] || 0) + elapsed
    this.store.update('usageStats', { days })
  }

  getDaySummary(key = dayKey()) {
    const bySite = this.state.days[key] || {}
    const entries = Object.entries(bySite)
      .map(([hostname, ms]) => ({ hostname, ms }))
      .sort((a, b) => b.ms - a.ms)
    return { date: key, total: entries.reduce((sum, e) => sum + e.ms, 0), bySite: entries }
  }

  getRecentDays(n = 7) {
    const out = []
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = dayKey(d)
      const bySite = this.state.days[key] || {}
      const total = Object.values(bySite).reduce((sum, ms) => sum + ms, 0)
      out.push({ date: key, total })
    }
    return out
  }

  clearAll() {
    this.stopTracking()
    this.store.update('usageStats', { days: {} })
  }

  deleteHostname(hostname) {
    const days = { ...this.state.days }
    let changed = false
    const lowerHost = hostname.toLowerCase()
    for (const key of Object.keys(days)) {
      if (days[key]) {
        const entries = Object.keys(days[key])
        const match = entries.find((k) => k.toLowerCase() === lowerHost || k.toLowerCase().endsWith('.' + lowerHost))
        if (match) {
          const nextDay = { ...days[key] }
          delete nextDay[match]
          days[key] = nextDay
          changed = true
        }
      }
    }
    if (changed) {
      this.store.update('usageStats', { days })
    }
    return changed
  }
}

module.exports = { UsageStats }
