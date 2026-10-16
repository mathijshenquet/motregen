import type { Grid } from './contract'
import { SEGMENT_FLOATS } from './isoline-contours'
import { isolineLineFragment, isolineLineVertex, multiply } from './isoline-line-shaders'
import { isolineWidthCss, lineProfile } from './map-presentation'
import { measurePerfPhase } from './perf'
import type { RainContourEntry, RainContours } from './rain-contours'
import { rainMotionShader } from './rain-motion'
import type { RainOutline } from './rain-palette'
import type { RainWarpLimit } from './rain-sampling'

const vertex = isolineLineVertex(`${rainMotionShader}
uniform float u_mix;
uniform float u_right_frame;
vec2 displaced(vec2 position) {
  float offset = blendWeight(u_mix) - u_right_frame;
  return position + rainDisplacement((position + 0.5) / u_grid_size) * offset;
}`, 'displaced(p)')

const compositeVertex = `#version 300 es
out vec2 v_uv;
void main() {
  v_uv = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  gl_Position = vec4(v_uv * 2.0 - 1.0, 0.0, 1.0);
}`

const compositeFragment = `#version 300 es
precision highp float;
${rainMotionShader}
uniform sampler2D u_left;
uniform sampler2D u_right;
uniform float u_mix;
uniform float u_opacity;
in vec2 v_uv;
out vec4 color;
void main() {
  color = mix(texture(u_left, v_uv), texture(u_right, v_uv), blendWeight(u_mix)) * u_opacity;
}`

interface ContourTarget {
  texture: WebGLTexture
  framebuffer: WebGLFramebuffer
  geometry: WebGLBuffer
  result?: RainContours
  ranges: Array<{ level: number; first: number; count: number }>
}

export interface RainContourDraw {
  matrix: ArrayLike<number>
  zoom: number
  left?: RainContourEntry
  right?: RainContourEntry
  mix: number
  opacity: number
  outlines: readonly RainOutline[]
  motion: WebGLTexture
  motionMask: WebGLTexture
  hasMotion: boolean
  intervalMinutes: number
  warpLimit: RainWarpLimit
}

export class RainContourRenderer {
  private readonly line: WebGLProgram
  private readonly composite: WebGLProgram
  private readonly corners: WebGLBuffer
  private readonly vertexArray: WebGLVertexArrayObject
  private targets: ContourTarget[]
  private width = 0
  private height = 0

  constructor(private readonly gl: WebGL2RenderingContext, private readonly grid: Grid) {
    this.line = link(gl, vertex, isolineLineFragment)
    this.composite = link(gl, compositeVertex, compositeFragment)
    this.corners = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW)
    this.vertexArray = gl.createVertexArray()!
    this.targets = Array.from({ length: 2 }, () => {
      const texture = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      const framebuffer = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
      return { texture, framebuffer, geometry: gl.createBuffer()!, ranges: [] }
    })
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  draw(input: RainContourDraw): void {
    if (!input.outlines.length || (!input.left?.result && !input.right?.result)) return
    measurePerfPhase('isoline-blit', () => this.render(input), { layer: 'rain' })
  }

  dispose(): void {
    const gl = this.gl
    gl.deleteProgram(this.line)
    gl.deleteProgram(this.composite)
    gl.deleteBuffer(this.corners)
    gl.deleteVertexArray(this.vertexArray)
    for (const target of this.targets) {
      gl.deleteTexture(target.texture)
      gl.deleteFramebuffer(target.framebuffer)
      gl.deleteBuffer(target.geometry)
    }
  }

