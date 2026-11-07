// Makes the website's images: WebP, at most 1000 px wide, plus a 600 px copy for phones.
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
const SMALL = 600

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
  const widths = [Math.min(MAX, meta.width)]
  if (meta.width > SMALL + 100) widths.push(SMALL)
  for (const w of widths) {
    const out = join(OUT, w === SMALL && widths.length > 1 ? `${name}-${SMALL}.webp` : `${name}.webp`)
    const info = await sharp(file).resize({ width: w, withoutEnlargement: true }).webp({ quality: 72, effort: 6 }).toFile(out)
    console.log(`${parse(out).base}: ${info.width}x${info.height}, ${(info.size / 1024).toFixed(0)} kB`)
  }
}
