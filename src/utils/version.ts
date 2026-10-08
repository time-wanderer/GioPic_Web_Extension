/** 判断远端版本是否高于当前扩展版本。 */
export function isNewerVersion(candidate: string, current: string): boolean {
    // ponytail: 只比较 manifest 的 1–4 段数字版本；预发布渠道需要单独接入 SemVer。
    const parse = (version: string) => {
        if (typeof version !== 'string' || !/^v?\d+(?:\.\d+){0,3}$/.test(version)) throw new Error('Invalid extension version')
        const parts = version.replace(/^v/, '').split('.').map(Number)
        if (parts.some(part => !Number.isSafeInteger(part))) throw new Error('Invalid extension version')
        return parts
    }
    const next = parse(candidate)
    const installed = parse(current)
    for (let index = 0; index < Math.max(next.length, installed.length); index++) {
        const nextPart = next[index] ?? 0
        const installedPart = installed[index] ?? 0
        if (nextPart !== installedPart) return nextPart > installedPart
    }
    return false
}
