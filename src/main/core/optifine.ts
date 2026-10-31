/**
 * OptiFine 安装支持。
 *
 * OptiFine 官方没有公开 API，下载必须走站点自己的三跳链路：
 *   downloads 页 → adloadx?f=<文件>&x=<短token> → downloadx?f=<文件>&x=<长token>
 * HTML 解析都做成纯函数，便于用固定夹具测试；站点结构若变化，报错直接指向对应解析步骤。
 *
 * 安装走官方安装器的 `--install <游戏目录>` 静默模式，与 Forge/NeoForge 安装器同样的
 * 子进程模型：输出落盘 installer.log，失败附末尾输出，取消杀进程。
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { downloadFile } from './download'
import { logScope } from './launcherLog'
import { withFileJob } from './fileJobs'
import type { ProgressEmit } from './loaders'
import type { OptiFineEntry } from '../../shared/types'

export type { OptiFineEntry } from '../../shared/types'

const optifineLog = logScope('optifine')
const ORIGIN = 'https://optifine.net'
/** 安装器 jar 的上限：正常 6 MB 左右，超过视为异常。 */
const MAX_INSTALLER_BYTES = 64 * 1024 * 1024

/** 解析文件名：OptiFine_1.20.1_HD_U_I6.jar / preview_OptiFine_26.2_HD_U_K2_pre5.jar */
export function parseOptiFineFileName(fileName: string): OptiFineEntry | null {
  const name = path.basename(fileName)
  const match = /^(preview_)?OptiFine_([^_]+)_(HD_U_[A-Za-z0-9]+(?:_pre\d+)?)\.jar$/i.exec(name)
  if (!match) return null
  const [, previewRaw, mcVersion, editionRaw] = match
  return {
    fileName: name,
    mcVersion,
    edition: editionRaw.replace(/_/g, ' ').toUpperCase(),
    preview: previewRaw === 'preview_',
    prerelease: /_pre\d+$/i.test(editionRaw)
  }
}

