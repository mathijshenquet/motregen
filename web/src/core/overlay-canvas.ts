import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'

/** Een custom layer die zelf om een volgende frame kan vragen (standaard: `map.triggerRepaint`). */
export interface OverlayLayer extends CustomLayerInterface {
  requestRepaint?: () => void
  /** Zet de laag dit na elke render; false = niets getekend, dan hoeft de compositor de canvas niet mee te nemen. */
  contentDrawn?: boolean
  /**
   * Na `prerender`: beschrijft wat `render` zou tekenen. Gelijk aan de vorige tekening (en dezelfde canvasmaat) =
   * de canvas niet aanraken; zonder tekening in de standaard-framebuffer presenteert de browser niets nieuws, wat in
   * Firefox op Android per frame een volle canvas scheelt (U111).
   */
  drawKey?: () => string
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
  /** Tekenbeurten zonder verschil met de vorige (drawKey), dus zonder nieuwe canvas. */
  skips = 0
  private frame?: number
  private delay?: number
  private drawnAt = -Infinity
  private drawnCamera = ''
  private drawnKey?: string
  private manual = false
  private hidden = false
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
    if (this.manual) return
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

  pause(): void {
    this.manual = true
    if (this.frame !== undefined) cancelAnimationFrame(this.frame)
    window.clearTimeout(this.delay)
    this.frame = this.delay = undefined
  }

  drawNow(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame)
    window.clearTimeout(this.delay)
    this.frame = this.delay = undefined
    this.draw()
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
    // Een nieuwe canvasmaat wist de inhoud: dan altijd tekenen.
    const resized = this.resize()
    this.drawnCamera = this.camera()
    this.drawnAt = performance.now()
    const options = { defaultProjectionData: this.map.transform.getProjectionDataForCustomLayer(false) } as CustomRenderMethodInput
    const keyed = this.layer.drawKey !== undefined
    // Een laag met drawKey tekent in prerender alleen in eigen framebuffers: die eerst, dan pas de canvas wissen.
    if (keyed) {
      this.layer.prerender?.(gl, options)
      const key = this.layer.drawKey!()
      const unchanged = key === this.drawnKey && !resized
      this.drawnKey = key
      if (unchanged) {
        this.skips++
        for (const callback of this.afterDraw.splice(0)) callback()
        return
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    if (!keyed) this.layer.prerender?.(gl, options)
    this.layer.render(gl, options)
    // U109: een lege, schermvullende canvas kost op de GPU evenveel compositing als een gevulde.
    const hidden = this.layer.contentDrawn === false
    if (hidden !== this.hidden) {
      this.hidden = hidden
      this.canvas.style.visibility = hidden ? 'hidden' : ''
    }
    this.draws++
    for (const callback of this.afterDraw.splice(0)) callback()
  }

  private resize(): boolean {
    const source = this.map.getCanvas()
    const resized = this.canvas.width !== source.width || this.canvas.height !== source.height
    if (this.canvas.width !== source.width) this.canvas.width = source.width
    if (this.canvas.height !== source.height) this.canvas.height = source.height
    this.canvas.style.width = source.style.width
    this.canvas.style.height = source.style.height
    return resized
  }

  private camera(): string {
    const { lng, lat } = this.map.getCenter()
    return `${lng},${lat},${this.map.getZoom()},${this.map.getBearing()},${this.map.getPitch()},${this.canvas.width}x${this.canvas.height}`
  }
}
