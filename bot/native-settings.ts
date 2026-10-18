export type NativeMode = 'weather' | 'feels' | 'wind'
/** Lucht (U92) bestaat alleen in de Rust-renderer. */
export type RustMode = NativeMode | 'air'

export function rustRenderer(mode: RustMode, environment: NodeJS.ProcessEnv = process.env): boolean {
  const value = environment.MOTREGEN_RUST_RENDERER
  if (value === undefined || value === '') return false
  const modes = value.split(',')
  if (modes.some((candidate) => !['weather', 'feels', 'wind', 'air'].includes(candidate)) || new Set(modes).size !== modes.length) {
    throw new Error('MOTREGEN_RUST_RENDERER moet een lijst van weather,feels,wind,air zijn of ontbreken')
  }
  return modes.includes(mode)
}

export function rendererBackend(mode: RustMode, environment: NodeJS.ProcessEnv = process.env): 'rust' | 'native' | 'playwright' {
  if (rustRenderer(mode, environment)) return 'rust'
  if (mode === 'air') throw new Error('Lucht vereist de Rust-renderer (MOTREGEN_RUST_RENDERER met air)')
  return nativeRenderer(mode, environment)
}

export function nativeRenderer(mode: NativeMode, environment: NodeJS.ProcessEnv = process.env): 'native' | 'playwright' {
  const value = environment.MOTREGEN_NATIVE_RENDERER
  if (value === undefined) {
    if (mode === 'weather' && environment.MOTREGEN_RAIN_RENDERER !== undefined) return rainRenderer(environment)
    return 'native'
  }
  if (value === 'playwright') return 'playwright'
  const modes = value.split(',')
  if (modes.some((candidate) => !['weather', 'feels', 'wind'].includes(candidate)) || new Set(modes).size !== modes.length) {
    throw new Error('MOTREGEN_NATIVE_RENDERER moet playwright of een lijst van weather,feels,wind zijn')
  }
  return modes.includes(mode) ? 'native' : 'playwright'
}

export function rainRenderer(environment: NodeJS.ProcessEnv = process.env): 'native' | 'playwright' {
  const value = environment.MOTREGEN_RAIN_RENDERER ?? 'native'
  if (value !== 'native' && value !== 'playwright') throw new Error('MOTREGEN_RAIN_RENDERER moet native of playwright zijn')
  return value
}
