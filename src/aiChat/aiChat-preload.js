const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('aiChatAPI', {
  getState: () => ipcRenderer.invoke('aiChat:getState'),
  setSidebarWidth: (px) => ipcRenderer.send('aiChat:setSidebarWidth', px),
  onState: (callback) => {
    const listener = (_e, state) => callback(state)
    ipcRenderer.on('aiChat:state', listener)
    return () => ipcRenderer.removeListener('aiChat:state', listener)
  },
  // history: the provider-shaped conversation so far; userText: the new
  // message. Resolves once the whole tool-call loop (if any) has finished —
  // no streaming, see README for why.
  sendMessage: (history, userText) => ipcRenderer.invoke('aiChat:sendMessage', { history, userText }),

  // Macro path: resolves immediately with a jobId (the run itself happens
  // in the background in main.js), progress/completion arrive separately
  // over onMacroEvent/onMacroDone.
  runMacro: (history, userText) => ipcRenderer.invoke('aiChat:runMacro', { history, userText }),
  cancelMacro: (jobId) => ipcRenderer.send('aiChat:cancelMacro', jobId),
  onMacroEvent: (callback) => {
    const listener = (_e, payload) => callback(payload)
    ipcRenderer.on('aiChat:macroEvent', listener)
    return () => ipcRenderer.removeListener('aiChat:macroEvent', listener)
  },
  onMacroDone: (callback) => {
    const listener = (_e, payload) => callback(payload)
    ipcRenderer.on('aiChat:macroDone', listener)
    return () => ipcRenderer.removeListener('aiChat:macroDone', listener)
  }
})
