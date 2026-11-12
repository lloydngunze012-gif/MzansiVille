// The palette rule (docs/palette.md), as a check any test can run on the screen in front of it.
//   - every piece of text has 4.5:1 contrast or better against the surface it sits on
//   - a yellow surface carries ink text; a dark surface carries white text; a light surface carries dark text
//   - no purple or navy buttons
// Text drawn straight over the 3D picture or over a photo has no surface to measure and is left out (it must sit
// on a card or a pill of its own). `root` narrows the check to one part of the page (a CSS selector).
export const paletteFaults = (page, root = 'body') => page.evaluate((sel) => {
  const parse = (v) => { const m = String(v).match(/[\d.]+/g); if (!m) return null; const [r, g, b, a = 1] = m.map(Number); return { r, g, b, a } }
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 })
  const hsl = ({ r, g, b }) => {
    r /= 255; g /= 255; b /= 255
    const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2
    if (max === min) return { h: 0, s: 0, l }
    const d = max - min
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60
    return { h, s, l }
  }
  const hex = (c) => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
  // The surface under an element: its own or the nearest ancestor's solid colour. null = a picture, a gradient,
  // or nothing solid at all (the 3D scene).
  const surface = (el) => {
    const layers = []
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n)
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return layers.length ? null : null
      const c = parse(cs.backgroundColor)
      if (c && c.a > 0.02) { layers.push(c); if (c.a > 0.9) break }
    }
    if (!layers.length || layers[layers.length - 1].a <= 0.9) return null
    return layers.reverse().reduce((under, top) => over(top, under), { r: 255, g: 255, b: 255, a: 1 })
  }
  const shown = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return false
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.4 || n.hidden) return false }
    return true
  }
  const name = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`
  const faults = []
  const seen = new Set()
  const add = (text) => { if (!seen.has(text)) { seen.add(text); faults.push(text) } }
  const scope = document.querySelector(sel)
  if (!scope) return [`nothing matches ${sel}`]
  for (const el of scope.querySelectorAll('*')) {
    if (!shown(el)) continue
    const cs = getComputedStyle(el)
    // buttons: never purple or navy
    if (el.matches('button, a.btn, [role="button"], [role="tab"]')) {
      const own = parse(cs.backgroundColor)
      if (own && own.a > 0.5) { const { h, s, l } = hsl(own); if (h >= 215 && h <= 320 && s > 0.25 && l < 0.62) add(`purple or navy button: ${name(el)} is ${hex(own)}`) }
    }
    // text: only elements that hold text of their own
    const words = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim()
    if (!words || /^[\p{Extended_Pictographic}\p{P}\p{S}\s️‍]+$/u.test(words)) continue // (an emoji or a mark carries its own colours)
    const bg = surface(el)
    if (!bg) continue
    const fg0 = parse(cs.color)
    if (!fg0) continue
    const fg = over({ ...fg0, a: fg0.a * Number(cs.opacity || 1) }, bg)
    const c = ratio(fg, bg)
    const said = `"${words.slice(0, 24)}" (${name(el)}): ${hex(fg)} on ${hex(bg)}`
    if (c < 4.5) add(`contrast ${c.toFixed(2)}:1 ${said}`)
    const b = hsl(bg)
    const yellow = b.h >= 40 && b.h <= 58 && b.s > 0.8 && b.l > 0.4 && b.l < 0.62
    if (yellow && lum(fg) > 0.06) add(`yellow must carry ink text: ${said}`)
    else if (!yellow && lum(bg) < 0.12 && lum(fg) < 0.85) add(`a dark surface carries white text only: ${said}`)
    else if (!yellow && lum(bg) > 0.7 && lum(fg) > 0.2) add(`a light surface carries dark text: ${said}`)
  }
  return faults
}, root)
