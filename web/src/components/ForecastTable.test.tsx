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
const allColumns = { weather: true, uv: true, temperature: true, humidity: true, wind: true }

function renderTable(options: { pinned?: FocusKind; weather?: boolean; rows?: HourlyForecastRow[]; historyInline?: boolean; windUnit?: () => WindUnit } = {}) {
  const [pinned, setPinned] = createSignal<FocusKind | undefined>(options.pinned)
  const onTogglePin = vi.fn((mode: FocusKind) => setPinned((current) => current === mode ? undefined : mode))
  const onFocus = vi.fn()
  render(() => <ForecastTable
    rows={options.rows ?? rows}
    series={series}
    location={{ lng: 5.18, lat: 52.1 }}
    columns={{ ...allColumns, weather: options.weather ?? true }}
    windUnit={options.windUnit?.() ?? 'bft'}
    loadedUntil={Number.POSITIVE_INFINITY}
    historyInline={options.historyInline ?? false}
    historyOpen={false}
    historyLoaded
    onNeedRows={() => undefined}
    onNeedHistory={() => undefined}
    onOpenHistory={() => undefined}
    focus={{ pinned: pinned(), onTogglePin, onFocus }}
  />)
  return { pinned, onTogglePin, onFocus }
}

afterEach(cleanup)

describe('forecast table headings', () => {
  it('render every column heading with an icon and a word, time and weather in one column', () => {
    renderTable()
    const headings = [...document.querySelectorAll('thead th')]
    expect(headings.map((heading) => heading.textContent)).toEqual(['Weer', 'UV', 'Gevoel', 'RV', 'Wind'])
    for (const heading of headings) expect(heading.querySelector('svg.lucide')).not.toBeNull()
    const first = document.querySelector('tbody tr:not(.history-toggle-row) td')!
    expect(first.textContent).toContain('Nu')
    expect(first.querySelector('.weather-icon')).not.toBeNull()
  })

  it('fall back to an hour heading when there is no cloud data', () => {
    renderTable({ weather: false })
    expect(document.querySelector('thead th')!.textContent).toBe('Uur')
    expect(document.querySelector('.weather-icon')).toBeNull()
  })

  it('only make map modes into toggle buttons; the default weather mode is not marked', () => {
    renderTable()
    const weather = screen.getByRole('button', { name: 'Weer' })
    expect(weather.hasAttribute('aria-pressed')).toBe(false)
    expect(screen.getByRole('button', { name: 'Gevoel' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Wind' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('button', { name: 'UV' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'RV' })).toBeNull()
  })

  it('pin a mode on click, marking the heading and tinting its column', () => {
    const { pinned, onTogglePin } = renderTable()
    fireEvent.click(screen.getByRole('button', { name: 'Gevoel' }))
    expect(onTogglePin).toHaveBeenCalledWith('temperature')
    expect(pinned()).toBe('temperature')
    expect(screen.getByRole('button', { name: 'Gevoel' }).getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('table')!.dataset.mode).toBe('temperature')
  })

  it('unpin on a click on Weer, and do nothing when nothing is pinned', () => {
    const { pinned, onTogglePin } = renderTable({ pinned: 'wind' })
    fireEvent.click(screen.getByRole('button', { name: 'Weer' }))
    expect(onTogglePin).toHaveBeenCalledWith('wind')
    expect(pinned()).toBeUndefined()
    expect(document.querySelector('table')!.dataset.mode).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: 'Weer' }))
    expect(onTogglePin).toHaveBeenCalledTimes(1)
  })
})

describe('forecast table cells', () => {
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
    expect(reading.getAttribute('aria-label')).toBe('Wind uit W, 2 Bft, stoten tot 29 km/u')
    const angle = Number(/rotate\(([\d.]+)deg\)/.exec(reading.querySelector<SVGElement>('.wind-arrow')!.style.transform)![1])
    expect(angle).toBeCloseTo(71.6, 1)
  })

  it('show the gust small behind the mean wind, in the chosen unit', () => {
    const [unit, setUnit] = createSignal<WindUnit>('bft')
    renderTable({ windUnit: unit })
    const reading = () => document.querySelector('.wind-reading')!
    const text = () => [...reading().querySelectorAll('b, small')].map((part) => part.textContent)
    expect(text()).toEqual(['2', 'Bft', '· 29'])
    setUnit('kn')
    expect(text()).toEqual(['6', 'kn', '· 16'])
    expect(reading().getAttribute('aria-label')).toBe('Wind uit W, 6 kn, stoten tot 16 kn')
    setUnit('ms')
    expect(text()).toEqual(['3', 'm/s', '· 8'])
  })
})

describe('history rows', () => {
  const withHistory = rows.map((row, index) => ({ ...row, kind: index < 2 ? 'past' as const : index === 2 ? 'now' as const : 'future' as const }))
  const times = () => [...document.querySelectorAll('tbody tr:not(.sun-row):not(.history-toggle-row) strong')].slice(0, 2).map((cell) => cell.textContent)

  it('fold behind a small toggle on touch', () => {
    renderTable({ rows: withHistory })
    expect(screen.getByRole('button', { name: 'Afgelopen 2 uur tonen' }).getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelectorAll('tr.past-hour')).toHaveLength(0)
  })

  it('stand inline above the now-row on desktop, without a toggle', () => {
    renderTable({ rows: withHistory, historyInline: true })
    expect(document.querySelector('.history-toggle')).toBeNull()
    expect(document.querySelectorAll('tr.past-hour')).toHaveLength(2)
    expect(times()).toEqual(withHistory.slice(0, 2).map((row) => new Date(row.epoch).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })))
  })
})

describe('sun rows', () => {
  it('draw the horizon glyph without an arrow; the text says rise or set', () => {
    renderTable()
    const sunRows = [...document.querySelectorAll('.sun-row')]
    expect(sunRows.map((row) => row.textContent?.replace(/\d\d:\d\d/, 'hh:mm'))).toEqual(['Zon op hh:mm', 'Zon onder hh:mm'])
    for (const row of sunRows) {
      expect(row.querySelector('.sun-glyph-disc')).not.toBeNull()
      expect(row.querySelectorAll('.sun-glyph path')).toHaveLength(2)
    }
  })
})
