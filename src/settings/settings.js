// ---- tabs ----
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'))
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'))
    btn.classList.add('active')
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active')
  })
})

// ---- blocking panel ----
const enabledToggle = document.getElementById('enabled-toggle')
const blockInput = document.getElementById('block-input')
const allowInput = document.getElementById('allow-input')
const blockList = document.getElementById('block-list')
const allowList = document.getElementById('allow-list')

function renderPatternList(el, patterns, onRemove) {
  el.innerHTML = ''
  patterns.forEach((pattern) => {
    const li = document.createElement('li')
    const span = document.createElement('span')
    span.textContent = pattern
    const removeBtn = document.createElement('button')
    removeBtn.textContent = '✕'
    removeBtn.addEventListener('click', () => onRemove(pattern))
    li.appendChild(span)
    li.appendChild(removeBtn)
    el.appendChild(li)
  })
}

function renderBlockerState(state) {
  enabledToggle.checked = state.enabled
  renderPatternList(blockList, state.blocklist, (p) => window.settingsAPI.removeBlock(p))
  renderPatternList(allowList, state.allowlist, (p) => window.settingsAPI.removeAllow(p))
}

enabledToggle.addEventListener('change', () => window.settingsAPI.setBlockerEnabled(enabledToggle.checked))

document.getElementById('block-add-btn').addEventListener('click', () => {
  if (blockInput.value.trim()) window.settingsAPI.addBlock(blockInput.value)
  blockInput.value = ''
  blockInput.focus()
})
blockInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('block-add-btn').click() })

document.getElementById('allow-add-btn').addEventListener('click', () => {
  if (allowInput.value.trim()) window.settingsAPI.addAllow(allowInput.value)
  allowInput.value = ''
  allowInput.focus()
})
allowInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('allow-add-btn').click() })

window.settingsAPI.onBlockerState(renderBlockerState)
window.settingsAPI.getBlockerState().then(renderBlockerState)

// ---- focus mode panel ----
const focusEnabledToggle = document.getElementById('focus-enabled-toggle')
const tabLimitEl = document.getElementById('tab-limit')

let suppressFocusEcho = false

function renderFocusModeState(state) {
  suppressFocusEcho = true
  focusEnabledToggle.checked = state.enabled
  tabLimitEl.value = state.tabLimit
  suppressFocusEcho = false
}

focusEnabledToggle.addEventListener('change', () => {
  if (suppressFocusEcho) return
  window.settingsAPI.setFocusModeEnabled(focusEnabledToggle.checked)
})
tabLimitEl.addEventListener('change', () => {
  if (suppressFocusEcho) return
  const value = Number(tabLimitEl.value)
  if (!Number.isFinite(value) || value < 0) return
  window.settingsAPI.setFocusModeTabLimit(value)
})

window.settingsAPI.onFocusModeState(renderFocusModeState)
window.settingsAPI.getFocusModeState().then(renderFocusModeState)

// ---- pomodoro panel ----
const workMinEl = document.getElementById('work-min')
const shortBreakMinEl = document.getElementById('short-break-min')
const longBreakMinEl = document.getElementById('long-break-min')
const cyclesEl = document.getElementById('cycles')
const autoFocusToggle = document.getElementById('auto-focus-toggle')

let suppressPomodoroEcho = false

function renderPomodoroSettings(state) {
  suppressPomodoroEcho = true
  workMinEl.value = state.settings.workMin
  shortBreakMinEl.value = state.settings.shortBreakMin
  longBreakMinEl.value = state.settings.longBreakMin
  cyclesEl.value = state.settings.cyclesBeforeLongBreak
  autoFocusToggle.checked = state.settings.autoFocus
  suppressPomodoroEcho = false
}

autoFocusToggle.addEventListener('change', () => {
  if (suppressPomodoroEcho) return
  window.settingsAPI.updatePomodoroSettings({ autoFocus: autoFocusToggle.checked })
})

function wirePomodoroField(el, key, parse = Number) {
  el.addEventListener('change', () => {
    if (suppressPomodoroEcho) return
    const value = parse(el.value)
    if (!Number.isFinite(value) || value <= 0) return
    window.settingsAPI.updatePomodoroSettings({ [key]: value })
  })
}
wirePomodoroField(workMinEl, 'workMin')
wirePomodoroField(shortBreakMinEl, 'shortBreakMin')
wirePomodoroField(longBreakMinEl, 'longBreakMin')
wirePomodoroField(cyclesEl, 'cyclesBeforeLongBreak')

