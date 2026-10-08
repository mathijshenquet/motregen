import { createSignal, For, onCleanup, onMount } from 'solid-js'

// Diagnose achter ?dev (U62, eigenaar U62, vervalt zodra de adresbalkbug op Firefox Android is opgelost):
// toont live wat de browser over het scherm en de scroll zegt, zodat een schermbeeld in de bugtoestand de
// oorzaak laat zien in plaats van dat we ernaar raden.

interface Props {
  /** Hoeveel het tabelpaneel is verlengd omdat de pagina eindigde vóór het paneel bovenaan stond. */
  shortfallPx: () => number
}

const UNITS = ['dvh', 'svh', 'lvh', 'vh'] as const

export default function ViewportDiagnose(props: Props) {
  const [rows, setRows] = createSignal<Array<[string, string]>>([])
  let probes: HTMLDivElement[] = []
  let frame: number | undefined

  const read = () => {
    frame = undefined
    const scroller = document.scrollingElement ?? document.documentElement
    const visual = window.visualViewport
    const panel = document.querySelector<HTMLElement>('.forecast-panel')
    const scrubber = document.querySelector<HTMLElement>('.scrubber')
    const shell = document.querySelector<HTMLElement>('.app-shell')
    const panelBounds = panel?.getBoundingClientRect()
    const scrubberBounds = scrubber?.getBoundingClientRect()
    const px = (value: number | undefined) => value === undefined ? '—' : `${Math.round(value * 10) / 10}`
    const maxScroll = scroller.scrollHeight - window.innerHeight
    setRows([
      ['innerHeight', px(window.innerHeight)],
      ['clientHeight (html)', px(document.documentElement.clientHeight)],
      ['visualViewport h / top / pageTop', visual ? `${px(visual.height)} / ${px(visual.offsetTop)} / ${px(visual.pageTop)}` : 'geen'],
      ...UNITS.map((unit, index): [string, string] => [`100${unit}`, px(probes[index]?.getBoundingClientRect().height)]),
      ['scrollTop / max', `${px(scroller.scrollTop)} / ${px(maxScroll)}`],
      ['scrollHeight', px(scroller.scrollHeight)],
      ['snappunt tabel (offsetTop)', px(panel ? panel.getBoundingClientRect().top + scroller.scrollTop : undefined)],
      ['paneel top / hoogte', `${px(panelBounds?.top)} / ${px(panelBounds?.height)}`],
      ['scrubber top / onder', `${px(scrubberBounds?.top)} / ${px(scrubberBounds?.bottom)}`],
      ['tekort paneel', `${px(props.shortfallPx())}`],
      ['tabel', [shell?.classList.contains('table-view-open') ? 'open' : 'dicht', shell?.classList.contains('table-scroll-open') ? 'scrolt' : 'vast'].join(', ')],
      ['dpr', px(window.devicePixelRatio)],
    ])
  }
  const queue = () => { frame ??= requestAnimationFrame(read) }

  onMount(() => {
    probes = UNITS.map((unit) => {
      const probe = document.createElement('div')
      probe.style.cssText = `position:fixed;top:0;left:0;width:0;height:100${unit};visibility:hidden;pointer-events:none`
      document.body.append(probe)
      return probe
    })
    const targets: Array<[EventTarget | null | undefined, string]> = [
      [window, 'scroll'], [window, 'resize'], [window.visualViewport, 'resize'], [window.visualViewport, 'scroll'],
    ]
    for (const [target, type] of targets) target?.addEventListener(type, queue, { passive: true })
    // Ook zonder gebeurtenis bijhouden: juist het uitblijven van een resize-event is hier verdacht.
    const ticker = window.setInterval(queue, 500)
    queue()
    onCleanup(() => {
      for (const [target, type] of targets) target?.removeEventListener(type, queue)
      window.clearInterval(ticker)
      if (frame !== undefined) cancelAnimationFrame(frame)
      for (const probe of probes) probe.remove()
    })
  })

  return <dl class="viewport-diagnose" data-testid="viewport-diagnose" aria-hidden="true">
    <For each={rows()}>{([label, value]) => <><dt>{label}</dt><dd>{value}</dd></>}</For>
  </dl>
}
