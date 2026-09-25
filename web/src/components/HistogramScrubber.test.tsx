// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TimelineFrame } from '../core/contract'
import HistogramScrubber, { hourLabelStep, stickyKeyframes, wallClamp } from './HistogramScrubber'

afterEach(cleanup)

function frame(time: string, source: TimelineFrame['source']): TimelineFrame {
  return {
    time,
    epoch: Date.parse(time),
    source,
    run: time,
    frameIndex: 0,
    chunk: { url: time, source, run: time, header_len: 8, times: [time] },
  }
}

describe('hour label step', () => {
  it('labels every hour when there is room and thins out so labels never touch', () => {
    expect(hourLabelStep(8, 330)).toBe(1)
    expect(hourLabelStep(10, 280)).toBe(2)
    expect(hourLabelStep(24, 330)).toBe(3)
    expect(hourLabelStep(50, 330)).toBe(6)
    expect(hourLabelStep(50, 1200)).toBe(2)
    for (const [span, width] of [[3, 200], [8, 280], [24, 330], [60, 330], [60, 900]] as const) {
      expect(width / (span / hourLabelStep(span, width))).toBeGreaterThanOrEqual(34)
    }
  })
})

// jsdom kent geen ResizeObserver: het plot blijft 320 px breed, dus 8 uur = 40 px per uur.
const PX_PER_HOUR = 40
// Langer dan het plot (23 u = 920 px), zodat de baan tussen de muren kan schuiven.
const day24 = () => Array.from({ length: 24 }, (_, hour) => frame(`2026-08-28T${String(hour).padStart(2, '0')}:00:00Z`, 'harmonie'))

function plotBounds(container: HTMLElement, left = 0): void {
  Object.defineProperty(container.querySelector('.chart-plot')!, 'getBoundingClientRect', {
    value: () => ({ left, width: 320, right: left + 320, top: 0, bottom: 180, height: 180, x: left, y: 0, toJSON: () => undefined }),
  })
}

function capturable(slider: HTMLElement): void {
  let captured = false
  Object.assign(slider, {
    setPointerCapture: vi.fn(() => { captured = true }),
    hasPointerCapture: vi.fn(() => captured),
    releasePointerCapture: vi.fn(() => { captured = false }),
  })
}

describe('wall clamp (U34)', () => {
  it('is exact away from the walls and stops at them, smoothly', () => {
    expect(wallClamp(-100, -500, 0, 40)).toBe(-100)
    expect(wallClamp(200, -500, 0, 40)).toBe(0)
    expect(wallClamp(-900, -500, 0, 40)).toBe(-500)
    // In de knie: tussen vrij en muur, en monotoon.
    const inKnee = [-60, -40, -20, 0, 20, 40, 60].map((value) => wallClamp(value, -500, 0, 40))
    expect(inKnee[0]).toBe(-60)
    expect(inKnee.at(-1)).toBe(0)
    for (let index = 1; index < inKnee.length; index++) expect(inKnee[index]!).toBeGreaterThanOrEqual(inKnee[index - 1]!)
    expect(wallClamp(0, -500, 0, 40)).toBeCloseTo(-10)
    // Past de tijdlijn in het plot: links uitgelijnd.
    expect(wallClamp(80, 0, 0, 40)).toBe(0)
  })
})

describe('sticky day label keyframes (U34)', () => {
  it('moves with the track, sticks at the inset, then is pushed out by the next day', () => {
    // Dag van baan-x 100 tot (label past tot) b = 300; verschuiving van 0 naar −400.
    const frames = stickyKeyframes({ label: 'MORGEN', a: 100, b: 300 }, 0, -400)
    expect(frames.map((frame) => [+frame.offset!.toFixed(3), frame.transform])).toEqual([
      [0, 'translateX(100px)'],
      [0.24, 'translateX(4px)'],
      [0.74, 'translateX(4px)'],
      [1, 'translateX(-100px)'],
    ])
  })
})

