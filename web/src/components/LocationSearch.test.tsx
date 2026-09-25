// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SavedPlace } from '../core/saved-places'
import LocationSearch from './LocationSearch'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const home: SavedPlace = { id: 'home', name: 'Thuis', sourceLabel: 'De Bilt', lng: 5.18, lat: 52.1 }

function renderSearch(savedPlaces: SavedPlace[] = []) {
  const onLocate = vi.fn()
  const onRemove = vi.fn()
  const onSave = vi.fn()
  const onSelect = vi.fn()
  const onSelectSaved = vi.fn()
  render(() => <LocationSearch
    location={{ lng: 5.18, lat: 52.1 }}
    mapCenter={() => ({ lng: 5.18, lat: 52.1 })}
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
    // Geen sectiekop: favorieten herken je aan hun ster.
    expect(screen.queryByText('Opgeslagen')).toBeNull()
    expect(options[1]!.querySelector('svg.lucide-star')).toBeTruthy()
    fireEvent.click(options[0]!)
    expect(onLocate).toHaveBeenCalledOnce()
  })

  it('draws its icons as decorative Lucide SVGs and keeps the labels on the buttons', () => {
    renderSearch([home])
    fireEvent.focus(screen.getByRole('textbox', { name: 'Zoek plaats' }))
    const icons = [...document.querySelectorAll('svg.lucide')]
    expect(icons.map((icon) => [...icon.classList].find((name) => name !== 'lucide' && name !== 'lucide-icon' && name.startsWith('lucide-')))).toEqual(
      ['lucide-search', 'lucide-x', 'lucide-locate-fixed', 'lucide-star', 'lucide-trash'],
    )
    for (const icon of icons) expect(icon.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByRole('button', { name: 'Thuis verwijderen uit opgeslagen plaatsen' }).querySelector('svg')?.getAttribute('width')).toBe('18')
  })

  it('reports saved-place clicks separately from search selections', () => {
    const work: SavedPlace = { id: 'work', name: 'Werk', sourceLabel: 'Utrecht', lng: 5.12, lat: 52.09 }
    const { onSelect, onSelectSaved } = renderSearch([home, work])
    fireEvent.focus(screen.getByRole('textbox', { name: 'Zoek plaats' }))
    fireEvent.click(screen.getByRole('option', { name: /Werk/ }))

    expect(onSelectSaved).toHaveBeenCalledWith(work)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('shows only the place in rest; the star to save it lives in the open panel', () => {
    const { onSave } = renderSearch()
    expect(screen.queryByRole('button', { name: 'Deze plaats opslaan' })).toBeNull()
    expect(document.querySelector('.search-sizer')!.textContent).toBe('De Bilt')
    fireEvent.focus(screen.getByRole('textbox', { name: 'Zoek plaats' }))
    fireEvent.click(screen.getByRole('button', { name: 'Deze plaats opslaan' }))
    const name = screen.getByLabelText('Naam voor deze plaats')
    fireEvent.input(name, { target: { value: 'Werk' } })
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    expect(onSave).toHaveBeenCalledWith('Werk')
  })

  it('hides the star for the current favorite and offers removal in the saved list', () => {
    const { onRemove } = renderSearch([home])
    fireEvent.focus(screen.getByRole('textbox', { name: 'Zoek plaats' }))
    expect(screen.queryByRole('button', { name: 'Deze plaats opslaan' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Thuis verwijderen uit opgeslagen plaatsen' }))
    expect(onRemove).not.toHaveBeenCalled()
    const confirm = screen.getByRole('group', { name: 'Thuis verwijderen?' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Nee' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ja' }))
    expect(onRemove).toHaveBeenCalledWith('home')
    expect(confirm.isConnected).toBe(false)
    expect(document.activeElement).toBe(screen.getByRole('listbox'))
  })

  it('cancels a removal with Nee or Escape and keeps the favorite', () => {
    const { onRemove } = renderSearch([home])
    fireEvent.focus(screen.getByRole('textbox', { name: 'Zoek plaats' }))
    const remove = () => screen.getByRole('button', { name: 'Thuis verwijderen uit opgeslagen plaatsen' })
    fireEvent.click(remove())
    fireEvent.click(screen.getByRole('button', { name: 'Nee' }))
    expect(screen.queryByRole('group', { name: 'Thuis verwijderen?' })).toBeNull()
    expect(document.activeElement).toBe(remove())
    fireEvent.click(remove())
    fireEvent.keyDown(screen.getByRole('button', { name: 'Nee' }), { key: 'Escape' })
    expect(screen.queryByRole('group', { name: 'Thuis verwijderen?' })).toBeNull()
    expect(screen.getByRole('option', { name: /Thuis/ })).toBeTruthy()
    expect(onRemove).not.toHaveBeenCalled()
  })

  it('clears the text with × first, then closes, and closes on Escape or a tap outside', () => {
    const { onSelect } = renderSearch()
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Zoek plaats' })
    // U34: openen begint met een leeg veld; getypte tekst wist × eerst, daarna sluit ×.
    fireEvent.focus(input)
    expect(input.value).toBe('')
    fireEvent.input(input, { target: { value: 'Ut' } })
    fireEvent.click(screen.getByRole('button', { name: 'Zoektekst wissen' }))
    expect(input.value).toBe('')
    expect(screen.getByRole('listbox')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Zoeken sluiten' }))
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(input.value).toBe('De Bilt')

    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()

    fireEvent.focus(input)
    const scrim = document.querySelector('.search-scrim')!
    const outside = new MouseEvent('pointerdown', { bubbles: true, cancelable: true })
    scrim.dispatchEvent(outside)
    expect(outside.defaultPrevented).toBe(true)
    fireEvent.click(scrim)
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('shows a Flemish municipality as "· BE" and selects it without a PDOK lookup', async () => {
    const fetch = vi.fn(async (input: URL | string) => {
      const url = String(input)
      if (url.includes('geo.api.vlaanderen.be')) return Response.json({ LocationResult: [
        { ID: 188, FormattedAddress: 'Gent', LocationType: 'basisregisters_gemeente', Location: { Lat_WGS84: 51.074, Lon_WGS84: 3.725 } },
      ] })
      return Response.json({ response: { docs: [{ id: 'wpl-sas', weergavenaam: 'Sas van Gent, Terneuzen, Zeeland', type: 'woonplaats' }] } })
    })
    vi.stubGlobal('fetch', fetch)
    const { onSelect } = renderSearch()
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Zoek plaats' })
    fireEvent.focus(input)
    fireEvent.input(input, { target: { value: 'Gent' } })

    const gent = await screen.findByRole('option', { name: /^Gent/ })
    expect(gent.querySelector('small')!.textContent).toBe('BE')
    expect(screen.getByRole('option', { name: /Sas van Gent/ }).querySelector('small')!.textContent).toBe('Terneuzen · Zeeland')
    fireEvent.click(gent)
    await vi.waitFor(() => expect(onSelect).toHaveBeenCalledWith({ lng: 3.725, lat: 51.074 }, 'Gent'))
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
