export const skins = [
  { id: 'sand', label: 'Sand', fill: '#f0c7a0' },
  { id: 'amber', label: 'Amber', fill: '#d2956b' },
  { id: 'brown', label: 'Brown', fill: '#8a5a3a' },
  { id: 'deep', label: 'Deep', fill: '#4a2e1f' },
  { id: 'ebony', label: 'Ebony', fill: '#2c1b12' },
]

export const genders = [
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
]

// Saves from before the gender picker: braids and curls read as female.
export function genderOf(avatar = {}) {
  if (avatar.gender === 'female' || avatar.gender === 'male') return avatar.gender
  return avatar.hair === 'braids' || avatar.hair === 'curls' ? 'female' : 'male'
}

// The day 1 roommate shares the student's gender (res rooms are single-gender).
export function roommateOf(avatar = {}) {
  return genderOf(avatar) === 'male' ? 'Sipho' : 'Zanele'
}

export const bodies = [
  { id: 'regular', label: 'Regular' },
  { id: 'curvy', label: 'Curvy' },
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
  { id: 'dress', label: 'Dress' },
  { id: 'skirt', label: 'Skirt & top' },
  { id: 'shweshwe', label: 'Shweshwe' },
]

// Outfits with bare legs below a hem.
export const SKIRTED = new Set(['dress', 'skirt', 'shweshwe'])

// Flat Durban palette per outfit: [top, shade, trousers, shoes]
const cloth = {
  hoodie: ['#2e8b57', '#1f6b45', '#2b3a55', '#f7f4ee'],
  shirt: ['#ff8a3d', '#e0662a', '#244e78', '#1c1915'],
  jacket: ['#1d7fb8', '#165f8a', '#3a2f4f', '#f0c400'],
  organt: ['#f0c400', '#d1a800', '#1c1915', '#7b3fe4'],
  dress: ['#e8497a', '#c23863', '#e8497a', '#f7f4ee'],
  skirt: ['#f7f4ee', '#d9d2c5', '#7b3fe4', '#1c1915'],
  shweshwe: ['#2456a6', '#163a78', '#2456a6', '#c58a3a'],
}

const HAIR = '#1c1915'

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16)
  const c = (v) => Math.max(0, Math.min(255, v + amt))
  const r = c(n >> 16), g = c((n >> 8) & 255), b = c(n & 255)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

function hairBack(id) {
  if (id === 'braids') {
    return `<g stroke="${HAIR}" stroke-width="4.2" stroke-linecap="round" fill="none">
      <path d="M25 30c-4 10-4 22-2 32"/><path d="M55 30c4 10 4 22 2 32"/>
      <path d="M29 34c-2 10-2 20 0 30"/><path d="M51 34c2 10 2 20 0 30"/></g>
      <g fill="#f0c400"><circle cx="23" cy="63" r="2.2"/><circle cx="57" cy="63" r="2.2"/>
      <circle cx="29" cy="65" r="2" fill="#ff8a3d"/><circle cx="51" cy="65" r="2" fill="#ff8a3d"/></g>`
  }
  if (id === 'curls') return `<ellipse cx="40" cy="26" rx="21" ry="17" fill="${HAIR}"/>`
  return ''
}

function hairFront(id) {
  if (id === 'curls') {
    return `<g fill="${HAIR}"><circle cx="24" cy="28" r="6"/><circle cx="56" cy="28" r="6"/>
      <circle cx="29" cy="18" r="7"/><circle cx="40" cy="14" r="8"/><circle cx="51" cy="18" r="7"/>
      <circle cx="34" cy="22" r="5"/><circle cx="46" cy="22" r="5"/></g>`
  }
  if (id === 'fade') {
    return `<path d="M24 30c0-12 7-18 16-18s16 6 16 18c-3-4-6-6-9-6H33c-3 0-6 2-9 6z" fill="${HAIR}"/>
      <path d="M24 30c0 4 0 6 1 8M56 30c0 4 0 6-1 8" stroke="${HAIR}" stroke-width="1.4" opacity=".45"/>`
  }
  if (id === 'braids') {
    return `<path d="M23 31c0-13 8-20 17-20s17 7 17 20c-5-6-11-8-17-8s-12 2-17 8z" fill="${HAIR}"/>
      <path d="M31 13v10M40 11v11M49 13v10" stroke="#3a332b" stroke-width="1.2"/>`
  }
  return `<path d="M23 32c-1-14 7-21 17-21 11 0 18 7 17 21-3-5-8-9-13-9-2 3-6 4-10 3-4 0-8 2-11 6z" fill="${HAIR}"/>`
}

