// Raw rows (arrays of cells), blank lines dropped. The header is row 0.
export function parseCsvRows(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  const src = String(text).replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i += 1
        } else quoted = false
      } else cell += c
      continue
    }
    if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (c !== '\r') cell += c
  }
  if (cell.length || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((value) => String(value).trim() !== ''))
}

export function parseCsv(text) {
  const kept = parseCsvRows(text)
  if (!kept.length) return []
  const header = kept[0].map((h) => h.trim())
  return kept.slice(1).map((r) => {
    const obj = {}
    header.forEach((key, index) => {
      obj[key] = (r[index] ?? '').trim()
    })
    return obj
  })
}

export function num(value) {
  const n = Number(String(value ?? '').trim())
  return Number.isFinite(n) ? n : 0
}
