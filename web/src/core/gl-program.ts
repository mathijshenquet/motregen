export function linkProgram(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  // Statusvragen wachten op de GPU; compileer beide shaders vóór de enige linkstatusvraag.
  const program = gl.createProgram()!
  const shaders = [gl.createShader(gl.VERTEX_SHADER)!, gl.createShader(gl.FRAGMENT_SHADER)!]
  for (const [index, shader] of shaders.entries()) {
    gl.shaderSource(shader, index === 0 ? vertex : fragment)
    gl.compileShader(shader)
    gl.attachShader(program, shader)
  }
  gl.linkProgram(program)
  try {
    if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program
    const details = [gl.getProgramInfoLog(program), ...shaders.map((shader) => gl.getShaderInfoLog(shader))].filter(Boolean).join('\n')
    throw new Error(details || 'Shader-linkfout')
  } catch (error) {
    gl.deleteProgram(program)
    throw error
  } finally {
    for (const shader of shaders) gl.deleteShader(shader)
  }
}
