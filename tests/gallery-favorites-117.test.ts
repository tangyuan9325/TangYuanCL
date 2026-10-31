import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { build } from 'esbuild'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { BUILTIN_LAUNCH_IMAGES } from '../src/shared/launchImages'
import { activeCarouselKeys, carouselImages, carouselKeys, carouselSelection, carouselTiming, MAX_CAROUSEL_IMAGES } from '../src/shared/appearancePolicy'

const builtins = BUILTIN_LAUNCH_IMAGES.map(image => image.key)
test('all bundled wallpapers exactly preserve the pixels supplied by the maintainer', async () => {
  const pixels = [
    '4165d02969289e2c75284acb5fa03b402d05ee88155b982f37d4e854cb34b263',
    'e012d74db7be030b1d2724f1585eb30cf295ccdba7ee44b6cacef5776d253bd8',
    'a0189690e92b418cee5cfa2e244dda71fde100f62d05d144200ebe35bb03bebc',
    '4c48409a91b82e3d458968703780f6352810eb33253ba7e262b86f7d719a4fb6',
    '406ca71bf46c1f8644bad689b4576e20737b6d67b959524f4c98601f2f2a7894',
    '1adf01216f5bcf6691ba308a28ccfa3639f8af7d8318903892d8cccf93761493',
    'dade1762955a041cacc04b62707b0f630356b4ab3a852619e9322a6b8edd6ba2',
    '2180e4ca282607b5299bb299bfa0e6736c13705e165a0ceb68c2c8b45517edbb',
    '17cc12b5afc6427c2668024aa12ae362d4fe0c587f604e941a4af7acdfc5c24c',
    'f04df9b3943c67e29d28a50d958073c2957d674faec66e238e43b6a6d9396376',
    '7a1825759368ee099099209100d8d55f1e205e894991cbd36940ea5d8369ecb8',
    'd3047f524738cf7d253b43096382dfaffc1c75cce9e7718c36e5137dcbf90a81',
    '0d93c73b714846517df67433e35737577ba66ce822e0d17813956fed72a76a23',
    'f6e24eaa51176edb483edc92be274dd8a51dd5f16fead21abb35ff5c335284e4',
    'e855d222eb06ca3c1474a895c64ce2b873640933e682a59e6154cbfe21ab9da2',
    'b2c343283e52a1efd0fc51d725bb2793d873d05312cfe6ecb7ed8d83f8180860',
    '7035542d5461d6dbed8f58aa8a65bd4b288e887660391b4ff138ed55215b6fb5',
    'd51520f6af3f4c792310d6ae6f38ea396799a6f0a73653a70c6d8e5afc52bdbc',
    'b1256352b20fa32542f1b4662a81b859b736aa8db2b89e60fc6a904505031717',
    '4c10fd6c39279bfb8c6ac70679770727b2cdd16059046765560973bbf4b10f6d'
  ]
  for (const [index, image] of BUILTIN_LAUNCH_IMAGES.entries()) {
    const decoded = await sharp(path.join('src/renderer/src/assets/launch', image.file)).raw().toBuffer()
    assert.equal(createHash('sha256').update(decoded).digest('hex'), pixels[index], image.title)
  }
})
test('new gallery mixes all bundled builtins and retained legacy custom pictures in stable order', () => {
  const old = { image: 'first.png', images: ['first.png', 'second.png', 'first.png'], fit: 'crop' as const }
  assert.deepEqual(activeCarouselKeys(old), [...builtins, 'first.png', 'second.png'])
  assert.deepEqual(carouselImages(old), ['first.png', 'second.png'])
  assert.equal(carouselKeys({ images: Array.from({ length: 60 }, (_, i) => 'custom-' + i) }).length, builtins.length + MAX_CAROUSEL_IMAGES)
})
test('deselection retains files and timings, empty selection never resurrects defaults', () => {
  const custom = 'managed-custom.webp'
  const settings = { images: [custom], disabled: [...builtins, custom], durations: { [custom]: 13, [builtins[1]]: 9, unknown: 10 } }
  assert.deepEqual(activeCarouselKeys(settings), [])
  assert.deepEqual(carouselImages(settings), [custom])
  assert.deepEqual(carouselTiming(settings).durations, { [custom]: 13, [builtins[1]]: 9 })
  assert.deepEqual(activeCarouselKeys({ ...settings, disabled: [...builtins] }), [custom])
})
test('mixed order rejects unknown IDs, duplicates and stale custom references, then appends new imports', () => {
  const selection = carouselSelection({ images: ['a', 'b'], order: ['b', builtins[3], 'removed', 'b'], disabled: ['b', 'removed', builtins[0]] })
  assert.deepEqual(selection.order, ['b', builtins[3], ...builtins.filter(key => key !== builtins[3]), 'a'])
  assert.deepEqual(selection.disabled, ['b', builtins[0]])
  const newer = { ...selection, images: ['a', 'b', 'new'] }
  assert.equal(carouselKeys(newer).at(-1), 'new')
  assert.deepEqual(carouselSelection(JSON.parse(JSON.stringify(newer))), { ...selection, order: [...selection.order, 'new'] })
})
test('gallery controls and external favorite buttons compile across their actual Vue templates', () => {
  for (const file of ['views/HomeView.vue', 'components/HomeLayoutEditor.vue', 'views/CommunityView.vue', 'components/FavoriteModsPicker.vue', 'components/FileManager.vue']) {
    const { descriptor, errors } = parse(fs.readFileSync('src/renderer/src/' + file, 'utf8'))
    assert.deepEqual(errors, [])
    const script = compileScript(descriptor, { id: file })
    assert.deepEqual(compileTemplate({ source: descriptor.template!.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } }).errors, [])
  }
})

