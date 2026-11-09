// U109: uniform- en attribuutlocaties per gelinkt programma één keer opvragen. getUniformLocation maakt bij elke
// aanroep een nieuw object; de lagen vroegen er ~20 per frame op.
const uniforms = new WeakMap<WebGLProgram, Map<string, WebGLUniformLocation | null>>()
const attributes = new WeakMap<WebGLProgram, Map<string, number>>()

export function uniformLocation(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation | null {
  let locations = uniforms.get(program)
  if (!locations) uniforms.set(program, locations = new Map())
  let location = locations.get(name)
  if (location === undefined) locations.set(name, location = gl.getUniformLocation(program, name))
  return location
}

export function attribLocation(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): number {
  let locations = attributes.get(program)
  if (!locations) attributes.set(program, locations = new Map())
  let location = locations.get(name)
  if (location === undefined) locations.set(name, location = gl.getAttribLocation(program, name))
  return location
}
