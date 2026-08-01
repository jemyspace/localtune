import { defineConfig } from 'vite'
import { researchApiPlugin } from './server/viteResearchPlugin.mjs'

export default defineConfig({
  base: './',
  server: {
    port: 5173,
  },
  plugins: [researchApiPlugin()],
})
