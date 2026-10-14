import type { DriveConfig } from '@/types'
import { getDefaultSettings } from '../constants/defaultSettings'

export const CONFIG_SETTING_KEYS = [
  ...Object.keys(getDefaultSettings()),
  'giopic-theme-mode', 'giopic-desktop-link-enabled', 'console-sidebar-collapsed',
  'giopic-show-upload-list', 'giopic-upload-list-position', 'copyFormat',
  'siteEditorConfig', 'preview_disabled_sites', 'giopic-site-detector-ignored-hosts', 'uploadArea',
]

export interface ConfigBackup {
  format: 'giopic-config-backup'
  schemaVersion: 1
  configs: DriveConfig[]
  selectedIds: string[]
  settings: Record<string, unknown>
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string')
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
const position = (value: unknown) => object(value) && number(value.x) && number(value.y)

function validSetting(key: string, value: unknown): boolean {
  switch (key) {
    case 'giopic-dark-mode': return typeof value === 'boolean' || value === 'true' || value === 'false'
    case 'giopic-theme-mode': return ['light', 'dark', 'auto'].includes(value as string)
    case 'giopic-theme-color': return ['blue', 'green', 'purple', 'orange', 'red'].includes(value as string)
    case 'giopic-ui-mode': return ['classic', 'console', 'center', 'simple'].includes(value as string)
    case 'giopic-locale': return value === 'zh-CN' || value === 'en-US'
    case 'open-mode': return ['tab', 'window', 'action'].includes(value as string)
    case 'copyFormat': return ['url', 'html', 'bbcode', 'markdown', 'MD with link', 'thumbUrl'].includes(value as string)
    case 'sidebar_disabled_sites':
    case 'preview_disabled_sites':
    case 'plugin_market_authorized_sites':
    case 'giopic-site-detector-ignored-hosts': return strings(value)
    case 'siteEditorConfig': return object(value) && Object.values(value).every(item => typeof item === 'string')
    case 'giopic-upload-list-position': return position(value)
    case 'sidebarSettings': {
      if (!object(value) || typeof value.enabled !== 'boolean' || !number(value.opacity)) return false
      if (value.mode !== undefined && value.mode !== 'inject' && value.mode !== 'native') return false
      if (value.position !== undefined && !position(value.position)) return false
      const hide = value.autoHide
      return hide === undefined || (object(hide) && typeof hide.enabled === 'boolean'
        && ['delay', 'opacity', 'scale', 'translateX'].every(field => number(hide[field])))
    }
    case 'uploadArea': return object(value)
      && (value.status === undefined || typeof value.status === 'boolean')
      && (value.location === undefined || number(value.location))
      && (value.opacity === undefined || number(value.opacity))
      && (value.position === undefined || value.position === 'Left' || value.position === 'Right')
    default: return typeof value === 'boolean'
  }
}

export function parseConfigBackup(text: string): ConfigBackup {
  const backup = JSON.parse(text, (key, value) => {
    if (key === '__proto__') throw new Error('Invalid configuration key')
    return value
  })
  if (!object(backup) || backup.format !== 'giopic-config-backup' || backup.schemaVersion !== 1
    || !Array.isArray(backup.configs) || !strings(backup.selectedIds) || !object(backup.settings)) {
    throw new Error('Invalid backup format')
  }
  const ids = new Set<string>()
  for (const config of backup.configs) {
    // ponytail: 插件自定义字段保持原样；这里只校验所有驱动共用的节点结构。
    if (!object(config) || !['id', 'name', 'type'].every(key => typeof config[key] === 'string' && config[key])
      || typeof config.enabled !== 'boolean' || ids.has(config.id as string)) {
      throw new Error('Invalid node configuration')
    }
    ids.add(config.id as string)
  }
  if (new Set(backup.selectedIds).size !== backup.selectedIds.length || backup.selectedIds.some(id => !ids.has(id))) {
    throw new Error('Invalid selected nodes')
  }
  for (const [key, value] of Object.entries(backup.settings)) {
    if (!CONFIG_SETTING_KEYS.includes(key) || !validSetting(key, value)) throw new Error('Invalid settings')
  }
  return backup as unknown as ConfigBackup
}
