export function startFrameLoop(
  step: FrameRequestCallback,
  requestFrame: (callback: FrameRequestCallback) => number,
  cancelFrame: (handle: number) => void,
): () => void {
  let active = true
  let handle = 0
  const tick: FrameRequestCallback = (time) => {
    if (!active) return
    step(time)
    if (active) handle = requestFrame(tick)
  }
  handle = requestFrame(tick)
  return () => {
    if (!active) return
    active = false
    cancelFrame(handle)
  }
}