function top(id, c, skin, code) {
  const [t, s] = c
  const arms = `<path d="M19 55c-5 4-7 14-6 24" stroke="${t}" stroke-width="8" stroke-linecap="round" fill="none"/>
    <circle cx="13.5" cy="81" r="4" fill="${skin}"/><g class="av-arm-r"><path d="M61 55c5 4 7 14 6 24" stroke="${t}" stroke-width="8" stroke-linecap="round" fill="none"/>
    <circle cx="66.5" cy="81" r="4" fill="${skin}"/></g>`
  const body = `<path d="M20 56c4-6 12-8 20-8s16 2 20 8l2 26H18z" fill="${t}"/>`
  if (id === 'hoodie') {
    return `${arms}${body}<path d="M28 50c3 6 21 6 24 0" fill="none" stroke="${s}" stroke-width="4" stroke-linecap="round"/>
      <path d="M37 54v8M43 54v8" stroke="#f7f4ee" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M30 70h20v8H30z" fill="${s}" rx="2"/>`
  }
  if (id === 'shirt') {
    return `${arms}${body}<path d="M34 49l6 7 6-7" fill="${skin}"/>
      <path d="M32 49l8 8 8-8" fill="none" stroke="${s}" stroke-width="2"/>
      <g fill="#fffaf2" opacity=".9"><path d="M26 63l4 2-3 3z"/><path d="M51 68l4-1-1 4z"/><path d="M33 75l3-3 2 4z"/><path d="M46 60l3 2-3 2z"/></g>`
  }
  if (id === 'dress' || id === 'shweshwe') {
    const short = `<path d="M19 55c-3 3-5 7-5 11" stroke="${t}" stroke-width="8" stroke-linecap="round" fill="none"/>
      <path d="M14 66c-1 5-1 10 0 14" stroke="${skin}" stroke-width="6" stroke-linecap="round" fill="none"/><circle cx="13.5" cy="81" r="4" fill="${skin}"/>
      <g class="av-arm-r"><path d="M61 55c3 3 5 7 5 11" stroke="${t}" stroke-width="8" stroke-linecap="round" fill="none"/>
      <path d="M66 66c1 5 1 10 0 14" stroke="${skin}" stroke-width="6" stroke-linecap="round" fill="none"/><circle cx="66.5" cy="81" r="4" fill="${skin}"/></g>`
    const print = id === 'shweshwe'
      ? `<g fill="#fffaf2" opacity=".85">${[[28, 60], [40, 58], [52, 60], [24, 72], [34, 70], [46, 70], [56, 72], [30, 81], [42, 80], [52, 82]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3"/><path d="M${x - 3} ${y + 4}h6" stroke="#fffaf2" stroke-width=".8"/>`).join('')}</g>`
      : `<path d="M22 66h36" stroke="${s}" stroke-width="2.4"/>`
    return `${short}<path d="M22 56c4-6 10-8 18-8s14 2 18 8l2 10 6 21H14l6-21z" fill="${t}"/>${print}
      <path d="M34 49c3 4 9 4 12 0" fill="${skin}"/>`
  }
  if (id === 'skirt') {
    return `${arms}<path d="M20 56c4-6 12-8 20-8s16 2 20 8l1 12H19z" fill="${t}"/>
      <path d="M34 49c3 4 9 4 12 0" fill="none" stroke="${s}" stroke-width="2"/>
      <path d="M20 67h40l5 19H15z" fill="${c[2]}"/><path d="M27 68l-3 17M40 68v18M53 68l3 17" stroke="#000" stroke-width=".8" opacity=".2"/>`
  }
  if (id === 'jacket') {
    return `${arms}${body}<path d="M35 50l5 32 5-32" fill="#fffaf2"/>
      <path d="M40 52v30" stroke="${s}" stroke-width="1.6"/>
      <path d="M20 60h40M19 66h42" stroke="#f0c400" stroke-width="1.6" opacity=".9"/>`
  }
  return `${arms}${body}<path d="M33 49c3 4 11 4 14 0" fill="none" stroke="#7b3fe4" stroke-width="2.4"/>
    <text x="40" y="71" text-anchor="middle" font-family="'Arial Black',Impact,sans-serif" font-size="12" font-weight="900" fill="#1c1915">${code}</text>
    <text x="40" y="78" text-anchor="middle" font-family="'Arial Black',Impact,sans-serif" font-size="4.6" letter-spacing="1" fill="#7b3fe4">ORGANT</text>`
}

export function avatarSvg(avatar = {}, dialCode = '', size = 96) {
  const skin = (skins.find((item) => item.id === avatar.skin) || skins[1]).fill
  const hair = avatar.hair || 'crop'
  const outfit = cloth[avatar.outfit] ? avatar.outfit : 'hoodie'
  const c = cloth[outfit]
  const code = String(dialCode || '').replace(/\D/g, '').slice(0, 3) || '000'
  const height = Math.round(size * 1.28)
  const cheek = shade(skin, -18)
  const dark = parseInt(skin.slice(1, 3), 16) < 0x60
  const wide = avatar.body === 'curvy' ? ' transform="translate(40 0) scale(1.24 1) translate(-40 0)"' : ''
  const ink = dark ? '#0b0705' : HAIR
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 102" width="${size}" height="${height}" role="img" aria-label="Avatar">
    <ellipse cx="40" cy="99" rx="20" ry="3" fill="#000" opacity=".18"/>
    ${hairBack(hair)}
    <g${wide}><path d="M28 80h10l-1 15h-8zM42 80h10l-1 15h-8z" fill="${SKIRTED.has(outfit) ? skin : c[2]}"/>
    <path d="M26 94h12v4H25zM42 94h12l1 4H42z" fill="${c[3]}"/>
    <rect x="35" y="42" width="10" height="9" rx="3" fill="${skin}"/>
    <path d="M35 47h10" stroke="${cheek}" stroke-width="2" opacity=".5"/>
    ${top(outfit, c, skin, code)}</g>
    <circle cx="23.5" cy="33" r="3.4" fill="${skin}"/><circle cx="56.5" cy="33" r="3.4" fill="${skin}"/>
    <ellipse cx="40" cy="30" rx="16" ry="17" fill="${skin}"/>
    ${hairFront(hair)}
    <path d="M31.5 29.5q2.5-2 5 0M43.5 29.5q2.5-2 5 0" stroke="${dark ? '#120b07' : HAIR}" stroke-width="${dark ? 1.9 : 1.5}" fill="none" stroke-linecap="round"/>
    ${dark ? '<ellipse cx="34" cy="34" rx="2.9" ry="3" fill="#f7f1ea"/><ellipse cx="46" cy="34" rx="2.9" ry="3" fill="#f7f1ea"/><ellipse cx="40" cy="22" rx="7" ry="3" fill="#fff" opacity=".1"/>' : ''}
    <ellipse cx="34" cy="34" rx="1.9" ry="2.3" fill="${ink}"/><ellipse cx="46" cy="34" rx="1.9" ry="2.3" fill="${ink}"/>
    <circle cx="34.6" cy="33.2" r=".6" fill="#fff"/><circle cx="46.6" cy="33.2" r=".6" fill="#fff"/>
    <ellipse cx="30" cy="39" rx="2.6" ry="1.6" fill="#ff7a59" opacity="${dark ? .5 : .35}"/><ellipse cx="50" cy="39" rx="2.6" ry="1.6" fill="#ff7a59" opacity="${dark ? .5 : .35}"/>
    ${dark ? '<path d="M35 40.5q5 4.5 10 0z" fill="#3a0f0c" stroke="#c97a62" stroke-width="1.1" stroke-linejoin="round"/><path d="M36.5 41h7" stroke="#fff" stroke-width="1"/>' : `<path d="M35 40.5q5 4.5 10 0" fill="${shade(skin, -60)}" stroke="${shade(skin, -60)}" stroke-width="1.2" stroke-linejoin="round"/>`}
  </svg>`
}
