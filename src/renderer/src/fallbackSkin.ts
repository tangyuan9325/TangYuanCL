/**
 * TangYuanCL 兜底皮肤：一张纯代码绘制的 64×64 经典皮肤位图，不引用任何远程皮肤或第三方贴图。
 *
 * 采用 Minecraft 标准 64×64 经典皮肤 UV 布局：
 *   [0..32, 8..16] 头部四面 + 帽顶/帽底，[16..32, 0..8] 头部外层；
 *   [16..40, 16..32] 躯干，[32..48, 16..32] / [40..56, 32..48] 双臂；
 *   [0..32, 16..32] / [16..32, 48..64] 双腿。未用到的外层区域留透明。
 *
 * 之所以用 rect 逐像素绘制而非内置 PNG：仓库保持零二进制贴图依赖，角色外观可随代码审查、可版本化。
 */
export function fallbackSkinPixels(): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(64 * 64 * 4)
  /** 把一个矩形区域填充为不透明纯色（hex = 0xRRGGBB） */
  function rect(x: number, y: number, w: number, h: number, hex: number): void {
    for (let row = y; row < y + h; row++) {
      for (let col = x; col < x + w; col++) {
        const i = (row * 64 + col) * 4
        pixels.set([hex >> 16 & 255, hex >> 8 & 255, hex & 255, 255], i)
      }
    }
  }
  // 调色板：肤色系 / 头发 / 青绿拉链夹克系 / 裤子系
  const skin = 0xd3a582, shade = 0xbf8b6c, hair = 0x49382f
  const jacket = 0x398d8a, seam = 0x286b70, light = 0x69b5ad
  const pants = 0x38485e, shoe = 0x27303d

  // ── 头部：帽顶、帽底与四个侧面。正面朝向默认预览相机。──
  rect(8, 0, 8, 8, hair); rect(16, 0, 8, 8, shade)          // 帽顶 / 帽底
  rect(0, 8, 32, 8, skin); rect(0, 8, 32, 2, hair)          // 四面底色 + 刘海
  rect(24, 8, 8, 7, hair); rect(0, 8, 6, 5, hair); rect(18, 8, 6, 5, hair) // 鬓角
  rect(8, 10, 2, 1, hair); rect(14, 10, 2, 2, hair)         // 眉
  rect(9, 11, 2, 1, 0x675043); rect(13, 11, 2, 1, 0x675043) // 眼眶
  rect(9, 12, 2, 1, 0xf2ede2); rect(13, 12, 2, 1, 0xf2ede2) // 眼白
  rect(10, 12, 1, 1, 0x315f62); rect(13, 12, 1, 1, 0x315f62) // 瞳孔
  rect(11, 13, 2, 1, shade); rect(11, 15, 2, 1, 0x915d50)   // 鼻 / 嘴

  // ── 躯干：青绿拉链夹克内搭浅色衬衫，含侧面与背面。──
  rect(20, 16, 16, 4, jacket); rect(16, 20, 24, 12, jacket) // 肩部 / 胸腹
  rect(16, 20, 4, 12, seam); rect(28, 20, 4, 12, seam)      // 侧缝
  rect(23, 16, 2, 3, skin); rect(22, 20, 4, 2, 0xe3e5df)    // 领口 / 衬衫
  rect(23, 22, 2, 10, 0xe3e5df); rect(20, 22, 1, 8, light)  // 拉链 / 高光
  rect(26, 26, 2, 2, seam); rect(20, 30, 3, 2, seam); rect(25, 30, 3, 2, seam) // 口袋
  rect(32, 22, 8, 1, light); rect(32, 30, 8, 2, seam)       // 背部高光 / 下摆

  /** 手臂：袖子（夹克色）+ 袖口 + 前臂肤色，含内侧接缝 */
  function arm(x: number, y: number): void {
    rect(x + 4, y, 4, 4, jacket); rect(x + 8, y, 4, 4, skin) // 肩面
    rect(x, y + 4, 16, 12, jacket)                            // 袖子
    rect(x, y + 10, 16, 1, light); rect(x, y + 11, 16, 1, seam) // 袖口
    rect(x, y + 12, 16, 4, skin); rect(x, y + 15, 16, 1, shade) // 前臂 / 手
    rect(x, y + 4, 4, 6, seam)                                // 内侧接缝
  }
  /** 腿部：裤面 + 鞋，含侧缝高光与鞋面细节 */
  function leg(x: number, y: number): void {
    rect(x + 4, y, 4, 4, pants); rect(x + 8, y, 4, 4, shoe)  // 腿顶 / 脚面
    rect(x, y + 4, 16, 12, pants); rect(x, y + 13, 16, 3, shoe) // 裤腿 / 鞋帮
    rect(x + 4, y + 4, 1, 9, 0x506078); rect(x + 4, y + 14, 4, 1, 0xb4bfc4) // 侧缝 / 鞋带
    rect(x + 12, y + 5, 3, 3, 0x304054)                       // 鞋面细节
  }
  // UV 布局中的四肢位置：右臂 / 左臂 / 右腿 / 左腿
  arm(40, 16); arm(32, 48); leg(0, 16); leg(16, 48)
  return pixels
}

export function createFallbackSkin(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')!
  const data = ctx.createImageData(64, 64)
  data.data.set(fallbackSkinPixels()); ctx.putImageData(data, 0, 0)
  return canvas
}
