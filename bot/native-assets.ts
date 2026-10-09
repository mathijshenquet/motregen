import type { BrowserContext } from 'playwright'

export type NativeAssetContext = (options?: { webgl: boolean }) => Promise<BrowserContext>

let preparation: Promise<unknown> = Promise.resolve()

export function prepareNativeAsset<T>(capture: () => Promise<T>): Promise<T> {
  const pending = preparation.then(capture)
  preparation = pending.catch(() => undefined)
  return pending
}
