/**
 * 游戏崩溃报告分析。
 *
 * 启动器现有的诊断只读取自己采集的 stdout/stderr；但游戏进程真正崩溃时，
 * Minecraft 会把最关键的 `Description:`、头部堆栈与系统信息写进实例目录下的
 * `crash-reports/crash-*.txt`，这些内容此前完全没有被读取。
 *
 * 这里把崩溃报告解析成与启动日志同一套 `DiagnosticFinding`，
 * 由实例诊断面板统一呈现与跳转，不新增界面。
 */
import fs from 'node:fs'
import path from 'node:path'
import type { DiagnosticFinding } from '../../shared/instanceCenter'
import { redactDiagnosticText } from './diagnostics'

/** 崩溃报告可达数百 KB，只需要头部的 Description 与前若干帧。 */
const MAX_REPORT_BYTES = 512 * 1024
const MAX_EVIDENCE = 2000
const MAX_TEXT = 200

export interface CrashReportFile {
  file: string
  name: string
  mtime: number
  size: number
}

interface CrashRule {
  rule: string
  title: string
  pattern: RegExp
  advice: string
  action?: DiagnosticFinding['action']
  confidence: DiagnosticFinding['confidence']
}

/** 顺序即优先级：越具体的成因越靠前，只取第一条命中，避免同一份报告刷出多条结论。 */
const CRASH_RULES: CrashRule[] = [
  {
    rule: 'crash-oom',
    title: '游戏因内存耗尽崩溃',
    pattern: /java\.lang\.OutOfMemoryError|GC overhead limit exceeded|Java heap space|Native memory allocation .* failed/i,
    advice: '在实例管理中提高该实例的内存分配，并确认没有同时运行其他占用大量内存的程序；若为 32 位 Java，改用 64 位。',
    confidence: 'certain'
  },
  {
    rule: 'crash-duplicate',
    title: '崩溃报告指出重复模组',
    pattern: /DuplicateModsFoundException|Duplicate mod(?:s| ID)?(?: found|:)|Found duplicate mods/i,
    advice: '打开模组管理里的清理重复，核对同名模组的不同版本后只保留一个。',
    action: 'mods',
    confidence: 'certain'
  },
  {
    rule: 'crash-mixin',
    title: '崩溃报告指出 Mixin 注入失败',
    pattern: /MixinApplyError|MixinTransformerError|InvalidMixinException|Mixin (?:apply|transform).{0,40}(?:failed|error)/i,
    advice: '通常是模组之间或模组与加载器版本不匹配；按堆栈中出现的模组名逐个禁用排查，并确认该模组支持当前游戏与加载器版本。',
    action: 'mods',
    confidence: 'certain'
  },
  {
    rule: 'crash-mod-load',
    title: '崩溃报告指出模组加载失败',
    pattern: /Failed to (?:create|construct|load) mod|ModLoadingException|ModLoadingCrashException|LoaderException|fml\.loading/i,
    advice: '打开模组管理核对加载器点名的模组，优先更新或移除最近新增的模组。',
    action: 'mods',
    confidence: 'certain'
  },
  {
    rule: 'crash-dependency',
    title: '崩溃报告指出前置依赖不满足',
    pattern: /Missing or unsupported mandatory dependencies|requires .{0,80} which is (?:missing|not installed)|Incompatible mod set/i,
    advice: '从社区资源安装堆栈中要求的前置模组，并保证版本范围匹配。',
    action: 'mods',
    confidence: 'certain'
  },
  {
    rule: 'crash-ticking',
    title: '游戏世界运行时崩溃（实体或方块实体）',
    pattern: /Exception ticking (?:entity|block entity)|Ticking (?:entity|block entity)|Server thread dump/i,
    advice: '这类崩溃多由某个模组在特定方块或实体上出错引起；按堆栈中的模组名定位，必要时先备份存档再逐个禁用。',
    action: 'mods',
    confidence: 'possible'
  },
  {
    rule: 'crash-worldgen',
    title: '崩溃报告指出世界生成失败',
    pattern: /Feature order cycle found|Failed to (?:create|generate) (?:chunk|world)|ChunkPopulation/i,
    advice: '多为地形类模组搭配冲突；核对堆栈中出现的模组，或改用未安装地形模组的新存档验证。',
    action: 'mods',
    confidence: 'possible'
  },
  {
    rule: 'crash-java',
    title: '崩溃报告指出 Java 版本不兼容',
    pattern: /UnsupportedClassVersionError|class file version .{0,40}only recognizes/i,
    advice: '为该实例改用报告要求的 Java 版本后重试。',
    action: 'java',
    confidence: 'certain'
  },
  {
    rule: 'crash-classpath',
    title: '崩溃报告指出缺少类定义',
    pattern: /NoClassDefFoundError|ClassNotFoundException/i,
    advice: '常见于缺少前置模组或运行库版本不符；先按堆栈中的类名定位所属模组，再校验运行文件。',
    action: 'mods',
    confidence: 'possible'
  },
  {
    rule: 'crash-graphics',
    title: '崩溃报告指出图形环境初始化失败',
    pattern: /GLFW error|Failed to create (?:the )?OpenGL|OpenGL context|Pixel format not accelerated/i,
    advice: '更新显卡驱动，或在实例设置中关闭光影与高负载画面选项后重试。',
    confidence: 'certain'
  }
]

