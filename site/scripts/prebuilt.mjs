// Turns site/dist/ into Vercel's prebuilt output (.vercel/output/, Build Output API v3),
// with the headers from site/vercel.json, ready for `npx vercel deploy --prebuilt --prod`.
// Why: `vercel build` fails on Windows without Developer Mode (it symlinks in its builder
// cache: EPERM), and this site is a plain static folder, so nothing else is needed.
// Run from site/ after `npm run build`: npm run prebuilt
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(SITE, 'dist')
const OUT = join(SITE, '.vercel', 'output')
if (!existsSync(join(DIST, 'index.html'))) throw new Error('site/dist is empty: run npm run build first')

const config = JSON.parse(readFileSync(join(SITE, 'vercel.json'), 'utf8'))
const routes = (config.headers || []).map((h) => ({
  src: `^${h.source}$`,
  headers: Object.fromEntries(h.headers.map((x) => [x.key, x.value])),
  continue: true,
}))
routes.push({ handle: 'filesystem' })

rmSync(OUT, { recursive: true, force: true })
mkdirSync(join(OUT, 'static'), { recursive: true })
cpSync(DIST, join(OUT, 'static'), { recursive: true })
writeFileSync(join(OUT, 'config.json'), JSON.stringify({ version: 3, routes }, null, 2))
console.log(`.vercel/output ready: ${routes.length - 1} header rules, static files from dist/`)
