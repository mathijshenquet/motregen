// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { jogCursor } from '../core/clock-timeline'
import type { Manifest, Source, TimelineFrame } from '../core/contract'
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

const MINUTE = 60_000
function frames(source: Source, fromMinutes: number, toMinutes: number, stepMinutes: number): TimelineFrame[] {
  const result: TimelineFrame[] = []
  for (let offset = fromMinutes; offset <= toMinutes; offset += stepMinutes) {
    const time = new Date(radar + offset * MINUTE).toISOString()
    result.push({ time, epoch: radar + offset * MINUTE, source, run: time, chunk: { url: `${source}.mrf`, source, run: time, header_len: 1, times: [time] }, frameIndex: 0 })
  }
  return result
}
// Radar tot nu, nowcast 2 u vooruit, HARMONIE tot +24 u; cursor 24 = het laatste radarframe.
const timeline = [...frames('rtcor', -120, 0, 5), ...frames('nowcast', 5, 120, 5), ...frames('harmonie', 180, 24 * 60, 60)]
const NOW_CURSOR = 24

beforeAll(() => {
  // jsdom kent geen pointer capture.
  const element = Element.prototype
  element.setPointerCapture ??= () => undefined
  element.releasePointerCapture ??= () => undefined
  element.hasPointerCapture ??= () => false
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
  it('shows the map time with a status dot beside it, ticks the status and announces only its changes', () => {
    render(() => <Freshness mapEpoch={radar} mapFrame={{ source: 'rtcor', run: '2026-09-23T14:00:00Z' }} manifest={manifest} refresh={{ checkedAt: radar }} onRefresh={async () => undefined} />)
    const pill = document.querySelector('.map-clock')!
    const live = document.querySelector('[aria-live="polite"]')!
    const trigger = screen.getByRole('slider', { name: /Details over dataversheid/ })
    // Eén knop: alleen de tijd; geen stip zolang de data actueel is, geen regimewoord of regimekleur.
    expect([...trigger.children].map((child) => child.className)).toEqual(['clock-main'])
    expect(trigger.querySelector('.freshness-dot')).toBeNull()
    expect(trigger.textContent).toBe(clock(radar))
    expect(pill.hasAttribute('data-source')).toBe(false)
    expect(pill.getAttribute('data-freshness')).toBe('fresh')
    expect(trigger.getAttribute('aria-label')).toBe(`Kaart ${clock(radar)}, observatie. Actueel: Radar ${clock(radar)}, 3 min geleden. Details over dataversheid`)
    expect(live.textContent).toBe('Actueel')

    vi.advanceTimersByTime(15_000 * 20)
    expect(trigger.getAttribute('aria-label')).toMatch(/8 min geleden\. Details/)
    expect(live.textContent).toBe('Actueel')
    vi.advanceTimersByTime(15_000 * 12)
    expect(pill.getAttribute('data-freshness')).toBe('aging')
    expect(live.textContent).toBe('Loopt achter')
  })

  it('turns a failed refresh into a visible offline status and refreshes on demand', async () => {
    const [refresh, setRefresh] = createSignal<RefreshState>({ checkedAt: radar })
    const onRefresh = vi.fn(async () => { setRefresh({ checkedAt: radar, failedAt: Date.now() }) })
    render(() => <Freshness mapEpoch={radar - 3_600_000} mapFrame={{ source: 'rtcor', run: '2026-09-23T13:00:00Z' }} manifest={manifest} refresh={refresh()} onRefresh={onRefresh} />)

    const trigger = screen.getByRole('slider', { name: /Details over dataversheid/ })
    fireEvent.click(trigger)
    const dialog = document.querySelector('dialog')!
    expect(dialog.open).toBe(true)
    for (const label of ['Radar', 'HARMONIE']) expect(within(dialog).getByText(label)).toBeTruthy()
    // U34: leeftijden per bron als tikkend label in korte vorm.
    expect(within(dialog).getAllByText('3 u').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Nu verversen' }))
    await vi.waitFor(() => expect(onRefresh).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(document.querySelector('.map-clock')!.getAttribute('data-freshness')).toBe('offline'))
    expect(trigger.getAttribute('aria-label')).toMatch(/\. Offline: Radar /)
    expect(screen.getByText(/verversen mislukt om/)).toBeTruthy()
    dialog.close()
    expect(document.activeElement).toBe(trigger)
  })

  it('names the regime only for the screen reader; nowcast and model are one regime', () => {
    const [frame, setFrame] = createSignal<{ source: 'nowcast' | 'harmonie'; run: string }>({ source: 'nowcast', run: '2026-09-23T14:25:00Z' })
    render(() => <Freshness mapEpoch={radar + 7_200_000} mapFrame={frame()} manifest={manifest} refresh={{ checkedAt: radar }} onRefresh={async () => undefined} />)
    const trigger = screen.getByRole('slider', { name: /Details over dataversheid/ })
    expect(document.querySelector('.clock-map-time')!.textContent).toBe(clock(radar + 7_200_000))
    expect(document.querySelector('.clock-day')).toBeNull()
    expect(trigger.getAttribute('aria-label')).toMatch(/, voorspelling\. /)
    setFrame({ source: 'harmonie', run: '2026-09-23T11:00:00Z' })
    expect(trigger.getAttribute('aria-label')).toMatch(/, voorspelling\. /)
    expect(trigger.textContent).toBe(clock(radar + 7_200_000))
  })

  it('shows a play button in the clock only while deliberately paused (U34)', () => {
    const [paused, setPaused] = createSignal(false)
    const onPlay = vi.fn(() => setPaused(false))
    render(() => <Freshness mapEpoch={radar} mapFrame={{ source: 'rtcor', run: '2026-09-23T13:00:00Z' }} manifest={manifest} refresh={{ checkedAt: radar }} onRefresh={async () => undefined} paused={paused()} onPlay={onPlay} />)
    expect(screen.queryByRole('button', { name: 'Afspelen' })).toBeNull()
    setPaused(true)
    fireEvent.click(screen.getByRole('button', { name: 'Afspelen' }))
    expect(onPlay).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Afspelen' })).toBeNull()
  })

  it('scrubs when the clock is dragged, pauses meanwhile and still opens the panel on a tap (U56)', () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(radar + 3 * MINUTE)
    const [paused, setPaused] = createSignal(false)
    const [cursor, setCursor] = createSignal(NOW_CURSOR)
    const onCursor = vi.fn(setCursor)
    const onPause = vi.fn(() => setPaused(true))
    const onPlay = vi.fn(() => setPaused(false))
    render(() => <Freshness mapEpoch={radar} mapFrame={{ source: 'rtcor', run: '2026-09-23T14:00:00Z' }} manifest={manifest} refresh={{ checkedAt: radar }} onRefresh={async () => undefined}
      timeline={timeline} cursor={cursor()} onCursor={onCursor} paused={paused()} onPause={onPause} onPlay={onPlay} />)
    const trigger = screen.getByRole('slider', { name: /Details over dataversheid/ })
    const dialog = document.querySelector('dialog')!
    expect(trigger.getAttribute('aria-valuenow')).toBe(String(NOW_CURSOR))
    expect(trigger.getAttribute('aria-valuemax')).toBe(String(timeline.length - 1))

    // Binnen de tap-slop gebeurt er niets: geen scrub, geen pauze.
    fireEvent.pointerDown(trigger, { button: 0, clientX: 100 })
    fireEvent.pointerMove(trigger, { clientX: 103 })
    expect(onCursor).not.toHaveBeenCalled()
    expect(onPause).not.toHaveBeenCalled()

    // 30 px naar rechts = een uur later, vanaf de tijd bij het begin van de sleep.
    fireEvent.pointerMove(trigger, { clientX: 130 })
    expect(onPause).toHaveBeenCalledOnce()
    expect(onCursor).toHaveBeenLastCalledWith(jogCursor(timeline, radar, 30))
    expect(timeline[cursor()]!.epoch).toBe(radar + 60 * MINUTE)
    expect(trigger.getAttribute('aria-valuenow')).toBe(String(NOW_CURSOR + 12))
    fireEvent.pointerMove(trigger, { clientX: 85 })
    expect(timeline[cursor()]!.epoch).toBe(radar - 30 * MINUTE)
    // Tijdens de eigen sleeppauze geen ▶: de pil mag niet verspringen onder de vinger.
    expect(paused()).toBe(true)
    expect(screen.queryByRole('button', { name: 'Afspelen' })).toBeNull()

    // De klik van het loslaten opent het paneel niet; na een seconde rust speelt het weer.
    fireEvent.pointerUp(trigger, { clientX: 85 })
    fireEvent.click(trigger)
    expect(dialog.open).toBe(false)
    vi.advanceTimersByTime(999)
    expect(onPlay).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onPlay).toHaveBeenCalledOnce()

    // Een tik (geen beweging) pauzeert niet zelf en opent het paneel.
    fireEvent.pointerDown(trigger, { button: 0, clientX: 100 })
    fireEvent.pointerUp(trigger, { clientX: 101 })
    fireEvent.click(trigger)
    expect(dialog.open).toBe(true)
    expect(onPause).toHaveBeenCalledOnce()
  })

  it('steps the time with the scrubber keys and toggles playback with space (U56)', () => {
    const [paused, setPaused] = createSignal(false)
    const onCursor = vi.fn()
    render(() => <Freshness mapEpoch={radar} mapFrame={{ source: 'rtcor', run: '2026-09-23T14:00:00Z' }} manifest={manifest} refresh={{ checkedAt: radar }} onRefresh={async () => undefined}
      timeline={timeline} cursor={NOW_CURSOR} onCursor={onCursor} paused={paused()} onPause={() => setPaused(true)} onPlay={() => setPaused(false)} />)
    const trigger = screen.getByRole('slider', { name: /Details over dataversheid/ })
    const pressed = (key: string) => { fireEvent.keyDown(trigger, { key }); return onCursor.mock.lastCall?.[0] as number | undefined }
    expect(pressed('ArrowRight')).toBe(NOW_CURSOR + 1)
    expect(pressed('ArrowLeft')).toBe(NOW_CURSOR - 1)
    expect(pressed('PageUp')).toBe(NOW_CURSOR + 6)
    expect(pressed('Home')).toBe(0)
    expect(pressed('End')).toBe(timeline.length - 1)
    onCursor.mockClear()
    fireEvent.keyDown(trigger, { key: ' ' })
    expect(paused()).toBe(true)
    fireEvent.keyDown(trigger, { key: ' ' })
    expect(paused()).toBe(false)
    expect(onCursor).not.toHaveBeenCalled()
    expect(document.querySelector('dialog')!.open).toBe(false)
  })

  it('unrolls into a strip with the three source zones, their freshness, now and the shown time (U56)', () => {
    const stripManifest: Manifest = { ...manifest, chunks: [...manifest.chunks, { url: 'chunks/nowcast.mrf', source: 'nowcast', run: '2026-09-23T14:20:00Z', header_len: 1, times: ['2026-09-23T14:25:00Z'] }] }
    const onCursor = vi.fn()
    render(() => <Freshness mapEpoch={radar + 60 * MINUTE} mapFrame={{ source: 'nowcast', run: '2026-09-23T14:20:00Z' }} manifest={stripManifest} refresh={{ checkedAt: radar }} onRefresh={async () => undefined}
      timeline={timeline} cursor={NOW_CURSOR + 12} onCursor={onCursor} />)
    // Dicht: geen strook in de DOM (de marker hoeft dan niet mee te lopen met afspelen).
    expect(document.querySelector('.freshness-strip')).toBeNull()
    fireEvent.click(screen.getByRole('slider', { name: /Details over dataversheid/ }))
    const strip = document.querySelector<HTMLElement>('.freshness-strip')!
    const zones = [...strip.querySelectorAll<HTMLElement>('.freshness-strip-zone')]
    expect(zones.map((zone) => [zone.dataset.zone, zone.dataset.kind, zone.querySelector('span')!.textContent, zone.querySelector('small')?.textContent])).toEqual([
      ['radar', 'observations', 'Radar', '3 min'],
      ['nowcast', 'forecast', 'Nowcast', '8 min'],
      ['harmonie', 'forecast', 'HARMONIE', '3 u'],
    ])
    const percent = (element: HTMLElement, property: 'left' | 'width') => Number.parseFloat(element.style[property])
    expect(zones.reduce((sum, zone) => sum + percent(zone, 'width'), 0)).toBeCloseTo(100)
    // Nu ligt op de grens radar/nowcast (± een half frame); de getoonde tijd (+1 u) op 39 % van de nowcast-zone (2,5–150 min).
    const radarWidth = percent(zones[0]!, 'width')
    const nowcastWidth = percent(zones[1]!, 'width')
    const now = percent(strip.querySelector<HTMLElement>('.freshness-strip-now')!, 'left')
    const marker = percent(strip.querySelector<HTMLElement>('.freshness-strip-marker')!, 'left')
    expect(now).toBeGreaterThan(radarWidth * 0.95)
    expect(now).toBeLessThanOrEqual(radarWidth)
    expect(marker).toBeGreaterThan(radarWidth + nowcastWidth * 0.37)
    expect(marker).toBeLessThan(radarWidth + nowcastWidth * 0.41)

    // Tik helemaal links en rechts in de strook: begin en einde van de tijdlijn.
    strip.getBoundingClientRect = () => ({ left: 100, width: 400, top: 0, right: 500, bottom: 30, height: 30, x: 100, y: 0, toJSON: () => undefined })
    fireEvent.click(strip, { clientX: 100 })
    expect(onCursor).toHaveBeenLastCalledWith(0)
    fireEvent.click(strip, { clientX: 500 })
    expect(onCursor).toHaveBeenLastCalledWith(timeline.length - 1)
    fireEvent.click(strip, { clientX: 100 + 4 * radarWidth / 2 })
    expect(timeline[Math.round(onCursor.mock.lastCall![0] as number)]!.epoch).toBeCloseTo(radar - 60 * MINUTE, -6)
  })

  it('names the day only when the map shows another day', () => {
    render(() => <Freshness mapEpoch={radar + 24 * 3_600_000} mapFrame={{ source: 'harmonie', run: '2026-09-23T11:00:00Z' }} manifest={manifest} refresh={{ checkedAt: radar }} onRefresh={async () => undefined} />)
    const day = new Date(radar + 24 * 3_600_000).toLocaleDateString('nl-NL', { weekday: 'short' })
    expect(document.querySelector('.clock-day')!.textContent).toBe(day)
    expect(screen.getByRole('slider', { name: /Details over dataversheid/ }).getAttribute('aria-label')).toMatch(new RegExp(`^Kaart ${clock(radar + 24 * 3_600_000)} ${day}, voorspelling\\.`))
  })
})
