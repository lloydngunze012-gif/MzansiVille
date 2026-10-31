import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 5173, host: true, watch: { ignored: ['**/docs/**', '**/test-results/**'] } },
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    chunkSizeWarningLimit: 400,
  },
})
