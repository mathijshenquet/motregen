import { decompress } from 'fzstd'
import type { Grid, Manifest, MotionField, RegionsSection } from './contract.js'
import { motionBlocks, rainPatchFrom, type RainPatch } from './rain-point-detail.js'

/**
 * Puntreeksen uit regiobestanden (MIP-40, format in docs/regiobestanden.md). Een plek leest per groep één klein
 * bestand in plaats van tientallen hele rasters te decoderen. De client vraagt per chunk, en elke lezing zegt
 * `undefined` als het bestand die cel, dat frame of dat bewegingsblok niet heeft: dan leest de aanroeper het raster.
 * Zo kunnen de ingest-marges, de frames en de chunks per groep later kleiner worden zonder clientwijziging.
 */

export interface RegionWindow { column: number; row: number; width: number; height: number }

export interface RegionChunkEntry {
  url: string
  source: string
  field: string
  run: string
  table: string
  window: RegionWindow
  frames: number
  frame_indexes?: number[]
  offset: number
  motion?: { grid: { bw: number; bh: number }; window: RegionWindow; frames: number[]; offset: number }
}

interface RegionFileHeader { version: number; group: string; region: number; chunks: RegionChunkEntry[] }
interface RegionTable { grid: Omit<Grid, 'crs'> & { crs: string }; quant: Array<number | null> }
interface TablesFile { version: number; tables: Record<string, RegionTable> }
interface RegionFile { header: RegionFileHeader; payload: Uint8Array }

export const REGION_FORMAT_VERSION = 1
const MAGIC = 'mrr1'
const NO_MOTION = 128
const decoder = new TextDecoder()

/** Regio-id van een geprojecteerd punt, of undefined buiten het kader of in een regio zonder bestand (A3). */
export function regionOf(section: RegionsSection, x: number, y: number): number | undefined {
  if (x < section.west || x >= section.east || y > section.north || y <= section.south) return undefined
  const column = Math.min(section.columns - 1, Math.floor((x - section.west) / ((section.east - section.west) / section.columns)))
  const row = Math.min(section.rows - 1, Math.floor((section.north - y) / ((section.north - section.south) / section.rows)))
  const id = row * section.columns + column
  return section.present.includes(id) ? id : undefined
}

export function parseRegionFile(bytes: Uint8Array): RegionFile {
  if (bytes.length < 8 || decoder.decode(bytes.subarray(0, 4)) !== MAGIC) throw new Error('Geen regiobestand')
  const raw = decompress(bytes.subarray(4))
  const headerLength = new DataView(raw.buffer, raw.byteOffset, 4).getUint32(0, true)
  const header = JSON.parse(decoder.decode(raw.subarray(4, 4 + headerLength))) as RegionFileHeader
  if (header.version !== REGION_FORMAT_VERSION) throw new Error(`Onbekend regioformaat ${header.version}`)
  return { header, payload: raw.subarray(4 + headerLength) }
}

function inWindow(window: RegionWindow, column: number, row: number): boolean {
  return column >= window.column && row >= window.row && column < window.column + window.width && row < window.row + window.height
}

/** Eén chunk in het regiobestand van één plek: dezelfde lezers als op het raster, met `undefined` voor "niet hier". */
export class RegionChunk {
  readonly grid: Grid
  readonly quant: Array<number | null>
  private readonly motions = new Map<number, MotionField | undefined>()

  constructor(readonly entry: RegionChunkEntry, table: RegionTable, private readonly payload: Uint8Array) {
    this.grid = table.grid as Grid
    this.quant = table.quant
  }

  /** Positie van een chunkframe in het bestand. */
  private slot(frameIndex: number): number | undefined {
    const slot = this.entry.frame_indexes ? this.entry.frame_indexes.indexOf(frameIndex) : frameIndex
    return slot >= 0 && slot < this.entry.frames ? slot : undefined
  }

  /** De rasterbyte; undefined als cel of frame niet in het bestand staat (binnen of buiten het raster). */
  byte(column: number, row: number, frameIndex: number): number | undefined {
    const slot = this.slot(frameIndex)
    const { window, frames, offset } = this.entry
    if (slot === undefined || !inWindow(window, column, row)) return undefined
    return this.payload[offset + ((row - window.row) * window.width + column - window.column) * frames + slot]
  }

  /** Als `pointValue`; null buiten het raster of zonder data, undefined als het bestand de cel niet heeft. */
  value(frameIndex: number, x: number, y: number): number | null | undefined {
    const { x0, y0, dx, dy, width, height } = this.grid
    const column = Math.floor((x - x0) / dx)
    const row = Math.floor((y - y0) / dy)
    if (column < 0 || row < 0 || column >= width || row >= height) return null
    const byte = this.byte(column, row, frameIndex)
    return byte === undefined ? undefined : this.quant[byte] ?? null
  }

  /** Als `pointValueBilinear`. */
  bilinear(frameIndex: number, x: number, y: number): number | null | undefined {
    const { x0, y0, dx, dy, width, height } = this.grid
    const column = (x - x0) / dx - 0.5
    const row = (y - y0) / dy - 0.5
    if (column < -0.5 || row < -0.5 || column > width - 0.5 || row > height - 0.5) return null
    const left = Math.floor(column)
    const top = Math.floor(row)
    const mixX = column - left
    const mixY = row - top
    let sum = 0
    let weights = 0
    for (const [cellColumn, cellRow, weight] of [
      [left, top, (1 - mixX) * (1 - mixY)], [left + 1, top, mixX * (1 - mixY)],
      [left, top + 1, (1 - mixX) * mixY], [left + 1, top + 1, mixX * mixY],
    ] as const) {
      if (weight <= 0 || cellColumn < 0 || cellRow < 0 || cellColumn >= width || cellRow >= height) continue
      const byte = this.byte(cellColumn, cellRow, frameIndex)
      if (byte === undefined) return undefined
      const value = this.quant[byte]
      if (value == null) continue
      sum += value * weight
      weights += weight
    }
    return weights > 0 ? sum / weights : null
  }

