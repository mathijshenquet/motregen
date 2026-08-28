import { Show } from 'solid-js'
import type { WeatherIconModel } from '../core/weather'

interface Props {
  model: WeatherIconModel
}

export default function WeatherIcon(props: Props) {
  const celestial = () => props.model.condition !== 'overcast'
  const clouds = () => props.model.condition !== 'clear'
  const rain = () => props.model.condition === 'rain' || props.model.condition === 'heavy-rain'
  return <svg class={`weather-icon ${props.model.condition} ${props.model.period}`} viewBox="0 0 36 30" role="img" aria-label={props.model.label}>
    <Show when={celestial() && props.model.period === 'day'}>
      <g class="weather-sun"><circle cx="11" cy="10" r="5" /><path d="M11 1v3M11 16v3M2 10h3M17 10h3M4.6 3.6l2.1 2.1M15.3 14.3l2.1 2.1M17.4 3.6l-2.1 2.1" /></g>
    </Show>
    <Show when={celestial() && props.model.period === 'night'}>
      <path class="weather-moon" d="M16.5 14.7A7 7 0 0 1 9.2 3.8a7.2 7.2 0 1 0 7.3 10.9Z" />
    </Show>
    <Show when={clouds()}>
      <path class="weather-cloud" d="M8 22.5h19.2a5.1 5.1 0 0 0 .2-10.2 8.1 8.1 0 0 0-15.2 2.2A4.1 4.1 0 0 0 8 22.5Z" />
    </Show>
    <Show when={rain()}>
      <g class="weather-rain"><path d="M12 25l-1 3M19 25l-1 3M26 25l-1 3" /><Show when={props.model.condition === 'heavy-rain'}><path d="M15.5 25l-1 3M22.5 25l-1 3" /></Show></g>
    </Show>
  </svg>
}
