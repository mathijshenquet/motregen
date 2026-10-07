import { describe, expect, it } from 'vitest'
import { canPlay, clampPlaybackCursor, playbackReach } from './playback-gate'

const loaded = (...indexes: number[]) => (index: number) => indexes.includes(index)

describe('speelregel: cursorframe plus het volgende frame', () => {
  it('speelt zodra het cursorframe en het volgende er zijn, ook als de rest nog ontbreekt', () => {
    expect(canPlay(4, 1, 10, loaded(4, 5))).toBe(true)
    expect(playbackReach(4, 1, 10, loaded(4, 5))).toEqual({ limit: 5, waitingFor: 6 })
  })

  it('wacht op het volgende frame als alleen het cursorframe er is', () => {
    expect(canPlay(4, 1, 10, loaded(4))).toBe(false)
    expect(playbackReach(4, 1, 10, loaded(4))).toEqual({ limit: 4, waitingFor: 5 })
  })

  it('wacht op het cursorframe zelf als dat ontbreekt, ook al zijn latere frames er', () => {
    expect(canPlay(4, 1, 10, loaded(5, 6))).toBe(false)
    expect(playbackReach(4, 1, 10, loaded(5, 6))).toEqual({ limit: 4, waitingFor: 4 })
  })

  it('loopt door tot het eerste gat en noemt dat frame', () => {
    expect(playbackReach(2.4, 1, 10, loaded(2, 3, 4, 5, 7))).toEqual({ limit: 5, waitingFor: 6 })
  })

  it('laat een cursor tussen twee geladen frames staan waar hij is als het frame erna ontbreekt', () => {
    expect(playbackReach(2.4, 1, 10, loaded(2))).toEqual({ limit: 2.4, waitingFor: 3 })
    expect(canPlay(2.4, 1, 10, loaded(2))).toBe(false)
  })

  it('kent geen wachtframe als de geladen reeks het eind van de tijdlijn haalt', () => {
    expect(playbackReach(7, 1, 10, loaded(7, 8, 9))).toEqual({ limit: 9, waitingFor: null })
    expect(canPlay(9, 1, 10, loaded(9))).toBe(true)
  })

  it('werkt gespiegeld in de terugrichting', () => {
    expect(playbackReach(6.5, -1, 10, loaded(7, 6, 5, 3))).toEqual({ limit: 5, waitingFor: 4 })
    expect(canPlay(6.5, -1, 10, loaded(7, 6))).toBe(true)
    expect(canPlay(6, -1, 10, loaded(6))).toBe(false)
    expect(playbackReach(1, -1, 10, loaded(1, 0))).toEqual({ limit: 0, waitingFor: null })
  })

  it('houdt een lege tijdlijn en een cursor buiten bereik heel', () => {
    expect(playbackReach(3, 1, 0, () => true)).toEqual({ limit: 3, waitingFor: null })
    expect(playbackReach(42, 1, 10, loaded(9))).toEqual({ limit: 9, waitingFor: null })
  })

  it('zet de gewenste cursor terug op het bereik', () => {
    const reach = playbackReach(4, 1, 10, loaded(4, 5))
    expect(clampPlaybackCursor(4.3, reach, 1)).toBe(4.3)
    expect(clampPlaybackCursor(5.8, reach, 1)).toBe(5)
    expect(clampPlaybackCursor(2.1, playbackReach(4, -1, 10, loaded(4, 3)), -1)).toBe(3)
  })
})
