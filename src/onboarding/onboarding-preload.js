const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('onboardingAPI', {
  // reason: 'completed' | 'skipped' — both mark onboarding done + close.
  dismiss: (reason) => ipcRenderer.send('onboarding:dismiss', reason),

  getTheme: () => ipcRenderer.invoke('theme:getResolved'),
  onThemeChanged: (callback) => {
    const listener = (_e, resolved) => callback(resolved)
    ipcRenderer.on('theme:changed', listener)
    return () => ipcRenderer.removeListener('theme:changed', listener)
  }
})
