const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('browserAPI', {
  newTab: () => ipcRenderer.send('tab:new'),
  newIncognitoTab: () => ipcRenderer.send('tab:newIncognito'),
  showNewTabContextMenu: (x, y) => ipcRenderer.send('tab:showNewTabContextMenu', { x, y }),
  addBookmark: (bookmark) => ipcRenderer.send('bookmarks:add', bookmark),
  removeBookmark: (url) => ipcRenderer.send('bookmarks:remove', url),
  closeTab: (id) => ipcRenderer.send('tab:close', id),
  switchTab: (id) => ipcRenderer.send('tab:switch', id),
  navigate: (id, input) => ipcRenderer.send('tab:navigate', { id, input }),
  back: (id) => ipcRenderer.send('tab:back', id),
  forward: (id) => ipcRenderer.send('tab:forward', id),
  reload: (id) => ipcRenderer.send('tab:reload', id),
  toggleReader: (id) => ipcRenderer.send('tab:toggleReader', id),
  toggleMute: (id) => ipcRenderer.send('tab:toggleMute', id),
  resetZoom: (id) => ipcRenderer.send('tab:resetZoom', id),

  createGroup: () => ipcRenderer.invoke('group:create'), // resolves with the new group id
  addTabToGroup: (tabId, groupId) => ipcRenderer.send('group:addTab', { tabId, groupId }),
  removeTabFromGroup: (tabId) => ipcRenderer.send('group:removeTab', tabId),
  closeGroup: (groupId) => ipcRenderer.send('group:close', groupId),

  getState: () => ipcRenderer.invoke('tabs:getState'),
  onState: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('tabs:state', listener)
    return () => ipcRenderer.removeListener('tabs:state', listener)
  },

  openSettings: () => ipcRenderer.send('settings:open'),
  openPomodoro: () => ipcRenderer.send('pomodoro:openPanel'),
  getPomodoroState: () => ipcRenderer.invoke('pomodoro:getState'),
  onPomodoroState: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('pomodoro:state', listener)
    return () => ipcRenderer.removeListener('pomodoro:state', listener)
  },

  getFocusModeState: () => ipcRenderer.invoke('focusMode:getState'),
  setFocusModeEnabled: (enabled) => ipcRenderer.send('focusMode:setEnabled', enabled),
  onFocusModeState: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('focusMode:state', listener)
    return () => ipcRenderer.removeListener('focusMode:state', listener)
  },

  onToast: (callback) => {
    const listener = (_e, message) => callback(message)
    ipcRenderer.on('toast:show', listener)
    return () => ipcRenderer.removeListener('toast:show', listener)
  },

  toggleWorkspaceSidebar: () => ipcRenderer.send('workspace:toggleSidebar'),
  getWorkspaceState: () => ipcRenderer.invoke('workspace:getState'),
  onWorkspaceState: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('workspace:state', listener)
    return () => ipcRenderer.removeListener('workspace:state', listener)
  },

  showLauncherMenu: (x, y) => ipcRenderer.send('launcher:showMenu', { x, y }),
  showTabContextMenu: (tabId, x, y) => ipcRenderer.send('tab:showContextMenu', { tabId, x, y }),

  openDashboard: () => ipcRenderer.send('dashboard:open'),
  searchHistory: (query) => ipcRenderer.invoke('history:search', query),
  getSearchSuggestions: (query) => ipcRenderer.invoke('search:getSuggestions', query),
  setChromeHeight: (px) => ipcRenderer.send('chrome:setHeight', px),

  getToolbarVisibility: () => ipcRenderer.invoke('toolbarVisibility:getState'),
  onToolbarVisibility: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('toolbarVisibility:state', listener)
    return () => ipcRenderer.removeListener('toolbarVisibility:state', listener)
  },

  toggleAiChatSidebar: () => ipcRenderer.send('aiChat:toggleSidebar'),
  getAiChatState: () => ipcRenderer.invoke('aiChat:getState'),
  onAiChatState: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('aiChat:state', listener)
    return () => ipcRenderer.removeListener('aiChat:state', listener)
  },

  findInPage: (tabId, text, options) => ipcRenderer.send('tab:findInPage', { id: tabId, text, options }),
  stopFindInPage: (tabId, action) => ipcRenderer.send('tab:stopFindInPage', { id: tabId, action }),
  onFindInPageResult: (callback) => {
    const listener = (_e, result) => callback(result)
    ipcRenderer.on('tab:foundInPageResult', listener)
    return () => ipcRenderer.removeListener('tab:foundInPageResult', listener)
  },
  onZoomChanged: (callback) => {
    const listener = (_e, data) => callback(data)
    ipcRenderer.on('tab:zoomChanged', listener)
    return () => ipcRenderer.removeListener('tab:zoomChanged', listener)
  },
  onFindInPageToggle: (callback) => {
    const listener = (_e) => callback()
    ipcRenderer.on('tab:findInPageToggle', listener)
    return () => ipcRenderer.removeListener('tab:findInPageToggle', listener)
  },
  onIncognito: (callback) => {
    const listener = (_e, val) => callback(val)
    ipcRenderer.on('chrome:setIncognito', listener)
    return () => ipcRenderer.removeListener('chrome:setIncognito', listener)
  }
})
