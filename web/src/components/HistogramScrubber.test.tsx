// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TimelineFrame } from '../core/contract'
import HistogramScrubber, { hourLabelStep } from './HistogramScrubber'

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
    const timeline = ['14', '15', '16', '17', '18'].map((hour) => frame(`2026-08-28T${hour}:00:00Z`, 'harmonie'))
    const [cursor, setCursor] = createSignal(1)
    const { container } = render(() => <HistogramScrubber
      timeline={timeline}
      values={[0, 0, 0, 0, 0]}
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
    expect(offset()).toBeCloseTo(320 / 3 - PX_PER_HOUR)
    setCursor(3)
    expect(offset()).toBeCloseTo(320 / 3 - 3 * PX_PER_HOUR)
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

  it('glides to the tapped moment and pauses autoplay only while interacting', () => {
    const timeline = ['14', '15', '16', '17', '18'].map((hour) => frame(`2026-08-28T${hour}:00:00Z`, 'harmonie'))
    const onCursor = vi.fn()
    const onPlaying = vi.fn()
    const { container } = render(() => <HistogramScrubber
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
    plotBounds(container, 100)
    capturable(slider)

    const tapX = 100 + 320 / 3 + 2 * PX_PER_HOUR
    fireEvent.pointerDown(slider, { clientX: tapX, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerUp(slider, { clientX: tapX, pointerId: 1, pointerType: 'mouse' })
    expect(onCursor).toHaveBeenLastCalledWith(2)
    expect(onPlaying.mock.calls).toEqual([[false], [true]])
    // Spatie schakelt afspelen/pauzeren (er is geen afspeelknop meer).
    fireEvent.keyDown(slider, { key: ' ' })
    expect(onPlaying).toHaveBeenLastCalledWith(false)
    expect(slider.hasAttribute('data-playing')).toBe(true)
  })

  it('pauses autoplay while the wheel scrolls and resumes shortly after the last wheel step', () => {
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
      vi.advanceTimersByTime(500)
      fireEvent.wheel(slider, { deltaY: PX_PER_HOUR })
      vi.advanceTimersByTime(500)
      expect(onPlaying.mock.calls).toEqual([[false]])
      vi.advanceTimersByTime(400)
      expect(onPlaying.mock.calls).toEqual([[false], [true]])
    } finally {
      vi.useRealTimers()
    }
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

    expect([...container.querySelectorAll('.day-grid span')].map((label) => label.textContent)).toEqual(['Morgen'])
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
