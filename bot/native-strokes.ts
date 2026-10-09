export function drawStroke(rgb: Buffer, size: { width: number; height: number }, start: [number, number], end: [number, number], width: number, color: readonly number[], opacity: number, decayLength: number, coverage?: Uint8Array, strength?: (distance: number) => number): void {
  const deltaX = end[0] - start[0], deltaY = end[1] - start[1]
  const lengthSquared = Math.max(1e-12, deltaX * deltaX + deltaY * deltaY)
  const padding = width / 2 + 1
  const left = Math.max(0, Math.floor(Math.min(start[0], end[0]) - padding)), right = Math.min(size.width, Math.ceil(Math.max(start[0], end[0]) + padding))
  const top = Math.max(0, Math.floor(Math.min(start[1], end[1]) - padding)), bottom = Math.min(size.height, Math.ceil(Math.max(start[1], end[1]) + padding))
  for (let row = top; row < bottom; row++) for (let column = left; column < right; column++) {
    const along = Math.max(0, Math.min(1, ((column + 0.5 - start[0]) * deltaX + (row + 0.5 - start[1]) * deltaY) / lengthSquared))
    const distance = Math.hypot(column + 0.5 - start[0] - along * deltaX, row + 0.5 - start[1] - along * deltaY)
    const behind = (1 - along) * Math.sqrt(lengthSquared)
    const alpha = Math.max(0, Math.min(1, padding - 0.5 - distance)) * Math.exp(-behind / decayLength) * opacity * (strength?.(behind) ?? 1)
    if (!alpha) continue
    const offset = (row * size.width + column) * 3
    if (coverage) coverage[row * size.width + column] = Math.round(coverage[row * size.width + column]! * (1 - alpha) + alpha * 255)
    for (let channel = 0; channel < 3; channel++) rgb[offset + channel] = Math.round(rgb[offset + channel]! * (1 - alpha) + color[channel]! * alpha)
  }
}
