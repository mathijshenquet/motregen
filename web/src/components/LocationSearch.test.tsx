// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SavedPlace } from '../core/saved-places'
import LocationSearch from './LocationSearch'

afterEach(cleanup)

const home: SavedPlace = { id: 'home', name: 'Thuis', sourceLabel: 'De Bilt', lng: 5.18, lat: 52.1 }

function renderSearch(savedPlaces: SavedPlace[] = []) {
  const onLocate = vi.fn()
  const onRemove = vi.fn()
  const onSave = vi.fn()
  const onSelect = vi.fn()
  const onSelectSaved = vi.fn()
  render(() => <LocationSearch
    location={{ lng: 5.18, lat: 52.1 }}
    locationLabel="De Bilt"
    savedPlaces={savedPlaces}
    onLocate={onLocate}
    onRemove={onRemove}
    onSave={onSave}
    onSelect={onSelect}
    onSelectSaved={onSelectSaved}
  />)
  return { onLocate, onRemove, onSave, onSelect, onSelectSaved }
}

describe('location search', () => {
  it('opens quick locations on focus and prioritizes saved places', () => {
    const { onLocate } = renderSearch([home])
    fireEvent.focus(screen.getByRole('textbox', { name: 'Zoek plaats' }))

    const options = screen.getAllByRole('option')
    expect(options[0]!.textContent).toContain('Mijn locatie')
    expect(options[1]!.textContent).toContain('Thuis')
    fireEvent.click(options[0]!)
    expect(onLocate).toHaveBeenCalledOnce()
  })

  it('reports saved-place clicks separately from search selections', () => {
    const work: SavedPlace = { id: 'work', name: 'Werk', sourceLabel: 'Utrecht', lng: 5.12, lat: 52.09 }
    const { onSelect, onSelectSaved } = renderSearch([home, work])
    fireEvent.focus(screen.getByRole('textbox', { name: 'Zoek plaats' }))
    fireEvent.click(screen.getByRole('option', { name: /Werk/ }))

    expect(onSelectSaved).toHaveBeenCalledWith(work)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('saves the current place under a custom name', () => {
    const { onSave } = renderSearch()
    fireEvent.click(screen.getByRole('button', { name: 'Deze plaats opslaan' }))
    const name = screen.getByLabelText('Naam voor deze plaats')
    fireEvent.input(name, { target: { value: 'Werk' } })
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    expect(onSave).toHaveBeenCalledWith('Werk')
  })

  it('hides the input star for the current favorite and offers removal in the saved list', () => {
    const { onRemove } = renderSearch([home])
    expect(screen.queryByRole('button', { name: 'Deze plaats opslaan' })).toBeNull()
    fireEvent.focus(screen.getByRole('textbox', { name: 'Zoek plaats' }))
    fireEvent.click(screen.getByRole('button', { name: 'Thuis verwijderen uit opgeslagen plaatsen' }))
    expect(onRemove).toHaveBeenCalledWith('home')
  })
})
