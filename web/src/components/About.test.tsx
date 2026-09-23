// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import About, { REPOSITORY_URL } from './About'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// jsdom has no modal dialog support; model the open/close contract we rely on.
beforeAll(() => {
  const dialog = HTMLDialogElement.prototype
  dialog.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
  dialog.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

describe('about dialog', () => {
  it('opens from the brand via keyboard activation, names the KNMI sources and returns focus on close', () => {
    render(() => <About onTripleTap={() => undefined} />)
    const trigger = screen.getByRole('button', { name: 'Over motregen' })
    const dialog = document.querySelector('dialog')!
    expect(dialog.open).toBe(false)

    fireEvent.click(trigger)
    expect(dialog.open).toBe(true)
    expect(screen.getByText('Data rechtstreeks van het KNMI. Gratis, zonder reclame, open source.')).toBeTruthy()
    for (const source of ['Radar', 'Nowcast', 'Model', 'UV', 'Kaart']) expect(screen.getByText(source)).toBeTruthy()
    expect(screen.getByText(/HARMONIE-AROME/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Broncode op GitHub/ }).getAttribute('href')).toBe(REPOSITORY_URL)

    fireEvent.click(screen.getByRole('button', { name: 'Sluiten' }))
    expect(dialog.open).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on a backdrop click but not on a click inside', () => {
    render(() => <About onTripleTap={() => undefined} />)
    const dialog = document.querySelector('dialog')!
    fireEvent.click(screen.getByRole('button', { name: 'Over motregen' }))
    fireEvent.click(screen.getByText(/Geen tracking/))
    expect(dialog.open).toBe(true)
    fireEvent.click(dialog)
    expect(dialog.open).toBe(false)
  })

  it('opens on a single brand tap after a short delay, and a triple tap toggles perf instead', () => {
    vi.useFakeTimers()
    const onTripleTap = vi.fn()
    render(() => <About onTripleTap={onTripleTap} />)
    const brand = screen.getByRole('button', { name: 'Over motregen' })
    const dialog = document.querySelector('dialog')!
    expect(brand.textContent).toContain('motregen.nl')
    expect(brand.querySelector('svg.lucide-info')?.getAttribute('aria-hidden')).toBe('true')

    fireEvent.click(brand, { detail: 1 })
    expect(dialog.open).toBe(false)
    vi.advanceTimersByTime(400)
    expect(dialog.open).toBe(true)
    dialog.close()

    vi.advanceTimersByTime(1_000)
    for (const detail of [1, 2, 3]) {
      fireEvent.click(brand, { detail })
      vi.advanceTimersByTime(40)
    }
    vi.advanceTimersByTime(1_000)
    expect(onTripleTap).toHaveBeenCalledOnce()
    expect(dialog.open).toBe(false)
  })
})
