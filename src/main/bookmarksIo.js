const { dialog } = require('electron')
const fs = require('fs')

function registerBookmarksIoHandlers(ipcMain, store, tabManager, writeBookmarksJs, getSettingsWin) {
  ipcMain.handle('bookmarks:export', async () => {
    const bookmarks = store.get('bookmarks')?.list || []
    if (bookmarks.length === 0) {
      return { success: false, error: 'No bookmarks to export' }
    }

    const { canceled, filePath } = await dialog.showSaveDialog(getSettingsWin(), {
      title: 'Export Bookmarks',
      defaultPath: 'bookmarks.html',
      filters: [{ name: 'HTML Files', extensions: ['html'] }]
    })

    if (canceled || !filePath) return { success: false }

    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and written by browser import/export tools. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`
    bookmarks.forEach(b => {
      const added = b.savedAt || Date.now()
      html += `    <DT><A HREF="${b.url}" ADD_DATE="${Math.floor(added / 1000)}">${b.title || b.url}</A>\n`
    })
    html += `</DL><p>\n`

    try {
      fs.writeFileSync(filePath, html, 'utf-8')
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('bookmarks:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getSettingsWin(), {
      title: 'Import Bookmarks HTML',
      filters: [{ name: 'HTML Files', extensions: ['html', 'htm'] }],
      properties: ['openFile']
    })

    if (canceled || filePaths.length === 0) return { success: false }

    try {
      const content = fs.readFileSync(filePaths[0], 'utf-8')
      // Simple regex to parse Netscape HTML bookmarks
      // e.g. <A HREF="url" ...>Title</A>
      const regex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
      const imported = []
      let match
      while ((match = regex.exec(content)) !== null) {
        const url = match[1]
        const title = match[2].replace(/<\/?[^>]+(>|$)/g, "").trim() || url
        if (url.startsWith('http://') || url.startsWith('https://')) {
          imported.push({ url, title })
        }
      }

      if (imported.length === 0) {
        return { success: false, error: 'No valid bookmarks found in file.' }
      }

      const bookmarks = store.get('bookmarks') || { list: [] }
      let addedCount = 0
      imported.forEach(item => {
        if (!bookmarks.list.some(b => b.url === item.url)) {
          bookmarks.list.push({
            id: require('crypto').randomUUID(),
            url: item.url,
            title: item.title,
            savedAt: Date.now()
          })
          addedCount++
        }
      })

      if (addedCount > 0) {
        store.update('bookmarks', { list: bookmarks.list })
        writeBookmarksJs(bookmarks.list)
        tabManager.broadcastState()
        const settingsWin = getSettingsWin()
        settingsWin?.webContents.send('bookmarks:state', bookmarks)
      }

      return { success: true, count: addedCount }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
}

module.exports = { registerBookmarksIoHandlers }
