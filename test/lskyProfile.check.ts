// Run: node --experimental-strip-types test/lskyProfile.check.ts
import assert from 'node:assert/strict'
import { fetchLskyProfile } from '../src/services/lskyProfile.ts'

const originalFetch = globalThis.fetch
const signal = new AbortController().signal
const data = { name: 'Test account', capacity: 1048576, used_capacity: 1024, image_num: 7 }
let response: unknown = { status: true, data }
let status = 200
let requests = 0

globalThis.fetch = async (input, init) => {
    requests++
    assert.equal(String(input), 'https://lsky.invalid/bed/api/v1/profile')
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-token')
    assert.equal(new Headers(init?.headers).get('Accept'), 'application/json')
    assert.equal(init?.signal, signal)
    return new Response(JSON.stringify(response), { status, headers: { 'Content-Type': 'application/json' } })
}

try {
    for (const suffix of ['', '/', '///', '/api/v1', '/api/v1/upload', '/api/v1/profile/']) {
        const result = await fetchLskyProfile(`https://lsky.invalid/bed${suffix}`, 'test-token', signal)
        assert.deepEqual(result, { name: 'Test account', capacity: 1073741824, usedCapacity: 1048576, imageCount: 7 })
    }
    await fetchLskyProfile('https://lsky.invalid/bed?ignored=1#fragment', 'Bearer test-token', signal)
    response = { status: true, data: { name: 'Legacy', capacity: 2048, size: 512, image_num: 2 } }
    assert.deepEqual(await fetchLskyProfile('https://lsky.invalid/bed', 'test-token', signal), {
        name: 'Legacy', capacity: 2097152, usedCapacity: 524288, imageCount: 2,
    })
    response = { status: true, data: { ...data, capacity: 0, used_capacity: 0, size: 512, image_num: 0 } }
    const zero = await fetchLskyProfile('https://lsky.invalid/bed', 'test-token', signal)
    assert.equal(zero.capacity, 0)
    assert.equal(zero.usedCapacity, 0)
    assert.equal(zero.imageCount, 0)

    for (const invalid of [null, { status: false, data }, { status: true, data: {} },
        { status: true, data: { ...data, capacity: -1 } },
        { status: true, data: { ...data, used_capacity: null } },
        { status: true, data: { ...data, image_num: 1.5 } },
        { status: true, data: { ...data, capacity: '1048576' } },
        { status: true, data: { ...data, capacity: Number.MAX_VALUE } }]) {
        response = invalid
        await assert.rejects(fetchLskyProfile('https://lsky.invalid/bed', 'test-token', signal), /Invalid Lsky profile response/)
    }
    for (const code of [401, 403, 500]) {
        status = code
        await assert.rejects(fetchLskyProfile('https://lsky.invalid/bed', 'test-token', signal), new RegExp(`HTTP ${code}`))
    }
    const previousRequests = requests
    await assert.rejects(fetchLskyProfile('file:///bed', 'test-token', signal), /Invalid Lsky URL/)
    await assert.rejects(fetchLskyProfile('https://lsky.invalid/bed', '', signal), /token is required/)
    assert.equal(requests, previousRequests)
    console.log('Lsky profile checks: URL, auth, KiB conversion, legacy fields, zero values, malformed data and HTTP failures verified')
} finally {
    globalThis.fetch = originalFetch
}
