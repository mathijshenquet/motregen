export type NativeMode = 'weather' | 'feels' | 'wind'

export function rustRenderer(mode: NativeMode, environment: NodeJS.ProcessEnv = process.env): boolean {
  const value = environment.MOTREGEN_RUST_RENDERER
  if (value !== undefined && value !== '' && value !== 'weather') throw new Error('MOTREGEN_RUST_RENDERER moet weather zijn of ontbreken')
  return value === 'weather' && mode === 'weather'
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
