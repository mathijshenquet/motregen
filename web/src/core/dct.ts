/** Laagfrequente DCT-frames (`dct` in de mrf-header); layout in docs/mrf.md §DCT fields. */

export interface DctFrameSpec {
  width: number
  height: number
  k: number
  quant: Array<number | null>
}

export function dctFrameLength(width: number, height: number, k: number): number {
  return 4 + Math.ceil(width * height / 8) + 2 * k * k
}

const bases = new Map<string, Float64Array>()

/** Orthonormale DCT-II-basis, rij `k` = frequentie: `basis[k * n + i]`. */
function basis(n: number, k: number): Float64Array {
  const key = `${n}:${k}`
  let rows = bases.get(key)
  if (!rows) {
    rows = new Float64Array(k * n)
    for (let frequency = 0; frequency < k; frequency++) {
      const scale = Math.sqrt((frequency === 0 ? 1 : 2) / n)
      for (let sample = 0; sample < n; sample++) rows[frequency * n + sample] = scale * Math.cos(Math.PI * (2 * sample + 1) * frequency / (2 * n))
    }
    bases.set(key, rows)
  }
  return rows
}

/** Minimale coëfficiëntstap (ortho-DCT-eenheden), gelijk aan de ingest (`mrf::dct::MIN_STEP`). */
export const DCT_MIN_STEP = 0.2

/** No-data krijgt de waarde van de dichtstbijzijnde geldige cel (4-buren-BFS, rij-major), zoals de ingest. */
function fillNearest(values: ArrayLike<number>, width: number, height: number): Float64Array {
  const filled = Float64Array.from(values)
  const reached = new Uint8Array(values.length)
  const queue = new Int32Array(values.length)
  let head = 0, tail = 0
  for (let index = 0; index < values.length; index++) if (Number.isFinite(values[index]!)) { reached[index] = 1; queue[tail++] = index }
  if (!tail) return new Float64Array(values.length)
  while (head < tail) {
    const index = queue[head++]!
    const row = Math.floor(index / width), column = index % width
    const neighbours = [row > 0 ? index - width : -1, column > 0 ? index - 1 : -1, column + 1 < width ? index + 1 : -1, row + 1 < height ? index + width : -1]
    for (const neighbour of neighbours) {
      if (neighbour < 0 || reached[neighbour]) continue
      reached[neighbour] = 1
      filled[neighbour] = filled[index]!
      queue[tail++] = neighbour
    }
  }
  return filled
}

/** Encoder (synthgen, tests); byte-gelijk aan `mrf::dct::encode_frame`. */
export function encodeDctFrame(values: ArrayLike<number>, width: number, height: number, k: number): Uint8Array {
  const filled = fillNearest(values, width, height)
  const across = basis(width, k), down = basis(height, k)
  const rows = new Float64Array(height * k)
  for (let y = 0; y < height; y++) {
    for (let kx = 0; kx < k; kx++) {
      let sum = 0
      for (let x = 0; x < width; x++) sum += filled[y * width + x]! * across[kx * width + x]!
      rows[y * k + kx] = sum
    }
  }
  const coefficients = new Float64Array(k * k)
  for (let ky = 0; ky < k; ky++) {
    for (let y = 0; y < height; y++) {
      const weight = down[ky * height + y]!
      for (let kx = 0; kx < k; kx++) coefficients[ky * k + kx] += weight * rows[y * k + kx]!
    }
  }
  let peak = 0
  for (const value of coefficients) peak = Math.max(peak, Math.abs(value))
  const step = Math.max(Math.fround(DCT_MIN_STEP), Math.fround(peak / 32767))
  const out = new Uint8Array(dctFrameLength(width, height, k))
  new DataView(out.buffer).setFloat32(0, step, true)
  for (let index = 0; index < values.length; index++) if (!Number.isFinite(values[index]!)) out[4 + (index >> 3)]! |= 0x80 >> (index & 7)
  const planes = 4 + Math.ceil(width * height / 8)
  const exactStep = Math.fround(step)
  for (let index = 0; index < k * k; index++) {
    const quantized = Math.max(-32767, Math.min(32767, roundHalfAway(coefficients[index]! / exactStep))) & 0xffff
    out[planes + index] = quantized & 0xff
    out[planes + k * k + index] = quantized >> 8
  }
  return out
}

/** Rust `f64::round`: halverwege van nul af (Math.round rondt −0,5 naar boven). */
function roundHalfAway(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value))
}

/** Het laagdoorlaatveld op het volle grid; NaN waar het masker no-data zegt. */
export function inverseDct(bytes: Uint8Array, width: number, height: number, k: number): Float32Array {
  const expected = dctFrameLength(width, height, k)
  if (bytes.length !== expected) throw new Error(`DCT-frame heeft ${bytes.length} bytes; verwacht ${expected}`)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const step = view.getFloat32(0, true)
  const maskStart = 4
  const planes = maskStart + Math.ceil(width * height / 8)
  const count = k * k
  const across = basis(width, k), down = basis(height, k)
  const partial = new Float64Array(k * width)
  for (let ky = 0; ky < k; ky++) {
    for (let kx = 0; kx < k; kx++) {
      const index = ky * k + kx
      const raw = bytes[planes + index]! | (bytes[planes + count + index]! << 8)
      if (!raw) continue
      const coefficient = (raw << 16 >> 16) * step
      const base = kx * width, target = ky * width
      for (let x = 0; x < width; x++) partial[target + x] += coefficient * across[base + x]!
    }
  }
  const field = new Float64Array(width * height)
  for (let ky = 0; ky < k; ky++) {
    const source = ky * width
    for (let y = 0; y < height; y++) {
      const weight = down[ky * height + y]!
      const target = y * width
      for (let x = 0; x < width; x++) field[target + x] += weight * partial[source + x]!
    }
  }
  const values = new Float32Array(width * height)
  for (let index = 0; index < values.length; index++) {
    values[index] = bytes[maskStart + (index >> 3)]! & (0x80 >> (index & 7)) ? Number.NaN : field[index]!
  }
  return values
}

/** Zelfde regel als de ingest: NaN → 255, satureren op 0/254, middenpunt kiest de lagere index. */
export function quantizeField(values: Float32Array, quant: Array<number | null>): Uint8Array {
  const table = quant.slice(0, 255) as number[]
  const out = new Uint8Array(values.length)
  for (let index = 0; index < values.length; index++) {
    const value = values[index]!
    if (Number.isNaN(value)) { out[index] = 255; continue }
    if (value <= table[0]!) { out[index] = 0; continue }
    if (value >= table[254]!) { out[index] = 254; continue }
    let low = 0, high = 254
    while (high - low > 1) {
      const middle = (low + high) >> 1
      if (table[middle]! < value) low = middle; else high = middle
    }
    out[index] = value - table[low]! <= table[high]! - value ? low : high
  }
  return out
}

/** Een DCT-frame als gekwantiseerd bitmapframe, zodat alle kaartconsumenten het ongewijzigd lezen. */
export function dctFrameToBitmap(bytes: Uint8Array, spec: DctFrameSpec): Uint8Array {
  return quantizeField(inverseDct(bytes, spec.width, spec.height, spec.k), spec.quant)
}
