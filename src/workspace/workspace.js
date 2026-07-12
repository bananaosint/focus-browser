const openFolderBtn = document.getElementById('open-folder-btn')
const folderNameEl = document.getElementById('folder-name')
const treeEl = document.getElementById('tree')
const fileNameEl = document.getElementById('file-name')
const dirtyDot = document.getElementById('dirty-dot')
const saveBtn = document.getElementById('save-btn')
const editorEl = document.getElementById('editor')
const errorBanner = document.getElementById('error-banner')
const widthShrinkBtn = document.getElementById('width-shrink-btn')
const widthGrowBtn = document.getElementById('width-grow-btn')
const explorerToggleBtn = document.getElementById('explorer-toggle-btn')
const explorerChevron = document.getElementById('explorer-chevron')
const resizeHandle = document.getElementById('resize-handle')

const WIDTH_STEP = 40

let root = null
let currentFile = null
let dirty = false
let errorTimer = null
let currentWidth = 320

function showError(message) {
  clearTimeout(errorTimer)
  errorBanner.textContent = message
  errorBanner.classList.remove('hidden')
  errorTimer = setTimeout(() => errorBanner.classList.add('hidden'), 4000)
}

function setDirty(v) {
  dirty = v
  dirtyDot.classList.toggle('hidden', !v)
}

async function openFile(filePath, name) {
  if (dirty && !confirm(`Discard unsaved changes to ${fileNameEl.textContent}?`)) return
  try {
    const content = await window.workspaceAPI.readFile(filePath)
    currentFile = filePath
    fileNameEl.textContent = name
    editorEl.value = content
    editorEl.disabled = false
    setDirty(false)
  } catch (err) {
    showError(err.message || 'Could not open file')
  }
}

async function save() {
  if (!currentFile || !dirty) return
  try {
    await window.workspaceAPI.writeFile(currentFile, editorEl.value)
    setDirty(false)
  } catch (err) {
    showError(err.message || 'Could not save file')
  }
}

editorEl.addEventListener('input', () => setDirty(true))
editorEl.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    save()
  }
})
saveBtn.addEventListener('click', save)

// Each folder's children are fetched fresh on every expand rather than
// cached — projects change on disk while the sidebar is open, and refetching
// a single directory listing is cheap enough not to bother invalidating a cache.
async function renderChildren(container, dirPath) {
  container.innerHTML = ''
  let entries
  try {
    entries = await window.workspaceAPI.readDir(dirPath)
  } catch (err) {
    showError(err.message || 'Could not read folder')
    return
  }
  entries.forEach((entry) => {
    const row = document.createElement('div')
    row.className = 'entry ' + (entry.isDirectory ? 'dir' : 'file')
    row.textContent = (entry.isDirectory ? '▸ ' : '') + entry.name
    container.appendChild(row)

    if (entry.isDirectory) {
      const childContainer = document.createElement('div')
      childContainer.className = 'children hidden'
      container.appendChild(childContainer)

      let expanded = false
      row.addEventListener('click', async () => {
        expanded = !expanded
        row.textContent = (expanded ? '▾ ' : '▸ ') + entry.name
        childContainer.classList.toggle('hidden', !expanded)
        if (expanded) await renderChildren(childContainer, entry.path)
      })
    } else {
      row.addEventListener('click', () => openFile(entry.path, entry.name))
    }
  })
}

async function loadFolder(folderPath) {
  root = folderPath
  folderNameEl.textContent = folderPath ? folderPath.split(/[\\/]/).pop() : ''
  folderNameEl.title = folderPath || ''
  if (folderPath) await renderChildren(treeEl, folderPath)
  else treeEl.innerHTML = ''
}

openFolderBtn.addEventListener('click', async () => {
  const folderPath = await window.workspaceAPI.pickFolder()
  if (folderPath && folderPath !== root) loadFolder(folderPath)
})

widthShrinkBtn.addEventListener('click', () => window.workspaceAPI.setSidebarWidth(currentWidth - WIDTH_STEP))
widthGrowBtn.addEventListener('click', () => window.workspaceAPI.setSidebarWidth(currentWidth + WIDTH_STEP))

// Actual width tracking happens in the main process (screen.getCursorScreenPoint
// polling, see main.js) — this just tells it when to start/stop. That's what
// lets the drag keep working even once the boundary moves out from under
// where the mouse originally went down, which plain renderer mousemove can't do.
let resizing = false
resizeHandle.addEventListener('mousedown', (e) => {
  e.preventDefault()
  resizing = true
  document.body.classList.add('resizing')
  window.workspaceAPI.startResize()
})
document.addEventListener('mouseup', () => {
  if (!resizing) return
  resizing = false
  document.body.classList.remove('resizing')
  window.workspaceAPI.endResize()
})

function applyTreeCollapsed(collapsed) {
  treeEl.classList.toggle('hidden', collapsed)
  explorerChevron.textContent = collapsed ? '▸' : '▾'
}
explorerToggleBtn.addEventListener('click', () => {
  const collapsed = !treeEl.classList.contains('hidden')
  window.workspaceAPI.setTreeCollapsed(collapsed)
})

function applyState(state) {
  currentWidth = state.sidebarWidth
  applyTreeCollapsed(!!state.treeCollapsed)
  if (state.folder !== root) loadFolder(state.folder)
}

window.workspaceAPI.onState(applyState)
window.workspaceAPI.getState().then(applyState)

// ---- theme + icons ----
window.FocusIcons.hydrate(document)
function applyWorkspaceTheme(t) {
  if (t) window.FocusTheme.applyTheme(t.palette, t.mode)
}
window.workspaceAPI.getTheme().then(applyWorkspaceTheme)
window.workspaceAPI.onThemeChanged(applyWorkspaceTheme)
