/**
 * 整合包归档构建（纯函数层，不依赖 Electron 运行时）。
 *
 * 采用 Modrinth 的 .mrpack 容器：清单 `files` 留空、全部内容放进 `overrides/`。
 * 这是 mrpack 规范允许的形态（"全量包"），导出的文件可以直接被本项目现有的
 * 导入器识别并还原，不需要联网查询 Modrinth 的下载地址。
 *
 * 只打包可分享的内容：模组、配置、脚本与资源包；存档、日志、截图与个人设置
 * 一律排除，避免把用户私有数据随包发出。
 */
import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import type { LoaderName } from '../../shared/types'

/** 允许进入整合包的目录（相对实例根目录）。 */
const INCLUDE_DIRS = [
  'mods',
  'config',
  'defaultconfigs',
  'scripts',
  'kubejs',
  'resourcepacks',
  'shaderpacks',
  'openloader',
  'patchouli_books',
  'customnpcs',
  'structure_gel'
]

/** 明确排除的文件名，即便出现在允许目录内也不打包。 */
const SKIP_NAMES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini'])

/** 单包上限：超过时明确报错，而不是悄悄截断。 */
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024

/** mrpack 依赖键 */
const LOADER_KEY: Record<LoaderName, string> = {
  fabric: 'fabric-loader',
  quilt: 'quilt-loader',
  forge: 'forge',
  neoforge: 'neoforge'
}

export interface ModpackBuildInput {
  /** 实例（游戏）目录 */
  root: string
  /** 包名，取实例名 */
  name: string
  /** 包版本号；缺省 1.0.0 */
  version?: string
  mcVersion: string
  loader?: LoaderName
  loaderVersion?: string
}

interface Collected {
  abs: string
  rel: string
  size: number
}

function shouldSkip(name: string): boolean {
  return SKIP_NAMES.has(name.toLowerCase())
}

/** 递归收集允许目录下的普通文件；跳过符号链接与系统垃圾文件。 */
async function collect(root: string, dir: string, out: Collected[], signal?: AbortSignal): Promise<void> {
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(path.join(root, dir), { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    signal?.throwIfAborted()
    if (shouldSkip(entry.name)) continue
    const rel = dir ? `${dir}/${entry.name}` : entry.name
    const abs = path.join(root, rel)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      await collect(root, rel, out, signal)
      continue
    }
    if (!entry.isFile()) continue
    const stat = await fs.promises.stat(abs)
    out.push({ abs, rel, size: stat.size })
  }
}

/**
 * 构建 .mrpack。
 * @param destination 目标文件路径，必须以 .mrpack 结尾
 */
export async function buildModpackArchive(
  input: ModpackBuildInput,
  destination: string,
  signal?: AbortSignal,
  progress?: (done: number, total: number, text: string) => void
): Promise<{ files: number; bytes: number }> {
  if (path.extname(destination).toLowerCase() !== '.mrpack') throw new Error('导出文件必须以 .mrpack 结尾')
  if (!input.mcVersion || !/^[0-9]/.test(input.mcVersion)) throw new Error('缺少可用的 Minecraft 版本号，无法生成整合包清单')

  const collected: Collected[] = []
  for (const dir of INCLUDE_DIRS) await collect(input.root, dir, collected, signal)

  const total = collected.reduce((sum, item) => sum + item.size, 0)
  if (total > MAX_TOTAL_BYTES) {
    throw new Error(`实例内容超过 2 GB（${(total / 1024 / 1024 / 1024).toFixed(2)} GB），请先清理模组或资源包`)
  }

  const dependencies: Record<string, string> = { minecraft: input.mcVersion }
  if (input.loader && input.loaderVersion) dependencies[LOADER_KEY[input.loader]] = input.loaderVersion
  const index = {
    formatVersion: 1,
    game: 'minecraft',
    versionId: input.version || '1.0.0',
    name: input.name,
    summary: `由 ${input.name} 导出的全量整合包（含 ${collected.length} 个文件）`,
    files: [] as unknown[],
    dependencies
  }

  const zip = new AdmZip()
  zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(index, null, 2)))
  let done = 0
  for (const item of collected) {
    signal?.throwIfAborted()
    zip.addFile(`overrides/${item.rel}`, await fs.promises.readFile(item.abs))
    done += 1
    if (done % 16 === 0 || done === collected.length) progress?.(done, collected.length, `打包 ${done}/${collected.length}`)
  }
  if (!collected.length) progress?.(1, 1, '实例没有可打包的内容')
  await new Promise<void>((resolve, reject) => {
    zip.writeZip(destination, (error) => (error ? reject(error) : resolve()))
  })
  return { files: collected.length, bytes: (await fs.promises.stat(destination)).size }
}