  private render(input: RainContourDraw): void {
    const gl = this.gl
    const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
    const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array
    const vertexArray = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null
    const depth = gl.isEnabled(gl.DEPTH_TEST)
    const stencil = gl.isEnabled(gl.STENCIL_TEST)
    const scissor = gl.isEnabled(gl.SCISSOR_TEST)
    gl.bindVertexArray(this.vertexArray)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.STENCIL_TEST)
    gl.disable(gl.SCISSOR_TEST)
    gl.enable(gl.BLEND)
    if (this.width !== viewport[2] || this.height !== viewport[3]) {
      this.width = viewport[2]!
      this.height = viewport[3]!
      for (const target of this.targets) {
        gl.bindTexture(gl.TEXTURE_2D, target.texture)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      }
    }
    if (input.left?.result && this.targets[1]!.result === input.left.result) this.targets.reverse()
    this.vectorPass(this.targets[0]!, input.left?.result, input, false)
    this.vectorPass(this.targets[1]!, input.right?.result, input, true)
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.viewport(viewport[0]!, viewport[1]!, viewport[2]!, viewport[3]!)
    gl.useProgram(this.composite)
    for (const [index, name] of ['u_left', 'u_right'].entries()) {
      gl.activeTexture(gl.TEXTURE0 + index)
      gl.bindTexture(gl.TEXTURE_2D, this.targets[index]!.texture)
      gl.uniform1i(gl.getUniformLocation(this.composite, name), index)
    }
    gl.uniform1f(gl.getUniformLocation(this.composite, 'u_mix'), input.mix)
    gl.uniform1f(gl.getUniformLocation(this.composite, 'u_opacity'), input.opacity)
    gl.blendEquation(gl.FUNC_ADD)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(vertexArray)
    if (depth) gl.enable(gl.DEPTH_TEST)
    if (stencil) gl.enable(gl.STENCIL_TEST)
    if (scissor) gl.enable(gl.SCISSOR_TEST)
  }

  private vectorPass(target: ContourTarget, result: RainContours | undefined, input: RainContourDraw, right: boolean): void {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
    gl.viewport(0, 0, this.width, this.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    if (!result) return
    if (result !== target.result) {
      const data = new Float32Array(result.levels.reduce((total, level) => total + level.data.length, 0))
      let offset = 0
      target.ranges = result.levels.map((level) => {
        data.set(level.data, offset)
        const range = { level: level.level, first: offset / SEGMENT_FLOATS, count: level.data.length / SEGMENT_FLOATS }
        offset += level.data.length
        return range
      })
      measurePerfPhase('texture-upload', () => {
        gl.bindBuffer(gl.ARRAY_BUFFER, target.geometry)
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
      }, { layer: 'rain-lines', segments: data.length / SEGMENT_FLOATS })
      target.result = result
    }
    const circumference = 2 * Math.PI * 6378137
    const scaleX = this.grid.dx / circumference
    const scaleY = -this.grid.dy / circumference
    const originX = (this.grid.x0 + 0.5 * this.grid.dx + circumference / 2) / circumference
    const originY = (circumference / 2 - this.grid.y0 - 0.5 * this.grid.dy) / circumference
    const affine = [scaleX, 0, 0, 0, 0, scaleY, 0, 0, 0, 0, 1, 0, originX, originY, 0, 1]
    gl.useProgram(this.line)
    const uniform = (name: string) => gl.getUniformLocation(this.line, name)
    gl.uniformMatrix4fv(uniform('u_matrix'), false, multiply(input.matrix, affine))
    gl.uniform2f(uniform('u_viewport'), this.width, this.height)
    gl.uniform2f(uniform('u_grid_size'), this.grid.width, this.grid.height)
    gl.uniform1f(uniform('u_has_motion'), input.hasMotion ? 1 : 0)
    gl.uniform1f(uniform('u_interval_minutes'), input.intervalMinutes)
    gl.uniform1f(uniform('u_warp_cap_cells'), input.warpLimit.capCells)
    gl.uniform1f(uniform('u_warp_fade_end_cells'), input.warpLimit.fadeEndCells)
    gl.uniform1f(uniform('u_mix'), input.mix)
    gl.uniform1f(uniform('u_right_frame'), right ? 1 : 0)
    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D, input.motion)
    gl.uniform1i(uniform('u_motion'), 3)
    gl.activeTexture(gl.TEXTURE4)
    gl.bindTexture(gl.TEXTURE_2D, input.motionMask)
    gl.uniform1i(uniform('u_motion_mask'), 4)
    const corner = gl.getAttribLocation(this.line, 'a_corner')
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners)
    gl.enableVertexAttribArray(corner)
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 8, 0)
    const segment = gl.getAttribLocation(this.line, 'a_segment')
    const alpha = gl.getAttribLocation(this.line, 'a_alpha')
    gl.bindBuffer(gl.ARRAY_BUFFER, target.geometry)
    gl.enableVertexAttribArray(segment)
    gl.enableVertexAttribArray(alpha)
    gl.vertexAttribDivisor(segment, 1)
    gl.vertexAttribDivisor(alpha, 1)
    gl.blendEquation(gl.MAX)
    const ratio = window.devicePixelRatio || 1
    for (const range of target.ranges) {
      const outline = input.outlines.find((outline) => outline.index === range.level)
      if (!outline || !range.count) continue
      const profile = lineProfile(isolineWidthCss(input.zoom) * outline.halfWidth * ratio)
      gl.uniform1f(uniform('u_extent'), profile.halfWidth + 1)
      gl.uniform1f(uniform('u_half_width'), profile.halfWidth)
      gl.uniform1f(uniform('u_line_alpha'), profile.alpha * outline.strength)
      gl.uniform3f(uniform('u_color'), ...outline.colour.map((channel) => channel / 255) as [number, number, number])
      gl.vertexAttribPointer(segment, 4, gl.FLOAT, false, SEGMENT_FLOATS * 4, range.first * SEGMENT_FLOATS * 4)
      gl.vertexAttribPointer(alpha, 2, gl.FLOAT, false, SEGMENT_FLOATS * 4, range.first * SEGMENT_FLOATS * 4 + 16)
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, range.count)
    }
    gl.vertexAttribDivisor(segment, 0)
    gl.vertexAttribDivisor(alpha, 0)
    gl.disableVertexAttribArray(segment)
    gl.disableVertexAttribArray(alpha)
    gl.disableVertexAttribArray(corner)
  }
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram()!
  const shaders = [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const
  for (const [type, source] of shaders) {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shaderfout')
    gl.attachShader(program, shader)
    gl.deleteShader(shader)
  }
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Shader-linkfout')
  return program
}