describe('histogram scrubber', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is the only slider, supports keyboard scrubbing and has no range buttons or time pill', () => {
    const onCursor = vi.fn()
    const timeline = [
      frame('2026-08-28T14:00:00Z', 'rtcor'),
      frame('2026-08-28T15:00:00Z', 'nowcast'),
      frame('2026-08-28T16:00:00Z', 'nowcast'),
      frame('2026-08-28T18:00:00Z', 'harmonie'),
    ]
    const { container } = render(() => <HistogramScrubber
      timeline={timeline}
      values={[0, 1, 4, 2]}
      loaded={[true, false, true, true]}
      cursor={1}
      now={Date.parse('2026-08-28T15:00:00Z')}
      playing={false}
      loading={false}
      locationLabel="Utrecht"
      onCursor={onCursor}
      onPlaying={() => undefined}
    />)

    const slider = screen.getByRole('slider', { name: 'Tijd' })
    expect(slider.getAttribute('aria-valuetext')).toMatch(/^vandaag \d\d:00, 1 mm\/u, licht, voorspelling$/)
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onCursor).toHaveBeenCalledWith(2)
    fireEvent.keyDown(slider, { key: 'End' })
    expect(onCursor).toHaveBeenLastCalledWith(3)
    expect(container.querySelector('input[type="range"]')).toBeNull()
    expect(screen.getByText('Nu')).toBeTruthy()
    expect(container.querySelector('.regimes')).toBeNull()
    expect(container.querySelector('.scrubber-source')).toBeNull()
    // U34: geen tijdsbereikknoppen en geen pil boven de cursor.
    expect(screen.queryByRole('group', { name: 'Tijdsbereik' })).toBeNull()
    expect(container.querySelector('.cursor-pill')).toBeNull()
    expect(container.querySelectorAll('.rain-bar')).toHaveLength(4)
    expect(container.querySelectorAll('.rain-bar.pending')).toHaveLength(1)
  })

  it('keeps the cursor fixed at a third of the width and slides the timeline under it', () => {
    const timeline = day24()
    const [cursor, setCursor] = createSignal(4)
    const { container } = render(() => <HistogramScrubber
      timeline={timeline}
      values={timeline.map(() => 0)}
      cursor={cursor()}
      now={timeline[0]!.epoch}
      playing={false}
      loading={false}
      locationLabel="Utrecht"
      onCursor={setCursor}
      onPlaying={() => undefined}
    />)
    const track = container.querySelector<HTMLElement>('.chart-track')!
    const offset = () => Number(/translateX\((-?[\d.]+)px\)/.exec(track.style.transform)![1])
    const marker = container.querySelector<HTMLElement>('.cursor-marker')!
    expect(offset()).toBeCloseTo(320 / 3 - 4 * PX_PER_HOUR)
    expect(Number.parseFloat(marker.style.left)).toBeCloseTo(320 / 3)
    setCursor(10)
    expect(offset()).toBeCloseTo(320 / 3 - 10 * PX_PER_HOUR)
    // Aan het begin loopt de baan tegen de muur en beweegt de cursor naar links (U34).
    setCursor(0)
    expect(offset()).toBe(0)
    expect(Number.parseFloat(marker.style.left)).toBe(0)
    // Aan het eind idem naar rechts: de baan staat stil met zijn einde op de rechterrand.
    setCursor(23)
    expect(offset()).toBeCloseTo(320 - 23 * PX_PER_HOUR)
    expect(Number.parseFloat(marker.style.left)).toBeCloseTo(320)
  })

  it('scrolls the timeline by dragging: dragging left moves the cursor into the future', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn())
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const timeline = ['14', '15', '16', '17', '18'].map((hour) => frame(`2026-08-28T${hour}:00:00Z`, 'harmonie'))
    const [cursor, setCursor] = createSignal(0)
    const onCursor = vi.fn(setCursor)
    const { container } = render(() => <HistogramScrubber
      timeline={timeline}
      values={[0, 0, 0, 0, 0]}
      cursor={cursor()}
      now={timeline[0]!.epoch}
      playing={false}
      loading={false}
      locationLabel="Utrecht"
      onCursor={onCursor}
      onPlaying={() => undefined}
    />)
    const slider = screen.getByRole('slider', { name: 'Tijd' })
    plotBounds(container)
    capturable(slider)

    fireEvent.pointerDown(slider, { clientX: 300, pointerId: 1, pointerType: 'touch' })
    fireEvent.pointerMove(slider, { clientX: 220, pointerId: 1, pointerType: 'touch' })
    expect(onCursor).toHaveBeenLastCalledWith(2)
    fireEvent.pointerMove(slider, { clientX: 100, pointerId: 1, pointerType: 'touch' })
    expect(onCursor).toHaveBeenLastCalledWith(4)
    // Voorbij het einde blijft de cursor op het laatste frame.
    fireEvent.pointerMove(slider, { clientX: -200, pointerId: 1, pointerType: 'touch' })
    expect(onCursor).toHaveBeenLastCalledWith(4)
    fireEvent.pointerUp(slider, { clientX: -200, pointerId: 1, pointerType: 'touch' })
  })

  it('glides to the tapped moment and pauses autoplay until 4 s after interacting', () => {
    vi.useFakeTimers()
    const timeline = day24()
    const onCursor = vi.fn()
    const onPlaying = vi.fn()
    const { container } = render(() => <HistogramScrubber
      timeline={timeline}
      values={timeline.map(() => 0)}
      cursor={4}
      now={timeline[0]!.epoch}
      playing
      loading={false}
      locationLabel="Utrecht"
      onCursor={onCursor}
      onPlaying={onPlaying}
    />)
    const slider = screen.getByRole('slider', { name: 'Tijd' })
    plotBounds(container, 100)
    capturable(slider)

    const tapX = 100 + 320 / 3 + 2 * PX_PER_HOUR
    fireEvent.pointerDown(slider, { clientX: tapX, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerUp(slider, { clientX: tapX, pointerId: 1, pointerType: 'mouse' })
    expect(onCursor).toHaveBeenLastCalledWith(6)
    expect(onPlaying.mock.calls).toEqual([[false]])
    vi.advanceTimersByTime(4_000)
    expect(onPlaying.mock.calls).toEqual([[false], [true]])
    vi.useRealTimers()
    // Spatie schakelt afspelen/pauzeren (er is geen afspeelknop meer).
    fireEvent.keyDown(slider, { key: ' ' })
    expect(onPlaying).toHaveBeenLastCalledWith(false)
    expect(slider.hasAttribute('data-playing')).toBe(true)
  })

  it('pauses autoplay while the wheel scrolls and resumes 4 s after the last wheel step', () => {
    vi.useFakeTimers()
    try {
      const timeline = ['14', '15', '16', '17', '18'].map((hour) => frame(`2026-08-28T${hour}:00:00Z`, 'harmonie'))
      const onCursor = vi.fn()
      const onPlaying = vi.fn()
      render(() => <HistogramScrubber
        timeline={timeline}
        values={[0, 0, 0, 0, 0]}
        cursor={0}
        now={timeline[0]!.epoch}
        playing
        loading={false}
        locationLabel="Utrecht"
        onCursor={onCursor}
        onPlaying={onPlaying}
      />)
      const slider = screen.getByRole('slider', { name: 'Tijd' })
      fireEvent.wheel(slider, { deltaY: PX_PER_HOUR })
      expect(onCursor).toHaveBeenLastCalledWith(1)
      expect(onPlaying.mock.calls).toEqual([[false]])
      vi.advanceTimersByTime(3_000)
      fireEvent.wheel(slider, { deltaY: PX_PER_HOUR })
      vi.advanceTimersByTime(3_900)
      expect(onPlaying.mock.calls).toEqual([[false]])
      vi.advanceTimersByTime(200)
      expect(onPlaying.mock.calls).toEqual([[false], [true]])
    } finally {
      vi.useRealTimers()
    }
  })

  it('always shows the three cloud layers with the rain histogram on top; the cloud mode adds the layer values (U34)', () => {
    const timeline = ['14', '15', '16', '17', '18'].map((hour) => frame(`2026-08-28T${hour}:00:00Z`, 'harmonie'))
    const layers = { timeline: { high: timeline, mid: timeline, low: timeline }, values: { high: [80, 80, 80, 80, 80], mid: [60, 60, 60, 60, 60], low: [0, 0, 0, 0, 0] } }
    const [mix, setMix] = createSignal({ wind: 0, clouds: 0, temperature: 0 })
    const { container } = render(() => <HistogramScrubber
      timeline={timeline}
      values={[0, 2, 2, 2, 0]}
      cursor={0}
      now={timeline[0]!.epoch}
      playing={false}
      loading={false}
      locationLabel="Utrecht"
      onCursor={() => undefined}
      onPlaying={() => undefined}
      clouds={layers}
      mix={mix()}
    />)
    const slider = screen.getByRole('slider', { name: 'Tijd' })
    expect(slider.getAttribute('data-scrubber-view')).toBe('rain')
    expect([...container.querySelectorAll('.cloud-band')].map((band) => band.getAttribute('data-layer'))).toEqual(['high', 'mid', 'low'])
    // Regen op volle breedte over de lagen heen.
    const bar = container.querySelector<SVGRectElement>('.rain-bar')!
    expect(Number(bar.getAttribute('width'))).toBeGreaterThan(PX_PER_HOUR * 0.9)
    expect(container.querySelector('.cursor-tags')).toBeNull()

    setMix({ wind: 0, clouds: 1, temperature: 0 })
    expect(slider.getAttribute('data-scrubber-view')).toBe('clouds')
    expect(container.querySelectorAll('.rain-bar').length).toBeGreaterThan(0)
    // Waarden per laag bij de cursor; een lege laag (0 %) krijgt geen label.
    expect([...container.querySelectorAll('.cursor-tags span')].map((label) => label.textContent)).toEqual(['hoogwolken 80%', 'middenwolken 60%'])
  })

  it('cross-fades to the wind chart on the wind focus, with the reading in the chosen unit (U34)', () => {
    const timeline = day24()
    const [mix, setMix] = createSignal({ wind: 0, clouds: 0, temperature: 0 })
    const { container } = render(() => <HistogramScrubber
      timeline={timeline}
      values={timeline.map(() => 1)}
      cursor={4}
      now={timeline[0]!.epoch}
      playing={false}
      loading={false}
      locationLabel="Utrecht"
      onCursor={() => undefined}
      onPlaying={() => undefined}
      wind={{ timeline, speed: timeline.map(() => 5), gustTimeline: timeline, gust: timeline.map(() => 12.5), unit: 'bft' }}
      mix={mix()}
    />)
    const slider = screen.getByRole('slider', { name: 'Tijd' })
    expect(slider.getAttribute('data-scrubber-view')).toBe('rain')
    expect(container.querySelector('[data-testid="wind-chart"]')).toBeNull()
    setMix({ wind: 0.3, clouds: 0, temperature: 0 })
    const chart = container.querySelector<SVGGElement>('[data-testid="wind-chart"]')!
    expect(Number(chart.style.opacity)).toBeCloseTo(0.3)
    expect(Number((container.querySelector<SVGGElement>('.rain-bars')!).style.opacity)).toBeCloseTo(0.7)
    setMix({ wind: 1, clouds: 0, temperature: 0 })
    expect(slider.getAttribute('data-scrubber-view')).toBe('wind')
    expect(container.querySelector('.wind-area')!.getAttribute('d')).toMatch(/^M/)
    // 5 m/s = 3 Bft, vlaag 12,5 m/s = 6 Bft.
    // Twee puntjes (U34): gemiddelde wind en de vlaag, die als band op de gemiddelde wind ligt.
    expect([...container.querySelectorAll('.cursor-readout span')].map((span) => span.textContent)).toEqual(['3 Bft', '6 Bft'])
    expect(container.querySelector('.wind-gust-band')!.getAttribute('d')).toMatch(/Z$/)
    expect(container.querySelector('.wind-guide, .wind-labels')).toBeNull()
  })

  it('renders with every series the app passes and shows the temperature chart on the temperature focus (U34)', () => {
    const timeline = day24()
    const [mix, setMix] = createSignal({ wind: 0, clouds: 0, temperature: 0 })
    const { container } = render(() => <HistogramScrubber
      timeline={timeline}
      values={timeline.map(() => 0)}
      cursor={4}
      now={timeline[0]!.epoch}
      playing={false}
      loading={false}
      locationLabel="Utrecht"
      onCursor={() => undefined}
      onPlaying={() => undefined}
      clouds={{ timeline: { high: timeline, mid: timeline, low: timeline }, values: { high: timeline.map(() => 50), mid: timeline.map(() => 50), low: timeline.map(() => 50) } }}
      cloudCover={{ timeline, values: timeline.map(() => 60) }}
      wind={{ timeline, speed: timeline.map(() => 5), gustTimeline: timeline, gust: timeline.map(() => 9), unit: 'kmh' }}
      temperature={{ timeline, values: timeline.map((_, hour) => 10 + hour / 4), airTimeline: timeline, air: timeline.map((_, hour) => 12 + hour / 4) }}
      mix={mix()}
    />)
    const slider = screen.getByRole('slider', { name: 'Tijd' })
    expect(slider.getAttribute('data-scrubber-view')).toBe('cover')
    setMix({ wind: 0, clouds: 0, temperature: 1 })
    expect(slider.getAttribute('data-scrubber-view')).toBe('temperature')
    expect(container.querySelector('[data-testid="temperature-chart"] .temperature-area')).not.toBeNull()
    // Gevoel en lucht als twee puntjes (U34).
    expect([...container.querySelectorAll('.cursor-readout span')].map((span) => span.textContent)).toEqual(['11° gevoel', '13° lucht'])
    expect(container.querySelector('.temperature-air-line')).not.toBeNull()
    expect(container.querySelector('.temperature-ribbon')!.getAttribute('d')).toMatch(/Z$/)
  })

  it('marks local day transitions', () => {
    const timeline = [
      frame('2026-08-31T20:00:00Z', 'rtcor'),
      frame('2026-08-31T21:00:00Z', 'nowcast'),
      frame('2026-09-01T00:00:00Z', 'harmonie'),
      frame('2026-09-01T05:00:00Z', 'harmonie'),
      frame('2026-09-01T06:00:00Z', 'harmonie'),
    ]
    const { container } = render(() => <HistogramScrubber
      timeline={timeline}
      values={[0, 1, 2, 3, 4]}
      cursor={1}
      now={Date.parse('2026-08-31T21:00:00Z')}
      playing={false}
      loading={false}
      locationLabel="Thuis"
      onCursor={() => undefined}
      onPlaying={() => undefined}
    />)

    // Daglabels plakken links in het plot (U34): vandaag vanaf het begin, morgen vanaf middernacht.
    expect([...container.querySelectorAll('.day-labels span')].map((label) => label.textContent)).toEqual(['Vandaag', 'Morgen'])
    expect(container.querySelectorAll('.day-grid .boundary')).toHaveLength(1)
    // De hele tijdlijn staat in de schuivende baan, ook buiten de 8 uur in beeld.
    expect(container.querySelectorAll('.rain-bar')).toHaveLength(5)
  })

  it('covers stale rain values with a loading placeholder', () => {
    render(() => <HistogramScrubber
      timeline={[frame('2026-08-28T14:00:00Z', 'rtcor')]}
      values={[4]}
      cursor={0}
      now={Date.parse('2026-08-28T14:00:00Z')}
      playing={false}
      loading
      locationLabel="Utrecht · verwachting laden…"
      onCursor={() => undefined}
      onPlaying={() => undefined}
    />)
    expect(screen.getByRole('status').textContent).toContain('Regenverwachting laden…')
    expect(screen.getByRole('slider', { name: 'Tijd' }).getAttribute('aria-disabled')).toBe('true')
  })

  it('moves the now marker when a refreshed manifest advances now', () => {
    const timeline = [
      frame('2026-08-28T14:00:00Z', 'rtcor'),
      frame('2026-08-28T15:00:00Z', 'nowcast'),
      frame('2026-08-28T16:00:00Z', 'harmonie'),
    ]
    const [now, setNow] = createSignal(Date.parse('2026-08-28T14:30:00Z'))
    const { container } = render(() => <HistogramScrubber
      timeline={timeline}
      values={[0, 1, 2]}
      cursor={1}
      now={now()}
      playing={false}
      loading={false}
      locationLabel="Utrecht"
      onCursor={() => undefined}
      onPlaying={() => undefined}
    />)
    const marker = container.querySelector<HTMLElement>('.now-line')!
    expect(marker.style.left).toBe(`${PX_PER_HOUR / 2}px`)
    setNow(Date.parse('2026-08-28T15:30:00Z'))
    expect(marker.style.left).toBe(`${PX_PER_HOUR * 1.5}px`)
  })
})
