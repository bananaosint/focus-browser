const MAX_ENTRIES = 5000

// One entry per tick (see main.js's 60s ticker), not per-URL like history.js
// — this is "what was I doing, minute by minute," a sequence, not a
// deduplicated visited-pages index.
class ActivityLog {
  constructor(store) {
    this.store = store
  }

  get state() {
    return this.store.get('activityLog')
  }

  record({ url, title }) {
    const entries = [...this.state.entries, { url, title: title || '', timestamp: Date.now() }]
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
    this.store.update('activityLog', { entries })
  }

  // Most recent first — same convention as history.js's getRecent(), used by
  // both the Dashboard's Activity Log tab and the AI's read_activity_log tool.
  getRecent(n = 100) {
    return this.state.entries.slice(-n).reverse()
  }

  clearAll() {
    this.store.update('activityLog', { entries: [] })
  }
}

module.exports = { ActivityLog }
