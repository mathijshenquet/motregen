export const LABEL_MIN_DISTANCE_PX = 90
export const LABEL_SPACING_PX = 260
export const MAX_LABEL_ANCHORS = 60

export function* lineLabelCandidates(points: ReadonlyArray<readonly [number, number]>, spacing: number): Generator<[number, number]> {
  let until = spacing / 2
  for (let index = 1; index < points.length; index++) {
    const [ax, ay] = points[index - 1]!, [bx, by] = points[index]!
    const length = Math.hypot(bx - ax, by - ay)
    while (until <= length) {
      const weight = until / length
      yield [ax + (bx - ax) * weight, ay + (by - ay) * weight]
      until += spacing
    }
    until -= length
  }
}
