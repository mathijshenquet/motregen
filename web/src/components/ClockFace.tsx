import { Show, type JSX } from 'solid-js'

export default function ClockFace(props: { time: string; day?: string; children?: JSX.Element }) {
  return <span class="clock-main">
    {props.children}
    <strong class="clock-map-time">{props.time}</strong>
    <Show when={props.day}><small class="clock-day">{props.day}</small></Show>
  </span>
}
