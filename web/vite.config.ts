/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

// dev/preview draait op ageq-mthq en wordt via het tailnet bekeken (MIP-1 §5)
const allowedHosts = ['ageq-mthq']

// dev gebruikt de echte ingest-data via caddy (:8080, MIP-3-contract);
// MOTREGEN_SYNTH=1 valt terug op de synthetische dataset in public/data
const proxy = process.env.MOTREGEN_SYNTH
  ? undefined
  : { '/data': { target: 'http://localhost:8080', changeOrigin: true, rewrite: (path: string) => path.replace(/^\/data/, '') } }

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  build: { sourcemap: true },
  server: { allowedHosts, proxy },
  preview: { allowedHosts },
  test: { environment: 'node' },
})
