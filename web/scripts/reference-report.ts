export interface ReferenceTimedEvent { kind: string; wallMs: number; value: string; covered?: boolean }
export interface ReferenceAction { name: string; wallMs: number }

export interface ReferenceMilestones {
  /** Navigatiestart tot het eerste zichtbare radarbeeld. */
  firstRadarMs: number | null
  /** Navigatiestart tot de eerste wissel van het zichtbare radarbeeld: de animatie loopt. */
  ttfpRefMs: number | null
  /** Als ttfp-ref, maar geteld vanaf het eerste beeld waar niets meer overheen ligt (toestemmingsmuur weg). */
  ttfpRefUncoveredMs: number | null
  /** Laatste toestemmingsklik; null als er geen toestemmingsmuur verscheen. */
  consentDoneMs: number | null
  frameChanges: number
  timeLabelChanges: number
}

export interface ReferenceReport {
  meta: { profile: string; origin: string; capturedAt: string; cpuThrottleRate: number; network: unknown; observeAfterFirstFrameMs: number; loadAverage: number }
  milestones: ReferenceMilestones
  actions: ReferenceAction[]
  events: ReferenceTimedEvent[]
}

export function referenceMilestones(events: ReferenceTimedEvent[], actions: ReferenceAction[], navigationStartMs: number): ReferenceMilestones {
  const shown = events.filter((event) => event.kind === 'radar-frame')
  // Een melding met hetzelfde beeld is alleen een wissel van bedekt naar onbedekt, geen frame-wissel.
  const frames = shown.filter((event, index) => index === 0 || event.value !== shown[index - 1]!.value)
  const firstUncovered = shown.find((event) => !event.covered)
  const uncoveredChange = firstUncovered && shown.find((event) => !event.covered && event.wallMs > firstUncovered.wallMs && event.value !== firstUncovered.value)
  const clicks = actions.filter((action) => !action.name.endsWith('(niet verschenen)'))
  const relative = (wallMs: number | undefined) => wallMs === undefined ? null : Math.round(wallMs - navigationStartMs)
  return {
    firstRadarMs: relative(frames[0]?.wallMs),
    ttfpRefMs: relative(frames[1]?.wallMs),
    ttfpRefUncoveredMs: relative(uncoveredChange?.wallMs),
    consentDoneMs: relative(clicks.at(-1)?.wallMs),
    frameChanges: Math.max(0, frames.length - 1),
    timeLabelChanges: Math.max(0, events.filter((event) => event.kind === 'time-label').length - 1),
  }
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]!
}

export function renderReferenceReport(report: ReferenceReport): string {
  const { milestones } = report
  const lines = [
    `# Referentie: ${report.meta.origin} / ${report.meta.profile}`,
    '',
    `${report.meta.capturedAt}. CPU ${report.meta.cpuThrottleRate}×; koud (verse context, cache uit). Loadavg host bij start ${report.meta.loadAverage}.`,
    '',
    '| maat | waarde |',
    '| --- | ---: |',
    `| eerste radarbeeld | ${milestones.firstRadarMs ?? 'niet gezien'} ms |`,
    `| ttfp-ref (eerste frame-wissel) | ${milestones.ttfpRefMs ?? 'geen wissel'} ms |`,
    `| ttfp-ref zonder iets over de kaart | ${milestones.ttfpRefUncoveredMs ?? 'geen wissel'} ms |`,
    `| toestemming afgerond | ${milestones.consentDoneMs ?? 'geen muur'} ms |`,
    `| frame-wissels in ${report.meta.observeAfterFirstFrameMs / 1_000} s na het eerste beeld | ${milestones.frameChanges} |`,
    `| wissels van het tijdlabel | ${milestones.timeLabelChanges} |`,
    '',
    'Handelingen:',
    ...report.actions.map((action) => `- ${Math.round(action.wallMs)} ms — ${action.name}`),
    '',
  ]
  return `${lines.join('\n')}\n`
}
