export const circumference = 40_075_016.6856
const radius = circumference / (2 * Math.PI)

export function projectedRingArea(ring: number[][]): number {
  const project = ([longitude, latitude]: number[]) => [radius * longitude! * Math.PI / 180, radius * Math.asinh(Math.tan(latitude! * Math.PI / 180))]
  let [previousX, previousY] = project(ring.at(-1)!)
  let sum = 0
  for (const point of ring) {
    const [x, y] = project(point)
    sum += previousX! * y! - x! * previousY!
    previousX = x
    previousY = y
  }
  return Math.abs(sum / 2)
}
