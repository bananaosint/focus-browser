const { randomUUID } = require('crypto')
const { exec } = require('child_process')
const os = require('os')

// The plan calls these "Workspace Profiles"; named "Launch Profiles" here
// instead to avoid colliding with workspace.js's unrelated "workspace"
// (the local-folder file panel) — same underlying idea, different word so
// the two features don't read as the same thing in code and UI.
//
// Commands run through the shell (child_process.exec) rather than spawn()
// with a parsed argv — that's a deliberate choice, not an oversight. Every
// command here is first-party: typed by the user into their own local
// Settings window, stored in their own local settings.json, and only ever
// triggered by an explicit click from that same trusted UI. It's the same
// trust boundary as a user's own .vscode/tasks.json or Makefile, not a
// network/web-content input, so exec's shell parsing (handling quoted paths,
// &&-chains, etc. the way a terminal would) is the right tool, not a risk.
// Nothing on the tab side (which has no preload/IPC at all) can reach this.
class Profiles {
  constructor(store) {
    this.store = store
    this.onChange = null
    this.onLaunchError = null // (profileName, command, errorMessage) => void
  }

  get state() {
    return this.store.get('profiles')
  }

  addProfile({ name, urls = [], commands = [], cwd = null }) {
    const profile = { id: randomUUID(), name: name.trim() || 'Untitled', urls, commands, cwd: cwd || null }
    this._update({ list: [...this.state.list, profile] })
    return profile.id
  }

  updateProfile(id, patch) {
    this._update({ list: this.state.list.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  }

  removeProfile(id) {
    this._update({ list: this.state.list.filter((p) => p.id !== id) })
  }

  launchProfile(id, { onOpenUrl }) {
    const profile = this.state.list.find((p) => p.id === id)
    if (!profile) return

    profile.urls.forEach((url) => {
      if (url.trim()) onOpenUrl(url.trim())
    })

    // Without an explicit cwd, exec() inherits the Electron process's own
    // working directory — wherever `npm start`/the packaged app happened to
    // launch from, i.e. this app's own install folder, not anything of the
    // user's. That's almost never what "code ." or similar should resolve
    // against, so fall back to the user's home directory instead.
    const cwd = profile.cwd || os.homedir()
    profile.commands.forEach((cmd) => {
      const command = cmd.trim()
      if (!command) return
      exec(command, { cwd }, (err) => {
        if (err) this.onLaunchError?.(profile.name, command, err.message)
      })
    })
  }

  _update(patch) {
    this.store.update('profiles', patch)
    this.onChange?.(this.state)
  }
}

module.exports = { Profiles }