window.settingsAPI.onPomodoroState(renderPomodoroSettings)
window.settingsAPI.getPomodoroState().then(renderPomodoroSettings)

// ---- launcher panel ----
const profileListEl = document.getElementById('profile-list')
const profileNameEl = document.getElementById('profile-name')
const profileUrlsEl = document.getElementById('profile-urls')
const profileCommandsEl = document.getElementById('profile-commands')
const profileCwdEl = document.getElementById('profile-cwd')
const profileCwdBrowseBtn = document.getElementById('profile-cwd-browse-btn')
const profileFormTitle = document.getElementById('profile-form-title')
const profileSaveBtn = document.getElementById('profile-save-btn')
const profileCancelBtn = document.getElementById('profile-cancel-btn')

let editingProfileId = null

function resetProfileForm() {
  editingProfileId = null
  profileFormTitle.textContent = 'New profile'
  profileNameEl.value = ''
  profileUrlsEl.value = ''
  profileCommandsEl.value = ''
  profileCwdEl.value = ''
  profileCancelBtn.classList.add('hidden')
}

profileCwdBrowseBtn.addEventListener('click', async () => {
  const folder = await window.settingsAPI.pickProfileCwd()
  if (folder) profileCwdEl.value = folder
})

function linesOf(el) {
  return el.value.split('\n').map((s) => s.trim()).filter(Boolean)
}

function renderProfiles(state) {
  profileListEl.innerHTML = ''
  state.list.forEach((profile) => {
    const li = document.createElement('li')

    const info = document.createElement('div')
    const name = document.createElement('div')
    name.className = 'profile-name'
    name.textContent = profile.name
    const meta = document.createElement('div')
    meta.className = 'profile-meta'
    const cwdNote = profile.cwd ? `, in ${profile.cwd}` : ''
    meta.textContent = `${profile.urls.length} URL${profile.urls.length === 1 ? '' : 's'}, ${profile.commands.length} command${profile.commands.length === 1 ? '' : 's'}${cwdNote}`
    info.appendChild(name)
    info.appendChild(meta)

    const actions = document.createElement('div')
    actions.className = 'profile-actions'

    const launchBtn = document.createElement('button')
    launchBtn.textContent = 'Launch'
    launchBtn.addEventListener('click', () => window.settingsAPI.launchProfile(profile.id))

    const editBtn = document.createElement('button')
    editBtn.textContent = 'Edit'
    editBtn.addEventListener('click', () => {
      editingProfileId = profile.id
      profileFormTitle.textContent = `Edit "${profile.name}"`
      profileNameEl.value = profile.name
      profileUrlsEl.value = profile.urls.join('\n')
      profileCommandsEl.value = profile.commands.join('\n')
      profileCwdEl.value = profile.cwd || ''
      profileCancelBtn.classList.remove('hidden')
    })

    const deleteBtn = document.createElement('button')
    deleteBtn.textContent = '✕'
    deleteBtn.addEventListener('click', () => {
      window.settingsAPI.removeProfile(profile.id)
      if (editingProfileId === profile.id) resetProfileForm()
    })

    actions.appendChild(launchBtn)
    actions.appendChild(editBtn)
    actions.appendChild(deleteBtn)

    li.appendChild(info)
    li.appendChild(actions)
    profileListEl.appendChild(li)
  })
}

profileSaveBtn.addEventListener('click', () => {
  const name = profileNameEl.value.trim()
  if (!name) return
  const urls = linesOf(profileUrlsEl)
  const commands = linesOf(profileCommandsEl)
  const cwd = profileCwdEl.value.trim() || null
  if (editingProfileId) {
    window.settingsAPI.updateProfile(editingProfileId, { name, urls, commands, cwd })
  } else {
    window.settingsAPI.addProfile({ name, urls, commands, cwd })
  }
  resetProfileForm()
})
profileCancelBtn.addEventListener('click', resetProfileForm)

window.settingsAPI.onProfilesState(renderProfiles)
window.settingsAPI.getProfilesState().then(renderProfiles)

// ---- tabs (freezing) panel ----
const freezeEnabledToggle = document.getElementById('freeze-enabled-toggle')
const freezeAfterMinEl = document.getElementById('freeze-after-min')

let suppressFreezeEcho = false

function renderTabFreezingState(state) {
  suppressFreezeEcho = true
  freezeEnabledToggle.checked = state.enabled
  freezeAfterMinEl.value = state.freezeAfterMin
  suppressFreezeEcho = false
}

