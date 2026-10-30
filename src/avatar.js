export const skins = [
  { id: 'sand', label: 'Sand', fill: '#f0c7a0' },
  { id: 'amber', label: 'Amber', fill: '#d2956b' },
  { id: 'brown', label: 'Brown', fill: '#8a5a3a' },
  { id: 'deep', label: 'Deep', fill: '#3f291c' },
]

export const hairs = [
  { id: 'crop', label: 'Crop' },
  { id: 'curls', label: 'Curls' },
  { id: 'fade', label: 'Fade' },
  { id: 'braids', label: 'Braids' },
]

export const outfits = [
  { id: 'hoodie', label: 'Hoodie' },
  { id: 'shirt', label: 'Shirt' },
  { id: 'jacket', label: 'Jacket' },
  { id: 'organt', label: 'Organt' },
]

const cloth = {
  hoodie: '#1f6b45',
  shirt: '#f7f4ee',
  jacket: '#244e78',
  organt: '#f0c400',
}

function hairSvg(id) {
  if (id === 'curls') {
    return `<g fill="#1c1915"><circle cx="24" cy="36" r="6"/><circle cx="56" cy="36" r="6"/><circle cx="30" cy="24" r="7"/><circle cx="40" cy="18" r="7"/><circle cx="50" cy="24" r="7"/></g>`
  }
  if (id === 'fade') return `<path d="M27 36c2-16 24-18 26 0-8-8-18-8-26 0z" fill="#1c1915"/>`
  if (id === 'braids') {
    return `<path d="M26 36c2-16 26-18 28 0-8-8-20-8-28 0z" fill="#1c1915"/>
      <path d="M30 42c-2 14-2 26 0 36" stroke="#1c1915" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M50 42c2 14 2 26 0 36" stroke="#1c1915" stroke-width="5" fill="none" stroke-linecap="round"/>
      <circle cx="30" cy="80" r="2.2" fill="#f0c400"/><circle cx="50" cy="80" r="2.2" fill="#f0c400"/>`
  }
  return `<path d="M24 38c1-18 31-20 32 0-8-10-24-10-32 0z" fill="#1c1915"/>`
}

function outfitDetail(id, dialCode) {
  if (id === 'hoodie') return `<path d="M30 76h20v8H30z" fill="#174d32"/>`
  if (id === 'shirt') return `<path d="M32 62l8 8 8-8" fill="none" stroke="#244e78" stroke-width="2"/>`
  if (id === 'jacket') return `<path d="M40 64v28" stroke="#f4efe4" stroke-width="2"/>`
  const code = String(dialCode || '').replace(/\D/g, '').slice(0, 3) || '000'
  return `<text x="40" y="80" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="700" fill="#1c1915">${code}</text>
    <text x="40" y="90" text-anchor="middle" font-family="sans-serif" font-size="5" font-weight="700" letter-spacing="1.1" fill="#1c1915">ORGANT</text>`
}

export function avatarSvg(avatar = {}, dialCode = '', size = 96) {
  const skin = (skins.find((item) => item.id === avatar.skin) || skins[1]).fill
  const hair = avatar.hair || 'crop'
  const outfit = avatar.outfit || 'hoodie'
  const fill = cloth[outfit] || cloth.hoodie
  const height = Math.round(size * 1.28)
  const hood = outfit === 'hoodie'
    ? `<path d="M16 62c2-18 12-24 20-14 4-10 14-12 20-2 10-10 20-4 20 14l2 8H16z" fill="#174d32"/>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 102" width="${size}" height="${height}" role="img" aria-label="Avatar">
    <ellipse cx="40" cy="98" rx="22" ry="3.5" fill="#000" opacity="0.15"/>
    ${hood}
    <path d="M18 62c8-14 36-14 44 0l6 34H12z" fill="${fill}"/>
    <path d="M33 56h14v10H33z" fill="${skin}"/>
    <circle cx="40" cy="40" r="16" fill="${skin}"/>
    ${hairSvg(hair)}
    <circle cx="34" cy="40" r="1.7" fill="#1c1915"/>
    <circle cx="46" cy="40" r="1.7" fill="#1c1915"/>
    <path d="M35 47c2 3 8 3 10 0" fill="none" stroke="#1c1915" stroke-width="1.4" stroke-linecap="round"/>
    ${outfitDetail(outfit, dialCode)}
  </svg>`
}
