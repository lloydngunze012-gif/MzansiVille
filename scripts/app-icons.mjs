// The game's install icons (owner, 8 Nov): the Soft Life logo (SL monogram, gold ring and crown, on plum).
// Source: scripts/logo-source.png. Makes public/icons/icon-192.png, icon-512.png, apple-touch-icon.png (180)
// from the full image, and maskable-512.png: the logo at 60% on flat plum (the logo's corner colour), edge
// feathered, so Android's round or squircle mask never cuts it. Run: node scripts/app-icons.mjs (PNGs committed).
import sharp from 'sharp'

const SRC = 'scripts/logo-source.png'
const png = { compressionLevel: 9 }
for (const [file, size] of [['icon-192', 192], ['icon-512', 512], ['apple-touch-icon', 180]]) {
  const i = await sharp(SRC).resize(size, size).png(png).toFile(`public/icons/${file}.png`)
  console.log(file, i.width + 'x' + i.height, (i.size / 1024).toFixed(1) + ' kB')
}
const S = 512, inner = Math.round(S * 0.6)
const { data } = await sharp(SRC).extract({ left: 0, top: 0, width: 40, height: 40 }).resize(1, 1).raw().toBuffer({ resolveWithObject: true })
const field = { r: data[0], g: data[1], b: data[2] }
const fade = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${inner}" height="${inner}"><defs><radialGradient id="g"><stop offset="0.72" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`)
const logo = await sharp(SRC).resize(inner, inner).composite([{ input: fade, blend: 'dest-in' }]).png().toBuffer()
const m = await sharp({ create: { width: S, height: S, channels: 3, background: field } })
  .composite([{ input: logo, left: Math.floor((S - inner) / 2), top: Math.floor((S - inner) / 2) }]).png(png).toFile('public/icons/maskable-512.png')
console.log('maskable-512', m.width + 'x' + m.height, (m.size / 1024).toFixed(1) + ' kB', JSON.stringify(field))
