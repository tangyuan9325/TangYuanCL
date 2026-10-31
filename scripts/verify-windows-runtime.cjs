// Fail before compression if platform file globs accidentally include the workspace.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto')
const asar = require('asar')
function verifyWindowsRuntime(appOutDir) {
  const archive = path.join(appOutDir, 'resources/app.asar')
  const names = asar.listPackage(archive).map(n => n.replaceAll('\\', '/').replace(/^\//, ''))
  // The launcher bundles the maintainer's own wallpapers for the launch screen.
  // Verify those assets match their sources byte for byte (no silent re-encode)
  // and stay inside the reviewed budget; keep the 16 MiB code/dependency budget.
  // The list is read from the shared manifest so it cannot drift from the app.
  const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
  const manifest = fs.readFileSync(path.resolve(__dirname, '../src/shared/launchImages.ts'), 'utf8')
  const files = [...manifest.matchAll(/file: '([^']+\.webp)'/g)].map(match => match[1])
  assert(files.length > 0, 'Bundled wallpaper manifest is empty')
  let illustrationBytes = 0
  for (const file of files) {
    const id = file.replace(/\.webp$/, '')
    const matches = names.filter(name => new RegExp('^out/renderer/assets/' + id + '-[^/]+\\.webp$').test(name))
    assert.equal(matches.length, 1, 'Exactly one bundled illustration: ' + id)
    const bytes = asar.extractFile(archive, matches[0].split('/').join(path.sep))
    const source = fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/assets/launch', file))
    assert.equal(digest(bytes), digest(source), 'Bundled illustration changed: ' + id)
    illustrationBytes += bytes.length
  }
  assert(illustrationBytes < 11 * 1024 * 1024, 'Illustrations exceed reviewed 11 MiB budget')
  assert(fs.statSync(archive).size - illustrationBytes < 16 * 1024 * 1024, 'Application code/dependencies exceed 16 MiB: review payload growth before release')
  for (const name of names) {
    const entry = asar.statFile(archive, name.split('/').join(path.sep))
    if (entry.files) continue
    assert(/^(node_modules\/|out\/(main|preload|renderer)\/|licenses\/|LICENSE$|THIRD_PARTY_NOTICES\.md$|package\.json$|docs\/CORRESPONDING_SOURCE\.md$)/.test(name), 'Unexpected packaged file: ' + name)
    assert(!/^node_modules\/koffi\/(doc|lib|vendor)(\/|$)/.test(name), 'Development-only Koffi files included')
    assert(!/^node_modules\/undici\/docs(\/|$)/.test(name), 'Development-only Undici docs included')
  }
  console.log(`Verified Windows ASAR: ${fs.statSync(archive).size} bytes, ${names.length} entries`)
}
module.exports = context => {
  if (context.electronPlatformName === 'win32') {
    verifyWindowsRuntime(context.appOutDir)
    require('./prune-windows-runtime.cjs').pruneWindowsRuntime(context)
  }
}
module.exports.verifyWindowsRuntime = verifyWindowsRuntime
