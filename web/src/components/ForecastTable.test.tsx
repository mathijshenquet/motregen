// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FocusKind } from '../core/focus-mode'
import type { HourlyForecastRow } from '../core/forecast'
import type { WindUnit } from '../core/weather'
import ForecastTable, { type ForecastSeries } from './ForecastTable'

const start = Date.parse('2026-08-28T00:00:00Z')
const rows: HourlyForecastRow[] = Array.from({ length: 24 }, (_, index) => ({
  epoch: start + index * 3_600_000,
  kind: index === 0 ? 'now' : 'future',
  rainIndex: index, uvIndex: null, uvClearIndex: null, radiationIndex: null, radiationNextIndex: null,
  temperatureIndex: index, feelsLikeIndex: index, humidityIndex: index, cloudIndex: index, windUIndex: index, windVIndex: index, gustIndex: index,
}))
const filled = (value: number) => rows.map(() => value)
const series: ForecastSeries = {
  rain: rows.map((_, index) => [0, 0.004, 0.35, 1.26][index % 4]!), uv: [], uvClear: [], radiation: [], temperature: filled(15),
  feelsLike: filled(14), humidity: filled(70), cloud: filled(0.5), windU: filled(3), windV: filled(1), gust: filled(8),
}
const allColumns = { weather: true, air: true, temperature: true, wind: true }

function renderTable(options: { pinned?: FocusKind; weather?: boolean; dayNight?: boolean; onSelectTime?: (epoch: number) => void; mobileTableOpen?: boolean; onOpenMobileTable?: () => void; onSelectMobileMode?: () => void; rows?: HourlyForecastRow[]; historyInline?: boolean; windUnit?: () => WindUnit } = {}) {
  const [pinned, setPinned] = createSignal<FocusKind>(options.pinned ?? 'weather')
  const onPin = vi.fn((mode: FocusKind) => setPinned(mode))
  const onFocus = vi.fn()
  render(() => <ForecastTable
    rows={options.rows ?? rows}
    series={series}
    location={{ lng: 5.18, lat: 52.1 }}
    columns={{ ...allColumns, weather: options.weather ?? true }}
    windUnit={options.windUnit?.() ?? 'bft'}
    dayNight={options.dayNight}
    loadedUntil={Number.POSITIVE_INFINITY}
    historyInline={options.historyInline ?? false}
    historyOpen={false}
    historyLoaded
    onNeedRows={() => undefined}
    onNeedHistory={() => undefined}
    onOpenHistory={() => undefined}
    onSelectTime={options.onSelectTime}
    mobileTableOpen={options.mobileTableOpen}
    onOpenMobileTable={options.onOpenMobileTable}
    onSelectMobileMode={options.onSelectMobileMode}
    focus={{ pinned: pinned(), onPin, onFocus }}
  />)
  return { pinned, onPin, onFocus }
}

afterEach(cleanup)

