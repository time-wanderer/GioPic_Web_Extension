// Build first. Set PLAYWRIGHT_MODULE if Playwright is installed outside this project.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const extensionPath = resolve('dist')
const scratch = await mkdtemp(join(resolve('node_modules/.tmp'), 'config-backup-'))
let context
try {
    context = await chromium.launchPersistentContext(join(scratch, 'profile'), {
        executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
        headless: true, acceptDownloads: true, viewport: { width: 1400, height: 1000 },
        args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    })
    const extensionId = 'eicniiibhbkbalhchochfhojfmmnjlpe'
    const page = await context.newPage()
    await page.route('https://api.github.com/**', route => route.fulfill({ status: 404, body: '{}' }))
    await page.goto(`chrome-extension://${extensionId}/index.html`)
    await page.locator('button').first().waitFor()
    await page.waitForFunction(async () => (await chrome.storage.local.get('giopic-onboarding-completed'))['giopic-onboarding-completed'] !== undefined)
    assert.equal(await page.evaluate(() => chrome.runtime.id), extensionId)
    const seed = {
        configs: [{ id: 'backup-check', name: 'Backup check', type: 'test', enabled: true, apiUrl: 'https://example.invalid', token: 'test-secret' }],
        selectedIds: ['backup-check'],
        settings: {
            'giopic-onboarding-completed': true, 'giopic-locale': 'zh-CN', 'giopic-ui-mode': 'classic',
            'giopic-theme-mode': 'light', 'giopic-dark-mode': 'false', 'giopic-theme-color': 'orange',
            'giopic-hover-preview': true, 'giopic-desktop-link-enabled': false,
            siteEditorConfig: { 'example.invalid': 'Markdown' }, preview_disabled_sites: ['example.invalid'],
            'giopic-upload-queue': [],
        },
    }
    async function state(payload) {
        return page.evaluate(async payload => {
            const database = await new Promise((resolve, reject) => {
                const request = indexedDB.open('giopic-db', 1)
                request.onupgradeneeded = () => request.result.createObjectStore('keyval')
                request.onsuccess = () => resolve(request.result)
                request.onerror = () => reject(request.error)
            })
            try {
                if (payload) {
                    await chrome.storage.local.set(payload.settings)
                    await new Promise((resolve, reject) => {
                        const tx = database.transaction('keyval', 'readwrite')
                        tx.objectStore('keyval').put(payload.configs, 'giopic-configs')
                        tx.objectStore('keyval').put(payload.selectedIds, 'giopic-selected-ids')
                        tx.oncomplete = resolve
                        tx.onerror = () => reject(tx.error)
                    })
                }
                const read = key => new Promise((resolve, reject) => {
                    const request = database.transaction('keyval').objectStore('keyval').get(key)
                    request.onsuccess = () => resolve(request.result)
                    request.onerror = () => reject(request.error)
                })
                return {
                    configs: await read('giopic-configs'), selectedIds: await read('giopic-selected-ids'),
                    history: await read('giopic-history'), plugins: await read('plugins'),
                    settings: await chrome.storage.local.get(null),
                }
            } finally { database.close() }
        }, payload)
    }
    await state(seed)
    await page.reload()
    async function openSettings() {
        await page.locator('button').filter({ has: page.locator('.i-ph-gear') }).click()
        await page.getByRole('button', { name: '导出配置', exact: true }).waitFor()
    }
    await openSettings()
    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出配置', exact: true }).click()
    const exported = JSON.parse(await readFile(await (await downloadEvent).path(), 'utf8'))
    assert.deepEqual(exported.configs, seed.configs)
    assert.deepEqual(exported.selectedIds, seed.selectedIds)
    assert.equal(exported.settings['giopic-theme-color'], 'orange')
    assert.equal(exported.settings['giopic-upload-queue'], undefined)
    assert.equal(exported.plugins, undefined)
    const before = await state()
    const importFile = text => page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({
        name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(text),
    })
    await importFile('{')
    await page.getByText('备份文件无效或超过 5 MB，配置未修改', { exact: true }).waitFor()
    assert.deepEqual(await state(), before, 'Invalid JSON leaves both stores untouched')
    await importFile(JSON.stringify(exported))
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await page.getByRole('button', { name: '确认', exact: true }).waitFor({ state: 'detached' })
    assert.deepEqual(await state(), before, 'Cancel leaves both stores untouched')
    const restored = structuredClone(exported)
    restored.configs[0].name = 'Restored node'
    restored.configs[0].token = 'restored-secret'
    restored.selectedIds = []
    restored.settings['giopic-theme-color'] = 'red'
    restored.settings['giopic-hover-preview'] = false
    delete restored.settings.siteEditorConfig
    const savedEvent = page.waitForEvent('download')
    savedEvent.catch(() => {})
    await importFile(JSON.stringify(restored))
    const refreshed = page.waitForEvent('load')
    refreshed.catch(() => {})
    await page.getByRole('button', { name: '确认', exact: true }).click()
    const saved = await savedEvent
    assert.ok(saved.suggestedFilename().startsWith('GioPic-before-import-'))
    assert.deepEqual(JSON.parse(await readFile(await saved.path(), 'utf8')), exported, 'Automatic backup precedes replacement')
    await refreshed
    await openSettings()
    const after = await state()
    assert.deepEqual(after.configs, restored.configs)
    assert.deepEqual(after.selectedIds, [])
    assert.equal(after.settings['giopic-theme-color'], 'red')
    assert.equal(after.settings['giopic-hover-preview'], false)
    assert.equal(after.settings.siteEditorConfig, undefined, 'Absent settings replace previous values')
    assert.deepEqual(after.history, before.history)
    assert.deepEqual(after.plugins, before.plugins)
    assert.deepEqual(after.settings['giopic-upload-queue'], before.settings['giopic-upload-queue'])
    // Exercise the real Chrome storage quota error after the IndexedDB write succeeds.
    await page.evaluate(async () => {
        const used = await chrome.storage.local.getBytesInUse(null)
        await chrome.storage.local.set({ 'backup-check-quota': 'x'.repeat(10 * 1024 * 1024 - used - 150000) })
    })
    const beforeFailure = await state()
    const tooLarge = structuredClone(restored)
    tooLarge.configs[0].name = 'Must roll back'
    tooLarge.settings.siteEditorConfig = { 'example.invalid': 'x'.repeat(500000) }
    const failureBackup = page.waitForEvent('download')
    failureBackup.catch(() => {})
    await importFile(JSON.stringify(tooLarge))
    await page.getByRole('button', { name: '确认', exact: true }).click()
    await failureBackup
    await page.getByText('导入失败，原配置已保留', { exact: true }).waitFor()
    assert.deepEqual(await state(), beforeFailure, 'Quota failure rolls back nodes, selection and settings')
    await page.evaluate(() => chrome.storage.local.remove('backup-check-quota'))
    console.log('INTEGRATION: Chrome export, invalid file, cancel, backup download, restore, excluded data and quota rollback verified')
} finally {
    if (context) await context.close()
    await rm(scratch, { recursive: true, force: true })
}
