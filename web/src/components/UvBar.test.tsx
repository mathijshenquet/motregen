// @vitest-environment jsdom
import { cleanup, render } from '@solidjs/testing-library'
import { afterEach, describe, expect, it } from 'vitest'
import UvBar from './UvBar'

afterEach(cleanup)

describe('UV bar', () => {
  it('laat rond de horizon geen lege pil achter', () => {
    const { container } = render(() => <UvBar reading={{ value: 0, clear: 0, estimated: true, clearEstimated: true }} />)
    expect(container.querySelector('.uv-bar')?.getAttribute('aria-label')).toBe('Geen zon')
    expect(container.querySelector('.uv-bar-track')).toBeNull()
  })

  it('houdt echte lage UV zichtbaar als de zon wel kracht heeft', () => {
    const { container } = render(() => <UvBar reading={{ value: 0, clear: 0.1, estimated: true, clearEstimated: true }} />)
    expect(container.querySelector('.uv-bar-track')).not.toBeNull()
    expect(container.querySelector('.uv-bar-value')?.textContent).toBe('UV 0')
  })
})
