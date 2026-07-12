const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dashboardAPI', {
  getToday: () => ipcRenderer.invoke('usageStats:getToday'),
  getWeek: () => ipcRenderer.invoke('usageStats:getWeek'),
  clearUsage: () => ipcRenderer.send('usageStats:clear'),
  clearHistory: () => ipcRenderer.send('history:clear'),
  getHistoryList: (query) => ipcRenderer.invoke('history:getEntries', query),
  deleteHistoryEntry: (url) => ipcRenderer.invoke('history:deleteEntry', url),
  deleteHistoryForHost: (hostname) => ipcRenderer.invoke('history:deleteEntriesForHost', hostname),
  openUrl: (url) => ipcRenderer.send('tab:new', url),

  getActivityLog: () => ipcRenderer.invoke('activityLog:getEntries'),
  clearActivityLog: () => ipcRenderer.send('activityLog:clear'),

  getProductivityNudge: () => ipcRenderer.invoke('productivityNudge:getState'),
  dismissProductivityNudge: () => ipcRenderer.send('productivityNudge:dismiss'),
  onProductivityNudge: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('productivityNudge:state', listener)
    return () => ipcRenderer.removeListener('productivityNudge:state', listener)
  },

  getFocusStats: () => ipcRenderer.invoke('focusStats:getState'),
  clearFocusStats: () => ipcRenderer.send('focusStats:clear'),
  onFocusStatsState: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('focusStats:state', listener)
    return () => ipcRenderer.removeListener('focusStats:state', listener)
  },

  getTheme: () => ipcRenderer.invoke('theme:getResolved'),
  onThemeChanged: (callback) => {
    const listener = (_e, resolved) => callback(resolved)
    ipcRenderer.on('theme:changed', listener)
    return () => ipcRenderer.removeListener('theme:changed', listener)
  }
})
