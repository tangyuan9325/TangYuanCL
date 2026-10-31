/**
 * OptiFine 安装编排：补齐原版文件 → 下载官方安装器 → 静默安装 → 定位新版本。
 *
 * OptiFine 安装器只会在游戏目录下写入 `versions/optifine_<mc>_<版本>/`，
 * 不改写已有实例，因此这里是「新增一个实例」而不是替换当前实例。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { currentGameDirPath } from './gamedir'
import { installVanilla, readVersionJson } from './versions'
import { withGameFolder } from './paths'
import { getSettings } from './settings'
import { ensureJava } from './java'
import {
  downloadOptiFineInstaller,
  parseOptiFineFileName,
  runOptiFineInstaller,
  type OptiFineEntry
} from './optifine'
import type { ProgressEmit } from './loaders'
import { logScope } from './launcherLog'

const log = logScope('optifine')
const STAGING = path.join(os.tmpdir(), 'kamucl-optifine')

export type { OptiFineInstallResult } from '../../shared/types'
import type { OptiFineInstallResult } from '../../shared/types'

function listVersions(target: string): Set<string> {
  try {
    return new Set(fs.readdirSync(path.join(target, 'versions'), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name))
  } catch {
    return new Set()
  }
}

/** 找出安装器新写入的 OptiFine 版本目录；找不到时按约定命名给出可读的错误。 */
function findCreatedVersion(target: string, before: Set<string>, entry: OptiFineEntry): string {
  const created = [...listVersions(target)].filter((name) => !before.has(name))
  const hit = created.find((name) => name.toLowerCase().startsWith('optifine'))
  if (hit) return hit
  // 兼容重复安装：目标目录已存在时，按官方命名约定回退
  const guess = `optifine_${entry.mcVersion}_${entry.edition.replace(/\s+/g, '_')}`
  if (listVersions(target).has(guess)) return guess
  throw new Error(`安装器未生成 OptiFine 版本（新增目录：${created.join('、') || '无'}），详见 kamucl-logs/installer.log`)
}

/**
 * 安装 OptiFine。
 * @param fileName 安装器文件名，如 OptiFine_1.20.1_HD_U_I6.jar
 */
export async function installOptiFine(
  fileName: string,
  emit: ProgressEmit,
  signal?: AbortSignal
): Promise<OptiFineInstallResult> {
  const entry = parseOptiFineFileName(fileName)
  if (!entry) throw new Error(`无法识别 OptiFine 文件名：${fileName}`)
  return withGameFolder(getSettings().activeFolder, async () => {
    const target = currentGameDirPath()
    log.info(`开始安装 ${entry.fileName}（Minecraft ${entry.mcVersion}）`)

    // 安装器依赖原版客户端文件，缺失时先补全（走同一套校验/镜像逻辑）
    emit({ stage: 'version', progress: 0.05, text: `准备 Minecraft ${entry.mcVersion} 运行文件` })
    await installVanilla(entry.mcVersion, emit, 'versions', undefined, signal)

    const java = await ensureJava(readVersionJson(entry.mcVersion), emit)
    fs.mkdirSync(STAGING, { recursive: true })
    const jar = path.join(STAGING, entry.fileName)

    await downloadOptiFineInstaller(entry.fileName, jar, emit, signal)
    const before = listVersions(target)
    await runOptiFineInstaller(java, jar, target, emit, signal)
    const id = findCreatedVersion(target, before, entry)
    log.info(`OptiFine 安装完成，生成实例 ${id}`)
    emit({ stage: 'loader', progress: 1, text: `OptiFine ${entry.edition} 安装完成` })
    return { id, mcVersion: entry.mcVersion, edition: entry.edition }
  })
}
