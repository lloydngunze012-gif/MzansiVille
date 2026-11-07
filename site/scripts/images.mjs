// Makes the website's images: WebP, at most 1000 px wide, plus 600 px and 240 px copies
// (phones, and the 72 px tee thumbnails).
// Sources: the game's poster (public/cover.jpg, so the site never drifts from the game) and
// any JPG, PNG or WebP dropped into site/img-src/ (the Organt photos: name them after the
// image in data/site/website.json, e.g. organt-lookbook.jpg -> img/organt-lookbook.webp).
// Run from site/: npm run images. The outputs in site/public/img/ are committed; the
// originals in img-src/ are not (they're big).
import { readdirSync, mkdirSync, existsSync } from 'node:fs'
import { join, parse, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(SITE, 'public', 'img')
const SRC = join(SITE, 'img-src')
const MAX = 1000
const SMALLER = [600, 240] // each made only when the original is clearly wider (name-600.webp, name-240.webp)

const sources = [{ name: 'poster', file: join(SITE, '..', 'public', 'cover.jpg') }]
if (existsSync(SRC)) {
  for (const f of readdirSync(SRC)) {
    const p = parse(f)
    if (/^\.(jpe?g|png|webp)$/i.test(p.ext)) sources.push({ name: p.name, file: join(SRC, f) })
  }
}

mkdirSync(OUT, { recursive: true })
for (const { name, file } of sources) {
  const meta = await sharp(file).metadata()
  const widths = [{ w: Math.min(MAX, meta.width), file: `${name}.webp` }]
  for (const w of SMALLER) if (meta.width > w + 100) widths.push({ w, file: `${name}-${w}.webp` })
  for (const { w, file: base } of widths) {
    const out = join(OUT, base)
    const info = await sharp(file).resize({ width: w, withoutEnlargement: true }).webp({ quality: 72, effort: 6 }).toFile(out)
    console.log(`${parse(out).base}: ${info.width}x${info.height}, ${(info.size / 1024).toFixed(0)} kB`)
  }
}
