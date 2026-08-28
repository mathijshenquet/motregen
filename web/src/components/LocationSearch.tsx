import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import { lookupLocation, suggestLocations, type PdokSuggestion } from '../core/pdok'

interface Props {
  onSelect: (location: { lng: number; lat: number }, label: string) => void
}

export default function LocationSearch(props: Props) {
  let timer: number | undefined
  let request: AbortController | undefined
  const [query, setQuery] = createSignal('')
  const [selectedLabel, setSelectedLabel] = createSignal('')
  const [suggestions, setSuggestions] = createSignal<PdokSuggestion[]>([])
  const [active, setActive] = createSignal(-1)
  const [message, setMessage] = createSignal('')
  const [open, setOpen] = createSignal(false)

  createEffect(() => {
    const value = query().trim()
    window.clearTimeout(timer)
    request?.abort()
    if (value === selectedLabel() || value.length < 2) {
      setSuggestions([])
      setOpen(false)
      setMessage('')
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
      setMessage(results.length ? '' : 'Geen locaties gevonden')
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
      setSelectedLabel(suggestion.label)
      setQuery(suggestion.label)
      setSuggestions([])
      setOpen(false)
      setMessage('')
      props.onSelect(location, suggestion.label)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setMessage('Deze locatie kon niet worden opgehaald')
      setOpen(true)
    }
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
      setOpen(false)
    }
  }

  return <div class="search">
    <span class="search-icon" aria-hidden="true">⌕</span>
    <input
      type="search"
      value={query()}
      onInput={(event) => { setSelectedLabel(''); setQuery(event.currentTarget.value) }}
      onFocus={() => { if (suggestions().length || message()) setOpen(true) }}
      onBlur={() => { timer = window.setTimeout(() => setOpen(false), 150) }}
      onKeyDown={keyDown}
      placeholder="Zoek plaats of adres"
      aria-label="Zoek plaats of adres"
      aria-autocomplete="list"
      aria-controls="location-results"
      aria-expanded={open()}
      aria-activedescendant={active() >= 0 ? `location-${active()}` : undefined}
    />
    <Show when={open()}>
      <div class="search-results" id="location-results" role="listbox">
        <For each={suggestions()}>{(suggestion, index) =>
          <button
            id={`location-${index()}`}
            role="option"
            aria-selected={index() === active()}
            classList={{ active: index() === active() }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void choose(suggestion)}
          >
            <span>{suggestion.label}</span><small>{suggestion.type}</small>
          </button>
        }</For>
        <Show when={message()}><p aria-live="polite">{message()}</p></Show>
      </div>
    </Show>
  </div>
}
