// @vitest-environment jsdom
import { fireEvent, render, screen } from '@solidjs/testing-library'
import { describe, expect, it, vi } from 'vitest'
import type { TimelineFrame } from '../core/contract'
import HistogramScrubber from './HistogramScrubber'

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
      locationLabel="Utrecht"
      onCursor={onCursor}
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
    Object.assign(slider, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => false),
      releasePointerCapture: vi.fn(),
    })
    fireEvent.pointerMove(slider, { clientX: 300, pointerId: 1, pointerType: 'mouse' })
    expect(onCursor).toHaveBeenLastCalledWith(1.5)

    fireEvent.pointerDown(slider, { clientX: 300, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerUp(slider, { clientX: 300, pointerId: 1, pointerType: 'mouse' })
    onCursor.mockClear()
    fireEvent.pointerMove(slider, { clientX: 400, pointerId: 1, pointerType: 'mouse' })
    expect(onCursor).not.toHaveBeenCalled()

    fireEvent.pointerDown(slider, { clientX: 400, pointerId: 1, pointerType: 'mouse' })
    expect(onCursor).toHaveBeenLastCalledWith(2)
    fireEvent.pointerUp(slider, { clientX: 400, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerMove(slider, { clientX: 400, pointerId: 1, pointerType: 'mouse' })
    expect(onCursor).toHaveBeenLastCalledWith(2.25)
  })
})
