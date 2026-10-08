// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { WindUnit } from '../core/weather'
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
  it('opens from the brand via keyboard activation, names the KNMI sources and returns focus on close', async () => {
    render(() => <About windUnit="bft" onWindUnit={() => undefined} theme="light" onTheme={() => undefined} onTripleTap={() => undefined} />)
    const trigger = screen.getByRole('button', { name: 'Over motregen en instellingen' })
    expect(document.querySelector('dialog')).toBeNull()

    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'motregen.nl' }) as HTMLDialogElement
    expect(dialog.open).toBe(true)
    expect(document.querySelector('.about-lead')!.textContent).toBe('Regenradar en weersverwachting')
    // Alles in één tabel, ook privacy en broncode; geen losse alinea's of knop meer.
    expect([...dialog.querySelectorAll('dt')].map((term) => term.textContent)).toEqual(['Observatie', 'Voorspelling', 'UV', 'Maan', 'Kaart', 'Zoeken', 'Privacy', 'Telegram', 'Broncode'])
    expect(dialog.querySelectorAll('.about-body > p')).toHaveLength(1)
    expect(screen.getByText(/HARMONIE-AROME/)).toBeTruthy()
    expect(screen.getByText(/NL en Vlaanderen/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'NASA Scientific Visualization Studio' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /GitHub/ }).getAttribute('href')).toBe(REPOSITORY_URL)

    fireEvent.click(screen.getByRole('button', { name: 'Sluiten' }))
    expect(dialog.open).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })

  it('states the anonymous usage count and reports each opening', async () => {
    const onOpen = vi.fn()
    render(() => <About windUnit="bft" onWindUnit={() => undefined} theme="light" onTheme={() => undefined} onOpen={onOpen} onTripleTap={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Over motregen en instellingen' }), { detail: 0 })
    await screen.findByRole('dialog', { name: 'motregen.nl' })
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Geen tracking, geen advertenties. Anoniem geteld: sessies en gebruikte functies, zonder IP of identificatie; locatie en favorieten blijven in je browser')).toBeTruthy()
  })

  it('closes on a backdrop click but not on a click inside', async () => {
    render(() => <About windUnit="bft" onWindUnit={() => undefined} theme="light" onTheme={() => undefined} onTripleTap={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Over motregen en instellingen' }))
    const dialog = await screen.findByRole('dialog', { name: 'motregen.nl' }) as HTMLDialogElement
    fireEvent.click(screen.getByText(/Anoniem geteld/))
    expect(dialog.open).toBe(true)
    fireEvent.click(dialog)
    expect(dialog.open).toBe(false)
  })

  it('opens on a single brand tap after a short delay, and a triple tap toggles perf instead', async () => {
    vi.useFakeTimers()
    const onTripleTap = vi.fn()
    render(() => <About windUnit="bft" onWindUnit={() => undefined} theme="light" onTheme={() => undefined} onTripleTap={onTripleTap} />)
    const brand = screen.getByRole('button', { name: 'Over motregen en instellingen' })
    // Alleen de druppel; het woordmerk staat in de modal.
    expect(brand.textContent).toBe('')
    expect(brand.querySelector('img')?.getAttribute('src')).toBe('/droplet.svg')

    fireEvent.click(brand, { detail: 1 })
    expect(document.querySelector('dialog')).toBeNull()
    await vi.advanceTimersByTimeAsync(400)
    await vi.dynamicImportSettled()
    const dialog = document.querySelector('dialog')!
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

  it('puts the theme setting first, above the wordmark and the explanation', async () => {
    const [theme, setTheme] = createSignal<ThemeChoice>('light')
    const onTheme = vi.fn(setTheme)
    const [windUnit, setWindUnit] = createSignal<WindUnit>('bft')
    const onWindUnit = vi.fn(setWindUnit)
    const [expressive, setExpressive] = createSignal(true)
    const onExpressive = vi.fn(setExpressive)
    render(() => <About theme={theme()} onTheme={onTheme} expressive={expressive()} onExpressive={onExpressive} windUnit={windUnit()} onWindUnit={onWindUnit} onTripleTap={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Over motregen en instellingen' }))
    const dialog = await screen.findByRole('dialog', { name: 'motregen.nl' })
    const group = screen.getByRole('group', { name: 'Weergave' })
    expect(dialog.contains(group)).toBe(true)
    for (const later of [screen.getByRole('heading', { name: 'motregen.nl' }), screen.getByText('Regenradar en weersverwachting')]) expect(group.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const pressed = () => [...dialog.querySelectorAll('.segmented button[aria-pressed="true"]')].map((button) => button.textContent)
    expect(pressed()).toEqual(['Licht', 'Bft'])
    const expressiveSwitch = screen.getByRole('button', { name: /Expressief/ })
    expect(expressiveSwitch.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(expressiveSwitch)
    expect(onExpressive).toHaveBeenCalledWith(false)
    expect(expressiveSwitch.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Donker' }))
    expect(onTheme).toHaveBeenCalledWith('dark')
    expect(pressed()).toEqual(['Donker', 'Bft'])
    const units = screen.getByRole('group', { name: 'Eenheid van de wind' })
    expect([...units.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Bft', 'knopen', 'km/u', 'm/s'])
    fireEvent.click(screen.getByRole('button', { name: 'km/u' }))
    expect(onWindUnit).toHaveBeenCalledWith('kmh')
    expect(pressed()).toEqual(['Donker', 'km/u'])
    expect(dialog.hasAttribute('open')).toBe(true)
  })

  it('shares the current state from About', async () => {
    const onShare = vi.fn()
    render(() => <About windUnit="bft" onWindUnit={() => undefined} theme="light" onTheme={() => undefined} onShare={onShare} onTripleTap={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Over motregen en instellingen' }), { detail: 0 })
    await screen.findByRole('dialog', { name: 'motregen.nl' })
    fireEvent.click(screen.getByRole('button', { name: 'Deel deze stand' }))
    expect(onShare).toHaveBeenCalledOnce()
  })
})
