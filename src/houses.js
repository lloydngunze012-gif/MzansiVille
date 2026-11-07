// A house's name as it stands today, for a name seen anywhere that may still carry an old one:
// a leaderboard row or a player card written by a phone on an older build, or saved before a rename
// (Thekwini House -> Wave House, Braam House -> Goldrush House, 7 Nov). Matches the current name, the
// id, or any of houses.json's "was" names; a name it doesn't know comes back unchanged.
// The district registry hands over houses.json (registerHouses), so this file reads no JSON itself
// (the sim checks run it in plain Node).
let table = new Map()

export function registerHouses(file) {
  const list = file?.houses || file || []
  table = new Map()
  for (const h of list) for (const n of [h.name, h.id, ...(h.was || [])]) table.set(String(n).toLowerCase(), h.name)
}

export function canonicalHouse(name) {
  if (!name) return name || ''
  return table.get(String(name).toLowerCase()) || name
}
