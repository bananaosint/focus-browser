const fs = require('fs/promises')
const path = require('path')
const { dialog } = require('electron')

const IGNORED_DIR_NAMES = new Set(['node_modules', '.git'])
const MAX_FILE_BYTES = 2 * 1024 * 1024 // large enough for real source files, small enough to keep the textarea responsive
const MIN_SIDEBAR_WIDTH = 220
const MAX_SIDEBAR_WIDTH = 600

// Local folder browsing for the workspace sidebar. The renderer never gets
// direct fs access (it's sandboxed, no Node) — every read/write funnels
// through here so the open-folder boundary is enforced in one place instead
// of trusted-by-convention in the UI code.
class Workspace {
  constructor(store) {
    this.store = store
    this.win = null // set via setWindow() once the BrowserWindow exists, used only as the folder-picker's parent
    this.onChange = null
  }

  setWindow(win) {
    this.win = win
  }

  get state() {
    return this.store.get('workspace')
  }

  async pickFolder() {
    const result = await dialog.showOpenDialog(this.win, { properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return this.state.folder
    this._update({ folder: result.filePaths[0] })
    return this.state.folder
  }

  setSidebarVisible(visible) {
    this._update({ sidebarVisible: !!visible })
  }

  setSidebarWidth(px) {
    const clamped = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(Number(px)) || this.state.sidebarWidth))
    this._update({ sidebarWidth: clamped })
    return clamped
  }

  setTreeCollapsed(collapsed) {
    this._update({ treeCollapsed: !!collapsed })
  }

  _update(patch) {
    this.store.update('workspace', patch)
    this.onChange?.(this.state)
  }

  _assertWithinRoot(targetPath) {
    const root = this.state.folder
    if (!root) throw new Error('No workspace folder open')
    const resolvedRoot = path.resolve(root)
    const resolvedTarget = path.resolve(targetPath)
    if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + path.sep)) {
      throw new Error('Path is outside the open workspace folder')
    }
    return resolvedTarget
  }

  async readDir(dirPath) {
    const resolved = this._assertWithinRoot(dirPath)
    const entries = await fs.readdir(resolved, { withFileTypes: true })
    return entries
      .filter((e) => !IGNORED_DIR_NAMES.has(e.name))
      .map((e) => ({
        name: e.name,
        path: path.join(resolved, e.name),
        isDirectory: e.isDirectory()
      }))
      .sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1))
  }

  async readFile(filePath) {
    const resolved = this._assertWithinRoot(filePath)
    const stat = await fs.stat(resolved)
    if (stat.size > MAX_FILE_BYTES) throw new Error('File is too large to open here (2MB limit)')
    return fs.readFile(resolved, 'utf-8')
  }

  async writeFile(filePath, content) {
    const resolved = this._assertWithinRoot(filePath)
    await fs.writeFile(resolved, content, 'utf-8')
  }
}

module.exports = { Workspace, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH }
