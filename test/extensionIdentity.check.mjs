// Build first. Uses an existing Playwright install; set PLAYWRIGHT_MODULE to its path if needed.
import assert from 'node:assert/strict'
import { createHash, createPublicKey } from 'node:crypto'
import { createRequire } from 'node:module'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const source = resolve('dist')
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'))
assert.ok(manifest.key, 'Chromium release must contain a fixed public key')
const publicKey = Buffer.from(manifest.key, 'base64')
assert.equal(createPublicKey({ key: publicKey, type: 'spki', format: 'der' }).asymmetricKeyType, 'rsa')
const expectedId = [...createHash('sha256').update(publicKey).digest('hex').slice(0, 32)]
    .map(digit => String.fromCharCode(97 + parseInt(digit, 16))).join('')
assert.equal(expectedId, 'eicniiibhbkbalhchochfhojfmmnjlpe', 'Published identity must never change between releases')

const scratch = await mkdtemp(join(resolve('node_modules/.tmp'), 'identity-check-'))
let context
try {
    const firstPath = join(scratch, 'first-release')
    const nextPath = join(scratch, 'another-directory', 'next-release')
    for (const destination of [firstPath, nextPath]) {
        await cp(source, destination, { recursive: true, filter: path => path !== join(source, 'releases') })
    }
    // Simulate the next version without changing the actual release package.
    const nextManifest = { ...manifest }
    const versionParts = manifest.version.split('.').map(Number)
    versionParts[versionParts.length - 1]++
    nextManifest.version = versionParts.join('.')
    await writeFile(join(nextPath, 'manifest.json'), JSON.stringify(nextManifest))
    const sampleConfigs = [{ id: 'identity-check', name: 'Identity check', type: 'lsky', version: 'v1', apiUrl: 'https://example.invalid', token: 'test-only' }]
    context = await chromium.launchPersistentContext(join(scratch, 'profile'), {
        executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
        headless: true,
        ignoreDefaultArgs: ['--disable-extensions'],
        args: ['--enable-unsafe-extension-debugging'],
    })
    const cdp = await context.browser().newBrowserCDPSession()
    for (const [index, extensionPath] of [firstPath, nextPath].entries()) {
        const installed = await cdp.send('Extensions.loadUnpacked', { path: extensionPath })
        assert.equal(installed.id, expectedId)
        const page = await context.newPage()
        await page.goto(`chrome-extension://${expectedId}/index.html`)
        await page.locator('button').first().waitFor()
        await page.waitForFunction(async () => (await chrome.storage.local.get('giopic-onboarding-completed'))['giopic-onboarding-completed'] !== undefined)
        const identity = await page.evaluate(() => ({ id: chrome.runtime.id, version: chrome.runtime.getManifest().version }))
        assert.equal(identity.id, expectedId, 'Directory changes must not change the extension ID')
        assert.equal(identity.version, index === 0 ? manifest.version : nextManifest.version, 'Browser loads the selected version')
        const persisted = await page.evaluate(async ({ first, configs }) => {
            const database = await new Promise((resolve, reject) => {
                const request = indexedDB.open('giopic-db', 1)
                request.onupgradeneeded = () => request.result.createObjectStore('keyval')
                request.onsuccess = () => resolve(request.result)
                request.onerror = () => reject(request.error)
            })
            try {
                if (first) {
                    await chrome.storage.local.set({ 'giopic-hover-preview': false })
                    await new Promise((resolve, reject) => {
                        const transaction = database.transaction('keyval', 'readwrite')
                        transaction.objectStore('keyval').put(configs, 'giopic-configs')
                        transaction.oncomplete = resolve
                        transaction.onerror = () => reject(transaction.error)
                    })
                }
                const savedConfigs = await new Promise((resolve, reject) => {
                    const request = database.transaction('keyval').objectStore('keyval').get('giopic-configs')
                    request.onsuccess = () => resolve(request.result)
                    request.onerror = () => reject(request.error)
                })
                const settings = await chrome.storage.local.get('giopic-hover-preview')
                return { configs: savedConfigs, hoverPreview: settings['giopic-hover-preview'] }
            } finally { database.close() }
        }, { first: index === 0, configs: sampleConfigs })
        assert.deepEqual(persisted.configs, sampleConfigs, 'IndexedDB node configuration survives the directory/version change')
        assert.equal(persisted.hoverPreview, false, 'Existing settings survive the update')
        console.log(`Chrome ${identity.version}: ID ${identity.id}, node configuration and settings verified`)
        await page.close()
    }
} finally {
    if (context) await context.close()
    await rm(scratch, { recursive: true, force: true })
}
