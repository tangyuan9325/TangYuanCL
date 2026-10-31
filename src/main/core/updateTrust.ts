import { app } from 'electron'
import { GITHUB_REPO, PRODUCT_NAME } from '../../shared/branding'
import type { ReleaseInfo } from '../../shared/types'

/** 测试覆盖只能用于开发进程，且必须同时指定独立数据目录和模拟 API。 */
export function isolatedUpdateTest(): boolean {
  return app?.isPackaged !== true && !!process.env.TANGYUANCL_USERDATA_DIR && !!process.env.TANGYUANCL_UPDATE_API_BASE
}

export function trustedUpdateRelease(release: ReleaseInfo | undefined): boolean {
  if (!release || !/^\d+\.\d+\.\d+$/.test(release.version)) return false
  if (isolatedUpdateTest()) return true
  const name = updateAssetName(release.version)
  return release.assetName === name && release.assetSize > 0 &&
    release.assetUrl === `https://github.com/${GITHUB_REPO}/releases/download/v${release.version}/${name}`
}

export function updateAssetName(version: string, platform = process.platform, arch = process.arch): string {
  return platform === 'darwin' ? `${PRODUCT_NAME}-${version}-mac-${arch}.zip` : `${PRODUCT_NAME}-${version}.exe`
}
