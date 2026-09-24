/** Verliesvrije predictieve frames (`pred` in de mrf-header); voorspeller, contexten en range-coder in docs/mrf.md §Predictive frames. */

export const PRED_VERSION = 1

export interface PredFrameSpec {
  width: number
  height: number
}

const NO_DATA = 255
const SYMBOLS = 64
const ESCAPE = SYMBOLS - 1
const ESCAPE_RANGE = 512
const CONTEXTS = 7 * 4
const INCREMENT = 32
const MAX_TOTAL = 1 << 16
const TOP = 1 << 24
const BYTE = 256
const WORD = 2 ** 32

class Model {
  readonly freq = new Uint32Array(CONTEXTS * SYMBOLS).fill(1)
  readonly total = new Uint32Array(CONTEXTS).fill(SYMBOLS)

  cumulative(context: number, symbol: number): number {
    let sum = 0
    for (let index = context * SYMBOLS, end = index + symbol; index < end; index++) sum += this.freq[index]!
    return sum
  }

  update(context: number, symbol: number): void {
    const base = context * SYMBOLS
    this.freq[base + symbol]! += INCREMENT
    this.total[context]! += INCREMENT
    if (this.total[context]! > MAX_TOTAL) {
      let total = 0
      for (let index = base; index < base + SYMBOLS; index++) total += this.freq[index] = (this.freq[index]! + 1) >> 1
      this.total[context] = total
    }
  }
}

/** Voorspelling en context van cel `index` uit al gereconstrueerde waarden, in `out[0]`/`out[1]`. */
function predict(values: Int32Array, width: number, index: number, out: Int32Array): void {
  const column = index % width
  let a: number, b: number, c: number, d: number
  if (index < width) {
    a = b = c = d = column > 0 ? values[index - 1]! : 127
  } else {
    const up = index - width
    b = values[up]!
    a = column > 0 ? values[index - 1]! : b
    c = column > 0 ? values[up - 1]! : b
    d = column + 1 < width ? values[up + 1]! : b
  }
  const sum = 2 * a + 2 * b - c + d + 2
  const floor = Math.floor(sum / 4)
  const activity = Math.abs(a - c) + Math.abs(b - c) + Math.abs(d - b)
  const bucket = activity < 3 ? activity : activity <= 4 ? 3 : activity <= 7 ? 4 : activity <= 11 ? 5 : 6
  out[0] = Math.min(254, Math.max(0, floor))
  out[1] = bucket * 4 + (sum - 4 * floor)
}

const zigzag = (residual: number) => residual >= 0 ? 2 * residual : -2 * residual - 1
const unzigzag = (value: number) => value % 2 === 0 ? value / 2 : -(value + 1) / 2

/** Encoder (synthgen, tests); byte-gelijk aan `mrf::pred::encode_frame`. */
export function encodePredFrame(cells: Uint8Array, width: number): Uint8Array {
  const maskLength = Math.ceil(cells.length / 8)
  const out: number[] = new Array<number>(maskLength).fill(0)
  for (let index = 0; index < cells.length; index++) if (cells[index] === NO_DATA) out[index >> 3]! |= 0x80 >> (index & 7)
  let low = 0, range = WORD - 1, cache = 0, pending = 1
  const shiftLow = () => {
    if (low < 0xff000000 || low >= WORD) {
      const carry = low >= WORD ? 1 : 0
      let byte = cache
      do { out.push((byte + carry) & 0xff); byte = 0xff } while (--pending)
      cache = Math.floor(low / TOP) & 0xff
    }
    pending++
    low = (low % TOP) * BYTE
  }
  const encode = (cumulative: number, frequency: number, total: number) => {
    const step = Math.floor(range / total)
    low += step * cumulative
    range = step * frequency
    while (range < TOP) { range *= BYTE; shiftLow() }
  }
  const model = new Model()
  const values = new Int32Array(cells.length)
  const prediction = new Int32Array(2)
  for (let index = 0; index < cells.length; index++) {
    predict(values, width, index, prediction)
    const predicted = prediction[0]!, context = prediction[1]!
    if (cells[index] === NO_DATA) { values[index] = predicted; continue }
    values[index] = cells[index]!
    const residual = zigzag(cells[index]! - predicted)
    const symbol = Math.min(residual, ESCAPE)
    encode(model.cumulative(context, symbol), model.freq[context * SYMBOLS + symbol]!, model.total[context]!)
    model.update(context, symbol)
    if (symbol === ESCAPE) encode(residual - ESCAPE, 1, ESCAPE_RANGE)
  }
  for (let flush = 0; flush < 5; flush++) shiftLow()
  return Uint8Array.from(out)
}

/** Gekwantiseerde cellen (255 = no-data) uit mask + range-gecodeerde residuen; weigert korte, te lange of ongeldige streams. */
export function decodePredFrame(bytes: Uint8Array, spec: PredFrameSpec): Uint8Array {
  const { width, height } = spec
  const cells = width * height
  const maskLength = Math.ceil(cells / 8)
  let position = maskLength
  const next = () => {
    if (position >= bytes.length) throw new Error('Predictief frame is te kort')
    return bytes[position++]!
  }
  let code = 0, range = WORD - 1
  for (let index = 0; index < 5; index++) code = (code * BYTE + next()) % WORD
  const consume = (step: number, cumulative: number, frequency: number) => {
    code -= step * cumulative
    range = step * frequency
    while (range < TOP) { code = code * BYTE + next(); range *= BYTE }
  }
  const model = new Model()
  const freq = model.freq
  const values = new Int32Array(cells)
  const out = new Uint8Array(cells).fill(NO_DATA)
  const prediction = new Int32Array(2)
  for (let index = 0; index < cells; index++) {
    predict(values, width, index, prediction)
    const predicted = prediction[0]!, context = prediction[1]!
    if (bytes[index >> 3]! & (0x80 >> (index & 7))) { values[index] = predicted; continue }
    const total = model.total[context]!
    let step = Math.floor(range / total)
    const target = Math.min(Math.floor(code / step), total - 1)
    const base = context * SYMBOLS
    let symbol = 0, cumulative = 0
    while (cumulative + freq[base + symbol]! <= target) cumulative += freq[base + symbol++]!
    consume(step, cumulative, freq[base + symbol]!)
    model.update(context, symbol)
    let residual = symbol
    if (symbol === ESCAPE) {
      step = Math.floor(range / ESCAPE_RANGE)
      const extra = Math.min(Math.floor(code / step), ESCAPE_RANGE - 1)
      consume(step, extra, 1)
      residual += extra
    }
    const value = predicted + unzigzag(residual)
    if (value < 0 || value > 254) throw new Error('Predictief frame buiten de tabel')
    values[index] = value
    out[index] = value
  }
  if (position !== bytes.length) throw new Error('Predictief frame heeft extra bytes')
  return out
}
