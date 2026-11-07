// The game's install icons (owner, 7 Nov): the Soft Life mark (ink tile, yellow disc, ink S),
// the same one the website uses (site/public/apple-touch-icon.png). Makes public/icons/
// icon-192.png, icon-512.png, maskable-512.png (the disc sits well inside the 80% safe
// zone, so Android's round or squircle mask never cuts it) and apple-touch-icon.png (180).
// Run once: node scripts/app-icons.mjs (the PNGs are committed).
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const mark = (size, disc = 0.29) => {
  const c = size / 2
  const r = size * disc
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="#1c1915"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="#f0c400"/>
    <text x="${c}" y="${c + r * 0.46}" text-anchor="middle" font-size="${r * 1.31}" font-family="Georgia, serif" font-weight="700" fill="#1c1915">S</text>
  </svg>`)
}

mkdirSync('public/icons', { recursive: true })
const out = [
  ['public/icons/icon-192.png', 192, 0.29],
  ['public/icons/icon-512.png', 512, 0.29],
  ['public/icons/maskable-512.png', 512, 0.26],
  ['public/icons/apple-touch-icon.png', 180, 0.29],
]
for (const [file, size, disc] of out) {
  const info = await sharp(mark(size, disc)).png({ compressionLevel: 9 }).toFile(file)
  console.log(`${file}: ${info.width}x${info.height}, ${(info.size / 1024).toFixed(1)} kB`)
}
