export function linkPrograms(gl: WebGL2RenderingContext, sources: ReadonlyArray<readonly [string, string]>): WebGLProgram[] {
  // Statusvragen wachten op de GPU: start alle compilaties/links vóór de eerste vraag (Khronos).
  const shaders: WebGLShader[] = []
  const programs = sources.map(([vertex, fragment]) => {
    const program = gl.createProgram()!
    const programShaders = [gl.createShader(gl.VERTEX_SHADER)!, gl.createShader(gl.FRAGMENT_SHADER)!]
    shaders.push(...programShaders)
    for (const [index, shader] of programShaders.entries()) {
      gl.shaderSource(shader, index === 0 ? vertex : fragment)
      gl.compileShader(shader)
      gl.attachShader(program, shader)
    }
    gl.linkProgram(program)
    return program
  })
  try {
    for (const program of programs) {
      if (gl.getProgramParameter(program, gl.LINK_STATUS)) continue
      const attachedShaders = gl.getAttachedShaders(program) ?? []
      const details = [gl.getProgramInfoLog(program), ...attachedShaders.map((shader) => gl.getShaderInfoLog(shader))].filter(Boolean).join('\n')
      throw new Error(details || 'Shader-linkfout')
    }
    return programs
  } catch (error) {
    for (const program of programs) gl.deleteProgram(program)
    throw error
  } finally {
    for (const shader of shaders) gl.deleteShader(shader)
  }
}
