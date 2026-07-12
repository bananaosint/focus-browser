const { ipcMain } = require('electron')
const https = require('https')

class SearchManager {
  constructor(store) {
    this.store = store
  }

  getSearchUrl(query) {
    const config = this.store.get('searchSettings') || { engine: 'google', customUrl: '', suggestionsEnabled: true }
    const trimmed = query.trim()
    
    let template = 'https://www.google.com/search?q=%s'
    if (config.engine === 'bing') {
      template = 'https://www.bing.com/search?q=%s'
    } else if (config.engine === 'duckduckgo') {
      template = 'https://duckduckgo.com/?q=%s'
    } else if (config.engine === 'custom' && config.customUrl) {
      template = config.customUrl
    }

    if (template.includes('%s')) {
      return template.replace('%s', encodeURIComponent(trimmed))
    }
    return template + encodeURIComponent(trimmed)
  }

  fetchSuggestions(query) {
    return new Promise((resolve) => {
      const config = this.store.get('searchSettings') || { suggestionsEnabled: true }
      if (!config.suggestionsEnabled) {
        return resolve([])
      }

      const url = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`
      https.get(url, (res) => {
        let data = ''
        res.on('data', (chunk) => data += chunk)
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data)
            // Format is [query, [suggestions...], ...]
            const suggestions = parsed[1] || []
            resolve(suggestions)
          } catch {
            resolve([])
          }
        })
      }).on('error', () => {
        resolve([])
      })
    })
  }

  registerIpcHandlers(settingsWin) {
    ipcMain.handle('searchSettings:getState', () => {
      return this.store.get('searchSettings') || { engine: 'google', customUrl: '', suggestionsEnabled: true }
    })

    ipcMain.on('searchSettings:update', (e, patch) => {
      const state = this.store.update('searchSettings', patch)
      if (settingsWin && !settingsWin.isDestroyed()) {
        settingsWin.webContents.send('searchSettings:state', state)
      }
    })

    ipcMain.handle('search:getSuggestions', async (e, query) => {
      return this.fetchSuggestions(query)
    })
  }
}

module.exports = { SearchManager }
