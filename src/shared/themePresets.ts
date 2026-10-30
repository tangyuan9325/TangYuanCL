/**
 * 主题数据（类型 + 预设色板 + key 迁移）。
 * 这些是纯数据/工具定义，与 IPC、业务类型解耦，避免 types.ts 被数据常量撑大。
 */
export type ThemeName =
  | 'blue-white'
  | 'black-orange'
  | 'white-pink'
  | 'black-pink'
  | 'custom'
  | 'transparent'

export type BuiltinThemeName = Exclude<ThemeName, 'custom'>

/** 自定义主题：颜色实时生效；layout 字段仅用于兼容旧主题码与旧配置。 */
export interface CustomTheme {
  colors: {
    accent: string // 主色调（按钮/选中/链接）
    bg: string // 界面背景
    card: string // 卡片背景
    text: string // 主要文字
    textDim: string // 次要文字
    border: string // 边框
    sidebarBg: string // 侧栏背景
    sidebarText: string // 侧栏文字
    bannerText: string // Banner 上的文字
  }
  layout: {
    sidebarWidth: number // 侧栏宽度 px（200-300）
    bannerHeight: number // 首页 Banner 高度 px（220-420）
    radius: number // 全局圆角 px（0-24）
  }
}

export const DEFAULT_CUSTOM_THEME: CustomTheme = {
  colors: {
    accent: '#2563eb',
    bg: '#edf0f7',
    card: '#ffffff',
    text: '#1b2437',
    textDim: '#68718a',
    border: '#e1e6f0',
    sidebarBg: '#f5f7fb',
    sidebarText: '#1b2437',
    bannerText: '#ffffff'
  },
  layout: {
    sidebarWidth: 208,
    bannerHeight: 430,
    radius: 14
  }
}

/** 正式主题色板。所有主题共用同一套布局和玻璃材质，只改变配色与背景策略。 */
export const THEME_PRESETS: Record<
  BuiltinThemeName,
  { label: string; colors: CustomTheme['colors']; description: string }
> = {
  'blue-white': {
    label: '白蓝',
    description: '清爽明亮的蓝白玻璃界面',
    colors: {
      accent: '#2563eb',
      bg: '#edf0f7',
      card: '#ffffff',
      text: '#1b2437',
      textDim: '#68718a',
      border: '#d8dfec',
      sidebarBg: '#f5f7fb',
      sidebarText: '#536078',
      bannerText: '#ffffff'
    }
  },
  'black-orange': {
    label: '橙黑',
    description: '深色底与克制的暖橙强调色',
    colors: {
      accent: '#f97316',
      bg: '#0b0b0e',
      card: '#18181f',
      text: '#f4f2ee',
      textDim: '#aaa69f',
      border: '#35353f',
      sidebarBg: '#111116',
      sidebarText: '#aaa69f',
      bannerText: '#ffffff'
    }
  },
  'white-pink': {
    label: '粉白',
    description: '柔和浅色底与粉色强调色',
    colors: {
      accent: '#ec4899',
      bg: '#fdf2f8',
      card: '#ffffff',
      text: '#4a1d35',
      textDim: '#a06b8a',
      border: '#fbcfe8',
      sidebarBg: '#fce7f3',
      sidebarText: '#4a1d35',
      bannerText: '#ffffff'
    }
  },
  'black-pink': {
    label: '粉黑',
    description: '深色底与柔亮粉色强调色',
    colors: {
      accent: '#f472b6',
      bg: '#171019',
      card: '#211623',
      text: '#f5e8f2',
      textDim: '#a68ba3',
      border: '#3d2740',
      sidebarBg: '#1c1220',
      sidebarText: '#a68ba3',
      bannerText: '#ffffff'
    }
  },
  // Keep the persisted key so existing default-theme users migrate without losing customization.
  transparent: {
    label: '默认·黑紫',
    description: '中性炭黑界面与柔和紫色强调，保留轻盈玻璃层次',
    colors: {
      accent: '#9475ed',
      bg: '#212121',
      card: '#292929',
      text: '#f5f5f5',
      textDim: '#b4b4b4',
      border: '#414141',
      sidebarBg: '#171717',
      sidebarText: '#c7c7c7',
      bannerText: '#ffffff'
    }
  }
}

/** 兼容 0.6.x 与早期预设 key，未知值安全回退到图一默认主题。 */
export function normalizeThemeName(value: unknown): ThemeName {
  const aliases: Record<string, ThemeName> = {
    light: 'blue-white',
    dark: 'black-orange',
    'pink-white': 'white-pink',
    'pink-black': 'black-pink',
    personalized: 'custom'
  }
  const raw = typeof value === 'string' ? value : ''
  if (raw in aliases) return aliases[raw]
  if (
    raw === 'blue-white' ||
    raw === 'black-orange' ||
    raw === 'white-pink' ||
    raw === 'black-pink' ||
    raw === 'custom' ||
    raw === 'transparent'
  ) {
    return raw
  }
  return 'transparent'
}
