import type { CDPSession } from '@playwright/test'

export interface WorkerThrottle {
  /** Aantal workers dat de rem bevestigde. */
  throttled: () => number
  errors: string[]
}

/**
 * CDP's page-throttle remt alleen de hoofddraad; decodes lopen in workers op hostsnelheid. Elk
 * workerdoel krijgt daarom zijn eigen `Emulation.setCPUThrottlingRate`. Playwright kan geen
 * kind-sessies aanspreken, vandaar de niet-afgevlakte `sendMessageToTarget`-route.
 */
export async function throttleWorkers(cdp: CDPSession, rate: number): Promise<WorkerThrottle> {
  const errors: string[] = []
  let confirmed = 0
  let messageId = 0
  cdp.on('Target.attachedToTarget', (event) => {
    if (event.targetInfo.type !== 'worker') return
    const message = JSON.stringify({ id: ++messageId, method: 'Emulation.setCPUThrottlingRate', params: { rate } })
    void cdp.send('Target.sendMessageToTarget', { sessionId: event.sessionId, message }).catch((error: unknown) => errors.push(String(error)))
  })
  cdp.on('Target.receivedMessageFromTarget', (event) => {
    const reply = JSON.parse(event.message) as { id?: number; error?: { message: string } }
    if (reply.id === undefined) return
    if (reply.error) errors.push(reply.error.message)
    else confirmed++
  })
  await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: false })
  return { throttled: () => confirmed, errors }
}