  /** Als `rainPatch`. */
  patch(frameIndex: number, x: number, y: number): RainPatch | undefined {
    if (this.slot(frameIndex) === undefined) return undefined
    return rainPatchFrom(this.grid, this.quant, x, y, (column, row) => this.byte(column, row, frameIndex))
  }

  /** Of het bestand voor dit frame een bewegingsveld heeft; undefined als de chunk geen bewegingsdeel heeft. */
  hasMotion(frameIndex: number): boolean | undefined {
    return this.entry.motion ? this.entry.motion.frames.includes(frameIndex) : undefined
  }

  /**
   * Een bewegingsveld ter grootte van het hele bewegingsgrid met alleen de blokken van het bestand; undefined als
   * de blokken die `motionAtPatch` op (x, y) leest er niet in staan.
   */
  motion(frameIndex: number, x: number, y: number): MotionField | undefined {
    const motion = this.entry.motion
    const slot = motion?.frames.indexOf(frameIndex) ?? -1
    if (!motion || slot < 0) return undefined
    const cellX = (x - this.grid.x0) / this.grid.dx
    const cellY = (y - this.grid.y0) / this.grid.dy
    const { bw, bh } = motion.grid
    if (motionBlocks(cellX, cellY, this.grid.width, this.grid.height, bw, bh).some(([column, row]) => !inWindow(motion.window, column, row))) return undefined
    if (this.motions.has(frameIndex)) return this.motions.get(frameIndex)
    const vectors = new Uint8Array(bw * bh * 2).fill(NO_MOTION)
    const { window } = motion
    const start = motion.offset + slot * window.width * window.height * 2
    for (let row = 0; row < window.height; row++) {
      const from = start + row * window.width * 2
      vectors.set(this.payload.subarray(from, from + window.width * 2), ((window.row + row) * bw + window.column) * 2)
    }
    const field = { width: bw, height: bh, vectors }
    this.motions.set(frameIndex, field)
    return field
  }
}

export type RegionFetch = (url: string) => Promise<Uint8Array | undefined>

/**
 * Haalt per manifest en plek de regiobestanden op, één keer per bestand. Elke fout (404 bij een oud manifest, netwerk,
 * onbekend formaat) geeft `undefined`, zodat de aanroeper het raster leest.
 */
export class RegionPoints {
  private readonly files = new Map<string, Promise<RegionFile | undefined>>()
  private readonly tables = new Map<string, Promise<TablesFile | undefined>>()
  private groupOfChunk = new WeakMap<Manifest, Map<string, { url: string }>>()

  constructor(private readonly manifestUrl: string, private readonly fetchBytes: RegionFetch, private readonly maxFiles = 16) {}

  /** Het stuk regiobestand voor deze chunk op dit punt, of undefined (geen sectie, buiten het kader, 404, …). */
  async chunk(manifest: Manifest | undefined, chunkUrl: string, x: number, y: number): Promise<RegionChunk | undefined> {
    const section = regionsSection(manifest)
    if (!manifest || !section?.tables) return undefined
    const region = regionOf(section, x, y)
    const group = this.groups(manifest, section).get(chunkUrl)
    if (region === undefined || !group) return undefined
    const [file, tables] = await Promise.all([
      this.file(new URL(`${group.url}${region}.mrr`, this.manifestUrl).href),
      this.tablesFile(new URL(section.tables, this.manifestUrl).href),
    ])
    const entry = file?.header.chunks.find((candidate) => candidate.url === chunkUrl)
    const table = entry && tables?.tables[entry.table]
    if (!file || !entry || !table) return undefined
    return new RegionChunk(entry, table, file.payload)
  }

  private groups(manifest: Manifest, section: RegionsSection): Map<string, { url: string }> {
    let groups = this.groupOfChunk.get(manifest)
    if (!groups) {
      groups = new Map(section.groups.flatMap((group) => group.chunks.map((url) => [url, group] as const)))
      this.groupOfChunk.set(manifest, groups)
    }
    return groups
  }

  private file(url: string): Promise<RegionFile | undefined> {
    let pending = this.files.get(url)
    if (pending) {
      this.files.delete(url)
      this.files.set(url, pending)
      return pending
    }
    pending = this.fetchBytes(url).then((bytes) => bytes && parseRegionFile(bytes)).catch(() => undefined)
    this.files.set(url, pending)
    while (this.files.size > this.maxFiles) this.files.delete(this.files.keys().next().value!)
    return pending
  }

  private tablesFile(url: string): Promise<TablesFile | undefined> {
    let pending = this.tables.get(url)
    if (!pending) {
      pending = this.fetchBytes(url)
        .then((bytes) => {
          if (!bytes) return undefined
          const tables = JSON.parse(decoder.decode(bytes)) as TablesFile
          return tables.version === REGION_FORMAT_VERSION ? tables : undefined
        })
        .catch(() => undefined)
      // Alleen het tabellenbestand van het huidige manifest is nodig; het vorige mag weg.
      if (this.tables.size >= 2) this.tables.delete(this.tables.keys().next().value!)
      this.tables.set(url, pending)
    }
    return pending
  }
}

export function regionsSection(manifest: Manifest | undefined): RegionsSection | undefined {
  const section = manifest?.regions
  return section?.version === REGION_FORMAT_VERSION && section.crs === 'EPSG:3857' ? section : undefined
}
