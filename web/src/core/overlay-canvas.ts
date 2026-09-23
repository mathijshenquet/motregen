import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'

/** Een custom layer die zelf om een volgende frame kan vragen (standaard: `map.triggerRepaint`). */
export interface OverlayLayer extends CustomLayerInterface {
  requestRepaint?: () => void
}

/**
 * Draait één custom layer op een eigen doorzichtige canvas boven de kaart. Een animatie (wind)
 * of tijdstap (regen) tekent dan alleen die canvas opnieuw; MapLibre rendert basiskaart,
 * symboolplaatsing en isolijnen alleen nog als de kaart zelf verandert (PO-profiel U8c).
 * Kaartbeweging tekent synchroon in het `render`-event van de kaart, zodat beide canvassen in
 * dezelfde frame verschijnen.
 */
export class LayerOverlay {
  readonly canvas: HTMLCanvasElement
  readonly gl: WebGL2RenderingContext
  draws = 0
  private frame?: number
  private delay?: number
  private drawnAt = -Infinity
  private drawnCamera = ''
  private readonly afterDraw: Array<() => void> = []
  private readonly mapRendered = () => { if (this.camera() !== this.drawnCamera) this.draw() }
  private readonly resized = () => this.draw()

  /** `maxFps`: bovengrens voor animatieframes (120 Hz-schermen zouden anders dubbel tekenen). */
  constructor(private readonly map: MapLibreMap, readonly layer: OverlayLayer, above: Element, private readonly maxFps: () => number = () => Infinity) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = `map-overlay map-overlay-${layer.id}`
    this.canvas.setAttribute('aria-hidden', 'true')
    above.after(this.canvas)
    const gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false })
    if (!gl) {
      this.canvas.remove()
      throw new Error('WebGL2 niet beschikbaar voor de overlay')
    }
    this.gl = gl
    layer.requestRepaint = () => this.triggerRepaint()
    this.resize()
    layer.onAdd?.(map, gl)
    map.on('render', this.mapRendered)
    map.on('resize', this.resized)
    this.triggerRepaint()
  }

  triggerRepaint(): void {
    if (this.frame !== undefined || this.delay !== undefined) return
    // Te vroeg voor maxFps: wachten met een timer i.p.v. lege rAF-ticks, die de refresh driver
    // op 120 Hz laten draaien (PO-heropname). Vier ms speling voor de vsync-fase.
    const early = this.drawnAt + 1_000 / this.maxFps() - 4 - performance.now()
    if (early > 0) {
      this.delay = window.setTimeout(() => { this.delay = undefined; this.triggerRepaint() }, early)
      return
    }
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined
      this.draw()
    })
  }

  /** Eenmalig na de eerstvolgende tekening (bv. TTFR/scrub-latentie). */
  once(callback: () => void): void {
    this.afterDraw.push(callback)
    this.triggerRepaint()
  }

  remove(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame)
    window.clearTimeout(this.delay)
    this.frame = this.delay = undefined
    this.map.off('render', this.mapRendered)
    this.map.off('resize', this.resized)
    this.layer.onRemove?.(this.map, this.gl)
    this.layer.requestRepaint = undefined
    this.canvas.remove()
  }

  private draw(): void {
    const gl = this.gl
    this.resize()
    this.drawnCamera = this.camera()
    this.drawnAt = performance.now()
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    const projection = this.map.transform.getProjectionDataForCustomLayer(false)
    this.layer.prerender?.(gl, { defaultProjectionData: projection } as CustomRenderMethodInput)
    this.layer.render(gl, { defaultProjectionData: projection } as CustomRenderMethodInput)
    this.draws++
    for (const callback of this.afterDraw.splice(0)) callback()
  }

  private resize(): void {
    const source = this.map.getCanvas()
    if (this.canvas.width !== source.width) this.canvas.width = source.width
    if (this.canvas.height !== source.height) this.canvas.height = source.height
    this.canvas.style.width = source.style.width
    this.canvas.style.height = source.style.height
  }

  private camera(): string {
    const { lng, lat } = this.map.getCenter()
    return `${lng},${lat},${this.map.getZoom()},${this.map.getBearing()},${this.map.getPitch()},${this.canvas.width}x${this.canvas.height}`
  }
}