freezeEnabledToggle.addEventListener('change', () => {
  if (suppressFreezeEcho) return
  window.settingsAPI.setTabFreezingEnabled(freezeEnabledToggle.checked)
})
freezeAfterMinEl.addEventListener('change', () => {
  if (suppressFreezeEcho) return
  const value = Number(freezeAfterMinEl.value)
  if (!Number.isFinite(value) || value <= 0) return
  window.settingsAPI.setTabFreezingFreezeAfterMin(value)
})

window.settingsAPI.onTabFreezingState(renderTabFreezingState)
window.settingsAPI.getTabFreezingState().then(renderTabFreezingState)

// ---- toolbar visibility panel ----
const TOOLBAR_KEYS = ['reader', 'group', 'focusMode', 'pomodoro', 'launcher', 'dashboard', 'aiChat']
let suppressToolbarEcho = false

function renderToolbarVisibility(state) {
  suppressToolbarEcho = true
  TOOLBAR_KEYS.forEach((key) => {
    document.getElementById('tb-' + key).checked = state[key]
  })
  suppressToolbarEcho = false
}

TOOLBAR_KEYS.forEach((key) => {
  document.getElementById('tb-' + key).addEventListener('change', (e) => {
    if (suppressToolbarEcho) return
    window.settingsAPI.setToolbarButtonVisible(key, e.target.checked)
  })
})

window.settingsAPI.onToolbarVisibility(renderToolbarVisibility)
window.settingsAPI.getToolbarVisibility().then(renderToolbarVisibility)

// ---- AI chat panel ----
const aiProviderEl = document.getElementById('ai-provider')
const aiApiKeyEl = document.getElementById('ai-api-key')
const aiModelEl = document.getElementById('ai-model')
const aiAgenticToggleEl = document.getElementById('ai-agentic-toggle')
const aiProductivityToggleEl = document.getElementById('ai-productivity-toggle')
let suppressAiChatEcho = false

function renderAiChatSettings(state) {
  suppressAiChatEcho = true
  aiProviderEl.value = state.provider
  aiApiKeyEl.value = state.apiKey
  aiModelEl.value = state.model
  aiAgenticToggleEl.checked = !!state.agenticToolsEnabled
  aiProductivityToggleEl.checked = !!state.productivityMonitorEnabled
  suppressAiChatEcho = false
}

aiProviderEl.addEventListener('change', () => {
  if (suppressAiChatEcho) return
  window.settingsAPI.updateAiChatSettings({ provider: aiProviderEl.value })
})
aiApiKeyEl.addEventListener('change', () => {
  if (suppressAiChatEcho) return
  window.settingsAPI.updateAiChatSettings({ apiKey: aiApiKeyEl.value.trim() })
})
aiModelEl.addEventListener('change', () => {
  if (suppressAiChatEcho) return
  window.settingsAPI.updateAiChatSettings({ model: aiModelEl.value.trim() })
})
aiAgenticToggleEl.addEventListener('change', () => {
  if (suppressAiChatEcho) return
  window.settingsAPI.updateAiChatSettings({ agenticToolsEnabled: aiAgenticToggleEl.checked })
})
aiProductivityToggleEl.addEventListener('change', () => {
  if (suppressAiChatEcho) return
  window.settingsAPI.updateAiChatSettings({ productivityMonitorEnabled: aiProductivityToggleEl.checked })
})

window.settingsAPI.onAiChatState(renderAiChatSettings)
window.settingsAPI.getAiChatState().then(renderAiChatSettings)

// ---- bookmarks panel ----
const bookmarksListEl = document.getElementById('bookmarks-list')
const noBookmarksSettingsEl = document.getElementById('no-bookmarks-settings')

function renderBookmarksSettings(state) {
  const list = state.list || []
  bookmarksListEl.innerHTML = ''

  if (list.length === 0) {
    noBookmarksSettingsEl.classList.remove('hidden')
    bookmarksListEl.classList.add('hidden')
  } else {
    noBookmarksSettingsEl.classList.add('hidden')
    bookmarksListEl.classList.remove('hidden')

    list.forEach((b) => {
      const li = document.createElement('li')

      const info = document.createElement('div')
      const title = document.createElement('div')
      title.className = 'profile-name'
      title.textContent = b.title || b.url
      const url = document.createElement('div')
      url.className = 'profile-meta'
      url.textContent = b.url

      info.appendChild(title)
      info.appendChild(url)

      const actions = document.createElement('div')
      actions.className = 'profile-actions'
      const deleteBtn = document.createElement('button')
      deleteBtn.textContent = '✕'
      deleteBtn.addEventListener('click', () => {
        window.settingsAPI.removeBookmark(b.url)
      })
      actions.appendChild(deleteBtn)

      li.appendChild(info)
      li.appendChild(actions)
      bookmarksListEl.appendChild(li)
    })
  }
}

