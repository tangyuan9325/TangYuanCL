import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseOptiFineDownloadPath,
  parseOptiFineDownloads,
  parseOptiFineFileName
} from '../src/main/core/optifine'

// 夹具取自 optifine.net 真实页面片段：downloads 页同时给出 adfoc.us 跳转链接
// 与直连 adloadx 链接，同一文件名会出现多次；adloadx 页使用单引号 href。
const DOWNLOADS_HTML = `
<a href="http://adfoc.us/serve/sitelinks/?id=475250&url=http://optifine.net/adloadx?f=preview_OptiFine_26.2_HD_U_K2_pre5.jar&x=ee6a">Preview</a>
<a href="http://optifine.net/adloadx?f=preview_OptiFine_26.2_HD_U_K2_pre5.jar">preview</a>
<a href="http://optifine.net/adloadx?f=preview_OptiFine_26.2_HD_U_K2_pre5.jar">preview</a>
<a href="http://optifine.net/adloadx?f=OptiFine_1.20.1_HD_U_I6.jar&x=ee6a">OptiFine 1.20.1 HD U I6</a>
<a href="http://optifine.net/adloadx?f=OptiFine_1.20.2_HD_U_I7_pre1.jar&x=ee6a">OptiFine 1.20.2 HD U I7 pre1</a>
`

const ADLOAD_HTML = `
<div class="download">
  <a href='downloadx?f=OptiFine_1.20.1_HD_U_I6.jar&x=ee6abb0bd7183028c34602de80f2631a' onclick='onDownload()'>Download</a>
</div>
`

test('OptiFine 文件名：解析正式版、预览版与 pre 发行', () => {
  const release = parseOptiFineFileName('OptiFine_1.20.1_HD_U_I6.jar')
  assert.deepEqual(release, {
    fileName: 'OptiFine_1.20.1_HD_U_I6.jar',
    mcVersion: '1.20.1',
    edition: 'HD U I6',
    preview: false,
    prerelease: false
  })

  const preview = parseOptiFineFileName('preview_OptiFine_26.2_HD_U_K2_pre5.jar')
  assert.equal(preview?.preview, true)
  assert.equal(preview?.prerelease, true)
  assert.equal(preview?.mcVersion, '26.2')
  assert.equal(preview?.edition, 'HD U K2 PRE5')

  const pre = parseOptiFineFileName('OptiFine_1.20.2_HD_U_I7_pre1.jar')
  assert.equal(pre?.preview, false)
  assert.equal(pre?.prerelease, true)

  assert.equal(parseOptiFineFileName('OptiFine_1.20.1.jar'), null, '缺少版本段应拒绝')
  assert.equal(parseOptiFineFileName('not-a-pack.jar'), null)
  assert.equal(parseOptiFineFileName('/tmp/evil/../../OptiFine_1.20.1_HD_U_I6.jar')?.fileName, 'OptiFine_1.20.1_HD_U_I6.jar', '只取文件名')
})

test('OptiFine 下载页：去重后提取清单，忽略无法解析的链接', () => {
  const entries = parseOptiFineDownloads(DOWNLOADS_HTML)
  assert.deepEqual(entries.map((e) => e.fileName), [
    'preview_OptiFine_26.2_HD_U_K2_pre5.jar',
    'OptiFine_1.20.1_HD_U_I6.jar',
    'OptiFine_1.20.2_HD_U_I7_pre1.jar'
  ])
  assert.deepEqual(parseOptiFineDownloads('<html>暂无下载</html>'), [])
})

test('OptiFine 跳转页：解析单引号 downloadx 链接并还原为绝对地址', () => {
  const url = parseOptiFineDownloadPath(ADLOAD_HTML, 'OptiFine_1.20.1_HD_U_I6.jar')
  assert.equal(url, 'https://optifine.net/downloadx?f=OptiFine_1.20.1_HD_U_I6.jar&x=ee6abb0bd7183028c34602de80f2631a')
})

test('OptiFine 跳转页：不匹配其他文件，实体转义与大小写不影响解析', () => {
  assert.equal(parseOptiFineDownloadPath(ADLOAD_HTML, 'OptiFine_1.20.4_HD_U_I7.jar'), null)
  const escaped = ADLOAD_HTML.replace(/&x=/, '&amp;x=')
  assert.ok(parseOptiFineDownloadPath(escaped, 'OptiFine_1.20.1_HD_U_I6.jar'))
  assert.ok(parseOptiFineDownloadPath(ADLOAD_HTML, 'optifine_1.20.1_hd_u_i6.jar'), '文件名大小写不敏感')
})