let favoriteBundle: Promise<string> | undefined
async function favoriteRuntime(invoke: (channel: string, ...args: any[]) => Promise<any>) {
  favoriteBundle ??= build({ entryPoints: ['src/renderer/src/modFavorites.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'isolated-renderer-services', setup(plugin) {
    plugin.onResolve({ filter: /^\.\/(api|store)$/ }, args => args.importer.endsWith('modFavorites.ts') ? { path: args.path, namespace: 'service' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'service' }, args => ({ contents: args.path === './api' ? 'export function errText(e){return e.message}' : 'export function toast(message){window.failures.push(message)}', loader: 'js' }))
  } }] }).then(result => result.outputFiles[0].text)
  const runtime = { exports: {} as any }, window = { kamucl: { invoke }, failures: [] as string[] }
  new Function('require', 'module', 'exports', 'window', await favoriteBundle)(createRequire(path.resolve('package.json')), runtime, runtime.exports, window)
  return { ...runtime.exports, failures: window.failures }
}
const tick = () => new Promise(resolve => setImmediate(resolve))
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { resolve, promise } }
test('shared favorite queue preserves distinct projects and blocks repeated clicks while a write is pending', async () => {
  let records: any[] = [], calls = 0
  const blocked = deferred<void>()
  const runtime = await favoriteRuntime(async (channel, value, enabled) => {
    if (channel === 'mods:favorites') return records
    calls++; if (calls === 1) await blocked.promise
    records = records.filter(record => record.key !== value.source + ':' + value.projectId)
    if (enabled) records.push({ ...value, key: value.source + ':' + value.projectId })
    return [...records]
  })
  const first = runtime.toggleProject('modrinth', 'a', 'A')
  const repeated = runtime.toggleProject('modrinth', 'a', 'A')
  const second = runtime.toggleProject('curseforge', 'b', 'B')
  await tick(); assert.equal(calls, 1); assert.equal(await repeated, false)
  assert(runtime.favoriteBusy.value.has('modrinth:a')); blocked.resolve()
  assert.equal(await first, true); assert.equal(await second, true)
  assert.deepEqual(runtime.favorites.value.map((record: any) => record.key), ['modrinth:a', 'curseforge:b'])
  assert.equal(runtime.favoriteBusy.value.size, 0)
})
test('newest favorite reads win and initial reads precede startup toggles of existing favorites', async () => {
  const older = deferred<any[]>(), newer = deferred<any[]>(); let reads = 0
  const runtime = await favoriteRuntime(async () => ++reads === 1 ? older.promise : newer.promise)
  const first = runtime.loadFavorites(), second = runtime.loadFavorites()
  await tick(); newer.resolve([{ key: 'modrinth:latest' }]); await second
  older.resolve([]); await first
  assert.equal(runtime.favorites.value[0].key, 'modrinth:latest')
  const initial = deferred<any[]>(); let enabled: unknown
  const startup = await favoriteRuntime(async (channel, _value, on) => { if (channel === 'mods:favorites') return initial.promise; enabled = on; return [] })
  const load = startup.loadFavorites(), toggle = startup.toggleProject('modrinth', 'existing', 'Existing')
  initial.resolve([{ key: 'modrinth:existing' }]); await Promise.all([load, toggle])
  assert.equal(enabled, false)
})
test('favorite write failure retains the confirmed snapshot and allows retry', async () => {
  let fail = true
  const runtime = await favoriteRuntime(async () => { if (fail) throw new Error('写盘失败'); return [{ key: 'modrinth:a' }] })
  assert.equal(await runtime.toggleProject('modrinth', 'a', 'A'), false)
  assert.deepEqual(runtime.favorites.value, []); assert.equal(runtime.favoriteBusy.value.size, 0)
  assert.deepEqual(runtime.failures, ['写盘失败'])
  fail = false; assert.equal(await runtime.toggleProject('modrinth', 'a', 'A'), true)
  assert.equal(runtime.favorites.value[0].key, 'modrinth:a')
})
test('reading during a queued startup write does not reverse the requested toggle', async () => {
  const read = deferred<any[]>(); let on: unknown, records = [{ key: 'modrinth:existing' }], calls = 0
  const runtime = await favoriteRuntime(async (channel, _value, enabled) => {
    if (channel === 'mods:favorites') return ++calls === 1 ? read.promise : records
    on = enabled; records = []; return records
  })
  const initial = runtime.loadFavorites(), toggle = runtime.toggleProject('modrinth', 'existing', 'Existing'), later = runtime.loadFavorites()
  read.resolve(records); await Promise.all([initial, toggle, later])
  assert.equal(on, false); assert.deepEqual(runtime.favorites.value, [])
})