window.settingsAPI.onBookmarksState(renderBookmarksSettings)
window.settingsAPI.getBookmarksState().then(renderBookmarksSettings)

// ---- bookmarks import/export ----
document.getElementById('bookmarks-import-btn').addEventListener('click', async () => {
  const result = await window.settingsAPI.importBookmarks()
  if (result.success) {
    alert(`Successfully imported ${result.count} bookmarks!`)
  } else if (result.error) {
    alert(`Import failed: ${result.error}`)
  }
})

document.getElementById('bookmarks-export-btn').addEventListener('click', async () => {
  const result = await window.settingsAPI.exportBookmarks()
  if (result.success) {
    alert('Successfully exported bookmarks!')
  } else if (result.error) {
    alert(`Export failed: ${result.error}`)
  }
})

// ---- downloads panel ----
const downloadsListEl = document.getElementById('downloads-list')
const noDownloadsEl = document.getElementById('no-downloads')
const downloadsClearBtn = document.getElementById('downloads-clear-btn')

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function renderDownloads(state) {
  const list = state.list || []
  downloadsListEl.innerHTML = ''
  
  if (list.length === 0) {
    noDownloadsEl.classList.remove('hidden')
    downloadsListEl.classList.add('hidden')
  } else {
    noDownloadsEl.classList.add('hidden')
    downloadsListEl.classList.remove('hidden')
    
    list.forEach(item => {
      const li = document.createElement('li')
      li.style.flexDirection = 'column'
      li.style.alignItems = 'stretch'
      
      const mainRow = document.createElement('div')
      mainRow.style.display = 'flex'
      mainRow.style.justifyContent = 'space-between'
      mainRow.style.alignItems = 'center'
      
      const info = document.createElement('div')
      info.className = 'download-details'
      
      const name = document.createElement('div')
      name.className = 'profile-name'
      name.textContent = item.name
      
      const metaRow = document.createElement('div')
      metaRow.className = 'download-info-row'
      
      let progressText = ''
      if (item.state === 'downloading' || item.state === 'paused') {
        const percent = item.totalBytes > 0 ? Math.round((item.receivedBytes / item.totalBytes) * 100) : 0
        progressText = `${formatBytes(item.receivedBytes)} of ${formatBytes(item.totalBytes)} (${percent}%)`
      } else {
        progressText = `${formatBytes(item.receivedBytes)} — ${item.state}`
      }
      
      const statusSpan = document.createElement('span')
      statusSpan.textContent = progressText
      
      metaRow.appendChild(statusSpan)
      info.appendChild(name)
      
      if (item.state === 'downloading' || item.state === 'paused') {
        const bar = document.createElement('div')
        bar.className = 'download-progress-bar'
        const fill = document.createElement('div')
        fill.className = 'download-progress-fill'
        const percent = item.totalBytes > 0 ? (item.receivedBytes / item.totalBytes) * 100 : 0
        fill.style.width = `${percent}%`
        bar.appendChild(fill)
        info.appendChild(bar)
      }
      info.appendChild(metaRow)
      
      const actions = document.createElement('div')
      actions.className = 'profile-actions'
      
      if (item.state === 'downloading') {
        const pauseBtn = document.createElement('button')
        pauseBtn.textContent = 'Pause'
        pauseBtn.addEventListener('click', () => window.settingsAPI.pauseDownload(item.id))
        
        const cancelBtn = document.createElement('button')
        cancelBtn.textContent = 'Cancel'
        cancelBtn.addEventListener('click', () => window.settingsAPI.cancelDownload(item.id))
        
        actions.appendChild(pauseBtn)
        actions.appendChild(cancelBtn)
      } else if (item.state === 'paused') {
        const resumeBtn = document.createElement('button')
        resumeBtn.textContent = 'Resume'
        resumeBtn.addEventListener('click', () => window.settingsAPI.resumeDownload(item.id))
        
        const cancelBtn = document.createElement('button')
        cancelBtn.textContent = 'Cancel'
        cancelBtn.addEventListener('click', () => window.settingsAPI.cancelDownload(item.id))
        
        actions.appendChild(resumeBtn)
        actions.appendChild(cancelBtn)
      } else if (item.state === 'completed') {
        const openBtn = document.createElement('button')
        openBtn.textContent = 'Open'
        openBtn.addEventListener('click', () => window.settingsAPI.openDownloadFile(item.id))
        
        const folderBtn = document.createElement('button')
        folderBtn.textContent = 'Folder'
        folderBtn.addEventListener('click', () => window.settingsAPI.showDownloadInFolder(item.id))
        
        actions.appendChild(openBtn)
        actions.appendChild(folderBtn)
      }
      
      mainRow.appendChild(info)
      mainRow.appendChild(actions)
      li.appendChild(mainRow)
      downloadsListEl.appendChild(li)
    })
  }
}

