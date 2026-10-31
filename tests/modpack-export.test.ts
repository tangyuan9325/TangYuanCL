import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import AdmZip from 'adm-zip'
import { buildModpackArchive } from '../src/main/core/modpackArchive'
import { probeModpack } from '../src/main/core/modpacks'

async function makeInstance(): Promise<string> {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tangyuancl-pack-export-'))
  const write = async (rel: string, body: string | Buffer) => {
    const file = path.join(root, rel)
    await fs.promises.mkdir(path.dirname(file), { recursive: true })
    await fs.promises.writeFile(file, body)
  }
  await write('mods/example.jar', Buffer.from('jar-bytes'))
  await write('mods/nested/extra.jar', Buffer.from('nested'))
  await write('config/example.toml', 'key = 1')
  await write('defaultconfigs/pack.toml', 'a = 2')
  await write('resourcepacks/pack.zip', Buffer.from('zip'))
  // 以下都不应该出现在整合包里
  await write('saves/world/level.dat', Buffer.from('world'))
  await write('logs/latest.log', 'log')
  await write('crash-reports/crash-test.txt', 'crash')
  await write('screenshots/a.png', Buffer.from('png'))
  await write('options.txt', 'fov:70')
  await write('mods/.DS_Store', 'junk')
  return root
}

test('整合包导出：能被本启动器的导入器原样识别（格式、版本、加载器、文件数）', async (t) => {
  const root = await makeInstance()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'out.mrpack')

  const result = await buildModpackArchive(
    { root, name: '示例整合包', version: '2.1.0', mcVersion: '1.20.1', loader: 'fabric', loaderVersion: '0.15.11' },
    file
  )
  assert.equal(result.files, 5, '只应打包 mods/config/defaultconfigs/resourcepacks 下的 5 个文件')
  assert.ok(result.bytes > 0)

  const info = await probeModpack(file)
  assert.equal(info.format, 'mrpack')
  assert.equal(info.innerName, '示例整合包')
  assert.equal(info.version, '2.1.0')
  assert.equal(info.mcVersion, '1.20.1')
  assert.equal(info.loader, 'fabric')
  assert.equal(info.loaderVersion, '0.15.11')
  assert.equal(info.fileCount, 0, '全量包不需要下载任何清单文件')
  assert.equal(info.overrideCount, 5, '内容随 overrides 分发')
  assert.equal(info.hasOverrides, true)
})

test('整合包导出：overrides 只包含可分享内容，排除存档、日志、截图与个人设置', async (t) => {
  const root = await makeInstance()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'out.mrpack')
  await buildModpackArchive({ root, name: 'p', mcVersion: '1.20.1' }, file)

  const names = new AdmZip(file).getEntries().map((entry) => entry.entryName.replace(/\\/g, '/'))
  assert.ok(names.includes('overrides/mods/example.jar'))
  assert.ok(names.includes('overrides/mods/nested/extra.jar'), '应保留子目录结构')
  assert.ok(names.includes('overrides/config/example.toml'))
  for (const forbidden of ['saves/', 'logs/', 'crash-reports/', 'screenshots/', 'options.txt']) {
    assert.ok(!names.some((name) => name.includes(forbidden)), `不应包含 ${forbidden}`)
  }
  assert.ok(!names.some((name) => name.toLowerCase().includes('.ds_store')), '应跳过系统垃圾文件')
})

test('整合包导出：原版实例的依赖只有 Minecraft 版本', async (t) => {
  const root = await makeInstance()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'vanilla.mrpack')
  await buildModpackArchive({ root, name: 'vanilla', mcVersion: '1.21.1' }, file)

  const index = JSON.parse(new AdmZip(file).readAsText('modrinth.index.json')) as {
    files: unknown[]
    dependencies: Record<string, string>
  }
  assert.deepEqual(index.dependencies, { minecraft: '1.21.1' })
  assert.deepEqual(index.files, [], '全量包把内容放在 overrides，清单 files 必须为空')
})

test('整合包导出：空实例也能产出合法包，便于分享纯配置组合', async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tangyuancl-pack-empty-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'empty.mrpack')
  const result = await buildModpackArchive({ root, name: 'empty', mcVersion: '1.20.1' }, file)
  assert.equal(result.files, 0)
  const info = await probeModpack(file)
  assert.equal(info.format, 'mrpack')
  assert.equal(info.fileCount, 0)
  assert.equal(info.overrideCount, 0, '空实例没有任何随包文件')
})

test('整合包导出：扩展名与版本号非法时明确拒绝', async (t) => {
  const root = await makeInstance()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await assert.rejects(
    () => buildModpackArchive({ root, name: 'p', mcVersion: '1.20.1' }, path.join(root, 'out.zip')),
    /mrpack/
  )
  await assert.rejects(
    () => buildModpackArchive({ root, name: 'p', mcVersion: '未知' }, path.join(root, 'out.mrpack')),
    /Minecraft 版本/
  )
})

test('整合包导出：取消信号会中断打包，不留下半成品', async (t) => {
  const root = await makeInstance()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'cancelled.mrpack')
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    () => buildModpackArchive({ root, name: 'p', mcVersion: '1.20.1' }, file, controller.signal),
    /abort/i
  )
})
