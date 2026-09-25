// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import About, { REPOSITORY_URL, type ThemeChoice } from './About'

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
    render(() => <About theme="light" onTheme={() => undefined} onTripleTap={() => undefined} />)
    const trigger = screen.getByRole('button', { name: 'Over motregen en instellingen' })
    const dialog = document.querySelector('dialog')!
    expect(dialog.open).toBe(false)

    fireEvent.click(trigger)
    expect(dialog.open).toBe(true)
    expect(document.querySelector('.about-lead')!.textContent).toBe('Rechtstreeks van het KNMIGratis en zonder reclame')
    // Alles in één tabel, ook privacy en broncode; geen losse alinea's of knop meer.
    expect([...dialog.querySelectorAll('dt')].map((term) => term.textContent)).toEqual(['Observatie', 'Voorspelling', 'UV', 'Kaart', 'Zoeken', 'Privacy', 'Broncode'])
    expect(dialog.querySelectorAll('.about-body > p')).toHaveLength(1)
    expect(screen.getByText(/HARMONIE-AROME/)).toBeTruthy()
    expect(screen.getByText(/NL en Vlaanderen/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /GitHub/ }).getAttribute('href')).toBe(REPOSITORY_URL)

    fireEvent.click(screen.getByRole('button', { name: 'Sluiten' }))
    expect(dialog.open).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })

  it('states the anonymous usage count and reports each opening', () => {
    const onOpen = vi.fn()
    render(() => <About theme="light" onTheme={() => undefined} onOpen={onOpen} onTripleTap={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Over motregen en instellingen' }), { detail: 0 })
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Geen tracking, geen advertenties. Anoniem geteld: sessies en gebruikte functies, zonder IP of identificatie; locatie en favorieten blijven in je browser')).toBeTruthy()
  })

  it('closes on a backdrop click but not on a click inside', () => {
    render(() => <About theme="light" onTheme={() => undefined} onTripleTap={() => undefined} />)
    const dialog = document.querySelector('dialog')!
    fireEvent.click(screen.getByRole('button', { name: 'Over motregen en instellingen' }))
    fireEvent.click(screen.getByText(/Anoniem geteld/))
    expect(dialog.open).toBe(true)
    fireEvent.click(dialog)
    expect(dialog.open).toBe(false)
  })

  it('opens on a single brand tap after a short delay, and a triple tap toggles perf instead', () => {
    vi.useFakeTimers()
    const onTripleTap = vi.fn()
    render(() => <About theme="light" onTheme={() => undefined} onTripleTap={onTripleTap} />)
    const brand = screen.getByRole('button', { name: 'Over motregen en instellingen' })
    const dialog = document.querySelector('dialog')!
    // Alleen de druppel; het woordmerk staat in de modal.
    expect(brand.textContent).toBe('')
    expect(brand.querySelector('img')?.getAttribute('src')).toBe('/droplet.svg')

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

  it('puts the theme setting first, above the wordmark and the explanation', () => {
    const [theme, setTheme] = createSignal<ThemeChoice>('light')
    const onTheme = vi.fn(setTheme)
    render(() => <About theme={theme()} onTheme={onTheme} onTripleTap={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Over motregen en instellingen' }))
    const dialog = screen.getByRole('dialog', { name: 'motregen.nl' })
    const group = screen.getByRole('group', { name: 'Weergave' })
    expect(dialog.contains(group)).toBe(true)
    for (const later of [screen.getByRole('heading', { name: 'motregen.nl' }), screen.getByText(/Rechtstreeks van het KNMI/)]) expect(group.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const pressed = () => screen.getAllByRole('button', { pressed: true }).map((button) => button.textContent)
    expect(pressed()).toEqual(['Licht'])
    fireEvent.click(screen.getByRole('button', { name: 'Donker' }))
    expect(onTheme).toHaveBeenCalledWith('dark')
    expect(pressed()).toEqual(['Donker'])
    expect(dialog.hasAttribute('open')).toBe(true)
  })
})
