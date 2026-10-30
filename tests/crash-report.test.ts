import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  analyzeCrashReport,
  analyzeInstanceCrashes,
  crashDescription,
  crashFrames,
  listCrashReports
} from '../src/main/core/crashReport'

const MIXIN_REPORT = `---- Minecraft Crash Report ----
// Why did you do that?

Time: 2026-10-30 12:00:00
Description: Mixin apply failed modid:sodium.mixins.json:LevelRendererMixin -> net.minecraft.client.renderer.LevelRenderer

-- Head --
Thread: Render thread
Stacktrace:
\tat net.minecraft.client.Minecraft.run(Minecraft.java:1000)
\tat org.spongepowered.asm.mixin.transformer.MixinApplicatorStandard.apply(MixinApplicatorStandard.java:1)
Caused by: org.spongepowered.asm.mixin.throwables.MixinApplyError: Mixin failed to apply
\tat org.spongepowered.asm.mixin.transformer.MixinApplicatorStandard.applyMixin(MixinApplicatorStandard.java:2)
\t... 12 more

-- System Details --
Details:
\tMinecraft Version: 1.20.1
\tJava Version: 17.0.8, Microsoft
`

const OOM_REPORT = `---- Minecraft Crash Report ----

Time: 2026-10-30 12:10:00
Description: Ticking block entity

-- Head --
Thread: Server thread
Stacktrace:
\tat net.minecraft.server.level.ServerLevel.tick(ServerLevel.java:800)
Caused by: java.lang.OutOfMemoryError: Java heap space
\tat java.util.Arrays.copyOf(Arrays.java:1)

-- System Details --
Details:
\tMinecraft Version: 1.20.1
`

const UNKNOWN_REPORT = `---- Minecraft Crash Report ----

Time: 2026-10-30 12:20:00
Description: Unexpected error

-- Head --
Thread: Render thread
Stacktrace:
\tat com.example.mod.Weird.onTick(Weird.java:42)

-- System Details --
Details:
\tMinecraft Version: 1.20.1
`

test('崩溃报告：识别 Mixin 注入失败并给出模组处置建议', () => {
  const [finding] = analyzeCrashReport(MIXIN_REPORT, { fileName: 'crash-2026-10-30_12.00.00-client.txt' })
  assert.equal(finding.rule, 'crash-mixin')
  assert.equal(finding.action, 'mods')
  assert.equal(finding.confidence, 'certain')
  assert.match(finding.title, /崩溃报告/)
  assert.match(finding.evidence, /Description: Mixin apply failed/)
  assert.match(finding.evidence, /crash-2026-10-30_12\.00\.00-client\.txt/)
})

test('崩溃报告：一份报告只产出一条结论，取最具体的成因', () => {
  // 同时含 Mixin 与 NoClassDefFoundError 特征时，不应刷出两条结论
  const mixed = MIXIN_REPORT + '\nCaused by: java.lang.NoClassDefFoundError: com/example/Missing\n'
  const findings = analyzeCrashReport(mixed)
  assert.equal(findings.length, 1)
  assert.equal(findings[0].rule, 'crash-mixin')
})

test('崩溃报告：识别内存耗尽，不误挂到模组入口', () => {
  const [finding] = analyzeCrashReport(OOM_REPORT)
  assert.equal(finding.rule, 'crash-oom')
  assert.equal(finding.action, undefined)
  assert.match(finding.evidence, /OutOfMemoryError/)
})

test('崩溃报告：无法归类时保留官方 Description 作为标题', () => {
  const [finding] = analyzeCrashReport(UNKNOWN_REPORT)
  assert.equal(finding.rule, 'crash-unknown')
  assert.equal(finding.confidence, 'unknown')
  assert.match(finding.title, /Unexpected error/)
})

test('崩溃报告：早于本次会话的报告标注为历史记录', () => {
  const [finding] = analyzeCrashReport(OOM_REPORT, { stale: true })
  assert.match(finding.title, /^历史崩溃报告：/)
})

test('崩溃报告：解析 Description 与头部堆栈帧', () => {
  assert.equal(crashDescription(MIXIN_REPORT), 'Mixin apply failed modid:sodium.mixins.json:LevelRendererMixin -> net.minecraft.client.renderer.LevelRenderer')
  assert.equal(crashDescription('Description:   \n'), '')
  const frames = crashFrames(MIXIN_REPORT)
  assert.ok(frames.length >= 2)
  assert.match(frames[0], /Minecraft\.run/)
  assert.ok(frames.some((line) => line.includes('Caused by:')), '应保留 Caused by 行')
})

test('崩溃报告：空内容不产出结论', () => {
  assert.deepEqual(analyzeCrashReport('   \n'), [])
})

test('崩溃报告：按修改时间倒序列出，忽略非崩溃文件并遵守上限', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kamucl-crash-'))
  try {
    const reports = path.join(dir, 'crash-reports')
    fs.mkdirSync(reports)
    const write = (name: string, body: string, ageMs: number) => {
      const file = path.join(reports, name)
      fs.writeFileSync(file, body)
      const when = new Date(Date.now() - ageMs)
      fs.utimesSync(file, when, when)
    }
    write('crash-2026-10-30_10.00.00-client.txt', OOM_REPORT, 3000)
    write('crash-2026-10-30_12.00.00-client.txt', MIXIN_REPORT, 1000)
    write('crash-2026-10-30_11.00.00-client.txt', UNKNOWN_REPORT, 2000)
    fs.writeFileSync(path.join(reports, 'notes.txt'), 'ignored')

    const all = await listCrashReports(dir, 10)
    assert.deepEqual(all.map((r) => r.name), [
      'crash-2026-10-30_12.00.00-client.txt',
      'crash-2026-10-30_11.00.00-client.txt',
      'crash-2026-10-30_10.00.00-client.txt'
    ])
    const limited = await listCrashReports(dir, 2)
    assert.equal(limited.length, 2)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('崩溃报告：实例无 crash-reports 目录时返回空，不影响诊断', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kamucl-crash-none-'))
  try {
    assert.deepEqual(await listCrashReports(dir), [])
    assert.deepEqual(await analyzeInstanceCrashes(dir, new Date().toISOString()), [])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('崩溃报告：诊断入口只分析最新一份并传递会话时间', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kamucl-crash-latest-'))
  try {
    const reports = path.join(dir, 'crash-reports')
    fs.mkdirSync(reports)
    const old = path.join(reports, 'crash-2026-10-30_09.00.00-client.txt')
    fs.writeFileSync(old, OOM_REPORT)
    const past = new Date(Date.now() - 60 * 60 * 1000)
    fs.utimesSync(old, past, past)
    const fresh = path.join(reports, 'crash-2026-10-30_12.00.00-client.txt')
    fs.writeFileSync(fresh, MIXIN_REPORT)

    // 会话开始于 30 分钟前，最新报告是刚写的 → 不算历史
    const recent = await analyzeInstanceCrashes(dir, new Date(Date.now() - 30 * 60 * 1000).toISOString())
    assert.equal(recent.length, 1)
    assert.equal(recent[0].rule, 'crash-mixin')
    assert.doesNotMatch(recent[0].title, /历史/)

    // 会话开始于 2 小时后（报告全部早于会话）→ 标为历史
    const future = await analyzeInstanceCrashes(dir, new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString())
    assert.equal(future[0].rule, 'crash-mixin')
    assert.match(future[0].title, /^历史崩溃报告：/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
