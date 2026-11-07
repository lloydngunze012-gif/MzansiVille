// A house's name as it stands today, for a name seen anywhere that may still carry an old one:
// a leaderboard row or a player card written by a phone on an older build, or saved before a rename
// (Thekwini House -> Wave House, Braam House -> Goldrush House, 7 Nov). Matches the current name, the
// id, or any of houses.json's "was" names; a name no house knows gets the house houseOf (engine/model.js) gives it, the same one every time
// (unchanged only before any houses are registered).
// The district registry hands over houses.json (registerHouses), so this file reads no JSON itself
// (the sim checks run it in plain Node).
import { houseOf } from './engine/model.js'

let table = new Map()
let houses = []

export function registerHouses(file) {
  const list = file?.houses || file || []
  table = new Map()
  houses = list.map((h) => ({ ...h, was: h.was || [] }))
  for (const h of list) for (const n of [h.name, h.id, ...(h.was || [])]) table.set(String(n).toLowerCase(), h.name)
}

export function canonicalHouse(name) {
  if (!name) return name || ''
  // a name no house lists (an old pre-house residence, e.g. Cane Crescent) lands in the house
  // main.js gives it: the same houseOf rule, so the leaderboard never shows a house that doesn't exist
  return table.get(String(name).toLowerCase()) || houseOf({ houses }, String(name))?.name || name
}
