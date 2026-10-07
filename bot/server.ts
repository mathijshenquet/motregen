import { createServer, type Server } from 'node:http'
import { validateInitData } from './auth.js'
import type { BotConfig } from './config.js'

export function startValidationServer(config: BotConfig): Server {
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    if (request.url !== '/telegram/validate' || request.method !== 'POST') {
      response.writeHead(404).end()
      return
    }
    try {
      let body = ''
      for await (const chunk of request) {
        body += chunk.toString()
        if (Buffer.byteLength(body) > 20_000) {
          response.writeHead(413).end()
          return
        }
      }
      const value = JSON.parse(body) as { initData?: unknown }
      const valid = typeof value.initData === 'string' && validateInitData(value.initData, config.token)
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ valid }))
    } catch {
      response.writeHead(400).end()
    }
  })
  server.listen(config.port, '127.0.0.1')
  return server
}
