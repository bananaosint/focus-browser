const { safeStorage, ipcMain } = require('electron')
const { randomUUID } = require('crypto')

class PasswordsManager {
  constructor(store) {
    this.store = store
  }

  encryptPassword(plainPassword) {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(plainPassword).toString('base64')
    }
    return plainPassword // Fallback
  }

  decryptPassword(base64Password) {
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(Buffer.from(base64Password, 'base64'))
      } catch (err) {
        console.error('safeStorage decryption failed:', err)
        return '[Decryption Failed]'
      }
    }
    return base64Password
  }

  registerIpcHandlers(getSettingsWin) {
    this.getSettingsWin = getSettingsWin
    ipcMain.handle('passwords:getState', () => {
      const state = this.store.get('passwords') || { list: [] }
      // Map list to not expose encrypted buffers directly unless requested,
      // but here we decrypt on-demand for display in settings.
      const decryptedList = state.list.map(item => ({
        id: item.id,
        hostname: item.hostname,
        username: item.username,
        password: this.decryptPassword(item.encryptedPassword),
        lastSaved: item.lastSaved
      }))
      return { list: decryptedList }
    })

    ipcMain.on('passwords:save', (e, { id, hostname, username, password }) => {
      const state = this.store.get('passwords') || { list: [] }
      const encryptedPassword = this.encryptPassword(password)
      
      if (id) {
        // Update
        const idx = state.list.findIndex(item => item.id === id)
        if (idx !== -1) {
          state.list[idx] = {
            id,
            hostname: hostname.trim().toLowerCase(),
            username: username.trim(),
            encryptedPassword,
            lastSaved: Date.now()
          }
        }
      } else {
        // Create
        state.list.push({
          id: randomUUID(),
          hostname: hostname.trim().toLowerCase(),
          username: username.trim(),
          encryptedPassword,
          lastSaved: Date.now()
        })
      }
      this.store.update('passwords', { list: state.list })
      this._broadcastChange()
    })

    ipcMain.on('passwords:delete', (e, id) => {
      const state = this.store.get('passwords') || { list: [] }
      const filtered = state.list.filter(item => item.id !== id)
      this.store.update('passwords', { list: filtered })
      this._broadcastChange()
    })
  }

  _broadcastChange() {
    const settingsWin = this.getSettingsWin?.()
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send('passwords:state', this.store.get('passwords'))
    }
  }

  getCredentialsForUrl(urlStr) {
    try {
      const url = new URL(urlStr)
      const host = url.hostname.toLowerCase()
      const state = this.store.get('passwords') || { list: [] }
      // Match exact domain or subdomains
      return state.list.filter(item => {
        const itemHost = item.hostname.toLowerCase()
        return host === itemHost || host.endsWith('.' + itemHost)
      }).map(item => ({
        username: item.username,
        password: this.decryptPassword(item.encryptedPassword)
      }))
    } catch {
      return []
    }
  }

  autofillTab(webContents, urlStr) {
    const credentials = this.getCredentialsForUrl(urlStr)
    if (credentials.length === 0) return

    const { username, password } = credentials[0]
    const js = `
      (function() {
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        if (passwordInputs.length === 0) return;
        
        // Find username input (usually text/email input preceding a password input)
        let usernameInput = null;
        const allInputs = Array.from(document.querySelectorAll('input'));
        const firstPwdIndex = allInputs.findIndex(i => i.type === 'password');
        if (firstPwdIndex > 0) {
          for (let i = firstPwdIndex - 1; i >= 0; i--) {
            if (allInputs[i].type === 'text' || allInputs[i].type === 'email') {
              usernameInput = allInputs[i];
              break;
            }
          }
        }
        
        if (usernameInput && !usernameInput.value) {
          usernameInput.value = ${JSON.stringify(username)};
          usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
          usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        if (passwordInputs[0] && !passwordInputs[0].value) {
          passwordInputs[0].value = ${JSON.stringify(password)};
          passwordInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
          passwordInputs[0].dispatchEvent(new Event('change', { bubbles: true }));
        }
      })();
    `
    webContents.executeJavaScript(js).catch(() => {})
  }
}

module.exports = { PasswordsManager }
