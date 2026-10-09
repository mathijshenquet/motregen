export function rainRenderer(environment: NodeJS.ProcessEnv = process.env): 'native' | 'playwright' {
  const value = environment.MOTREGEN_RAIN_RENDERER ?? 'native'
  if (value !== 'native' && value !== 'playwright') throw new Error('MOTREGEN_RAIN_RENDERER moet native of playwright zijn')
  return value
}
