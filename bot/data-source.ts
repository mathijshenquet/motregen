import { readFile } from 'node:fs/promises'
import { join, normalize, sep } from 'node:path'

// Op de machine waar de ingest draait staan manifest en chunks al op schijf; dan is HTTP via de eigen origin
// (op prod: via Cloudflare en terug) alleen maar omweg. Zonder MOTREGEN_DATA_DIR blijft het HTTP, zoals op een
// renderer die elders draait.
const dataDirectory = process.env.MOTREGEN_DATA_DIR

/** Leest `/data/<path>` van schijf wanneer de datamap lokaal is, anders van de origin. */
export async function readData(origin: string, path: string, timeoutMilliseconds: number, fresh = false): Promise<Uint8Array> {
  if (dataDirectory) {
    const relative = normalize(path)
    if (relative.startsWith('..') || relative.startsWith(sep)) throw new Error('Datapad buiten de datamap')
    return readFile(join(dataDirectory, relative), { signal: AbortSignal.timeout(timeoutMilliseconds) })
  }
  const response = await fetch(new URL(path, new URL('/data/', origin)), { ...(fresh ? { cache: 'no-store' as const } : {}), signal: AbortSignal.timeout(timeoutMilliseconds) })
  if (!response.ok) throw new Error(`Data laden mislukt (${response.status}): ${path}`)
  return new Uint8Array(await response.arrayBuffer())
}

export async function readManifestJson(origin: string): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await readData(origin, 'manifest.json', 15_000, true)))
}
