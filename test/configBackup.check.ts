// Run: pnpm exec esno test/configBackup.check.ts
import assert from 'node:assert/strict'
import { CONFIG_SETTING_KEYS, parseConfigBackup } from '../src/utils/configBackup'
import { getDefaultSettings } from '../src/constants/defaultSettings'

const backup = {
  format: 'giopic-config-backup', schemaVersion: 1,
  configs: [{ id: 'lsky-1', name: 'My Lsky', type: 'lsky', enabled: true, token: 'test-secret', version: 'v1' }],
  selectedIds: ['lsky-1'],
  settings: {
    ...getDefaultSettings(),
    'giopic-theme-mode': 'auto',
    'giopic-dark-mode': 'true',
    sidebarSettings: { ...getDefaultSettings().sidebarSettings, position: { x: 0, y: 200 } },
    siteEditorConfig: { 'example.invalid': 'Markdown' },
    preview_disabled_sites: ['example.invalid'],
    'giopic-upload-list-position': { x: 10, y: 20 },
    'giopic-desktop-link-enabled': false,
  },
}
assert.deepEqual(parseConfigBackup(JSON.stringify(backup)), backup, 'Backup round trip preserves credentials, IDs and settings')
assert.deepEqual(parseConfigBackup(JSON.stringify({ ...backup, configs: [], selectedIds: [], settings: {} })).configs, [])
const invalid = [
  { ...backup, format: 'other-app' },
  { ...backup, schemaVersion: 2 },
  { ...backup, configs: [{ ...backup.configs[0], enabled: 'yes' }] },
  { ...backup, configs: [backup.configs[0], backup.configs[0]] },
  { ...backup, selectedIds: ['missing'] },
  { ...backup, selectedIds: ['lsky-1', 'lsky-1'] },
  ...[
    { 'giopic-upload-queue': [] }, { plugins: [] }, { 'giopic-history': [] },
    { 'giopic-context-menu': 'yes' }, { 'giopic-theme-mode': 'unknown' },
    { sidebarSettings: { enabled: true, opacity: 80, position: { x: '10', y: 20 } } },
    { sidebarSettings: { enabled: true, opacity: 80, autoHide: {} } },
    { preview_disabled_sites: [false] }, { siteEditorConfig: { 'example.invalid': 1 } },
  ].map(settings => ({ ...backup, settings })),
]
for (const payload of invalid) assert.throws(() => parseConfigBackup(JSON.stringify(payload)))
for (const text of ['null', '[]', '{', JSON.stringify(backup).replace('"My Lsky"', '{"__proto__":{}}')]) {
  assert.throws(() => parseConfigBackup(text))
}
assert.ok(!CONFIG_SETTING_KEYS.includes('giopic-upload-queue'))
console.log(`MODULE: configuration round trip and ${invalid.length + 4} invalid backups verified`)
