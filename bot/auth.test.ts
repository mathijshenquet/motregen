import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { validateInitData } from './auth.js'

const token = 'test-token'
const now = Date.parse('2026-10-07T12:00:00Z')

function signedData(authenticatedAt: number): string {
  const user = '{"id":123,"first_name":"Test"}'
  const date = String(Math.floor(authenticatedAt / 1000))
  const fields = `auth_date=${date}\nquery_id=example\nuser=${user}`
  const secret = createHmac('sha256', 'WebAppData').update(token).digest()
  const hash = createHmac('sha256', secret).update(fields).digest('hex')
  return new URLSearchParams({ user, auth_date: date, query_id: 'example', hash }).toString()
}

describe('Mini App initData verification', () => {
  it('accepts valid signatures independently of query order', () => {
    expect(validateInitData(signedData(now), token, now)).toBe(true)
  })

  it('rejects forgery, duplicate fields, stale data and a different bot token', () => {
    const valid = signedData(now)
    expect(validateInitData(valid.replace('example', 'forged'), token, now)).toBe(false)
    expect(validateInitData(`${valid}&query_id=example`, token, now)).toBe(false)
    expect(validateInitData(signedData(now - 3_600_001), token, now)).toBe(false)
    expect(validateInitData(signedData(now + 60_000), token, now)).toBe(false)
    expect(validateInitData(valid, 'wrong-token', now)).toBe(false)
    expect(validateInitData('hash=broken', token, now)).toBe(false)
  })
})