downloadsClearBtn.addEventListener('click', () => window.settingsAPI.clearDownloadHistory())

window.settingsAPI.onDownloadsState(renderDownloads)
window.settingsAPI.getDownloadsState().then(renderDownloads)

// ---- passwords panel ----
const pwdHost = document.getElementById('pwd-host')
const pwdUsername = document.getElementById('pwd-username')
const pwdPassword = document.getElementById('pwd-password')
const pwdGenerateBtn = document.getElementById('pwd-generate-btn')
const pwdSaveBtn = document.getElementById('pwd-save-btn')
const pwdSearch = document.getElementById('pwd-search')
const passwordsListEl = document.getElementById('passwords-list')

pwdGenerateBtn.addEventListener('click', () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  let pass = ''
  for (let i = 0; i < 16; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  pwdPassword.type = 'text' // Show generated password
  pwdPassword.value = pass
})

pwdSaveBtn.addEventListener('click', () => {
  const hostname = pwdHost.value.trim()
  const username = pwdUsername.value.trim()
  const password = pwdPassword.value
  if (!hostname || !username || !password) return
  
  window.settingsAPI.savePassword({ hostname, username, password })
  pwdHost.value = ''
  pwdUsername.value = ''
  pwdPassword.value = ''
  pwdPassword.type = 'password'
})

let allPasswords = []
function renderPasswords(state) {
  allPasswords = state.list || []
  filterPasswords()
}

function filterPasswords() {
  const query = pwdSearch.value.trim().toLowerCase()
  const filtered = allPasswords.filter(p => p.hostname.includes(query) || p.username.toLowerCase().includes(query))
  passwordsListEl.innerHTML = ''
  
  filtered.forEach(p => {
    const li = document.createElement('li')
    
    const info = document.createElement('div')
    const host = document.createElement('div')
    host.className = 'profile-name'
    host.textContent = p.hostname
    
    const meta = document.createElement('div')
    meta.className = 'profile-meta'
    meta.textContent = `User: ${p.username} | Password: ••••••••`
    
    info.appendChild(host)
    info.appendChild(meta)
    
    const actions = document.createElement('div')
    actions.className = 'profile-actions'
    
    const copyUserBtn = document.createElement('button')
    copyUserBtn.textContent = 'Copy User'
    copyUserBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(p.username)
    })
    
    const copyPassBtn = document.createElement('button')
    copyPassBtn.textContent = 'Copy Pass'
    copyPassBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(p.password)
    })
    
    const viewBtn = document.createElement('button')
    viewBtn.textContent = 'View'
    viewBtn.addEventListener('click', () => {
      alert(`Website: ${p.hostname}\nUsername: ${p.username}\nPassword: ${p.password}`)
    })
    
    const deleteBtn = document.createElement('button')
    deleteBtn.textContent = '✕'
    deleteBtn.addEventListener('click', () => {
      window.settingsAPI.deletePassword(p.id)
    })
    
    actions.appendChild(copyUserBtn)
    actions.appendChild(copyPassBtn)
    actions.appendChild(viewBtn)
    actions.appendChild(deleteBtn)
    
    li.appendChild(info)
    li.appendChild(actions)
    passwordsListEl.appendChild(li)
  })
}

pwdSearch.addEventListener('input', filterPasswords)
window.settingsAPI.onPasswordsState(renderPasswords)
window.settingsAPI.getPasswordsState().then(renderPasswords)

// ---- privacy panel ----
const searchEngineSelect = document.getElementById('search-engine')
const customSearchRow = document.getElementById('search-engine-custom-row')
const customSearchInput = document.getElementById('search-engine-custom')
const suggestionsToggle = document.getElementById('search-suggestions-toggle')

