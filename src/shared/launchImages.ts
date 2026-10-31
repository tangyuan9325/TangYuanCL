/** Stable keys keep image selection and timing independent of bundled asset hashes. */
export const BUILTIN_LAUNCH_IMAGES = [
  { key: 'builtin:bg01', title: '壁纸 01', file: 'HV0ftLZXcAAq5LS.webp' },
  { key: 'builtin:bg02', title: '壁纸 02', file: 'HV3-TN0a4AA3riG.webp' },
  { key: 'builtin:bg03', title: '壁纸 03', file: 'HV3zSlZbQAA91Wu.webp' },
  { key: 'builtin:bg04', title: '壁纸 04', file: 'HV49o55aoAEU3sv.webp' },
  { key: 'builtin:bg05', title: '壁纸 05', file: 'HV4It4ZbEAA3iiz.webp' },
  { key: 'builtin:bg06', title: '壁纸 06', file: 'HV4PR2oaIAAK4IY.webp' },
  { key: 'builtin:bg07', title: '壁纸 07', file: 'HV4PRO1bcAA9njM.webp' },
  { key: 'builtin:bg08', title: '壁纸 08', file: 'HV4PlS_boAAXAUP.webp' },
  { key: 'builtin:bg09', title: '壁纸 09', file: 'HV4Z3VKa8AA_ti3.webp' },
  { key: 'builtin:bg10', title: '壁纸 10', file: 'HV4ylJpbQAAeW-Z.webp' },
  { key: 'builtin:bg11', title: '壁纸 11', file: 'HV4z4vBbIAAHDcW.webp' },
  { key: 'builtin:bg12', title: '壁纸 12', file: 'HV5-xBGbsAAOUU9.webp' },
  { key: 'builtin:bg13', title: '壁纸 13', file: 'HV6doCHbUAAgG2G.webp' },
  { key: 'builtin:bg14', title: '壁纸 14', file: 'HV7oGS-a0AAy9wC.webp' },
  { key: 'builtin:bg15', title: '壁纸 15', file: 'HV7pV-vbYAA27LC.webp' },
  { key: 'builtin:bg16', title: '壁纸 16', file: 'HV8Svh-awAA69_U.webp' },
  { key: 'builtin:bg17', title: '壁纸 17', file: 'HV8tVSJaAAAYtb5.webp' },
  { key: 'builtin:bg18', title: '壁纸 18', file: 'HVyd98KagAAISjN.webp' },
  { key: 'builtin:bg19', title: '壁纸 19', file: 'HVyxQrsasAAGRy6.webp' },
  { key: 'builtin:bg20', title: '壁纸 20', file: 'HVzh7bwasAEI0Xk.webp' }
] as const

export function isBuiltinLaunchImage(key: string): boolean {
  return BUILTIN_LAUNCH_IMAGES.some(image => image.key === key)
}
