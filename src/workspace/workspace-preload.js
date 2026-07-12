const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('workspaceAPI', {
  pickFolder: () => ipcRenderer.invoke('workspace:pickFolder'),
  getState: () => ipcRenderer.invoke('workspace:getState'),
  readDir: (dirPath) => ipcRenderer.invoke('workspace:readDir', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('workspace:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('workspace:writeFile', filePath, content),
  setSidebarWidth: (px) => ipcRenderer.send('workspace:setSidebarWidth', px),
  setTreeCollapsed: (collapsed) => ipcRenderer.send('workspace:setTreeCollapsed', collapsed),
  startResize: () => ipcRenderer.send('workspace:resizeStart'),
  endResize: () => ipcRenderer.send('workspace:resizeEnd'),
  onState: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('workspace:state', listener)
    return () => ipcRenderer.removeListener('workspace:state', listener)
  }
})
