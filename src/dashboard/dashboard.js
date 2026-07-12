const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const REFRESH_MS = 30_000

let activeTab = 'history' // 'history', 'productivity', or 'activity'
let searchQuery = ''
let searchTimeout = null

// Helper for duration formatting
function formatDuration(ms) {
  const totalMin = Math.round(ms / 60_000)
  if (totalMin < 1) return '<1 min'
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h === 0 ? `${m} min` : `${h}h ${m}m`
}

// Group key helper for dates in History list
function getGroupKey(timestamp) {
  const d = new Date(timestamp)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  const dStr = d.toDateString()
  if (dStr === today.toDateString()) return 'Today'
  if (dStr === yesterday.toDateString()) return 'Yesterday'

  return d.toLocaleDateString(undefined, { 
    weekday: 'long', 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  })
}

// Render browsing history list
async function renderHistory() {
  const historyContainer = document.getElementById('history-container')
  if (!historyContainer) return

  const entries = await window.dashboardAPI.getHistoryList(searchQuery)

  if (!entries || entries.length === 0) {
    historyContainer.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" width="40" height="40">
          <path fill="currentColor" d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        <div class="empty-text">${searchQuery ? 'No matching pages found' : 'Browsing history is empty'}</div>
      </div>
    `
    return
  }

  // Group entries by date
  const groups = {}
  entries.forEach((entry) => {
    const key = getGroupKey(entry.lastVisitedAt)
    if (!groups[key]) groups[key] = []
    groups[key].push(entry)
  })

  historyContainer.innerHTML = ''
  
  Object.keys(groups).forEach((dateKey) => {
    const groupDiv = document.createElement('div')
    groupDiv.className = 'history-group'

    const dateHeader = document.createElement('div')
    dateHeader.className = 'group-date'
    dateHeader.textContent = dateKey
    groupDiv.appendChild(dateHeader)

    groups[dateKey].forEach((entry) => {
      let hostname = ''
      try {
        hostname = new URL(entry.url).hostname
      } catch {
        hostname = entry.url || 'local'
      }

      const row = document.createElement('div')
      row.className = 'history-row'

      // Favicon
      const favContainer = document.createElement('div')
      favContainer.className = 'favicon-container'
      
      const favImg = document.createElement('img')
      favImg.className = 'favicon-img'
      favImg.src = `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(hostname)}`
      
      const favFallback = document.createElement('span')
      favFallback.className = 'favicon-fallback'
      favFallback.style.display = 'none'
      favFallback.textContent = hostname.charAt(0).toUpperCase() || 'W'

      favImg.onerror = () => {
        favImg.style.display = 'none'
        favFallback.style.display = 'flex'
      }

      favContainer.appendChild(favImg)
      favContainer.appendChild(favFallback)

      // Info
      const info = document.createElement('div')
      info.className = 'row-info'

      const title = document.createElement('div')
      title.className = 'row-title'
      title.textContent = entry.title || hostname || entry.url
      title.title = entry.url
      title.addEventListener('click', () => {
        window.dashboardAPI.openUrl(entry.url)
      })

      const urlSpan = document.createElement('span')
      urlSpan.className = 'row-url'
      urlSpan.textContent = entry.url

      info.appendChild(title)
      info.appendChild(urlSpan)

      // Time
      const timeSpan = document.createElement('div')
      timeSpan.className = 'row-time'
      const timeStr = new Date(entry.lastVisitedAt).toLocaleTimeString(undefined, { 
        hour: 'numeric', 
        minute: '2-digit' 
      })
      timeSpan.textContent = timeStr

      // Actions
      const actions = document.createElement('div')
      actions.className = 'row-actions'

      // Action 1: Delete individual entry
      const delItemBtn = document.createElement('button')
      delItemBtn.className = 'action-btn delete-item'
      delItemBtn.title = 'Remove page from history'
      delItemBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      `
      delItemBtn.addEventListener('click', async (e) => {
        e.stopPropagation()
        await window.dashboardAPI.deleteHistoryEntry(entry.url)
        renderHistory()
        renderProductivity() // Refresh stats in case totals shift
      })

      // Action 2: Delete entire domain history & stats
      const delHostBtn = document.createElement('button')
      delHostBtn.className = 'action-btn delete-host'
      delHostBtn.title = `Clear all data for ${hostname}`
      delHostBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zm2.46-7.12l1.41-1.41L12 12.59l2.12-2.12 1.41 1.41L13.41 14l2.12 2.12-1.41 1.41L12 15.41l-2.12 2.12-1.41-1.41L10.59 14l-2.13-2.12zM15.5 4l-1-1h-5l-1 1H5v2h14V4z"/>
        </svg>
      `
      delHostBtn.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (confirm(`Remove all browsing history and productivity stats for "${hostname}"? This cannot be undone.`)) {
          await window.dashboardAPI.deleteHistoryForHost(hostname)
          renderHistory()
          renderProductivity()
        }
      })

      actions.appendChild(delHostBtn)
      actions.appendChild(delItemBtn)

      row.appendChild(favContainer)
      row.appendChild(info)
      row.appendChild(timeSpan)
      row.appendChild(actions)

      groupDiv.appendChild(row)
    })

    historyContainer.appendChild(groupDiv)
  })
}

// Render the Activity Log tab — one row per minute-tick snapshot, newest
// first, grouped by date the same way the History tab is (reuses the same
// getGroupKey/.history-* CSS classes rather than a parallel set of styles).
async function renderActivityLog() {
  const container = document.getElementById('activity-container')
  if (!container) return

  const entries = await window.dashboardAPI.getActivityLog()

  if (!entries || entries.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" width="40" height="40">
          <path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 10.41V7h-2v6l5.25 3.15 1-1.64z"/>
        </svg>
        <div class="empty-text">No activity logged yet — this fills in once a minute during a running Pomodoro work session.</div>
      </div>
    `
    return
  }

  const groups = {}
  entries.forEach((entry) => {
    const key = getGroupKey(entry.timestamp)
    if (!groups[key]) groups[key] = []
    groups[key].push(entry)
  })

  container.innerHTML = ''

  Object.keys(groups).forEach((dateKey) => {
    const groupDiv = document.createElement('div')
    groupDiv.className = 'history-group'

    const dateHeader = document.createElement('div')
    dateHeader.className = 'group-date'
    dateHeader.textContent = dateKey
    groupDiv.appendChild(dateHeader)

    groups[dateKey].forEach((entry) => {
      let hostname = ''
      try {
        hostname = new URL(entry.url).hostname
      } catch {
        hostname = entry.url || 'local'
      }

      const row = document.createElement('div')
      row.className = 'history-row'

      const favContainer = document.createElement('div')
      favContainer.className = 'favicon-container'
      const favImg = document.createElement('img')
      favImg.className = 'favicon-img'
      favImg.src = `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(hostname)}`
      const favFallback = document.createElement('span')
      favFallback.className = 'favicon-fallback'
      favFallback.style.display = 'none'
      favFallback.textContent = hostname.charAt(0).toUpperCase() || 'W'
      favImg.onerror = () => {
        favImg.style.display = 'none'
        favFallback.style.display = 'flex'
      }
      favContainer.appendChild(favImg)
      favContainer.appendChild(favFallback)

      const info = document.createElement('div')
      info.className = 'row-info'
      const title = document.createElement('div')
      title.className = 'row-title'
      title.textContent = entry.title || hostname || entry.url
      title.title = entry.url
      title.addEventListener('click', () => window.dashboardAPI.openUrl(entry.url))
      const urlSpan = document.createElement('span')
      urlSpan.className = 'row-url'
      urlSpan.textContent = entry.url
      info.appendChild(title)
      info.appendChild(urlSpan)

      const timeSpan = document.createElement('div')
      timeSpan.className = 'row-time'
      timeSpan.textContent = new Date(entry.timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

      row.appendChild(favContainer)
      row.appendChild(info)
      row.appendChild(timeSpan)
      groupDiv.appendChild(row)
    })

    container.appendChild(groupDiv)
  })
}

