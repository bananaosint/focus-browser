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

// 1. Build both Windows and macOS targets
run('npm', ['run', 'dist'])

// Collect all installer files (.exe, .dmg, .zip)
// electron-builder creates these based on the platform and config
const assets = fs.readdirSync(distDir)
  .filter((f) => f.endsWith('.exe') || f.endsWith('.dmg') || f.endsWith('.zip'))
  .map((f) => path.join(distDir, f))

if (assets.length === 0) {
  throw new Error(`No installer files found in ${distDir} after build`)
}

console.log(`\nBuilt installers:`)
assets.forEach((a) => console.log(`  - ${path.basename(a)}`))

// 2. Tag + push
run('git', ['tag', tag])
run('git', ['push'])
run('git', ['push', 'origin', tag])

// 3. Publish the GitHub release with all installers attached
run('gh', ['release', 'create', tag, ...assets, '--title', tag, '--generate-notes'])

console.log(`\nReleased ${tag} — https://github.com/bananaosint/focus-browser/releases/tag/${tag}`)
