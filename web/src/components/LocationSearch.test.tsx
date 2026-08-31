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
  render(() => <LocationSearch
    location={{ lng: 5.18, lat: 52.1 }}
    locationLabel="De Bilt"
    savedPlaces={savedPlaces}
    onLocate={onLocate}
    onRemove={onRemove}
    onSave={onSave}
    onSelect={() => undefined}
  />)
  return { onLocate, onRemove, onSave }
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

  it('saves the current place under a custom name', () => {
    const { onSave } = renderSearch()
    fireEvent.click(screen.getByRole('button', { name: 'Deze plaats opslaan' }))
    const name = screen.getByLabelText('Naam voor deze plaats')
    fireEvent.input(name, { target: { value: 'Werk' } })
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    expect(onSave).toHaveBeenCalledWith('Werk')
  })

  it('removes the saved version of the current place from the filled star', () => {
    const { onRemove } = renderSearch([home])
    fireEvent.click(screen.getByRole('button', { name: 'Thuis verwijderen uit opgeslagen plaatsen' }))
    expect(onRemove).toHaveBeenCalledWith('home')
  })
})
