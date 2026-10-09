export interface WindMetrics { components: number; meanLength: number; meanWidth: number; ink: number }

export function windMetrics(alpha: Uint8Array, width: number, height: number, scale: number): WindMetrics {
  if (alpha.length !== width * height) throw new Error('Windmasker heeft verkeerde maat')
  const visited = new Uint8Array(alpha.length)
  const queue = new Int32Array(alpha.length)
  let components = 0, lengthSum = 0, widthSum = 0, ink = 0
  for (const value of alpha) ink += value / 255 / (scale * scale)
  for (let start = 0; start < alpha.length; start++) {
    if (visited[start] || alpha[start]! < 8) continue
    let count = 1
    queue[0] = start
    visited[start] = 1
    let sumX = 0, sumY = 0, sumXX = 0, sumYY = 0, sumXY = 0
    for (let cursor = 0; cursor < count; cursor++) {
      const pixel = queue[cursor]!, x = pixel % width, y = Math.floor(pixel / width)
      sumX += x; sumY += y; sumXX += x * x; sumYY += y * y; sumXY += x * y
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue
        const neighbour = (y + dy) * width + x + dx
        if (visited[neighbour] || alpha[neighbour]! < 8) continue
        visited[neighbour] = 1
        queue[count++] = neighbour
      }
    }
    if (count < 6) continue
    const covarianceXX = sumXX / count - (sumX / count) ** 2
    const covarianceYY = sumYY / count - (sumY / count) ** 2
    const covarianceXY = sumXY / count - sumX * sumY / (count * count)
    const angle = Math.atan2(2 * covarianceXY, covarianceXX - covarianceYY) / 2
    const cosine = Math.cos(angle), sine = Math.sin(angle)
    let minimum = Infinity, maximum = -Infinity
    for (let cursor = 0; cursor < count; cursor++) {
      const pixel = queue[cursor]!
      const along = pixel % width * cosine + Math.floor(pixel / width) * sine
      minimum = Math.min(minimum, along); maximum = Math.max(maximum, along)
    }
    const length = maximum - minimum + 1
    if (length < 3 * scale) continue
    components++
    lengthSum += length / scale
    widthSum += count / length / scale
  }
  return { components, meanLength: components ? lengthSum / components : 0, meanWidth: components ? widthSum / components : 0, ink }
}

export function phaseMask(first: Uint8Array, second: Uint8Array, width: number, height: number): Uint8Array {
  if (first.length !== width * height || second.length !== first.length) throw new Error('Windmaskers hebben verschillende maten')
  const mask = new Uint8Array(first.length)
  for (let pixel = 0; pixel < mask.length; pixel++) {
    if (first[pixel]! <= 1 && second[pixel]! <= 1) continue
    const x = pixel % width, y = Math.floor(pixel / width)
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) mask[(y + dy) * width + x + dx] = 1
    }
  }
  return mask
}

export function unmaskedRgb(rgb: Buffer, mask: Uint8Array): Buffer {
  if (rgb.length !== mask.length * 3) throw new Error('RGB en windmasker hebben verschillende maten')
  const output = Buffer.alloc((mask.length - mask.reduce((sum, value) => sum + value, 0)) * 3)
  let offset = 0
  for (let pixel = 0; pixel < mask.length; pixel++) {
    if (mask[pixel]) continue
    rgb.copy(output, offset, pixel * 3, pixel * 3 + 3)
    offset += 3
  }
  return output
}
