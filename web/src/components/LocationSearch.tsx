import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js'
import { lookupLocation, suggestLocations, type PdokSuggestion } from '../core/pdok'
import { samePlace, type SavedPlace } from '../core/saved-places'

interface Props {
  location: { lng: number; lat: number }
  locationLabel: string
  savedPlaces: SavedPlace[]
  onLocate: () => void
  onRemove: (id: string) => void
  onSave: (name: string) => void
  onSelect: (location: { lng: number; lat: number }, label: string) => void
}

export default function LocationSearch(props: Props) {
  let timer: number | undefined
  let request: AbortController | undefined
  let nameInput: HTMLInputElement | undefined
  const [query, setQuery] = createSignal('')
  const [selectedLabel, setSelectedLabel] = createSignal('')
  const [suggestions, setSuggestions] = createSignal<PdokSuggestion[]>([])
  const [active, setActive] = createSignal(-1)
  const [message, setMessage] = createSignal('')
  const [open, setOpen] = createSignal(false)
  const [focused, setFocused] = createSignal(false)
  const [editingName, setEditingName] = createSignal(false)
  const [customName, setCustomName] = createSignal('')
  const savedCurrent = createMemo(() => props.savedPlaces.find((place) => samePlace(place, props.location)))
  const visibleSaved = createMemo(() => {
    const value = query().trim().toLocaleLowerCase('nl-NL')
    if (!value || value === selectedLabel().toLocaleLowerCase('nl-NL')) return props.savedPlaces
    return props.savedPlaces.filter((place) => `${place.name} ${place.sourceLabel}`.toLocaleLowerCase('nl-NL').includes(value))
  })

  createEffect(() => {
    setSelectedLabel(props.locationLabel)
    setQuery(props.locationLabel)
    setSuggestions([])
    setEditingName(false)
    setOpen(false)
  })

  createEffect(() => {
    const value = query().trim()
    window.clearTimeout(timer)
    request?.abort()
    if (value === selectedLabel() || value.length < 2) {
      setSuggestions([])
      setActive(-1)
      setMessage('')
      if (!focused()) setOpen(false)
      return
    }
    setMessage('Zoeken…')
    timer = window.setTimeout(() => void search(value), 250)
  })

  onCleanup(() => { window.clearTimeout(timer); request?.abort() })

  async function search(value: string): Promise<void> {
    request = new AbortController()
    try {
      const results = await suggestLocations(value, request.signal)
      if (query().trim() !== value) return
      setSuggestions(results)
      setActive(results.length ? 0 : -1)
      setMessage(results.length ? '' : 'Geen plaatsen gevonden')
      setOpen(true)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setSuggestions([])
      setMessage('Zoeken is nu niet beschikbaar')
      setOpen(true)
    }
  }

  async function choose(suggestion: PdokSuggestion): Promise<void> {
    request?.abort()
    request = new AbortController()
    setMessage('Locatie ophalen…')
    try {
      const location = await lookupLocation(suggestion.id, request.signal)
      commitSelection(location, suggestion.label)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setMessage('Deze locatie kon niet worden opgehaald')
      setOpen(true)
    }
  }

  function commitSelection(location: { lng: number; lat: number }, label: string): void {
    setSelectedLabel(label)
    setQuery(label)
    setSuggestions([])
    setOpen(false)
    setMessage('')
    props.onSelect(location, label)
  }

  function keyDown(event: KeyboardEvent): void {
    const results = suggestions()
    if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault(); setActive((value) => (value + 1 + results.length) % results.length); setOpen(true)
    } else if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault(); setActive((value) => (value - 1 + results.length) % results.length); setOpen(true)
    } else if (event.key === 'Enter' && results.length) {
      event.preventDefault(); void choose(results[Math.max(0, active())]!)
    } else if (event.key === 'Escape') {
      setEditingName(false)
      setOpen(false)
    }
  }

  function startSaving(): void {
    setCustomName(props.locationLabel)
    setEditingName(true)
    setOpen(true)
    window.requestAnimationFrame(() => nameInput?.select())
  }

  function save(event: SubmitEvent): void {
    event.preventDefault()
    const name = customName().trim()
    if (!name) return
    props.onSave(name)
    setEditingName(false)
  }

  return <div
    class="search"
    classList={{ 'saved-current': Boolean(savedCurrent()) }}
    onFocusIn={() => { window.clearTimeout(timer); setFocused(true) }}
    onFocusOut={(event) => {
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
      setFocused(false)
      timer = window.setTimeout(() => { setOpen(false); setEditingName(false) }, 100)
    }}
  >
    <span class="search-icon" aria-hidden="true">⌕</span>
    <input
      type="text"
      inputMode="search"
      value={query()}
      onInput={(event) => { setSelectedLabel(''); setQuery(event.currentTarget.value); setOpen(true) }}
      onFocus={() => setOpen(true)}
      onKeyDown={keyDown}
      placeholder="Zoek plaats"
      aria-label="Zoek plaats"
      aria-autocomplete="list"
      aria-controls="location-results"
      aria-expanded={open()}
      aria-activedescendant={active() >= 0 ? `location-${active()}` : undefined}
    />
    <Show when={!savedCurrent()}><button
      class="save-place"
      type="button"
      onClick={startSaving}
      disabled={!selectedLabel()}
      aria-label="Deze plaats opslaan"
      title="Plaats opslaan"
    >☆</button></Show>
    <Show when={open()}>
      <div class="search-results" id="location-results" role="listbox">
        <button class="quick-location" role="option" aria-selected="false" onClick={() => { setOpen(false); props.onLocate() }}>
          <span><b aria-hidden="true">⌖</b> Mijn locatie</span><small>apparaat</small>
        </button>
        <Show when={visibleSaved().length}>
          <p class="search-section-label">Opgeslagen</p>
          <For each={visibleSaved()}>{(place) =>
            <div class="saved-location-row">
              <button class="saved-location" role="option" aria-selected={samePlace(place, props.location)} onClick={() => commitSelection(place, place.name)}>
                <span><b aria-hidden="true">★</b> {place.name}</span><small>{place.sourceLabel === place.name ? 'opgeslagen' : place.sourceLabel}</small>
              </button>
              <button class="remove-saved" type="button" onClick={() => props.onRemove(place.id)} aria-label={`${place.name} verwijderen uit opgeslagen plaatsen`} title="Verwijderen">×</button>
            </div>
          }</For>
        </Show>
        <Show when={editingName()}>
          <form class="save-place-editor" onSubmit={save}>
            <label for="saved-place-name">Naam voor deze plaats</label>
            <div><input ref={nameInput} id="saved-place-name" value={customName()} maxlength="80" onInput={(event) => setCustomName(event.currentTarget.value)} /><button type="submit">Opslaan</button></div>
          </form>
        </Show>
        <Show when={suggestions().length}><p class="search-section-label">Plaatsen</p></Show>
        <For each={suggestions()}>{(suggestion, index) =>
          <button
            id={`location-${index()}`}
            role="option"
            aria-selected={index() === active()}
            classList={{ active: index() === active() }}
            onClick={() => void choose(suggestion)}
          >
            <span>{suggestion.label}</span><small>{suggestion.detail ?? suggestion.type}</small>
          </button>
        }</For>
        <Show when={message()}><p class="search-message" aria-live="polite">{message()}</p></Show>
      </div>
    </Show>
  </div>
}
