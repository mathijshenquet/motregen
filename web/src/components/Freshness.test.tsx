// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Manifest } from '../core/contract'
import type { RefreshState } from '../core/freshness'
import Freshness from './Freshness'

const radar = Date.parse('2026-09-23T14:25:00Z')
const clock = (epoch: number) => new Date(epoch).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
const manifest: Manifest = {
  version: 0,
  generated: '2026-09-23T14:27:52Z',
  now: '2026-09-23T14:25:00Z',
  chunks: [
    { url: 'chunks/rtcor.mrf', source: 'rtcor', run: '2026-09-23T14:00:00Z', header_len: 1, times: ['2026-09-23T14:00:00Z', '2026-09-23T14:25:00Z'] },
    { url: 'chunks/harmonie.mrf', source: 'harmonie', field: 'temp_c', run: '2026-09-23T11:00:00Z', header_len: 1, times: ['2026-09-23T12:00:00Z'] },
  ],
}

beforeAll(() => {
  const dialog = HTMLDialogElement.prototype
  dialog.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
  dialog.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(radar + 3 * 60_000)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('freshness indicator', () => {
  it('carries the radar age on the amber badge, ticks it and announces only status changes', () => {
    render(() => <Freshness mapEpoch={radar} mapFrame={{ source: 'rtcor', run: '2026-09-23T14:00:00Z' }} manifest={manifest} refresh={{ checkedAt: radar }} onRefresh={async () => undefined} />)
    const pill = document.querySelector('.map-clock')!
    const live = document.querySelector('[aria-live="polite"]')!
    expect(pill.getAttribute('data-freshness')).toBe('fresh')
    expect(pill.getAttribute('data-source')).toBe('observations')
    expect(document.querySelector('.clock-source')!.textContent).toBe('observatie')
    const badge = screen.getByRole('button', { name: /^Dataversheid:/ })
    expect(badge.getAttribute('aria-label')).toBe(`Dataversheid: actueel, radar ${clock(radar)}, 3 min oud`)
    expect(live.textContent).toBe('Actueel')

    vi.advanceTimersByTime(15_000 * 20)
    expect(badge.getAttribute('aria-label')).toMatch(/, 8 min oud$/)
    expect(live.textContent).toBe('Actueel')
    vi.advanceTimersByTime(15_000 * 12)
    expect(pill.getAttribute('data-freshness')).toBe('aging')
    expect(live.textContent).toBe('Loopt achter')
  })

  it('turns a failed refresh into a visible offline status and refreshes on demand', async () => {
    const [refresh, setRefresh] = createSignal<RefreshState>({ checkedAt: radar })
    const onRefresh = vi.fn(async () => { setRefresh({ checkedAt: radar, failedAt: Date.now() }) })
    render(() => <Freshness mapEpoch={radar - 3_600_000} mapFrame={{ source: 'rtcor', run: '2026-09-23T13:00:00Z' }} manifest={manifest} refresh={refresh()} onRefresh={onRefresh} />)

    // De amber knop opent hetzelfde paneel als de klok zelf.
    fireEvent.click(screen.getByRole('button', { name: /^Dataversheid:/ }))
    const dialog = document.querySelector('dialog')!
    expect(dialog.open).toBe(true)
    for (const label of ['Radar', 'HARMONIE']) expect(within(dialog).getByText(label)).toBeTruthy()
    expect(within(dialog).getByText('3 u 28 min geleden')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Nu verversen' }))
    await vi.waitFor(() => expect(onRefresh).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(document.querySelector('.map-clock')!.getAttribute('data-freshness')).toBe('offline'))
    expect(screen.getByRole('button', { name: /^Dataversheid:/ }).getAttribute('aria-label')).toBe(`Dataversheid: offline, radar ${clock(radar)}, verversen mislukt`)
    expect(screen.getByText(/verversen mislukt om/)).toBeTruthy()
  })

  it('shows only the map time and the regime word; nowcast and model are one regime', () => {
    const [frame, setFrame] = createSignal<{ source: 'nowcast' | 'harmonie'; run: string }>({ source: 'nowcast', run: '2026-09-23T14:25:00Z' })
    render(() => <Freshness mapEpoch={radar + 7_200_000} mapFrame={frame()} manifest={manifest} refresh={{ checkedAt: radar }} onRefresh={async () => undefined} />)
    const pill = document.querySelector('.map-clock')!
    expect(document.querySelector('.clock-map-time')!.textContent).toBe(clock(radar + 7_200_000))
    expect(document.querySelector('.clock-day')).toBeNull()
    expect(pill.getAttribute('data-source')).toBe('forecast')
    expect(document.querySelector('.clock-source')!.textContent).toBe('voorspelling')
    // Geen radartijd of leeftijd meer als tekst in de klok: die zit in de knop en het paneel.
    expect(document.querySelector('.clock-data')!.textContent).toBe('voorspelling')

    // Nowcast en HARMONIE zijn voor de gebruiker één regime.
    setFrame({ source: 'harmonie', run: '2026-09-23T11:00:00Z' })
    expect(pill.getAttribute('data-source')).toBe('forecast')
    expect(document.querySelector('.clock-source')!.textContent).toBe('voorspelling')
    expect(pill.getAttribute('data-freshness')).toBe('fresh')
  })

  it('names the day only when the map shows another day', () => {
    render(() => <Freshness mapEpoch={radar + 24 * 3_600_000} mapFrame={{ source: 'harmonie', run: '2026-09-23T11:00:00Z' }} manifest={manifest} refresh={{ checkedAt: radar }} onRefresh={async () => undefined} />)
    const day = new Date(radar + 24 * 3_600_000).toLocaleDateString('nl-NL', { weekday: 'short' })
    expect(document.querySelector('.clock-day')!.textContent).toBe(day)
    expect(screen.getByRole('button', { name: /Details over dataversheid/ }).getAttribute('aria-label')).toMatch(new RegExp(`^Kaart ${clock(radar + 24 * 3_600_000)} ${day}, voorspelling\\.`))
  })
})
