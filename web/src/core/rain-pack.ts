const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1

/** Regenframe als RG-textuur: waarde plus geldigheid, zodat lineair filteren geen nodata (255) in de buurpixels mengt. */
export function packRainTexture(data: Uint8Array): Uint8Array {
  const packed = new Uint8Array(data.length * 2)
  if (LITTLE_ENDIAN) {
    // Eén 16-bit-schrijf per pixel: waarde in de lage byte, geldigheid in de hoge.
    const pairs = new Uint16Array(packed.buffer)
    for (let index = 0; index < data.length; index++) {
      const value = data[index]!
      pairs[index] = value === 255 ? 0 : 0xff00 | value
    }
    return packed
  }
  for (let index = 0; index < data.length; index++) {
    const valid = data[index] !== 255
    packed[index * 2] = valid ? data[index]! : 0
    packed[index * 2 + 1] = valid ? 255 : 0
  }
  return packed
}
