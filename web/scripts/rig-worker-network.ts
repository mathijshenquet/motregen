import { readFileSync } from 'node:fs'
import type { PerformanceProfile } from '../e2e/profiles'

export interface WorkerNetworkRequest {
  url: string; range: string | null; startEpochMs: number; cached: boolean; finished: boolean
}

export async function emulateWorkerNetwork(profileDirectory: string, network: PerformanceProfile['network']) {
  const [port, path] = readFileSync(`${profileDirectory}/DevToolsActivePort`, 'utf8').trim().split('\n')
  const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`)
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener('error', () => reject(new Error('CDP-verbinding voor SW-netwerk mislukt')), { once: true })
  })
  let nextId = 0
  const pending = new Map<number, { resolve: () => void; reject: (error: Error) => void; deadline: ReturnType<typeof setTimeout> }>()
  const targets: Array<{ url: string; configured: boolean }> = []
  const errors: string[] = []
  const configuring: Promise<void>[] = []
  const requests = new Map<string, WorkerNetworkRequest>()
  function send(method: string, params: unknown = {}, sessionId?: string): Promise<void> {
    const id = ++nextId
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(() => { pending.delete(id); reject(new Error(`SW CDP-timeout: ${method}`)) }, 10_000)
      pending.set(id, { resolve, reject, deadline })
      socket.send(JSON.stringify({ id, method, params, sessionId }))
    })
  }
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    if (message.id) {
      const command = pending.get(message.id)
      if (!command) return
      clearTimeout(command.deadline)
      pending.delete(message.id)
      if (message.error) command.reject(new Error(JSON.stringify(message.error)))
      else command.resolve()
    } else if (message.method === 'Target.attachedToTarget') {
      const { sessionId, targetInfo } = message.params
      const target = { url: targetInfo.url, configured: false }
      targets.push(target)
      configuring.push((async () => {
        try {
          if (network) {
            const conditions = { offline: false, latency: network.latency, downloadThroughput: network.downloadThroughput, uploadThroughput: network.uploadThroughput, connectionType: network.connectionType }
            await send('Network.enable', {}, sessionId)
            await send('Network.setCacheDisabled', { cacheDisabled: false }, sessionId)
            await send('Network.overrideNetworkState', conditions, sessionId)
            await send('Network.emulateNetworkConditionsByRule', { matchedNetworkConditions: [{ urlPattern: '', ...conditions }] }, sessionId)
          }
          target.configured = true
        } catch (error) { errors.push(String(error)) }
        finally { await send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(error => errors.push(String(error))) }
      })())
    } else if (message.method === 'Network.requestWillBeSent') {
      const { requestId, request, wallTime } = message.params
      const range = Object.entries(request.headers as Record<string, string>).find(([name]) => name.toLowerCase() === 'range')?.[1] ?? null
      requests.set(`${message.sessionId}/${requestId}`, { url: request.url, range, startEpochMs: wallTime * 1_000, cached: false, finished: false })
    } else if (message.method === 'Network.requestServedFromCache') {
      const request = requests.get(`${message.sessionId}/${message.params.requestId}`)
      if (request) request.cached = true
    } else if (message.method === 'Network.responseReceived') {
      const request = requests.get(`${message.sessionId}/${message.params.requestId}`)
      if (request && message.params.response.fromDiskCache) request.cached = true
    } else if (message.method === 'Network.loadingFinished') {
      const request = requests.get(`${message.sessionId}/${message.params.requestId}`)
      if (request) request.finished = true
    }
  })
  // Page-CDP remt fetches in een serviceworker niet; attach vóór de eerste SW-fetch.
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: [{ type: 'service_worker' }, { exclude: true }] })
  return {
    evidence: () => ({ network, targets, errors, requests: [...requests.values()] }),
    cached: (url: string, range: string | null, epochMs: number) => [...requests.values()].some(request => request.cached && request.finished && request.url === url && request.range === range && Math.abs(request.startEpochMs - epochMs) < 250),
    close: async () => { await Promise.all(configuring); socket.close() },
  }
}
