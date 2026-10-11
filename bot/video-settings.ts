import defaults from '../crates/render/assets/video-encoding.json' with { type: 'json' }

export interface VideoSettings { preset: string; crf: number; maxBytes: number; x264Params?: string; vbvBudgetRatio: number; vbvBufferSeconds: number }

export function videoSettings(environment: NodeJS.ProcessEnv = process.env): VideoSettings {
  const preset = environment.MOTREGEN_VIDEO_PRESET ?? defaults.preset
  const settings = {
    preset,
    crf: Number(environment.MOTREGEN_VIDEO_CRF ?? defaults.crf),
    maxBytes: Number(environment.MOTREGEN_VIDEO_MAX_BYTES ?? defaults.maxBytes),
    x264Params: preset === 'ultrafast' ? defaults.x264Params : undefined,
    vbvBudgetRatio: defaults.vbvBudgetRatio,
    vbvBufferSeconds: defaults.vbvBufferSeconds,
  }
  if (!['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow', 'placebo'].includes(settings.preset)) throw new Error('Ongeldige MOTREGEN_VIDEO_PRESET')
  if (!Number.isInteger(settings.crf) || settings.crf < 1 || settings.crf > 51) throw new Error('MOTREGEN_VIDEO_CRF moet een geheel getal van 1 tot 51 zijn')
  if (!Number.isSafeInteger(settings.maxBytes) || settings.maxBytes <= 0 || settings.maxBytes >= 50_000_000) throw new Error('MOTREGEN_VIDEO_MAX_BYTES moet tussen 0 en 50 MB liggen')
  return settings
}

export function videoArguments(settings: VideoSettings, frames: number, fps: number): string[] {
  if (!Number.isSafeInteger(frames) || frames <= 0 || !Number.isFinite(fps) || fps <= 0) throw new Error('Ongeldig loopplan voor VBV')
  const maxrate = Math.floor(settings.vbvBudgetRatio * settings.maxBytes * 8 / (frames / fps))
  if (maxrate <= 0) throw new Error('Videoveiligheidsgrens te klein voor VBV')
  return ['-preset', settings.preset, '-crf', String(settings.crf), '-profile:v', 'high',
    ...(settings.x264Params ? ['-x264-params', settings.x264Params] : []),
    '-maxrate', String(maxrate), '-bufsize', String(Math.floor(settings.vbvBufferSeconds * maxrate)),
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
}

export function validateLoopBytes(bytes: number, settings = videoSettings()): void {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > settings.maxBytes) throw new Error(`Loop groter dan veiligheidsgrens van ${settings.maxBytes} bytes (${bytes})`)
}
