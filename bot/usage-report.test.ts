import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'

const execute = promisify(execFile)
const script = resolve('../nix/usage/daily-report.sh')
const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'motregen-report-'))
  directories.push(root)
  await execute(process.execPath, [resolve('../nix/fixtures/daily-report/generate.mjs'), root])
  return root
}
function report(root: string, arguments_ = ['--dry-run', '--offline'], environment: NodeJS.ProcessEnv = {}) {
  return execute('bash', [script, '--root', root, '--day', '2026-10-17', ...arguments_], {
    env: { PATH: process.env.PATH, ...environment },
  })
}

describe('dagrapport', () => {
  it('toont gisteren, de zeven voorafgaande dagen, features, Telegram, kanaal en grove Cloudflare-totalen', async () => {
    const { stdout } = await report(await fixture())
    expect(stdout).toContain('sessies 41 (7d gem. 28)')
    expect(stdout).toContain('bakens 34 (7d gem. 20)')
    expect(stdout).toContain('touch 25 · desktop 9 (7d 70 % touch)')
    expect(stdout).toContain('tijd verschoven 70,6 % (7d 50 %)')
    expect(stdout).toContain('lucht vastgezet 11,8 %')
    expect(stdout).toContain('Telegram-webview 14,7 % (7d 10 %)')
    expect(stdout).toContain('gebruikers ≥6 (7d gem. 4)')
    expect(stdout).toContain('commando’s 14 (7d gem. 7) · /weer 9, /regen 3, /wind 2')
    expect(stdout).toContain('inline 3 (7d 1) · tijdknoppen 11 (7d 4) · plaatsknoppen 2 (7d 1)')
    expect(stdout).toContain('kanaal nu 23 leden (+2)')
    expect(stdout).toContain('Cloudflare (UTC, incl. bots): 90 unieke IP’s · 120 pageviews · FR 75 % van verzoeken (FR is vooral de dev-host)')
    expect(stdout).toContain('filters sinds 2026-10-17')
  })

  it('meldt ontbrekende dagen en deelt niet door nul', async () => {
    const root = await fixture()
    await rm(join(root, 'stats/2026-10-17.json'))
    await rm(join(root, 'telegram/2026-10-17.json'))
    const { stdout } = await report(root)
    expect(stdout.match(/meting stil sinds 2026-10-16/g)).toHaveLength(2)
    const next = await execute('bash', [script, '--root', root, '--day', '2026-10-25', '--dry-run', '--offline'])
    expect(next.stdout).not.toContain('filters sinds')
    await rm(join(root, 'stats'), { recursive: true })
    await rm(join(root, 'telegram'), { recursive: true })
    expect((await report(root)).stdout).toContain('nog geen dagaggregaat')
  })

  it('noemt ontbrekende meetdagen in het gemiddelde en behandelt een echte nuldag als gemeten', async () => {
    const root = await fixture()
    await rm(join(root, 'stats/2026-10-10.json'))
    const path = join(root, 'stats/2026-10-17.json')
    const current = JSON.parse(await readFile(path, 'utf8'))
    current.beacons = 0
    current.features = {}
    await writeFile(path, JSON.stringify(current))
    const { stdout } = await report(root)
    expect(stdout).toContain('7d gem. 28 · 6/7 dagen')
    expect(stdout).toContain('bakens 0')
    expect(stdout).toContain('Telegram-webview – %')
    expect(stdout).not.toMatch(/NaN|Infinity|meting stil/)
  })

  it('laat Cloudflare zonder token weg en verstuurt HTML uitsluitend naar het nep-endpoint', async () => {
    const root = await fixture()
    let sent: { text: string; chat_id: string; parse_mode: string } | undefined
    const server = createServer(async (request, response) => {
      let body = ''
      for await (const chunk of request) body += chunk
      response.setHeader('Content-Type', 'application/json')
      if (request.url?.endsWith('/getChatMemberCount')) response.end(JSON.stringify({ ok: true, result: 24 }))
      else if (request.url?.endsWith('/sendMessage')) {
        sent = JSON.parse(body)
        response.end(JSON.stringify({ ok: true, result: { message_id: 1 } }))
      } else {
        response.statusCode = 500
        response.end('{}')
      }
    })
    await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
    try {
      const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      const { stdout } = await report(root, [], { TG_BOT_KEY: 'fake-token', MOTREGEN_REPORT_CHAT_ID: 'fake-chat', MOTREGEN_TELEGRAM_API: endpoint })
      expect(stdout).toBe('')
      expect(sent).toMatchObject({ chat_id: 'fake-chat', parse_mode: 'HTML' })
      expect(sent!.text).toContain('kanaal nu 24 leden (+3)')
      expect(sent!.text).not.toContain('Cloudflare')
      expect(JSON.parse(await readFile(join(root, 'report/2026-10-17-channel.json'), 'utf8'))).toEqual({ day: '2026-10-17', members: 24 })
    } finally {
      await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()))
    }
  })

  it.each([true, false])('normaliseert alleen Cloudflare-totalen en laat een API-fout het eigen rapport niet blokkeren (succes=%s)', async (success) => {
    const root = await fixture()
    let calls = 0
    const server = createServer(async (request, response) => {
      let body = ''
      for await (const chunk of request) body += chunk
      calls++
      const payload = JSON.parse(body)
      expect(payload.variables).toEqual({ zone: 'test-zone', day: '2026-10-17' })
      expect(payload.query).toContain('httpRequests1dGroups')
      expect(payload.query).not.toMatch(/clientIP|userAgent/)
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify(success
        ? { data: { viewer: { zones: [{ httpRequests1dGroups: [{ uniq: { uniques: 90 }, sum: { pageViews: 120, requests: 1000, countryMap: [{ clientCountryName: 'FR', requests: 750 }, { clientCountryName: 'NL', requests: 250 }] } }] }] } } }
        : { errors: [{ message: 'token-secret U88-geheime-plaatsnaam' }] }))
    })
    await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
    try {
      const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      const { stdout, stderr } = await report(root, ['--dry-run'], { CLOUDFLARE_ANALYTICS_TOKEN: 'token-secret', MOTREGEN_CLOUDFLARE_ZONE: 'test-zone', MOTREGEN_CLOUDFLARE_API: endpoint })
      expect(calls).toBe(1)
      expect(stdout).toContain('sessies 41')
      if (success) expect(stdout).toContain('90 unieke IP’s · 120 pageviews · FR 75 %')
      else expect(stdout).not.toContain('Cloudflare')
      expect(stdout + stderr).not.toMatch(/token-secret|U88-geheime/)
    } finally {
      await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()))
    }
  })

  it('rapporteert een verzendfout zonder ontvanger, token of Telegram-antwoord te loggen', async () => {
    const server = createServer((request, response) => {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify(request.url?.endsWith('/getChatMemberCount')
        ? { ok: true, result: 23 }
        : { ok: false, description: 'fake-chat token-secret U88-geheime-plaatsnaam' }))
    })
    await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
    try {
      const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      await expect(report(await fixture(), [], { TG_BOT_KEY: 'token-secret', MOTREGEN_REPORT_CHAT_ID: 'fake-chat', MOTREGEN_TELEGRAM_API: endpoint }))
        .rejects.toMatchObject({ code: 1, stdout: '', stderr: 'Dagrapport kon niet worden verstuurd.\n' })
    } finally {
      await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()))
    }
  })
})
