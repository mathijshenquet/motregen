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

describe('histogram scrubber', () => {
  it('is the only slider and supports keyboard scrubbing across visible regimes', () => {
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
      horizonHours={8}
      loading={false}
      locationLabel="Utrecht"
      onCursor={onCursor}
      onHorizonHours={() => undefined}
      onPlaying={() => undefined}
    />)

    const slider = screen.getByRole('slider', { name: 'Tijd' })
    expect(slider.getAttribute('aria-valuetext')).toMatch(/^vandaag \d\d:00, 1 mm\/u, licht, voorspelling$/)
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onCursor).toHaveBeenCalledWith(2)
    expect(container.querySelector('input[type="range"]')).toBeNull()
    expect(screen.getByText('Nu')).toBeTruthy()
    // the source strip is textless (titles only); the toolbar names the source under the cursor
    expect([...container.querySelectorAll('.regimes span')].map((zone) => zone.getAttribute('title'))).toEqual(['Observatie', 'Voorspelling'])
    expect(container.querySelector('.scrubber-source')!.textContent).toBe('Voorspelling')
    expect(screen.queryByRole('group', { name: 'Grafiektype' })).toBeNull()
    expect(container.querySelectorAll('.rain-bar')).toHaveLength(4)
    expect(container.querySelectorAll('.rain-bar.pending')).toHaveLength(1)

    Object.defineProperty(container.querySelector('.chart-plot')!, 'getBoundingClientRect', {
      value: () => ({ left: 100, width: 400, right: 500, top: 0, bottom: 180, height: 180, x: 100, y: 0, toJSON: () => undefined }),
    })
    let captured = false
    Object.assign(slider, {
      setPointerCapture: vi.fn(() => { captured = true }),
      hasPointerCapture: vi.fn(() => captured),
      releasePointerCapture: vi.fn(() => { captured = false }),
    })
    onCursor.mockClear()
    fireEvent.mouseEnter(slider, { clientX: 300 })
    fireEvent.pointerMove(slider, { clientX: 300, pointerId: 1, pointerType: 'mouse' })
    expect(onCursor).toHaveBeenLastCalledWith(2)

    onCursor.mockClear()
    fireEvent.pointerDown(slider, { clientX: 300, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerUp(slider, { clientX: 300, pointerId: 1, pointerType: 'mouse' })
    expect(onCursor).toHaveBeenLastCalledWith(2)
    onCursor.mockClear()
    fireEvent.pointerMove(slider, { clientX: 400, pointerId: 1, pointerType: 'mouse' })
    expect(onCursor).not.toHaveBeenCalled()

    fireEvent.pointerDown(slider, { clientX: 400, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerUp(slider, { clientX: 400, pointerId: 1, pointerType: 'mouse' })
    onCursor.mockClear()
    fireEvent.pointerMove(slider, { clientX: 200, pointerId: 1, pointerType: 'mouse' })
    expect(onCursor).toHaveBeenLastCalledWith(1)

    onCursor.mockClear()
    fireEvent.pointerDown(slider, { clientX: 200, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerMove(slider, { clientX: 300, pointerId: 1, pointerType: 'mouse' })
    expect(onCursor).toHaveBeenLastCalledWith(2)
    fireEvent.pointerUp(slider, { clientX: 350, pointerId: 1, pointerType: 'mouse' })
    expect(onCursor).toHaveBeenLastCalledWith(2.25)
    onCursor.mockClear()
    fireEvent.pointerMove(slider, { clientX: 400, pointerId: 1, pointerType: 'mouse' })
    expect(onCursor).not.toHaveBeenCalled()
    expect(screen.getByText('16u')).toBeTruthy()
    // the hour label under the now marker gives way to the "Nu" pill
    expect(screen.queryByText('15u')).toBeNull()
  })

  it('temporarily pauses autoplay for hover and drag interactions', () => {
    const onPlaying = vi.fn()
    const { container } = render(() => <HistogramScrubber
      timeline={[frame('2026-08-28T14:00:00Z', 'rtcor'), frame('2026-08-28T15:00:00Z', 'nowcast')]}
      values={[0, 1]}
      cursor={0}
      now={Date.parse('2026-08-28T14:00:00Z')}
      playing
      horizonHours={8}
      loading={false}
      locationLabel="Utrecht"
      onCursor={() => undefined}
      onHorizonHours={() => undefined}
      onPlaying={onPlaying}
    />)
    const slider = screen.getByRole('slider', { name: 'Tijd' })
    Object.defineProperty(container.querySelector('.chart-plot')!, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 400, right: 400, top: 0, bottom: 180, height: 180, x: 0, y: 0, toJSON: () => undefined }),
    })
    let captured = false
    Object.assign(slider, {
      setPointerCapture: vi.fn(() => { captured = true }),
      hasPointerCapture: vi.fn(() => captured),
      releasePointerCapture: vi.fn(() => { captured = false }),
    })

    fireEvent.mouseEnter(slider, { clientX: 100 })
    expect(onPlaying).toHaveBeenLastCalledWith(false)
    fireEvent.mouseLeave(slider, { clientX: 100 })
    expect(onPlaying).toHaveBeenLastCalledWith(true)

    onPlaying.mockClear()
    fireEvent.mouseEnter(slider, { clientX: 100 })
    fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerUp(slider, { clientX: 100, pointerId: 1, pointerType: 'mouse' })
    expect(onPlaying.mock.calls).toEqual([[false], [true]])

    onPlaying.mockClear()
    fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerMove(slider, { clientX: 200, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerUp(slider, { clientX: 200, pointerId: 1, pointerType: 'mouse' })
    expect(onPlaying.mock.calls).toEqual([[false], [true]])
  })

  it('damps touch scrubbing to a quarter once the finger leaves the plot vertically, without jumping', () => {
    const timeline = ['14', '15', '16', '17', '18'].map((hour) => frame(`2026-08-28T${hour}:00:00Z`, 'harmonie'))
    const [cursor, setCursor] = createSignal(0)
    const onCursor = vi.fn(setCursor)
    const { container } = render(() => <HistogramScrubber
      timeline={timeline}
      values={[0, 0, 0, 0, 0]}
      cursor={cursor()}
      now={timeline[0]!.epoch}
      playing={false}
      horizonHours={null}
      loading={false}
      locationLabel="Utrecht"
      onCursor={onCursor}
      onHorizonHours={() => undefined}
      onPlaying={() => undefined}
    />)
    const slider = screen.getByRole('slider', { name: 'Tijd' })
    Object.defineProperty(container.querySelector('.chart-plot')!, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 400, right: 400, top: 0, bottom: 180, height: 180, x: 0, y: 0, toJSON: () => undefined }),
    })
    let captured = false
    Object.assign(slider, {
      setPointerCapture: vi.fn(() => { captured = true }),
      hasPointerCapture: vi.fn(() => captured),
      releasePointerCapture: vi.fn(() => { captured = false }),
    })

    fireEvent.pointerDown(slider, { clientX: 0, clientY: 90, pointerId: 1, pointerType: 'touch' })
    fireEvent.pointerMove(slider, { clientX: 200, clientY: 90, pointerId: 1, pointerType: 'touch' })
    expect(onCursor).toHaveBeenLastCalledWith(2)
    fireEvent.pointerMove(slider, { clientX: 200, clientY: 160, pointerId: 1, pointerType: 'touch' })
    expect(onCursor).toHaveBeenLastCalledWith(2)
    expect(container.querySelector('.cursor-pill.fine')).toBeTruthy()
    fireEvent.pointerMove(slider, { clientX: 400, clientY: 160, pointerId: 1, pointerType: 'touch' })
    expect(onCursor).toHaveBeenLastCalledWith(2.5)
    fireEvent.pointerUp(slider, { clientX: 400, clientY: 160, pointerId: 1, pointerType: 'touch' })
    expect(onCursor).toHaveBeenLastCalledWith(2.5)
    expect(container.querySelector('.cursor-pill.fine')).toBeNull()
  })

  it('defaults to a bounded horizon and marks local day transitions', () => {
    const onHorizonHours = vi.fn()
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
      horizonHours={8}
      loading={false}
      locationLabel="Thuis"
      onCursor={() => undefined}
      onHorizonHours={onHorizonHours}
      onPlaying={() => undefined}
    />)

    expect(screen.getByRole('button', { name: '+8u' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '+3u' }))
    expect(onHorizonHours).toHaveBeenCalledWith(3)
    // Vandaag heeft geen label (de nu-lijn zegt het al), en geen lege pil.
    expect(screen.queryByText('Vandaag')).toBeNull()
    expect([...container.querySelectorAll('.day-grid span')].map((label) => label.textContent)).toEqual(['Morgen'])
    expect(container.querySelectorAll('.day-grid .boundary')).toHaveLength(1)
    expect(container.querySelectorAll('.rain-bar')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: '+24u' }))
    expect(onHorizonHours).toHaveBeenCalledWith(24)
  })

  it('covers stale rain values with a loading placeholder', () => {
    render(() => <HistogramScrubber
      timeline={[frame('2026-08-28T14:00:00Z', 'rtcor')]}
      values={[4]}
      cursor={0}
      now={Date.parse('2026-08-28T14:00:00Z')}
      playing={false}
      horizonHours={8}
      loading
      locationLabel="Utrecht · verwachting laden…"
      onCursor={() => undefined}
      onHorizonHours={() => undefined}
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
      horizonHours={null}
      loading={false}
      locationLabel="Utrecht"
      onCursor={() => undefined}
      onHorizonHours={() => undefined}
      onPlaying={() => undefined}
    />)
    const marker = container.querySelector<HTMLElement>('.now-line')!
    expect(marker.style.left).toBe('25%')
    setNow(Date.parse('2026-08-28T15:30:00Z'))
    expect(marker.style.left).toBe('75%')
  })
})
