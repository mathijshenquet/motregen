import { describe, expect, it } from 'vitest'
import { windsockDevOptions } from './wind-socks'

describe('windsockDevOptions', () => {
  it('kiest de zakeenheid alleen uit de bekende vormen (U113)', () => {
    expect(windsockDevOptions(new URLSearchParams('zakeenheid=pil')).unitStyle).toBe('pil')
    expect(windsockDevOptions(new URLSearchParams('zakeenheid=onzin')).unitStyle).toBe('cirkel')
    expect(windsockDevOptions(new URLSearchParams('')).unitStyle).toBe('cirkel')
  })
})