/** 读取崩溃报告头部；超出上限时只保留前 MAX_REPORT_BYTES。 */
async function readHead(file: string): Promise<string> {
  const handle = await fs.promises.open(file, 'r')
  try {
    const stat = await handle.stat()
    const size = Math.min(stat.size, MAX_REPORT_BYTES)
    const data = Buffer.alloc(size)
    await handle.read(data, 0, size, 0)
    return data.toString('utf8')
  } finally {
    await handle.close()
  }
}

/** 列出实例目录下最新的崩溃报告（按修改时间倒序）。 */
export async function listCrashReports(dir: string, limit = 3): Promise<CrashReportFile[]> {
  const root = path.join(dir, 'crash-reports')
  let names: string[]
  try {
    names = await fs.promises.readdir(root)
  } catch {
    return []
  }
  const rows: CrashReportFile[] = []
  for (const name of names) {
    if (!/^crash-.*\.txt$/i.test(name)) continue
    try {
      const file = path.join(root, name)
      const stat = await fs.promises.stat(file)
      if (!stat.isFile()) continue
      rows.push({ file, name, mtime: stat.mtimeMs, size: stat.size })
    } catch {
      /* 单个报告不可读时跳过，不影响其余 */
    }
  }
  rows.sort((a, b) => b.mtime - a.mtime)
  return rows.slice(0, Math.max(0, limit))
}

function clip(text: string, max = MAX_TEXT): string {
  const value = text.replace(/\s+/g, ' ').trim()
  return value.length > max ? value.slice(0, max) + '…' : value
}

/** 崩溃报告首行的 `Description:` 是官方给出的人类可读摘要。 */
export function crashDescription(text: string): string {
  const match = /^\s*Description:\s*(.+)$/m.exec(text)
  return match ? clip(match[1]) : ''
}

/** 抽取 -- Head -- 段落里的堆栈帧；没有该段时退化为前若干条 `at` 行。 */
export function crashFrames(text: string, limit = 4): string[] {
  const lines = text.split(/\r?\n/)
  const head = lines.findIndex((line) => /^\s*-- Head --\s*$/.test(line))
  const source = head >= 0 ? lines.slice(head + 1) : lines
  const frames: string[] = []
  for (const line of source) {
    if (head >= 0 && /^\s*-- .+ --\s*$/.test(line) && frames.length) break
    if (/^\s*(?:at |Caused by: |[\w.$]+(?:Exception|Error))/.test(line)) {
      frames.push(line.trim())
      if (frames.length >= limit) break
    }
  }
  return frames
}

/**
 * 把一份崩溃报告转成诊断结论。
 * @param meta.fileName 报告文件名（写进证据，便于用户自己打开对照）
 * @param meta.stale  报告早于本次启动会话，标注为历史记录，避免误判为刚发生
 */
export function analyzeCrashReport(
  text: string,
  meta: { fileName?: string; stale?: boolean } = {}
): DiagnosticFinding[] {
  if (!text.trim()) return []
  const description = crashDescription(text)
  const frames = crashFrames(text)
  const rule = CRASH_RULES.find((item) => item.pattern.test(text))
  const prefix = meta.stale ? '历史崩溃报告：' : '崩溃报告：'
  const evidence = redactDiagnosticText(
    [
      meta.fileName ? `报告文件 ${meta.fileName}` : '',
      description ? `Description: ${description}` : '',
      ...frames
    ]
      .filter(Boolean)
      .join('\n')
  ).slice(0, MAX_EVIDENCE)

  if (!rule) {
    return [
      {
        rule: 'crash-unknown',
        title: `${prefix}${description || '游戏异常退出'}`,
        confidence: 'unknown',
        evidence: evidence || '崩溃报告没有可识别的摘要。',
        advice: '打开实例目录下的 crash-reports 查看完整报告，或导出诊断日志进一步排查。'
      }
    ]
  }
  return [
    {
      rule: rule.rule,
      title: prefix + rule.title,
      confidence: rule.confidence,
      evidence,
      advice: rule.advice,
      action: rule.action
    }
  ]
}

/**
 * 诊断入口：分析实例最新的一份崩溃报告。
 * 没有 crash-reports 目录（从未崩溃过）时返回空数组，不干扰既有结论。
 */
export async function analyzeInstanceCrashes(
  dir: string,
  sessionStart?: string
): Promise<DiagnosticFinding[]> {
  const [report] = await listCrashReports(dir, 1)
  if (!report) return []
  let text: string
  try {
    text = await readHead(report.file)
  } catch {
    return []
  }
  const started = sessionStart ? Date.parse(sessionStart) : NaN
  const stale = Number.isFinite(started) && report.mtime < started - 1000
  return analyzeCrashReport(text, { fileName: report.name, stale })
}
