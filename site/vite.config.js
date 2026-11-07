import { defineConfig } from 'vite'
import softLifePage from './build/page.mjs'

// The Soft Life website: one static page, no framework and no JavaScript in the page.
// build/page.mjs fills index.html from the repo's data (data/site/website.json and the
// game's houses, day slots and shop link) and writes sitemap.xml, robots.txt and share.jpg.
export default defineConfig({
  plugins: [softLifePage()],
  server: { port: 5180, host: true },
  preview: { port: 4180 },
  build: { outDir: 'dist', emptyOutDir: true },
})
