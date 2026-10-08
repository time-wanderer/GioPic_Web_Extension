export interface LskyProfile {
    name: string
    capacity: number
    usedCapacity: number
    imageCount: number
}

/** Lsky v1 的容量单位是 KiB；返回值统一转换为字节。 */
export async function fetchLskyProfile(apiUrl: string, token: string, signal?: AbortSignal): Promise<LskyProfile> {
    const url = new URL(apiUrl.trim())
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid Lsky URL')
    const credential = token.trim().replace(/^Bearer\s+/i, '')
    if (!credential) throw new Error('Lsky token is required')

    url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/api\/v1(?:\/(?:upload|profile))?$/, '') + '/api/v1/profile'
    url.search = ''
    url.hash = ''
    const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${credential}`, Accept: 'application/json' },
        signal,
    })
    if (!response.ok) throw new Error(`Lsky profile HTTP ${response.status}`)

    const body = await response.json()
    const data = body?.data
    // ponytail: 兼容旧项目的 size 和官方接口的 used_capacity；其他协议需单独确认。
    const usedCapacity = data?.used_capacity ?? data?.size
    if (body?.status !== true || typeof data?.name !== 'string'
        || ![data?.capacity, usedCapacity, data?.image_num].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)
        || !Number.isSafeInteger(data.image_num)
        || !Number.isFinite(data.capacity * 1024) || !Number.isFinite(usedCapacity * 1024)) {
        throw new Error('Invalid Lsky profile response')
    }
    return { name: data.name, capacity: data.capacity * 1024, usedCapacity: usedCapacity * 1024, imageCount: data.image_num }
}