// Pinned card: latest off-track nudge from the productivity monitor
// (main.js), so it's still readable after the OS notification itself has
// auto-dismissed. Hidden entirely once dismissed / if nothing's ever fired.
function renderNudge(state) {
  const card = document.getElementById('nudge-card')
  if (!card || !state) return
  if (!state.message) {
    card.classList.add('hidden')
    return
  }
  document.getElementById('nudge-message').textContent = state.message
  document.getElementById('nudge-time').textContent = state.timestamp
    ? new Date(state.timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : ''
  card.classList.remove('hidden')
}

// Render productivity stats
async function renderProductivity() {
  // Render Achievements
  const stats = await window.dashboardAPI.getFocusStats()
  const todayStr = new Date().toLocaleDateString('en-CA')
  const todayHistory = stats.history?.[todayStr] || { pomodoros: 0, blocked: 0 }
  
  const pomodoroVal = document.getElementById('stat-pomodoros')
  const blockedVal = document.getElementById('stat-blocked')
  if (pomodoroVal) pomodoroVal.textContent = todayHistory.pomodoros || 0
  if (blockedVal) blockedVal.textContent = todayHistory.blocked || 0

  // Render Today
  const summary = await window.dashboardAPI.getToday()
  const totalEl = document.getElementById('today-total')
  if (totalEl) {
    totalEl.textContent = summary.total > 0 ? `Total: ${formatDuration(summary.total)}` : 'No tracked activity today.'
  }

  const barsEl = document.getElementById('today-bars')
  if (barsEl) {
    barsEl.innerHTML = ''
    if (summary.bySite.length === 0) {
      barsEl.innerHTML = `<div class="empty-state"><div class="empty-text">No data today</div></div>`
    } else {
      const max = summary.bySite[0]?.ms || 1
      summary.bySite.forEach((site) => {
        const row = document.createElement('div')
        row.className = 'bar-row'

        const label = document.createElement('div')
        label.className = 'bar-label'
        label.textContent = site.hostname
        label.title = site.hostname

        const track = document.createElement('div')
        track.className = 'bar-track'
        const fill = document.createElement('div')
        fill.className = 'bar-fill'
        track.appendChild(fill)

        const value = document.createElement('div')
        value.className = 'bar-value'
        value.textContent = formatDuration(site.ms)

        row.appendChild(label)
        row.appendChild(track)
        row.appendChild(value)
        barsEl.appendChild(row)

        // Animate fill bar width
        requestAnimationFrame(() => {
          setTimeout(() => {
            fill.style.width = Math.max(2, Math.round((site.ms / max) * 100)) + '%'
          }, 50)
        })
      })
    }
  }

  // Render Last 7 Days
  const days = await window.dashboardAPI.getWeek()
  const chartEl = document.getElementById('week-chart')
  if (chartEl) {
    chartEl.innerHTML = ''
    const max = Math.max(1, ...days.map((d) => d.total))

    days.forEach((day) => {
      const col = document.createElement('div')
      col.className = 'week-col'

      const barWrap = document.createElement('div')
      barWrap.className = 'week-bar-wrap'
      const bar = document.createElement('div')
      bar.className = 'week-bar'
      bar.title = `${day.date}: ${formatDuration(day.total)}`
      barWrap.appendChild(bar)

      const label = document.createElement('div')
      label.className = 'week-label'
      label.textContent = DAY_NAMES[new Date(day.date + 'T00:00:00').getDay()]

      col.appendChild(barWrap)
      col.appendChild(label)
      chartEl.appendChild(col)

      // Animate bar columns height
      requestAnimationFrame(() => {
        setTimeout(() => {
          bar.style.height = Math.max(2, Math.round((day.total / max) * 100)) + '%'
        }, 50)
      })
    })
  }
}

// Refresh all sections
function refreshAll() {
  if (activeTab === 'history') renderHistory()
  else if (activeTab === 'activity') renderActivityLog()
  else renderProductivity()
}

// Tab Switching logic
function setupTabs() {
  const btnHistory = document.getElementById('tab-btn-history')
  const btnProductivity = document.getElementById('tab-btn-productivity')
  const btnActivity = document.getElementById('tab-btn-activity')
  const panelHistory = document.getElementById('panel-history')
  const panelProductivity = document.getElementById('panel-productivity')
  const panelActivity = document.getElementById('panel-activity')

  const allBtns = [btnHistory, btnProductivity, btnActivity]
  const allPanels = [panelHistory, panelProductivity, panelActivity]

  function activate(tab, btn, panel, render) {
    if (activeTab === tab) return
    activeTab = tab
    allBtns.forEach((b) => b.classList.toggle('active', b === btn))
    allPanels.forEach((p) => p.classList.toggle('active', p === panel))
    render()
  }

  btnHistory.addEventListener('click', () => activate('history', btnHistory, panelHistory, renderHistory))
  btnProductivity.addEventListener('click', () => activate('productivity', btnProductivity, panelProductivity, renderProductivity))
  btnActivity.addEventListener('click', () => activate('activity', btnActivity, panelActivity, renderActivityLog))
}

// Search interactions
function setupSearch() {
  const searchInput = document.getElementById('history-search')
  const clearBtn = document.getElementById('clear-search-btn')

  if (!searchInput) return

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value
    
    // Toggle clear button visibility
    if (searchQuery.trim().length > 0) {
      clearBtn.classList.remove('hidden')
    } else {
      clearBtn.classList.add('hidden')
    }

    // Debounce search
    if (searchTimeout) clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => {
      renderHistory()
    }, 200)
  })

  clearBtn.addEventListener('click', () => {
    searchInput.value = ''
    searchQuery = ''
    clearBtn.classList.add('hidden')
    renderHistory()
    searchInput.focus()
  })
}

