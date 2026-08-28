/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

// dev/preview draait op ageq-mthq en wordt via het tailnet bekeken (MIP-1 §5)
const allowedHosts = ['ageq-mthq']

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  build: { sourcemap: true },
  server: { allowedHosts },
  preview: { allowedHosts },
  test: { environment: 'node' },
})