describe('forecast table headings', () => {
  it('render every column heading with an icon and a word; time and weather in their own columns (U34)', () => {
    renderTable()
    const headings = [...document.querySelectorAll('thead th')]
    expect(headings.map((heading) => heading.textContent)).toEqual(['Uur', 'Weer', 'Lucht', 'Gevoel', 'Wind'])
    expect(screen.getByRole('columnheader', { name: 'Uur' })).toBe(headings[0])
    for (const heading of headings) expect(heading.querySelector('svg.lucide')).not.toBeNull()
    const [time, weather] = document.querySelectorAll('tbody tr:not(.history-toggle-row) td')
    expect(time!.textContent).toContain('Nu')
    expect(weather!.querySelector('.weather-icon')).not.toBeNull()
  })

  it('jump the scrubber to an hour on a click on its row or time (U34)', () => {
    const onSelectTime = vi.fn()
    renderTable({ onSelectTime })
    const second = document.querySelectorAll<HTMLTableRowElement>('tbody tr:not(.sun-row):not(.history-toggle-row)')[1]!
    fireEvent.click(second.querySelector('.air-cell') ?? second)
    expect(onSelectTime).toHaveBeenLastCalledWith(rows[1]!.epoch)
    fireEvent.click(document.querySelectorAll('.time-label')[2]!)
    expect(onSelectTime).toHaveBeenLastCalledWith(rows[2]!.epoch)
    expect(onSelectTime).toHaveBeenCalledTimes(2)
  })

  it('keeps the hour heading when there is no cloud data', () => {
    renderTable({ weather: false })
    expect(document.querySelector('thead th')!.textContent).toBe('Uur')
    expect(document.querySelector('.weather-icon')).toBeNull()
  })

  it('uses the first heading as a regular table mode on portrait mobile', () => {
    const onOpenMobileTable = vi.fn()
    const onSelectMobileMode = vi.fn()
    const past = { ...rows[0]!, epoch: start - 3_600_000, kind: 'past' as const }
    renderTable({ rows: [past, ...rows], onOpenMobileTable, onSelectMobileMode })
    expect(screen.queryByRole('columnheader', { name: 'Uur' })).toBeNull()
    const table = screen.getByRole('button', { name: 'Tabel' })
    expect(table.classList.contains('column-focus')).toBe(true)
    expect(table.getAttribute('aria-pressed')).toBe('false')
    expect(document.querySelector('tr.past-hour')).not.toBeNull()
    fireEvent.click(table)
    expect(onOpenMobileTable).toHaveBeenCalledOnce()
    cleanup()
    renderTable({ rows: [past, ...rows], mobileTableOpen: true, onOpenMobileTable, onSelectMobileMode })
    expect(screen.getByRole('button', { name: 'Tabel' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Weer' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('button', { name: 'Kaart' })).toBeNull()
    expect(document.querySelector('tr.past-hour')).not.toBeNull()
    expect(document.querySelector('.history-toggle')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tabel' }))
    expect(onSelectMobileMode).toHaveBeenCalledOnce()
    onSelectMobileMode.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Lucht' }))
    expect(onSelectMobileMode).toHaveBeenCalledOnce()
  })

  it('returns to the map at the selected time from an open mobile table', () => {
    const onSelectTime = vi.fn()
    const onSelectMobileMode = vi.fn()
    renderTable({ mobileTableOpen: true, onOpenMobileTable: vi.fn(), onSelectMobileMode, onSelectTime })
    fireEvent.click(document.querySelectorAll<HTMLButtonElement>('.time-label')[2]!)
    expect(onSelectTime).toHaveBeenCalledOnce()
    expect(onSelectTime).toHaveBeenLastCalledWith(rows[2]!.epoch)
    expect(onSelectMobileMode).toHaveBeenCalledOnce()
    expect(onSelectTime.mock.invocationCallOrder[0]).toBeLessThan(onSelectMobileMode.mock.invocationCallOrder[0]!)
  })

  it('makes Weer, Lucht, Gevoel and Wind mode buttons while RV stays out of view', () => {
    renderTable()
    expect(screen.getByRole('button', { name: 'Weer' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Lucht' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Gevoel' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Wind' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('button', { name: 'RV' })).toBeNull()
  })

  it('pins air from its heading and treats the whole air column as a hover target', () => {
    const { pinned, onPin, onFocus } = renderTable()
    fireEvent.click(screen.getByRole('button', { name: 'Lucht' }))
    expect(onPin).toHaveBeenCalledWith('air')
    expect(pinned()).toBe('air')
    const cell = document.querySelector('.air-cell')!
    fireEvent.pointerEnter(cell, { pointerType: 'mouse' })
    expect(onFocus).toHaveBeenLastCalledWith('air', 'table', true)
    fireEvent.pointerEnter(cell, { pointerType: 'touch' })
    expect(document.querySelector('.forecast-table')!.getAttribute('data-hover')).toBeNull()
    expect(onFocus).toHaveBeenLastCalledWith('air', 'table', false)
  })

  it('pin the weather mode and keep it pinned on a second click', () => {
    const { pinned, onPin } = renderTable({ pinned: 'wind' })
    fireEvent.click(screen.getByRole('button', { name: 'Weer' }))
    expect(onPin).toHaveBeenCalledWith('weather')
    expect(pinned()).toBe('weather')
    expect(document.querySelector('table')!.dataset.mode).toBe('weather')
    fireEvent.click(screen.getByRole('button', { name: 'Weer' }))
    expect(pinned()).toBe('weather')
    expect(document.querySelector('table')!.dataset.mode).toBe('weather')
  })

  it('pin a mode on click, marking the heading and tinting its column', () => {
    const { pinned, onPin } = renderTable()
    fireEvent.click(screen.getByRole('button', { name: 'Gevoel' }))
    expect(onPin).toHaveBeenCalledWith('temperature')
    expect(pinned()).toBe('temperature')
    expect(screen.getByRole('button', { name: 'Gevoel' }).getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('table')!.dataset.mode).toBe('temperature')
  })


  it('treat the whole column as hover target and tint it, without dropping focus between cells (U34)', () => {
    vi.useFakeTimers()
    try {
      const { onFocus } = renderTable()
      const table = document.querySelector('table')!
      const heading = document.querySelector('.temperature-heading')!
      const cell = document.querySelector('.temperature-cell')!
      fireEvent.pointerEnter(heading, { pointerType: 'mouse' })
      expect(onFocus).toHaveBeenLastCalledWith('temperature', 'table', true)
      expect(table.dataset.hover).toBe('temperature')
      fireEvent.pointerLeave(heading, { pointerType: 'mouse' })
      fireEvent.pointerEnter(cell, { pointerType: 'mouse' })
      vi.advanceTimersByTime(200)
      expect(onFocus.mock.calls.filter(([, , active]) => !active)).toHaveLength(0)
      fireEvent.pointerLeave(cell, { pointerType: 'mouse' })
      vi.advanceTimersByTime(200)
      expect(onFocus).toHaveBeenLastCalledWith('temperature', 'table', false)
      expect(table.dataset.hover).toBeUndefined()
      fireEvent.pointerEnter(cell, { pointerType: 'touch' })
      expect(table.dataset.hover).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

})

describe('forecast table cells', () => {
  it('groups night hours with a distinct row treatment around the sun boundaries', () => {
    renderTable()
    expect(document.querySelector('.forecast-table')?.classList.contains('day-night-table')).toBe(true)
    const rowAt = (hour: number) => document.querySelector<HTMLTableRowElement>(`tr[data-epoch="${start + hour * 3_600_000}"]`)!
    expect(rowAt(2).classList.contains('night-hour')).toBe(true)
    expect(rowAt(14).classList.contains('night-hour')).toBe(false)
    expect(rowAt(22).classList.contains('night-hour')).toBe(true)
    const sunrise = [...document.querySelectorAll<HTMLTableRowElement>('.sun-row')].find((row) => row.textContent?.includes('Zon op'))!
    const sunset = [...document.querySelectorAll<HTMLTableRowElement>('.sun-row')].find((row) => row.textContent?.includes('Zon onder'))!
    expect(sunrise.classList.contains('sunrise-row')).toBe(true)
    expect(sunset.classList.contains('sunset-row')).toBe(true)
    expect(sunrise.previousElementSibling?.classList.contains('before-sunrise')).toBe(true)
    expect(sunset.previousElementSibling?.classList.contains('before-sunset')).toBe(true)
    expect(sunrise.previousElementSibling?.classList.contains('night-hour')).toBe(true)
    expect(sunset.previousElementSibling?.classList.contains('night-hour')).toBe(false)
  })

  it('can turn the complete table day/night treatment off', () => {
    renderTable({ dayNight: false })
    expect(document.querySelector('.forecast-table')?.classList.contains('day-night-table')).toBe(false)
    expect(document.querySelector('tr.night-hour')).not.toBeNull()
  })

  it('masks the NASA moon texture with the calculated terminator at night', () => {
    renderTable()
    const moon = document.querySelector('.moon-glyph')!
    expect(moon.querySelectorAll('image[href="/moon@2x.png"]')).toHaveLength(2)
    expect(moon.querySelector('.moon-texture')?.getAttribute('clip-path')).toMatch(/^url\(#.+-litclip\)$/)
    expect(document.querySelector('.moon-angle')?.textContent).toMatch(/^∠-?\d+°$/)
    expect(document.querySelector('.moon-reading')?.getAttribute('aria-label')).toMatch(/graden (boven|onder) de horizon$/)
  })

  it('show rain beside the weather icon only when the rounded amount is not zero', () => {
    renderTable()
    const amounts = [...document.querySelectorAll('tbody tr:not(.sun-row):not(.history-toggle-row)')].slice(0, 4)
      .map((row) => row.querySelector('.rain-amount')?.textContent ?? null)
    expect(amounts).toEqual([null, null, '0,35 mm/u', '1,3 mm/u'])
  })

  it('point the wind arrow where the wind blows to, with the direction in the label', () => {
    renderTable()
    const reading = document.querySelector('.wind-reading')!
    // u = 3, v = 1: wind uit het westzuidwesten, dus de pijl wijst naar het oostnoordoosten.
    expect(reading.getAttribute('aria-label')).toBe('Wind uit W, 2 Bft, windstoten tot 5 Bft')
    const angle = Number(/rotate\(([\d.]+)deg\)/.exec(reading.querySelector<SVGElement>('.wind-arrow')!.style.transform)![1])
    expect(angle).toBeCloseTo(71.6, 1)
  })

  it('show the gust small behind the mean wind, in the chosen unit', () => {
    const [unit, setUnit] = createSignal<WindUnit>('bft')
    renderTable({ windUnit: unit })
    const reading = () => document.querySelector('.wind-reading')!
    const text = () => [...reading().querySelectorAll('b, small')].map((part) => part.textContent)
    // U34: "2 ⌇ 5 Bft" — vlaag in dezelfde eenheid, met vlaagteken.
    // U34: pijl + hoofdwaarde, daaronder het windicoon met de vlaag in dezelfde eenheid.
    expect(text()).toEqual(['2', 'Bft', '5 Bft'])
    expect(reading().querySelector('.wind-gust-icon')).not.toBeNull()
    expect(reading().getAttribute('aria-label')).toBe('Wind uit W, 2 Bft, windstoten tot 5 Bft')
    setUnit('kn')
    expect(text()).toEqual(['6', 'kn', '16 kn'])
    expect(reading().getAttribute('title')).toBe('Wind uit W, 6 kn, windstoten tot 16 kn')
    setUnit('ms')
    expect(text()).toEqual(['3', 'm/s', '8 m/s'])
  })
})

describe('history rows', () => {
  const withHistory = rows.map((row, index) => ({ ...row, kind: index < 2 ? 'past' as const : index === 2 ? 'now' as const : 'future' as const }))
  const times = () => [...document.querySelectorAll('tbody tr:not(.sun-row):not(.history-toggle-row) strong')].slice(0, 2).map((cell) => cell.textContent)

  it('fold behind a small toggle on touch', () => {
    renderTable({ rows: withHistory })
    const toggle = screen.getByRole('button', { name: 'Afgelopen 2 uur tonen' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelectorAll('tr.past-hour')).toHaveLength(0)
    expect(toggle.closest('tr')?.previousElementSibling?.classList.contains('current-hour')).toBe(true)
  })

  it('stand inline above the now-row on desktop, without a toggle', () => {
    renderTable({ rows: withHistory, historyInline: true })
    expect(document.querySelector('.history-toggle')).toBeNull()
    expect(document.querySelectorAll('tr.past-hour')).toHaveLength(2)
    expect(times()).toEqual(withHistory.slice(0, 2).map((row) => new Date(row.epoch).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })))
  })
})

describe('sun rows', () => {
  it('draw the horizon glyph with rays and without an arrow; the text says rise or set', () => {
    renderTable()
    const sunRows = [...document.querySelectorAll('.sun-row')]
    expect(sunRows.map((row) => row.textContent?.replace(/\d\d:\d\d/, 'hh:mm'))).toEqual(['Zon op hh:mm', 'Zon onder hh:mm'])
    for (const row of sunRows) {
      expect(row.querySelector('.sun-glyph-disc')).not.toBeNull()
      expect(row.previousElementSibling?.classList.contains('before-sun-row')).toBe(true)
      // Horizon, halve schijf en stralen (U34); geen pijl.
      expect(row.querySelectorAll('.sun-glyph path')).toHaveLength(3)
      expect(row.querySelector('.sun-glyph-rays')).not.toBeNull()
    }
  })
})