/** 从 downloads 页 HTML 提取安装器清单（去重，保持出现顺序）。 */
export function parseOptiFineDownloads(html: string): OptiFineEntry[] {
  const names = [...html.matchAll(/adloadx\?f=([^&"'>\s]+?\.jar)/gi)].map((m) => decodeURIComponent(m[1]))
  const seen = new Set<string>()
  const out: OptiFineEntry[] = []
  for (const raw of names) {
    const parsed = parseOptiFineFileName(raw)
    if (!parsed || seen.has(parsed.fileName.toLowerCase())) continue
    seen.add(parsed.fileName.toLowerCase())
    out.push(parsed)
  }
  return out
}

/** 从 adloadx 页面解析真实下载地址（单引号 href='downloadx?...'）。 */
export function parseOptiFineDownloadPath(html: string, fileName: string): string | null {
  const target = decodeURIComponent(fileName)
  for (const match of html.matchAll(/href=['"](downloadx\?[^'"]+)['"]/gi)) {
    const href = match[1].replace(/&amp;/g, '&')
    if (!href.toLowerCase().includes('f=' + target.toLowerCase())) continue
    try {
      return new URL(href, ORIGIN).toString()
    } catch {
      return null
    }
  }
  return null
}

async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { signal, redirect: 'follow', headers: { 'User-Agent': 'KAMUCL-Launcher' } })
  if (!res.ok) throw new Error(`OptiFine 站点响应 ${res.status}（${url}）`)
  return res.text()
}

/** 拉取官方下载目录；站点不可用时抛错，不返回半成品列表。 */
export async function listOptiFineVersions(signal?: AbortSignal): Promise<OptiFineEntry[]> {
  const entries = parseOptiFineDownloads(await fetchText(`${ORIGIN}/downloads`, signal))
  if (!entries.length) throw new Error('未能从 OptiFine 下载页解析出任何版本，站点结构可能已变化')
  return entries
}

/** 解析安装器的真实下载地址。 */
export async function resolveOptiFineDownload(fileName: string, signal?: AbortSignal): Promise<string> {
  const entry = parseOptiFineFileName(fileName)
  if (!entry) throw new Error(`无法识别 OptiFine 文件名：${fileName}`)
  const url = parseOptiFineDownloadPath(
    await fetchText(`${ORIGIN}/adloadx?f=${encodeURIComponent(entry.fileName)}&x=`, signal),
    entry.fileName
  )
  if (!url) throw new Error(`未能在下载页找到 ${entry.fileName} 的下载地址`)
  return url
}

/** 下载安装器并校验大小与 jar 魔数。 */
export async function downloadOptiFineInstaller(fileName: string, dest: string, progress: ProgressEmit, signal?: AbortSignal): Promise<void> {
  const url = await resolveOptiFineDownload(fileName, signal)
  progress({ stage: 'download', progress: 0, text: `下载 ${fileName}` })
  await downloadFile(url, dest, (done, total) => {
    progress({ stage: 'download', progress: total ? done / total : 0, text: `下载 ${fileName}` })
  }, undefined, 'official', signal)
  const stat = await fs.promises.stat(dest)
  if (stat.size <= 0 || stat.size > MAX_INSTALLER_BYTES) throw new Error(`下载的安装器大小异常（${stat.size} 字节），请重试`)
  const head = Buffer.alloc(4)
  const handle = await fs.promises.open(dest, 'r')
  try {
    await handle.read(head, 0, 4, 0)
  } finally {
    await handle.close()
  }
  if (head[0] !== 0x50 || head[1] !== 0x4b) throw new Error('下载的文件不是有效的 jar 归档')
}

/** OptiFine / Forge 安装器都要求目标目录存在 launcher_profiles.json。 */
function ensureLauncherProfiles(target: string): void {
  const file = path.join(target, 'launcher_profiles.json')
  if (!fs.existsSync(file)) {
    fs.mkdirSync(target, { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ profiles: {}, settings: {}, version: 3 }), 'utf-8')
  }
}

/** 运行官方安装器：java -jar <jar> --install <游戏目录> */
export function runOptiFineInstaller(javaPath: string, jar: string, target: string, emit: ProgressEmit, signal?: AbortSignal): Promise<void> {
  return withFileJob(path.join(target, '.kamucl-installer'), signal, () =>
    new Promise<void>((resolve, reject) => {
      ensureLauncherProfiles(target)
      optifineLog.info(`运行 OptiFine 安装器 ${path.basename(jar)}（目标 ${target}）`)
      const args = ['-jar', jar, '--install', target]
      const proc = spawn(javaPath, args, { windowsHide: true, cwd: target })
      let cancelled = false
      let spawnError: Error | null = null
      const onAbort = (): void => {
        cancelled = true
        try {
          proc.kill()
        } catch {
          /* 忽略 */
        }
      }
      if (signal) {
        if (signal.aborted) onAbort()
        else signal.addEventListener('abort', onAbort, { once: true })
      }
      const allLines: string[] = []
      let tail = ''
      const onData = (d: Buffer): void => {
        const lines = (tail + d.toString('utf-8')).split(/\r?\n/)
        tail = lines.pop() ?? ''
        for (const line of lines) if (line.trim()) allLines.push(line)
        emit({ stage: 'loader-process', progress: 0, indeterminate: true, text: `安装 OptiFine: ${lines.slice(-2).join(' ').slice(-160) || '处理中…'}` })
      }
      proc.stdout.on('data', onData)
      proc.stderr.on('data', onData)
      proc.on('error', (e) => { spawnError = e })
      proc.on('close', (code) => {
        signal?.removeEventListener('abort', onAbort)
        if (tail.trim()) allLines.push(tail)
        try {
          const logDir = path.join(target, 'kamucl-logs')
          fs.mkdirSync(logDir, { recursive: true })
          fs.writeFileSync(path.join(logDir, 'installer.log'), allLines.join('\n') + `\n\n[退出码 ${code ?? '未知'}] ${args.join(' ')}\n`, 'utf-8')
        } catch {
          /* 日志写盘失败不影响流程 */
        }
        if (cancelled || signal?.aborted) reject(new Error('已取消'))
        else if (spawnError) reject(spawnError)
        else if (code === 0) resolve()
        else {
          const last = allLines.slice(-30).join('\n')
          optifineLog.error(`安装器失败（退出码 ${code ?? '未知'}）`)
          reject(new Error(`OptiFine 安装器退出码 ${code}（完整日志见 kamucl-logs/installer.log）\n${last}`))
        }
      })
    })
  )
}
