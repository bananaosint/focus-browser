const { dialog, ipcMain, session } = require('electron')

class PrivacyManager {
  constructor(store) {
    this.store = store
  }

  registerSession(sessionInstance) {
    sessionInstance.setPermissionRequestHandler(async (webContents, permission, callback, details) => {
      try {
        const urlStr = webContents.getURL()
        if (!urlStr || urlStr.startsWith('file://')) {
          return callback(true) // Allow local pages
        }
        
        const host = new URL(urlStr).hostname.toLowerCase()
        const sites = this.store.get('permissions')?.sites || {}
        const siteRules = sites[host] || {}
        
        // Map Electron permission strings to simpler keys
        let permKey = permission
        if (permission === 'media') {
          // Can check details.mediaTypes to differentiate audio/video if needed
          permKey = 'media'
        }

        // Check if there is an existing rule
        if (siteRules[permKey] === 'allow') {
          return callback(true)
        } else if (siteRules[permKey] === 'deny') {
          return callback(false)
        }

        // If no rule exists, ask the user via dialog
        let friendlyPermission = permission
        if (permission === 'media') {
          const types = details?.mediaTypes || ['audio', 'video']
          friendlyPermission = types.join(' and ')
        }

        const { response } = await dialog.showMessageBox({
          type: 'question',
          buttons: ['Block', 'Allow'],
          defaultId: 0,
          title: 'Permission Request',
          message: `"${host}" wants to access your ${friendlyPermission}.`,
          cancelId: 0
        })

        const allowed = response === 1
        const value = allowed ? 'allow' : 'deny'

        // Save rule to store
        const currentSites = this.store.get('permissions')?.sites || {}
        if (!currentSites[host]) currentSites[host] = {}
        currentSites[host][permKey] = value
        this.store.update('permissions', { sites: currentSites })

        callback(allowed)
      } catch (err) {
        console.error('Permission request handling error:', err)
        callback(false)
      }
    })
  }

  registerIpcHandlers(getSettingsWin) {
    this.getSettingsWin = getSettingsWin
    ipcMain.handle('privacy:getPermissions', () => {
      return this.store.get('permissions') || { sites: {} }
    })

    ipcMain.on('privacy:setPermission', (e, { host, permission, value }) => {
      const currentSites = this.store.get('permissions')?.sites || {}
      if (!currentSites[host]) currentSites[host] = {}
      currentSites[host][permission] = value
      this.store.update('permissions', { sites: currentSites })
      this._broadcastChange()
    })

    ipcMain.on('privacy:deletePermission', (e, { host, permission }) => {
      const currentSites = this.store.get('permissions')?.sites || {}
      if (currentSites[host]) {
        delete currentSites[host][permission]
        if (Object.keys(currentSites[host]).length === 0) {
          delete currentSites[host]
        }
        this.store.update('permissions', { sites: currentSites })
      }
      this._broadcastChange()
    })

    ipcMain.handle('privacy:getCookies', async () => {
      try {
        const cookies = await session.defaultSession.cookies.get({})
        const grouped = {}
        cookies.forEach(c => {
          let domain = c.domain
          if (domain.startsWith('.')) domain = domain.slice(1)
          if (!grouped[domain]) {
            grouped[domain] = { domain, count: 0, cookies: [] }
          }
          grouped[domain].count++
          grouped[domain].cookies.push(c)
        })
        return { list: Object.values(grouped) }
      } catch (err) {
        return { list: [], error: err.message }
      }
    })

    ipcMain.handle('privacy:clearCookiesForDomain', async (e, domain) => {
      try {
        const sessionCookies = session.defaultSession.cookies
        // Query cookies matching domain
        const cookies = await sessionCookies.get({ domain })
        for (const cookie of cookies) {
          const scheme = cookie.secure ? 'https://' : 'http://'
          const host = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain
          const url = `${scheme}${host}${cookie.path}`
          await sessionCookies.remove(url, cookie.name)
        }
        return { success: true }
      } catch (err) {
        return { success: false, error: err.message }
      }
    })
  }

  _broadcastChange() {
    const settingsWin = this.getSettingsWin?.()
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send('privacy:state', this.store.get('permissions'))
    }
  }
}

module.exports = { PrivacyManager }
