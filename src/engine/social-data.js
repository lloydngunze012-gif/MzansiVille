import { canonicalHouse } from '../houses.js'
// Pure board ranking and the labelled sample rows used by mock mode.
const SAMPLE_PEOPLE = [
  ['s1', 'Lerato M.', 'Peak House', 2860, 71, 82],
  ['s2', 'Sipho K.', 'Wave House', 2410, 64, 77],
  ['s3', 'Ayesha P.', 'Oakwinds House', 1980, 88, 69],
  ['s4', 'Pieter v.d.M.', 'Jakaranda House', 3120, 52, 61],
  ['s5', 'Nomsa D.', 'Wave House', 1640, 79, 86],
  ['s6', 'Thabo N.', 'Goldrush House', 2210, 58, 73],
  ['s7', 'Kayla R.', 'Peak House', 1310, 92, 66],
  ['s8', 'Zanele S.', 'Oakwinds House', 2750, 61, 80],
  ['s9', 'Mohammed A.', 'Mzansi House', 1890, 74, 71],
  ['s10', 'Jabu T.', 'Wave House', 980, 67, 58],
]

export function sampleBoard() {
  return SAMPLE_PEOPLE.map(([id, name, res, money, grades, balanced]) => ({
    user_id: id, display_name: name, residence: res, sample: true,
    money, grades, balanced, rich_avg: money, dean_avg: grades, balanced_avg: balanced,
  }))
}

export function sampleLobby(now = Date.now()) {
  const lines = [
    ['s2', 'Sipho K.', 'Wave House', 'Anyone at the Quad? Free time vibes', 42],
    ['s5', 'Nomsa D.', 'Wave House', 'Library opens 15:00, saving us a table', 31],
    ['s4', 'Pieter v.d.M.', 'Jakaranda House', 'That surprise test was kak hard, jissis', 22],
    ['s7', 'Kayla R.', 'Peak House', 'Derby Day on Sunday!! who is coming', 15],
    ['s10', 'Jabu T.', 'Wave House', 'Cafeteria special is lekker today', 6],
    ['s8', 'Zanele S.', 'Oakwinds House', 'Sho, see you all at the bus station', 2],
  ]
  return lines.map(([user_id, name, residence, body, ago], i) => ({
    id: `sample-${i}`, user_id, name, residence, body, sample: true,
    created_at: new Date(now - ago * 60000).toISOString(),
  }))
}

export const BOARD_TABS = [
  ['money', 'Richest', 'rich_avg', '\u{1F4B0}'],
  ['grades', "Dean's List", 'dean_avg', '\u{1F393}'],
  ['balanced', 'Most Balanced', 'balanced_avg', '\u2696\uFE0F'],
]

export function rankRows(rows, tab, scope, myRes) {
  // (rows written before a house was renamed still carry its old name: same house, same group)
  rows = rows.map((r) => (r.residence ? { ...r, residence: canonicalHouse(r.residence) } : r))
  myRes = canonicalHouse(myRes)
  const key = (BOARD_TABS.find((t) => t[0] === tab) || BOARD_TABS[0])[2]
  const score = (r) => Number(r[key] ?? 0)
  if (scope === 'houses') {
    const groups = {}
    for (const r of rows) {
      if (!r.residence) continue
      const g = groups[r.residence] || (groups[r.residence] = { residence: r.residence, n: 0, sum: 0, sample: r.sample })
      g.n += 1
      g.sum += score(r)
    }
    return Object.values(groups).map((g) => ({ ...g, score: g.sum / g.n, mine: g.residence === myRes })).sort((a, b) => b.score - a.score)
  }
  const list = scope === 'res' ? rows.filter((r) => r.residence === myRes) : rows
  return list.map((r) => ({ ...r, score: score(r) })).sort((a, b) => b.score - a.score)
}
