import defaults from '../crates/render/assets/video-encoding.json' with { type: 'json' }

export interface VideoSettings { preset: string; crf: number; maxBytes: number; x264Params: string }

export function videoSettings(environment: NodeJS.ProcessEnv = process.env): VideoSettings {
  const settings = {
    preset: environment.MOTREGEN_VIDEO_PRESET ?? defaults.preset,
    crf: Number(environment.MOTREGEN_VIDEO_CRF ?? defaults.crf),
    maxBytes: Number(environment.MOTREGEN_VIDEO_MAX_BYTES ?? defaults.maxBytes),
    x264Params: defaults.x264Params,
  }
  if (!['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow', 'placebo'].includes(settings.preset)) throw new Error('Ongeldige MOTREGEN_VIDEO_PRESET')
  if (!Number.isInteger(settings.crf) || settings.crf < 1 || settings.crf > 51) throw new Error('MOTREGEN_VIDEO_CRF moet een geheel getal van 1 tot 51 zijn')
  if (!Number.isSafeInteger(settings.maxBytes) || settings.maxBytes <= 0 || settings.maxBytes >= 50_000_000) throw new Error('MOTREGEN_VIDEO_MAX_BYTES moet tussen 0 en 50 MB liggen')
  return settings
}

export function videoArguments(settings: VideoSettings): string[] {
  return ['-preset', settings.preset, '-crf', String(settings.crf), '-profile:v', 'high', '-x264-params', settings.x264Params, '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
}

export function validateLoopBytes(bytes: number, settings = videoSettings()): void {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > settings.maxBytes) throw new Error(`Loop groter dan veiligheidsgrens van ${settings.maxBytes} bytes (${bytes})`)
}
