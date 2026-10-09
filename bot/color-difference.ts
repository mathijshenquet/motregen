export interface ColorDifference { mean: number; maximum: number; pixels: number }

export function colorDifference(first: Uint8Array, second: Uint8Array): ColorDifference {
  if (first.length !== second.length || first.length % 3 !== 0) throw new Error('Beelden hebben verschillende RGB-maten')
  let sum = 0, maximum = 0
  for (let offset = 0; offset < first.length; offset += 3) {
    const left = lab(first, offset), right = lab(second, offset)
    const delta = Math.hypot(left[0]! - right[0]!, left[1]! - right[1]!, left[2]! - right[2]!)
    sum += delta
    maximum = Math.max(maximum, delta)
  }
  return { mean: sum / (first.length / 3), maximum, pixels: first.length / 3 }
}

function lab(rgb: Uint8Array, offset: number): number[] {
  const linear = [0, 1, 2].map((channel) => {
    const value = rgb[offset + channel]! / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const red = linear[0]!, green = linear[1]!, blue = linear[2]!
  const transform = (value: number) => value > 216 / 24389 ? Math.cbrt(value) : 841 / 108 * value + 4 / 29
  const x = transform((red * 0.4124564 + green * 0.3575761 + blue * 0.1804375) / 0.95047)
  const y = transform(red * 0.2126729 + green * 0.7151522 + blue * 0.072175)
  const z = transform((red * 0.0193339 + green * 0.119192 + blue * 0.9503041) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
