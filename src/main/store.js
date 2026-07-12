const fs = require('fs')
const path = require('path')
const { app } = require('electron')

// One flat JSON file, namespaced by feature ('blocker', 'pomodoro', ...).
// The original plan called for SQLite (better-sqlite3) once usage stats
// showed up, but that's a native module needing a rebuild against
// Electron's own Node ABI — real risk for zero benefit at this data size.
// usageStats stores one number per (day, hostname); history is capped at a
// few thousand entries. Both fit fine in the same flat JSON file as
// everything else, so there was never actually a milestone where a real DB
// earned its keep.
const DEFAULTS = {
  blocker: {
    enabled: true,
    blocklist: [
      'facebook.com',
      'instagram.com',
      'twitter.com',
      'x.com',
      'tiktok.com',
      'youtube.com',
      'reddit.com',
      'netflix.com',
      'twitch.tv',
      'pinterest.com'
    ],
    allowlist: []
  },
  pomodoro: {
    workMin: 25,
    shortBreakMin: 5,
    longBreakMin: 15,
    cyclesBeforeLongBreak: 4,
    autoFocus: true, // auto-enable Focus Mode + blocking for work sessions, auto-lift on break
    muted: false // suppresses the phase-complete OS notification (see Pomodoro._notify)
  },
  focusMode: {
    enabled: false,
    tabLimit: 0 // 0 = no limit
  },
  workspace: {
    folder: null,
    sidebarVisible: false,
    sidebarWidth: 320,
    treeCollapsed: false
  },
  profiles: {
    list: [] // { id, name, urls: string[], commands: string[], cwd: string|null }
  },
  tabFreezing: {
    enabled: true,
    freezeAfterMin: 10
  },
  usageStats: {
    days: {} // { 'YYYY-MM-DD': { [hostname]: milliseconds } }
  },
  history: {
    entries: {} // { [url]: { url, title, lastVisitedAt, visitCount } }
  },
  // A timestamped sequence (not a per-URL dict like history above) — one
  // snapshot of "what tab was active" per tick, taken only during a running
  // Pomodoro work session (see main.js). Feeds the Dashboard's Activity Log
  // tab and the AI's read_activity_log tool.
  activityLog: {
    entries: [] // [{ url, title, timestamp }], oldest first
  },
  // Settings and Workspace are excluded on purpose — Settings is how you get
  // back into this list if everything else is hidden, and Workspace was
  // asked for by name to stay put. Everything else here is an optional
  // feature button, not core navigation, so it's fair game to declutter.
  toolbarVisibility: {
    reader: false,
    group: false,
    focusMode: false,
    pomodoro: true,
    launcher: false,
    dashboard: true,
    aiChat: true
  },
  aiChat: {
    sidebarVisible: false,
    sidebarWidth: 320,
    provider: 'anthropic',
    apiKey: '',
    model: '',
    // Off by default: gates tools that act on pages the user is already
    // authenticated into (clicks, form fills, submits), not just read them.
    agenticToolsEnabled: false,
    // Off by default: a recurring background LLM call (every 5 min during a
    // running Pomodoro work session) that judges the current session's
    // Activity Log and nudges the user if it looks like they've drifted.
    productivityMonitorEnabled: false
  },
  bookmarks: {
    list: []
  },
  focusStats: {
    pomodorosCompleted: 0,
    distractionsBlocked: 0,
    history: {}
  },
  // Latest off-track nudge from the productivity monitor (see main.js), so
  // it's still visible in the Dashboard's Productivity tab well after the
  // OS notification itself has disappeared. null fields = nothing pinned.
  productivityNudge: {
    message: null,
    timestamp: null
  },
  downloads: {
    list: []
  },
  passwords: {
    list: []
  },
  permissions: {
    sites: {}
  },
  searchSettings: {
    engine: 'google',
    customUrl: '',
    suggestionsEnabled: true
  },
  zoomSettings: {
    hosts: {}
  },
  // Theme preference. mode is the user's *choice* — 'light' | 'dark' |
  // 'system' — resolved to a concrete light/dark at broadcast time (see
  // src/main/theme.js). Default is Night lofi, dark (unchanged from the
  // pre-redesign look); 'system' is an available option, not the default.
  theme: {
    palette: 'nightlofi',
    mode: 'dark'
  },
  // First-run onboarding tour. Skip and Finish both set completed=true; there
  // is deliberately no separate skipped-vs-completed tracking (zero telemetry).
  onboarding: {
    completed: false,
    completedAt: null
  },
  // Misc Settings-window UI state that isn't feature data. lastOpenCategory
  // reopens Settings on the last category viewed rather than always the first.
  settings: {
    lastOpenCategory: 'focus'
  }
}

function filePath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

class SettingsStore {
  constructor() {
    this.data = this._load()
  }

  _load() {
    try {
      const raw = fs.readFileSync(filePath(), 'utf-8')
      const parsed = JSON.parse(raw)
      // Shallow-merge per namespace so new default keys (e.g. a future
      // pomodoro setting) show up for existing users without wiping the rest.
      return {
        blocker: { ...DEFAULTS.blocker, ...parsed.blocker },
        pomodoro: { ...DEFAULTS.pomodoro, ...parsed.pomodoro },
        focusMode: { ...DEFAULTS.focusMode, ...parsed.focusMode },
        workspace: { ...DEFAULTS.workspace, ...parsed.workspace },
        profiles: { ...DEFAULTS.profiles, ...parsed.profiles },
        tabFreezing: { ...DEFAULTS.tabFreezing, ...parsed.tabFreezing },
        usageStats: { ...DEFAULTS.usageStats, ...parsed.usageStats },
        history: { ...DEFAULTS.history, ...parsed.history },
        activityLog: { ...DEFAULTS.activityLog, ...parsed.activityLog },
        toolbarVisibility: { ...DEFAULTS.toolbarVisibility, ...parsed.toolbarVisibility },
        aiChat: { ...DEFAULTS.aiChat, ...parsed.aiChat },
        bookmarks: { ...DEFAULTS.bookmarks, ...parsed.bookmarks },
        focusStats: { ...DEFAULTS.focusStats, ...parsed.focusStats },
        productivityNudge: { ...DEFAULTS.productivityNudge, ...parsed.productivityNudge },
        downloads: { ...DEFAULTS.downloads, ...parsed.downloads },
        passwords: { ...DEFAULTS.passwords, ...parsed.passwords },
        permissions: { ...DEFAULTS.permissions, ...parsed.permissions },
        searchSettings: { ...DEFAULTS.searchSettings, ...parsed.searchSettings },
        zoomSettings: { ...DEFAULTS.zoomSettings, ...parsed.zoomSettings },
        theme: { ...DEFAULTS.theme, ...parsed.theme },
        onboarding: { ...DEFAULTS.onboarding, ...parsed.onboarding },
        settings: { ...DEFAULTS.settings, ...parsed.settings }
      }
    } catch {
      return JSON.parse(JSON.stringify(DEFAULTS))
    }
  }

  _save() {
    fs.mkdirSync(path.dirname(filePath()), { recursive: true })
    fs.writeFileSync(filePath(), JSON.stringify(this.data, null, 2))
  }

  get(namespace) {
    return this.data[namespace]
  }

  update(namespace, patch) {
    this.data[namespace] = { ...this.data[namespace], ...patch }
    this._save()
    return this.data[namespace]
  }
}

module.exports = { SettingsStore }
