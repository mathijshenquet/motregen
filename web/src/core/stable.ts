// Afgeleide gegevens (reeksen, hemelstops, streken) worden bij elke aanvulling opnieuw berekend en zijn dan
// nieuwe objecten, ook als er niets aan veranderd is. Deze helpers geven het vorige object terug zolang de
// inhoud gelijk is, zodat Solid alleen bijwerkt wat echt anders is.

export function sameFields<Value extends object>(left: Value | null | undefined, right: Value | null | undefined): boolean {
  if (left === right) return true
  if (!left || !right) return false
  const keys = Object.keys(left) as Array<keyof Value>
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key])
}

/** `next` met per positie het vorige element waar dat inhoudelijk gelijk is; de vorige lijst zelf als niets verschilt. */
export function stableByIndex<Value extends object>(previous: Value[], next: Value[]): Value[] {
  let changed = previous.length !== next.length
  const merged = next.map((value, index) => {
    const before = previous[index]
    if (before && sameFields(before, value)) return before
    changed = true
    return value
  })
  return changed ? merged : previous
}
