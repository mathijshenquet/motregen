// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TimelineFrame } from '../core/contract'
import HistogramScrubber from './HistogramScrubber'

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
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onCursor).toHaveBeenCalledWith(2)
    expect(container.querySelector('input[type="range"]')).toBeNull()
    expect(screen.getByText('Nu')).toBeTruthy()
    expect(screen.getByText('Nowcast')).toBeTruthy()
    expect(screen.getByText('Model')).toBeTruthy()
    expect(screen.getByText('Observaties')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Grafiektype' })).toBeNull()
    expect(container.querySelectorAll('.rain-bar')).toHaveLength(4)

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
    fireEvent.pointerEnter(slider, { clientX: 300, pointerId: 1, pointerType: 'mouse' })
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
    expect(screen.getByText('15u')).toBeTruthy()
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

    fireEvent.pointerEnter(slider, { clientX: 100, pointerId: 1, pointerType: 'mouse' })
    expect(onPlaying).toHaveBeenLastCalledWith(false)
    fireEvent.pointerLeave(slider, { clientX: 100, pointerId: 1, pointerType: 'mouse' })
    expect(onPlaying).toHaveBeenLastCalledWith(true)

    onPlaying.mockClear()
    fireEvent.pointerEnter(slider, { clientX: 100, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerUp(slider, { clientX: 100, pointerId: 1, pointerType: 'mouse' })
    expect(onPlaying.mock.calls).toEqual([[false], [true]])

    onPlaying.mockClear()
    fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerMove(slider, { clientX: 200, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerUp(slider, { clientX: 200, pointerId: 1, pointerType: 'mouse' })
    expect(onPlaying.mock.calls).toEqual([[false], [true]])
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
    expect(screen.getByText('Vandaag')).toBeTruthy()
    expect(screen.getByText('Morgen')).toBeTruthy()
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
})
