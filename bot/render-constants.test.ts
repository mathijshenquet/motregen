import { it } from 'vitest'
import { generateRenderConstants } from './render-constants.js'

it('keeps Rust constants and content fixtures equal to their TypeScript sources', async () => {
  await generateRenderConstants(true)
})
