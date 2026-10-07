import { createHmac, timingSafeEqual } from 'node:crypto'

export function validateInitData(initData: string, token: string, now = Date.now()): boolean {
  if (!initData || initData.length > 16_384) return false
  const parameters = new URLSearchParams(initData)
  const hash = parameters.get('hash')
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return false
  const names = [...parameters.keys()]
  if (new Set(names).size !== names.length) return false
  const authenticatedAt = Number(parameters.get('auth_date')) * 1000
  if (!Number.isFinite(authenticatedAt) || authenticatedAt > now + 30_000 || now - authenticatedAt > 3_600_000) return false
  parameters.delete('hash')
  const entries = [...parameters.entries()].sort(([left], [right]) => {
    if (left < right) return -1
    if (left > right) return 1
    return 0
  })
  const checkString = entries.map(([name, value]) => `${name}=${value}`).join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(token).digest()
  const expected = createHmac('sha256', secret).update(checkString).digest()
  return timingSafeEqual(expected, Buffer.from(hash, 'hex'))
}
