const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pomodoroAPI', {
  getState: () => ipcRenderer.invoke('pomodoro:getState'),
  start: () => ipcRenderer.send('pomodoro:start'),
  pause: () => ipcRenderer.send('pomodoro:pause'),
  reset: () => ipcRenderer.send('pomodoro:reset'),
  skip: () => ipcRenderer.send('pomodoro:skip'),
  setMuted: (muted) => ipcRenderer.send('pomodoro:setMuted', muted),
  adjustTime: (minutes) => ipcRenderer.send('pomodoro:adjustTime', minutes),
  onState: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('pomodoro:state', listener)
    return () => ipcRenderer.removeListener('pomodoro:state', listener)
  }
})
