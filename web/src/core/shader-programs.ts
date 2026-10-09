export type ShaderSources = readonly [vertex: string, fragment: string]

export async function prepareShaderPrograms(gl: WebGL2RenderingContext, sources: readonly ShaderSources[], signal: AbortSignal): Promise<WebGLProgram[]> {
  const programs: WebGLProgram[] = []
  const parallel = gl.getExtension('KHR_parallel_shader_compile')
  try {
    signal.throwIfAborted()
    for (const pair of sources) {
      const program = gl.createProgram()
      if (!program) throw new Error('WebGL-programma kon niet worden aangemaakt')
      programs.push(program)
      for (const [index, source] of pair.entries()) {
        const shader = gl.createShader(index === 0 ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER)
        if (!shader) throw new Error('WebGL-shader kon niet worden aangemaakt')
        gl.shaderSource(shader, source)
        gl.compileShader(shader)
        gl.attachShader(program, shader)
        gl.deleteShader(shader)
      }
      gl.linkProgram(program)
    }
    for (const program of programs) {
      if (parallel) {
        while (!gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) await waitForCompilationTurn(signal)
      } else {
        await waitForCompilationTurn(signal)
      }
      signal.throwIfAborted()
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Wind-shader-linkfout')
    }
    return programs
  } catch (error) {
    for (const program of programs) gl.deleteProgram(program)
    throw error
  }
}

function waitForCompilationTurn(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const complete = () => { signal.removeEventListener('abort', abort); resolve() }
    const handle = requestAnimationFrame(complete)
    const abort = () => {
      cancelAnimationFrame(handle)
      signal.removeEventListener('abort', abort)
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}