// Setup clear commands inside Privacy Panel
function setupPrivacyControls() {
  document.getElementById('clear-usage-btn').addEventListener('click', async () => {
    if (!confirm('Clear all tracked focus time, completed Pomodoros, and blocked distractions? This cannot be undone.')) return
    await window.dashboardAPI.clearUsage()
    window.dashboardAPI.clearFocusStats()
    if (activeTab === 'productivity') renderProductivity()
  })

  document.getElementById('clear-history-btn').addEventListener('click', async () => {
    if (!confirm('Clear all browsing history? This also clears address bar autocomplete suggestions. Cannot be undone.')) return
    await window.dashboardAPI.clearHistory()
    if (activeTab === 'history') renderHistory()
    if (activeTab === 'productivity') renderProductivity() // Productivity totals might clear
  })

  document.getElementById('clear-activity-btn').addEventListener('click', async () => {
    if (!confirm('Clear the Activity Log? Cannot be undone.')) return
    window.dashboardAPI.clearActivityLog()
    if (activeTab === 'activity') renderActivityLog()
  })

  document.getElementById('nudge-dismiss-btn').addEventListener('click', () => {
    window.dashboardAPI.dismissProductivityNudge()
    document.getElementById('nudge-card').classList.add('hidden')
  })
}

// Init everything
document.addEventListener('DOMContentLoaded', () => {
  setupTabs()
  setupSearch()
  setupPrivacyControls()

  // Real-time updates for focus stats
  if (window.dashboardAPI.onFocusStatsState) {
    window.dashboardAPI.onFocusStatsState((stats) => {
      const todayStr = new Date().toLocaleDateString('en-CA')
      const todayHistory = stats.history?.[todayStr] || { pomodoros: 0, blocked: 0 }
      const pomodoroVal = document.getElementById('stat-pomodoros')
      const blockedVal = document.getElementById('stat-blocked')
      if (pomodoroVal) pomodoroVal.textContent = todayHistory.pomodoros || 0
      if (blockedVal) blockedVal.textContent = todayHistory.blocked || 0
    })
  }
  
  // Pinned nudge card: fetch whatever's currently pinned, then keep it live
  // if a new one fires while the dashboard is open.
  window.dashboardAPI.getProductivityNudge().then(renderNudge)
  window.dashboardAPI.onProductivityNudge(renderNudge)

  // Initial render
  refreshAll()

  // Periodic background refresh for productivity charts
  setInterval(() => {
    if (activeTab === 'productivity') renderProductivity()
    else if (activeTab === 'activity') renderActivityLog()
  }, REFRESH_MS)
})
