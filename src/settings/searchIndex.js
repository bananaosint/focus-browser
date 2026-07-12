// Search index for the Settings search box. One entry per searchable control
// or subsection. `anchor` is the element id to scroll into view; `controlId`
// is the specific control to flash-highlight on landing. Plain data, loaded as
// a <script> global (no bundler).
;(function () {
  const SETTINGS_SEARCH_INDEX = [
    // Focus
    { category: 'focus', section: 'Focus Mode', label: 'Focus Mode', keywords: ['distraction free', 'tab limit', 'minimize distractions'], anchor: 'sub-focus-mode', controlId: 'focus-enabled-toggle' },
    { category: 'focus', section: 'Pomodoro Timer', label: 'Pomodoro timer', keywords: ['work break timer', 'intervals', 'sessions', 'tomato'], anchor: 'sub-pomodoro', controlId: 'work-min' },
    { category: 'focus', section: 'Site Blocking', label: 'Site blocking', keywords: ['block facebook', 'blocklist', 'allowlist', 'block site', 'distracting sites'], anchor: 'sub-blocking', controlId: 'enabled-toggle' },
    // Browser
    { category: 'browser', section: 'Tabs & Memory', label: 'Tabs and memory', keywords: ['memory', 'freeze tabs', 'ram usage', 'suspend tabs', 'save memory'], anchor: 'sub-tabs', controlId: 'freeze-enabled-toggle' },
    { category: 'browser', section: 'Toolbar', label: 'Toolbar buttons', keywords: ['hide buttons', 'toolbar', 'show buttons'], anchor: 'sub-toolbar', controlId: 'sub-toolbar' },
    { category: 'browser', section: 'Appearance', label: 'Appearance', keywords: ['dark mode', 'light mode', 'theme', 'colors', 'palette', 'night lofi', 'washi', 'zen'], anchor: 'sub-appearance', controlId: 'appearance-swatches' },
    { category: 'browser', section: 'Search Engine', label: 'Search engine', keywords: ['default search', 'change search engine', 'google', 'bing', 'duckduckgo', 'suggestions'], anchor: 'sub-search', controlId: 'search-engine' },
    { category: 'browser', section: 'Launch Profiles', label: 'Launch profiles', keywords: ['launch profile', 'open vscode', 'dev environment', 'profiles', 'workspace launcher'], anchor: 'sub-launcher', controlId: 'profile-name' },
    { category: 'browser', section: 'Keyboard Shortcuts', label: 'Keyboard shortcuts', keywords: ['shortcuts', 'hotkeys', 'keyboard commands', 'reopen closed tab', 'key bindings'], anchor: 'sub-shortcuts', controlId: 'shortcuts-list' },
    // Privacy & Security
    { category: 'privacy', section: 'Cookies & Site Data', label: 'Cookies and site data', keywords: ['cookies', 'site data', 'local storage'], anchor: 'sub-cookies', controlId: 'cookies-list' },
    { category: 'privacy', section: 'Site Permissions', label: 'Site permissions', keywords: ['camera', 'microphone', 'location', 'permissions', 'geolocation'], anchor: 'sub-permissions', controlId: 'permissions-list' },
    { category: 'privacy', section: 'Clear Browsing Data', label: 'Clear browsing data', keywords: ['delete history', 'wipe cache', 'clear cookies', 'erase data', 'reset browser', 'remove history', 'clear data'], anchor: 'sub-clear-data', controlId: 'privacy-clear-all-btn' },
    // Passwords
    { category: 'passwords', section: 'Add Login', label: 'Add login', keywords: ['generate password', 'strong password', 'save login', 'new password'], anchor: 'sub-add', controlId: 'pwd-host' },
    { category: 'passwords', section: 'Saved Logins', label: 'Saved logins', keywords: ['saved passwords', 'logins', 'credentials'], anchor: 'sub-saved', controlId: 'pwd-search' },
    // Downloads
    { category: 'downloads', section: 'Downloads', label: 'Downloads', keywords: ['downloads', 'files', 'download history'], anchor: 'panel-downloads', controlId: 'downloads-list' },
    // Bookmarks
    { category: 'bookmarks', section: 'Bookmarks', label: 'Bookmarks', keywords: ['bookmarks', 'import bookmarks', 'export bookmarks', 'favorites'], anchor: 'panel-bookmarks', controlId: 'bookmarks-list' },
    // AI Chat
    { category: 'aichat', section: 'Connection', label: 'AI connection', keywords: ['api key', 'claude key', 'openai key', 'gemini key', 'provider', 'model'], anchor: 'sub-connection', controlId: 'ai-api-key' },
    { category: 'aichat', section: 'Automation', label: 'AI automation', keywords: ['ai control browser', 'let ai click', 'auto agent', 'ai automation', 'agentic', 'script my browser'], anchor: 'sub-automation', controlId: 'ai-agentic-toggle' },
    { category: 'aichat', section: 'Check-ins', label: 'Productivity check-ins', keywords: ['productivity', 'nudge', 'check in', 'focus check'], anchor: 'sub-checkins', controlId: 'ai-productivity-toggle' }
  ]

  // Small Levenshtein for the fuzzy tier (only used on tokens >= 4 chars).
  function editDistance(a, b) {
    const m = a.length, n = b.length
    if (!m) return n
    if (!n) return m
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
    for (let j = 0; j <= n; j++) dp[0][j] = j
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
      }
    }
    return dp[m][n]
  }

  function normalize(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  }

  // Scores every entry against the query; returns up to `limit` best matches.
  function searchSettings(query, limit) {
    const q = normalize(query)
    if (!q) return []
    const qTokens = q.split(' ')
    const results = []
    for (const entry of SETTINGS_SEARCH_INDEX) {
      const label = normalize(entry.label)
      const kw = entry.keywords.map(normalize)
      let score = 0
      if (label.includes(q)) score += 3
      for (const k of kw) if (k.includes(q) || q.includes(k)) score += 2
      // fuzzy per-token
      for (const qt of qTokens) {
        if (qt.length < 4) continue
        const hay = [label, ...kw, normalize(entry.section)].join(' ').split(' ')
        for (const ht of hay) {
          if (ht.length < 4) continue
          if (editDistance(qt, ht) <= 2) { score += 1; break }
        }
      }
      if (score > 0) results.push({ entry, score })
    }
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, limit || 6).map((r) => r.entry)
  }

  const api = { SETTINGS_SEARCH_INDEX, searchSettings }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof window !== 'undefined') window.SettingsSearch = Object.assign(window.SettingsSearch || {}, api)
})()
