import { decompress } from 'fzstd'
import { chunkField, type MrfHeader } from './contract.js'
import { decodePredFrame, PRED_VERSION, type PredFrameSpec } from './pred.js'

const decoder = new TextDecoder()

export function parseMrfHeader(bytes: Uint8Array): MrfHeader {
  if (bytes.length < 8 || decoder.decode(bytes.subarray(0, 4)) !== 'mrf0') throw new Error('Ongeldige mrf-magic')
  const jsonLength = new DataView(bytes.buffer, bytes.byteOffset + 4, 4).getUint32(0, true)
  if (bytes.length !== jsonLength + 8) throw new Error('Onvolledige mrf-header')
  const header = JSON.parse(decoder.decode(bytes.subarray(8))) as MrfHeader
  validateHeader(header)
  return header
}

function validateHeader(header: MrfHeader): void {
  if (header.version !== 0 || header.grid.crs !== 'EPSG:3857') throw new Error('Niet-ondersteunde mrf-versie of projectie')
  const field = chunkField(header)
  const zeroBased = field === 'rain_rate' || field === 'radiation'
  if (header.quant.length !== 256 || header.quant[255] !== null || (zeroBased && header.quant[0] !== 0)) throw new Error('Ongeldige kwantisatietabel')
  if (header.dict !== null || header.grid.width < 1 || header.grid.height < 1) throw new Error('Ongeldige mrf-header')
  if (header.motion_grid && (!Number.isInteger(header.motion_grid.bw) || !Number.isInteger(header.motion_grid.bh) || header.motion_grid.bw < 1 || header.motion_grid.bh < 1)) throw new Error('Ongeldig motion-grid')
  if (!header.motion_grid && header.frames.some((frame) => frame.motion)) throw new Error('Motion-annex zonder motion-grid')
  if (header.pred && header.pred.v !== PRED_VERSION) throw new Error(`Niet-ondersteunde predictieve frames v${header.pred.v}`)
  if (header.frames.some((frame) => frame.motion && (!Number.isInteger(frame.motion.offset) || !Number.isInteger(frame.motion.len) || frame.motion.offset < 0 || frame.motion.len < 1))) throw new Error('Ongeldige motion-verwijzing')
}

export function decodeFrame(bytes: Uint8Array, expectedLength: number, pred?: PredFrameSpec, decompressFrame: (bytes: Uint8Array) => Uint8Array = decompress): Uint8Array {
  const raw = decompressFrame(bytes)
  const decoded = pred ? decodePredFrame(raw, pred) : raw
  if (decoded.length !== expectedLength) throw new Error(`Frame heeft ${decoded.length} bytes; verwacht ${expectedLength}`)
  return decoded
}