const cookiesListEl = document.getElementById('cookies-list')
const noCookiesEl = document.getElementById('no-cookies')
const permissionsListEl = document.getElementById('permissions-list')
const noPermissionsEl = document.getElementById('no-permissions')

// Search Engine Settings binding
let suppressSearchSettingsEcho = false
function renderSearchSettings(state) {
  suppressSearchSettingsEcho = true
  searchEngineSelect.value = state.engine
  customSearchInput.value = state.customUrl || ''
  suggestionsToggle.checked = state.suggestionsEnabled !== false
  
  if (state.engine === 'custom') {
    customSearchRow.classList.remove('hidden')
  } else {
    customSearchRow.classList.add('hidden')
  }
  suppressSearchSettingsEcho = false
}

searchEngineSelect.addEventListener('change', () => {
  if (suppressSearchSettingsEcho) return
  const engine = searchEngineSelect.value
  window.settingsAPI.updateSearchSettings({ engine })
  if (engine === 'custom') {
    customSearchRow.classList.remove('hidden')
    customSearchInput.focus()
  } else {
    customSearchRow.classList.add('hidden')
  }
})

customSearchInput.addEventListener('change', () => {
  if (suppressSearchSettingsEcho) return
  window.settingsAPI.updateSearchSettings({ customUrl: customSearchInput.value.trim() })
})

suggestionsToggle.addEventListener('change', () => {
  if (suppressSearchSettingsEcho) return
  window.settingsAPI.updateSearchSettings({ suggestionsEnabled: suggestionsToggle.checked })
})

window.settingsAPI.onSearchSettingsState(renderSearchSettings)
window.settingsAPI.getSearchSettings().then(renderSearchSettings)

// Cookies & Permissions rendering
function refreshCookies() {
  window.settingsAPI.getCookies().then(res => {
    const list = res.list || []
    cookiesListEl.innerHTML = ''
    if (list.length === 0) {
      noCookiesEl.classList.remove('hidden')
      cookiesListEl.classList.add('hidden')
    } else {
      noCookiesEl.classList.add('hidden')
      cookiesListEl.classList.remove('hidden')
      
      list.forEach(item => {
        const li = document.createElement('li')
        const info = document.createElement('div')
        const name = document.createElement('div')
        name.className = 'profile-name'
        name.textContent = item.domain
        const meta = document.createElement('div')
        meta.className = 'profile-meta'
        meta.textContent = `${item.count} cookie${item.count === 1 ? '' : 's'}`
        info.appendChild(name)
        info.appendChild(meta)
        
        const deleteBtn = document.createElement('button')
        deleteBtn.textContent = 'Clear'
        deleteBtn.addEventListener('click', async () => {
          await window.settingsAPI.clearCookiesForDomain(item.domain)
          refreshCookies()
        })
        
        li.appendChild(info)
        li.appendChild(deleteBtn)
        cookiesListEl.appendChild(li)
      })
    }
  })
}

function renderPermissions(state) {
  const sites = state.sites || {}
  permissionsListEl.innerHTML = ''
  
  const hosts = Object.keys(sites)
  if (hosts.length === 0) {
    noPermissionsEl.classList.remove('hidden')
    permissionsListEl.classList.add('hidden')
  } else {
    noPermissionsEl.classList.add('hidden')
    permissionsListEl.classList.remove('hidden')
    
    hosts.forEach(host => {
      const rules = sites[host]
      Object.entries(rules).forEach(([perm, val]) => {
        const li = document.createElement('li')
        const info = document.createElement('div')
        const name = document.createElement('div')
        name.className = 'profile-name'
        name.textContent = host
        const meta = document.createElement('div')
        meta.className = 'profile-meta'
        meta.textContent = `${perm}: ${val}`
        info.appendChild(name)
        info.appendChild(meta)
        
        const deleteBtn = document.createElement('button')
        deleteBtn.textContent = '✕'
        deleteBtn.addEventListener('click', () => {
          window.settingsAPI.deletePermission({ host, permission: perm })
        })
        
        li.appendChild(info)
        li.appendChild(deleteBtn)
        permissionsListEl.appendChild(li)
      })
    })
  }
}

window.settingsAPI.onPrivacyState(renderPermissions)
window.settingsAPI.getPrivacyState().then(renderPermissions)

// Refresh cookies list when switching to privacy tab
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.tab === 'privacy') {
      refreshCookies()
    }
  })
})
