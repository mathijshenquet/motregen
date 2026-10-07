/** Het venster rond "nu" waarbinnen kaart, histogram en tabel samen compleet moeten zijn (MIP-19 punt 4). */
export const READY_WINDOW_MS = 3_600_000

export interface WindowEntry {
  epoch: number
  present: boolean
}

/** Of elk tijdstip binnen nu ± 1 u zijn waarde heeft; een venster zonder tijdstippen telt niet als gereed. */
export function windowReady(entries: WindowEntry[], now: number): boolean {
  const inWindow = entries.filter((entry) => Math.abs(entry.epoch - now) <= READY_WINDOW_MS)
  return inWindow.length > 0 && inWindow.every((entry) => entry.present)
}
