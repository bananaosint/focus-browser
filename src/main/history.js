const MAX_ENTRIES = 5000

function isTrackableUrl(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

// Records every real navigation across every tab (not just the active one —
// unlike UsageStats, this is "what URLs have I been to," not attention
// time), for the address bar's autocomplete. recordVisit() and
// updateTitle() are separate because they fire at different points in a
// navigation: the URL is known immediately (did-navigate), the page's title
// generally isn't until slightly after (page-title-updated) — calling
// recordVisit twice per navigation would double-count visitCount.
class History {
  constructor(store) {
    this.store = store
  }

  get state() {
    return this.store.get('history')
  }

  recordVisit(url) {
    if (!isTrackableUrl(url)) return
    const entries = { ...this.state.entries }
    const existing = entries[url]
    entries[url] = {
      url,
      title: existing?.title || '',
      lastVisitedAt: Date.now(),
      visitCount: (existing?.visitCount || 0) + 1
    }
    this._save(entries)
  }

  updateTitle(url, title) {
    if (!title) return
    const existing = this.state.entries[url]
    if (!existing || existing.title === title) return
    this._save({ ...this.state.entries, [url]: { ...existing, title } })
  }

  _save(entries) {
    let list = Object.values(entries)
    if (list.length > MAX_ENTRIES) {
      list.sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
      list = list.slice(0, MAX_ENTRIES)
      entries = Object.fromEntries(list.map((e) => [e.url, e]))
    }
    this.store.update('history', { entries })
  }

  // Plain substring match on URL/title, weighted by a bit of recency and
  // frequency — enough to stop "which exact URL was that" guesswork without
  // pretending to be a real fuzzy-match/relevance engine.
  search(query, limit = 8) {
    const q = (query || '').trim().toLowerCase()
    if (!q) return []
    const now = Date.now()
    const scored = Object.values(this.state.entries)
      .map((entry) => ({ entry, score: this._score(entry, q, now) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
    return scored.slice(0, limit).map((s) => s.entry)
  }

  _score(entry, q, now) {
    const url = entry.url.toLowerCase()
    const title = (entry.title || '').toLowerCase()
    let score = 0
    if (url.includes(q)) score += 3
    if (title.includes(q)) score += 2
    if (score === 0) return 0
    const daysAgo = (now - entry.lastVisitedAt) / 86_400_000
    score += Math.max(0, 3 - daysAgo * 0.2) // mild recency boost, decays over ~15 days
    score += Math.min(2, entry.visitCount * 0.1) // mild frequency boost, caps out fast
    return score
  }

  // Most-recently-visited N entries, no query — used by the AI chat's
  // read_history tool ("what have I been looking at") rather than the
  // address bar's query-driven search() above.
  getRecent(n = 30) {
    return Object.values(this.state.entries)
      .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
      .slice(0, n)
      .map((e) => ({ url: e.url, title: e.title, lastVisitedAt: e.lastVisitedAt }))
  }

  clearAll() {
    this.store.update('history', { entries: {} })
  }

  getHistoryList(query) {
    const list = Object.values(this.state.entries)
      .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
    const q = (query || '').trim().toLowerCase()
    if (!q) return list
    return list.filter((e) => {
      const url = e.url.toLowerCase()
      const title = (e.title || '').toLowerCase()
      return url.includes(q) || title.includes(q)
    })
  }

  deleteEntry(url) {
    const entries = { ...this.state.entries }
    if (entries[url]) {
      delete entries[url]
      this._save(entries)
      return true
    }
    return false
  }

  deleteEntriesForHost(hostname) {
    const entries = { ...this.state.entries }
    let changed = false
    const lowerHost = hostname.toLowerCase()
    for (const url of Object.keys(entries)) {
      try {
        const u = new URL(url)
        const itemHost = u.hostname.toLowerCase()
        if (itemHost === lowerHost || itemHost.endsWith('.' + lowerHost)) {
          delete entries[url]
          changed = true
        }
      } catch {
        // Skip invalid URL formats
      }
    }
    if (changed) {
      this._save(entries)
    }
    return changed
  }
}

module.exports = { History }
