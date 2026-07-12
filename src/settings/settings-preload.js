const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('settingsAPI', {
  getBookmarksState: () => ipcRenderer.invoke('bookmarks:getState'),
  removeBookmark: (url) => ipcRenderer.send('bookmarks:remove', url),
  onBookmarksState: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('bookmarks:state', listener)
    return () => ipcRenderer.removeListener('bookmarks:state', listener)
  },

  getBlockerState: () => ipcRenderer.invoke('blocker:getState'),
  setBlockerEnabled: (enabled) => ipcRenderer.send('blocker:setEnabled', enabled),
  addBlock: (pattern) => ipcRenderer.send('blocker:addBlock', pattern),
  removeBlock: (pattern) => ipcRenderer.send('blocker:removeBlock', pattern),
  addAllow: (pattern) => ipcRenderer.send('blocker:addAllow', pattern),
  removeAllow: (pattern) => ipcRenderer.send('blocker:removeAllow', pattern),
  onBlockerState: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('blocker:state', listener)
    return () => ipcRenderer.removeListener('blocker:state', listener)
  },

  getPomodoroState: () => ipcRenderer.invoke('pomodoro:getState'),
  updatePomodoroSettings: (patch) => ipcRenderer.send('pomodoro:updateSettings', patch),
  onPomodoroState: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('pomodoro:state', listener)
    return () => ipcRenderer.removeListener('pomodoro:state', listener)
  },

  getFocusModeState: () => ipcRenderer.invoke('focusMode:getState'),
  setFocusModeEnabled: (enabled) => ipcRenderer.send('focusMode:setEnabled', enabled),
  setFocusModeTabLimit: (limit) => ipcRenderer.send('focusMode:setTabLimit', limit),
  onFocusModeState: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('focusMode:state', listener)
    return () => ipcRenderer.removeListener('focusMode:state', listener)
  },

  getProfilesState: () => ipcRenderer.invoke('profiles:getState'),
  addProfile: (profile) => ipcRenderer.send('profiles:add', profile),
  updateProfile: (id, patch) => ipcRenderer.send('profiles:update', { id, patch }),
  removeProfile: (id) => ipcRenderer.send('profiles:remove', id),
  launchProfile: (id) => ipcRenderer.send('profiles:launch', id),
  pickProfileCwd: () => ipcRenderer.invoke('profiles:pickCwd'),
  onProfilesState: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('profiles:state', listener)
    return () => ipcRenderer.removeListener('profiles:state', listener)
  },

  getTabFreezingState: () => ipcRenderer.invoke('tabFreezing:getState'),
  setTabFreezingEnabled: (enabled) => ipcRenderer.send('tabFreezing:setEnabled', enabled),
  setTabFreezingFreezeAfterMin: (minutes) => ipcRenderer.send('tabFreezing:setFreezeAfterMin', minutes),
  onTabFreezingState: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('tabFreezing:state', listener)
    return () => ipcRenderer.removeListener('tabFreezing:state', listener)
  },

  getToolbarVisibility: () => ipcRenderer.invoke('toolbarVisibility:getState'),
  setToolbarButtonVisible: (key, visible) => ipcRenderer.send('toolbarVisibility:setVisible', { key, visible }),
  onToolbarVisibility: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('toolbarVisibility:state', listener)
    return () => ipcRenderer.removeListener('toolbarVisibility:state', listener)
  },

  getAiChatState: () => ipcRenderer.invoke('aiChat:getState'),
  updateAiChatSettings: (patch) => ipcRenderer.send('aiChat:updateSettings', patch),
  onAiChatState: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('aiChat:state', listener)
    return () => ipcRenderer.removeListener('aiChat:state', listener)
  },

  getDownloadsState: () => ipcRenderer.invoke('downloads:getState'),
  pauseDownload: (id) => ipcRenderer.send('downloads:pause', id),
  resumeDownload: (id) => ipcRenderer.send('downloads:resume', id),
  cancelDownload: (id) => ipcRenderer.send('downloads:cancel', id),
  openDownloadFile: (id) => ipcRenderer.invoke('downloads:openFile', id),
  showDownloadInFolder: (id) => ipcRenderer.invoke('downloads:showInFolder', id),
  clearDownloadHistory: () => ipcRenderer.send('downloads:clearHistory'),
  onDownloadsState: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('downloads:state', listener)
    return () => ipcRenderer.removeListener('downloads:state', listener)
  },

  importBookmarks: () => ipcRenderer.invoke('bookmarks:import'),
  exportBookmarks: () => ipcRenderer.invoke('bookmarks:export'),

  getPasswordsState: () => ipcRenderer.invoke('passwords:getState'),
  savePassword: (data) => ipcRenderer.send('passwords:save', data),
  deletePassword: (id) => ipcRenderer.send('passwords:delete', id),
  onPasswordsState: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('passwords:state', listener)
    return () => ipcRenderer.removeListener('passwords:state', listener)
  },

  getPrivacyState: () => ipcRenderer.invoke('privacy:getPermissions'),
  setPermission: (data) => ipcRenderer.send('privacy:setPermission', data),
  deletePermission: (data) => ipcRenderer.send('privacy:deletePermission', data),
  getCookies: () => ipcRenderer.invoke('privacy:getCookies'),
  clearCookiesForDomain: (domain) => ipcRenderer.invoke('privacy:clearCookiesForDomain', domain),
  onPrivacyState: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('privacy:state', listener)
    return () => ipcRenderer.removeListener('privacy:state', listener)
  },

  getSearchSettings: () => ipcRenderer.invoke('searchSettings:getState'),
  updateSearchSettings: (patch) => ipcRenderer.send('searchSettings:update', patch),
  onSearchSettingsState: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('searchSettings:state', listener)
    return () => ipcRenderer.removeListener('searchSettings:state', listener)
  },

  // Theme (Appearance panel). getTheme = resolved (for applying to this
  // window); getRawTheme = stored preference (for the Light/Dark/System
  // toggle state); setTheme persists + fans out everywhere.
  getTheme: () => ipcRenderer.invoke('theme:getResolved'),
  getRawTheme: () => ipcRenderer.invoke('theme:getRaw'),
  setTheme: (pref) => ipcRenderer.invoke('theme:set', pref),
  onThemeChanged: (callback) => {
    const listener = (_e, resolved) => callback(resolved)
    ipcRenderer.on('theme:changed', listener)
    return () => ipcRenderer.removeListener('theme:changed', listener)
  },
  onRawThemeChanged: (callback) => {
    const listener = (_e, raw) => callback(raw)
    ipcRenderer.on('theme:rawChanged', listener)
    return () => ipcRenderer.removeListener('theme:rawChanged', listener)
  },

  // Keyboard Shortcuts panel — static display data sourced from the actual
  // dispatch code (see src/main/shortcuts.js).
  getShortcuts: () => ipcRenderer.invoke('shortcuts:getList'),

  // Clear Browsing Data (Privacy → Clear Browsing Data). Clears history +
  // cookies/site data + cache together.
  clearBrowsingData: () => ipcRenderer.invoke('privacy:clearBrowsingData'),
  clearHistory: () => ipcRenderer.send('history:clear'),

  // Last-open category persistence + onboarding replay.
  getSettingsMeta: () => ipcRenderer.invoke('settings:getMeta'),
  setLastCategory: (category) => ipcRenderer.send('settings:setLastCategory', category),
  showOnboarding: () => ipcRenderer.send('onboarding:show')
})
