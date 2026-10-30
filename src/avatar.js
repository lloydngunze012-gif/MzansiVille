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

const outfitFill = {
  hoodie: '#1f6b45',
  shirt: '#f7f4ee',
  jacket: '#244e78',
  organt: '#f0c400',
}

function hairMarkup(id) {
  if (id === 'curls') {
    return `
      <circle cx="28" cy="34" r="8" fill="#1c1915"/>
      <circle cx="92" cy="34" r="8" fill="#1c1915"/>
      <circle cx="36" cy="20" r="9" fill="#1c1915"/>
      <circle cx="60" cy="14" r="10" fill="#1c1915"/>
      <circle cx="84" cy="20" r="9" fill="#1c1915"/>
      <circle cx="46" cy="28" r="7" fill="#1c1915"/>
      <circle cx="74" cy="28" r="7" fill="#1c1915"/>`
  }
  if (id === 'fade') {
    return `
      <path d="M40 28 C44 8 76 8 80 28 C74 16 46 16 40 28Z" fill="#1c1915"/>
      <path d="M36 40 C38 30 44 26 48 34" fill="none" stroke="#1c1915" stroke-width="3"/>`
  }
  if (id === 'braids') {
    return `
      <path d="M38 30 C36 8 82 8 80 32 C70 16 48 16 38 30Z" fill="#1c1915"/>
      <path d="M42 36 C38 58 34 78 40 96" fill="none" stroke="#1c1915" stroke-width="7" stroke-linecap="round"/>
      <path d="M78 36 C82 58 86 78 80 96" fill="none" stroke="#1c1915" stroke-width="7" stroke-linecap="round"/>
      <circle cx="40" cy="98" r="3.5" fill="#f0c400"/>
      <circle cx="80" cy="98" r="3.5" fill="#f0c400"/>`
  }
  return `<path d="M34 40 C36 14 84 14 86 40 C74 24 46 24 34 40Z" fill="#1c1915"/>`
}

function outfitMarkup(id, dialCode) {
  const fill = outfitFill[id] || outfitFill.hoodie
  const body = `<path d="M34 78 L28 148 L92 148 L86 78 C78 70 42 70 34 78Z" fill="${fill}"/>`
  if (id === 'hoodie') {
    return `
      <path d="M30 70 C24 48 40 44 48 62 C56 50 64 50 72 62 C80 44 96 48 90 70Z" fill="#1f6b45"/>
      ${body}
      <path d="M48 108 H72 V122 H48Z" fill="#174d32"/>`
  }
  if (id === 'shirt') {
    return `
      ${body}
      <path d="M48 78 L60 92 L72 78" fill="none" stroke="#244e78" stroke-width="3"/>
      <path d="M52 96 H68" stroke="#244e78" stroke-width="3"/>`
  }
  if (id === 'jacket') {
    return `
      ${body}
      <path d="M60 80 L60 146" stroke="#f4efe4" stroke-width="3"/>
      <path d="M46 78 L60 92 L74 78" fill="none" stroke="#f4efe4" stroke-width="3"/>`
  }
  const code = String(dialCode || '').replace(/[^\d]/g, '').slice(0, 3) || '000'
  return `
    ${body}
    <text x="60" y="112" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="700" fill="#1c1915">${code}</text>
    <text x="60" y="128" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="700" letter-spacing="1.4" fill="#1c1915">ORGANT</text>`
}

export function avatarSvg(avatar = {}, dialCode = '', size = 96) {
  const skin = skins.find((s) => s.id === avatar.skin) || skins[1]
  const hair = avatar.hair || 'crop'
  const outfit = avatar.outfit || 'hoodie'
  const height = Math.round(size * 1.25)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150" width="${size}" height="${height}" role="img" aria-label="Avatar">
    <ellipse cx="60" cy="142" rx="28" ry="5" fill="#000" opacity="0.12"/>
    ${hairMarkup(hair)}
    <circle cx="60" cy="52" r="24" fill="${skin.fill}"/>
    <circle cx="51" cy="52" r="2" fill="#1c1915"/>
    <circle cx="69" cy="52" r="2" fill="#1c1915"/>
    <path d="M54 62 Q60 66 66 62" fill="none" stroke="#1c1915" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M50 86 H70 V96 H50Z" fill="${skin.fill}"/>
    ${outfitMarkup(outfit, dialCode)}
  </svg>`
}
