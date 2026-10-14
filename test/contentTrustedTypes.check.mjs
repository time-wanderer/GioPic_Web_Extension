// Build first: pnpm build. Uses an existing Playwright install; set PLAYWRIGHT_MODULE to its path if needed.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const extensionPath = resolve('dist')
const profile = await mkdtemp(join(resolve('node_modules/.tmp'), 'trusted-types-'))
const policies = {
    '/strict': "trusted-types nAZtB7 default; require-trusted-types-for 'script'",
    '/deny-all': "trusted-types 'none'; require-trusted-types-for 'script'",
    '/other-policy': "trusted-types site-policy; require-trusted-types-for 'script'",
    '/policy-only': 'trusted-types nAZtB7 default',
}
const server = createServer((request, response) => {
    if (policies[request.url]) response.setHeader('Content-Security-Policy', policies[request.url])
    const frame = request.url === '/iframe-host' ? '<iframe src="/strict"></iframe>' : ''
    response.end(`<!doctype html><html><head><title>Trusted Types check</title></head><body><h1>Check</h1>${frame}</body></html>`)
})

function findClass(node, className) {
    const attributes = node.attributes || []
    for (let index = 0; index < attributes.length; index += 2) {
        if (attributes[index] === 'class' && attributes[index + 1].split(/\s+/).includes(className)) return node
    }
    for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) {
        const found = findClass(child, className)
        if (found) return found
    }
}

let context
try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    context = await chromium.launchPersistentContext(profile, {
        executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        headless: true,
        args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    })
    for (const route of ['/plain', ...Object.keys(policies), '/iframe-host']) {
        const page = await context.newPage()
        const cdp = await context.newCDPSession(page)
        const policyErrors = []
        const runtimeErrors = []
        cdp.on('Log.entryAdded', ({ entry }) => {
            if (entry.source === 'security' && /TrustedTypePolicy.*['"]vue['"]/.test(entry.text)) policyErrors.push(entry.text)
        })
        page.on('pageerror', error => runtimeErrors.push(error.message))
        await cdp.send('Log.enable')
        await page.goto(`http://127.0.0.1:${server.address().port}${route}`)
        const policyFrame = route === '/iframe-host'
            ? page.frames().find(frame => frame.url() === `http://127.0.0.1:${server.address().port}/strict`)
            : page.mainFrame()
        assert.ok(policyFrame, `${route}: target frame loaded`)
        if (route === '/iframe-host') await policyFrame.waitForSelector('html[data-giopic-page-bundle]')
        await page.waitForSelector('#giopic-content-overlay', { state: 'attached' })
        let tree = (await cdp.send('DOM.getDocument', { depth: -1, pierce: true })).root
        assert.ok(findClass(tree, 'giopic-overlay-container'), `${route}: Vue overlay rendered`)
        assert.ok(findClass(tree, 'giopic-floating-ball'), `${route}: floating ball rendered`)
        const closeButton = findClass(tree, 'giopic-close-btn')
        assert.ok(closeButton, `${route}: close button rendered`)
        const { object } = await cdp.send('DOM.resolveNode', { nodeId: closeButton.nodeId })
        await cdp.send('Runtime.callFunctionOn', {
            objectId: object.objectId,
            functionDeclaration: 'async function () { this.click(); await Promise.resolve(); }',
            awaitPromise: true,
        })
        tree = (await cdp.send('DOM.getDocument', { depth: -1, pierce: true })).root
        assert.ok(findClass(tree, 'giopic-dialog'), `${route}: Vue dialog interaction works`)
        if (policies[route] || route === '/iframe-host') {
            const denied = await policyFrame.evaluate(() => {
                if (!window.trustedTypes) return false
                try {
                    window.trustedTypes.createPolicy('giopic-forbidden', { createHTML: html => html })
                    return false
                } catch { return true }
            })
            assert.equal(denied, true, 'Host Trusted Types restrictions remain enforced')
        }
        assert.deepEqual(runtimeErrors, [], `${route}: no uncaught page errors`)
        assert.deepEqual(policyErrors, [], `${route}: no Vue Trusted Types CSP violations`)
        console.log(`${route}: overlay, floating ball, dialog and CSP checks verified`)
        await page.close()
    }
} finally {
    if (context) await context.close()
    if (server.listening) await new Promise(resolve => server.close(resolve))
    await rm(profile, { recursive: true, force: true })
}
