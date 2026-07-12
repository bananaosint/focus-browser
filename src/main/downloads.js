const { shell, ipcMain } = require('electron')
const { randomUUID } = require('crypto')

class DownloadsManager {
  constructor(store, broadcastToAllChrome) {
    this.store = store
    this.broadcastToAllChrome = broadcastToAllChrome
    this.activeDownloads = new Map() // id -> DownloadItem
    
    // Load download history from store
    const state = this.store.get('downloads') || { list: [] }
    // Clean up any stale "downloading" states from previous crashes/quits
    state.list = state.list.map(item => {
      if (item.state === 'downloading' || item.state === 'paused') {
        return { ...item, state: 'failed' }
      }
      return item
    })
    this.store.update('downloads', { list: state.list })
  }

  registerSession(sessionInstance) {
    sessionInstance.on('will-download', (event, item, webContents) => {
      const id = randomUUID()
      const filename = item.getFilename()
      const totalBytes = item.getTotalBytes()
      
      this.activeDownloads.set(id, item)

      const record = {
        id,
        name: filename,
        url: item.getURL(),
        state: 'downloading',
        receivedBytes: 0,
        totalBytes,
        savePath: item.getSavePath() || '',
        startedAt: Date.now()
      }

      this._addRecord(record)
      this._broadcastChange()

      item.on('updated', (e, state) => {
        if (state === 'interrupted') {
          this._updateRecordState(id, { state: 'interrupted' })
        } else if (state === 'progressing') {
          this._updateRecordState(id, {
            state: item.isPaused() ? 'paused' : 'downloading',
            receivedBytes: item.getReceivedBytes(),
            totalBytes: item.getTotalBytes(),
            savePath: item.getSavePath()
          })
        }
        this._broadcastChange()
      })

      item.once('done', (e, state) => {
        this.activeDownloads.delete(id)
        if (state === 'completed') {
          this._updateRecordState(id, {
            state: 'completed',
            receivedBytes: item.getReceivedBytes(),
            savePath: item.getSavePath()
          })
        } else if (state === 'cancelled') {
          this._updateRecordState(id, { state: 'cancelled' })
        } else {
          this._updateRecordState(id, { state: 'failed' })
        }
        this._broadcastChange()
      })
    })
  }

  registerIpcHandlers() {
    ipcMain.handle('downloads:getState', () => {
      return this.store.get('downloads') || { list: [] }
    })

    ipcMain.on('downloads:pause', (e, id) => {
      const item = this.activeDownloads.get(id)
      if (item && !item.isPaused()) {
        item.pause()
      }
    })

    ipcMain.on('downloads:resume', (e, id) => {
      const item = this.activeDownloads.get(id)
      if (item && item.canResume()) {
        item.resume()
      }
    })

    ipcMain.on('downloads:cancel', (e, id) => {
      const item = this.activeDownloads.get(id)
      if (item) {
        item.cancel()
      }
    })

    ipcMain.handle('downloads:openFile', async (e, id) => {
      const list = this.store.get('downloads')?.list || []
      const record = list.find(item => item.id === id)
      if (record && record.savePath) {
        try {
          const err = await shell.openPath(record.savePath)
          return { success: !err, error: err }
        } catch (err) {
          return { success: false, error: err.message }
        }
      }
      return { success: false, error: 'File not found' }
    })

    ipcMain.handle('downloads:showInFolder', async (e, id) => {
      const list = this.store.get('downloads')?.list || []
      const record = list.find(item => item.id === id)
      if (record && record.savePath) {
        try {
          shell.showItemInFolder(record.savePath)
          return { success: true }
        } catch (err) {
          return { success: false, error: err.message }
        }
      }
      return { success: false, error: 'File not found' }
    })

    ipcMain.on('downloads:clearHistory', () => {
      const state = this.store.get('downloads') || { list: [] }
      // Keep only active/downloading things or clear everything that is done
      const filtered = state.list.filter(item => this.activeDownloads.has(item.id))
      this.store.update('downloads', { list: filtered })
      this._broadcastChange()
    })
  }

  _addRecord(record) {
    const downloads = this.store.get('downloads') || { list: [] }
    downloads.list.unshift(record) // Add to top
    this.store.update('downloads', { list: downloads.list })
  }

  _updateRecordState(id, updates) {
    const downloads = this.store.get('downloads') || { list: [] }
    const index = downloads.list.findIndex(item => item.id === id)
    if (index !== -1) {
      downloads.list[index] = { ...downloads.list[index], ...updates }
      this.store.update('downloads', { list: downloads.list })
    }
  }

  _broadcastChange() {
    const state = this.store.get('downloads') || { list: [] }
    this.broadcastToAllChrome('downloads:state', state)
  }
}

module.exports = { DownloadsManager }
