const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const distDir = path.join(root, 'dist')
const pkg = require(path.join(root, 'package.json'))
const tag = `v${pkg.version}`

function run(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(' ')}`)
  const useShell = cmd === 'npm' && process.platform === 'win32'
  execFileSync(cmd, args, { cwd: root, stdio: 'inherit', shell: useShell, ...opts })
}

// 1. Build both Windows targets (nsis installer + portable exe)
run('npm', ['run', 'dist'])

// electron-builder doesn't glob-expand for us and cmd.exe doesn't either,
// so find the built exes ourselves instead of passing dist/*.exe through
const assets = fs.readdirSync(distDir)
  .filter((f) => f.endsWith('.exe'))
  .map((f) => path.join(distDir, f))

if (assets.length === 0) {
  throw new Error(`No .exe files found in ${distDir} after build`)
}

// 2. Tag + push
run('git', ['tag', tag])
run('git', ['push'])
run('git', ['push', 'origin', tag])

// 3. Publish the GitHub release with the built exes attached
run('gh', ['release', 'create', tag, ...assets, '--title', tag, '--generate-notes'])

console.log(`\nReleased ${tag} — https://github.com/bananaosint/focus-browser/releases/tag/${tag}`)
