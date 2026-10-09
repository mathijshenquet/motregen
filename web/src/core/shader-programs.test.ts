import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareShaderPrograms } from './shader-programs'

const sources = [['vertex', 'fragment'], ['vertex2', 'fragment2']] as const
function harness(parallel = true) {
  vi.stubGlobal('window', globalThis)
  let completed = false
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, LINK_STATUS: 3,
    getExtension: vi.fn(() => parallel ? { COMPLETION_STATUS_KHR: 4 } : null),
    createProgram: vi.fn(() => ({})), createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(), compileShader: vi.fn(), attachShader: vi.fn(), deleteShader: vi.fn(), linkProgram: vi.fn(), deleteProgram: vi.fn(),
    getProgramInfoLog: vi.fn(() => 'invalid shader'),
    getProgramParameter: vi.fn((_program: WebGLProgram, parameter: number) => {
      if (parameter === 3 && !completed) throw new Error('blocking status queried before completion')
      return completed
    }),
  }
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  return { gl, context: gl as unknown as WebGL2RenderingContext, frames, complete: () => { completed = true } }
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('shader preparation', () => {
  it('submits every program without blocking status queries and polls across frames', async () => {
    const { gl, context, frames, complete } = harness()
    const ready = prepareShaderPrograms(context, sources, new AbortController().signal)
    expect(gl.linkProgram).toHaveBeenCalledTimes(2)
    expect(gl.getProgramParameter.mock.calls.every(([, parameter]) => parameter === 4)).toBe(true)
    complete()
    frames.shift()!(0)
    expect(await ready).toHaveLength(2)
    expect(gl.deleteShader).toHaveBeenCalledTimes(4)
    expect(gl.deleteProgram).not.toHaveBeenCalled()
  })

  it('cancels pending polling and deletes all programs when a layer is removed', async () => {
    const { gl, context } = harness()
    const controller = new AbortController()
    const ready = prepareShaderPrograms(context, sources, controller.signal)
    controller.abort()
    await expect(ready).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancelAnimationFrame).toHaveBeenCalledOnce()
    expect(gl.deleteProgram).toHaveBeenCalledTimes(2)
    expect(gl.getProgramParameter.mock.calls.every(([, parameter]) => parameter === 4)).toBe(true)
  })

  it('reports a completed link failure and releases the whole batch', async () => {
    const { gl, context, complete } = harness()
    complete()
    gl.getProgramParameter.mockImplementation((_program, parameter) => parameter === 4)
    await expect(prepareShaderPrograms(context, sources, new AbortController().signal)).rejects.toThrow('invalid shader')
    expect(gl.deleteProgram).toHaveBeenCalledTimes(2)
  })

  it('checks unsupported drivers one program per frame and cancels before a blocking query', async () => {
    const { gl, context } = harness(false)
    const controller = new AbortController()
    const ready = prepareShaderPrograms(context, sources, controller.signal)
    expect(gl.linkProgram).toHaveBeenCalledTimes(2)
    expect(gl.getProgramParameter).not.toHaveBeenCalled()
    controller.abort()
    await expect(ready).rejects.toMatchObject({ name: 'AbortError' })
    expect(gl.deleteProgram).toHaveBeenCalledTimes(2)
  })
})
