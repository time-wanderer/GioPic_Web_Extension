// Run: node --experimental-strip-types test/version.check.ts
import assert from 'node:assert/strict'
import { isNewerVersion } from '../src/utils/version.ts'

for (const [candidate, current, expected] of [
    ['2.3.4', '2.4.0', false],
    ['2.4.0', '2.4.0', false],
    ['2.4.1', '2.4.0', true],
    ['2.10.0', '2.9.0', true],
    ['2.9.0', '2.10.0', false],
    ['3.0.0', '2.99.99', true],
    ['1.99.99', '2.0.0', false],
    ['v2.4.1', '2.4.0', true],
    ['2.4.1', 'v2.4.0', true],
    ['2.4', '2.4.0', false],
    ['2.4.0.0', '2.4', false],
    ['2.4.0.1', '2.4.0', true],
    ['2.4.0', '2.4.0.1', false],
    ['2', '2.0.0', false],
    ['0.0.1', '0', true],
    ['0', '0.0.1', false],
] as const) {
    assert.equal(isNewerVersion(candidate, current), expected, `${candidate} > ${current}`)
}
for (const invalid of ['', 'latest', '2..4', '2.4.0-beta.1', '2.4.0+build', '-2.4.0', '2.4.0.0.1', '9007199254740992']) {
    assert.throws(() => isNewerVersion(invalid, '2.4.0'), /Invalid extension version/)
    assert.throws(() => isNewerVersion('2.4.0', invalid), /Invalid extension version/)
}
assert.throws(() => isNewerVersion(null as unknown as string, '2.4.0'), /Invalid extension version/)
console.log('Version checks: older/equal/newer, numeric ordering, v prefix, omitted zero segments, four-part versions and invalid values verified')
