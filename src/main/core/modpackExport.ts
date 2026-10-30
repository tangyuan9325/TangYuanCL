/**
 * 实例导出为整合包（需要实例上下文的主进程层）。
 * 纯归档构建见 modpackArchive.ts。
 */
import type { InstanceTarget } from '../../shared/instanceCenter'
import type { LoaderName } from '../../shared/types'
import { centerTarget, assertInstanceIdle } from './instanceCenter'
import { readVersionJson, resolveVersionChain } from './versions'
import { resolveInstanceMetadata } from './instanceMetadata'
import { withGameFolder } from './paths'
import { logScope } from './launcherLog'
import { buildModpackArchive } from './modpackArchive'

const packLog = logScope('modpack-export')

export interface ModpackExportResult {
  file: string
  files: number
  bytes: number
  mcVersion: string
  loader?: LoaderName
  loaderVersion?: string
}

/**
 * 从实例读取真实版本信息后导出。
 * @param destination 目标文件路径（由调用方通过保存对话框取得）
 */
export async function exportInstanceModpack(
  target: InstanceTarget,
  destination: string,
  signal?: AbortSignal,
  progress?: (done: number, total: number, text: string) => void
): Promise<ModpackExportResult> {
  const c = centerTarget(target)
  return withGameFolder(c.folder, async () => {
    await assertInstanceIdle(c.dir)
    const json = readVersionJson(target.id)
    const { merged } = resolveVersionChain(target.id)
    const meta = resolveInstanceMetadata(merged, (id) => {
      try {
        return readVersionJson(id)
      } catch {
        return undefined
      }
    })
    if (!meta.mcVersion || meta.mcVersion === '未知') throw new Error('无法确定该实例的 Minecraft 版本，已取消导出')
    const result = await buildModpackArchive(
      {
        root: c.dir,
        name: json._modpackName || c.target.id,
        version: json._modpackVersion,
        mcVersion: meta.mcVersion,
        loader: meta.loader,
        loaderVersion: meta.loaderVersion
      },
      destination,
      signal,
      progress
    )
    packLog.info(`已导出 ${c.target.id}：${result.files} 个文件，${result.bytes} 字节`)
    return {
      ...result,
      file: destination,
      mcVersion: meta.mcVersion,
      loader: meta.loader,
      loaderVersion: meta.loaderVersion
    }
  })
}
