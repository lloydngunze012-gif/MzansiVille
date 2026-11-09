// Old saves keep their old ids (owner, 9 Nov: the cast was renamed). Everything a save remembers about
// a person is keyed by their id (run.people, run.contacts, run.crush, run.bestieName), so a save from
// before is mapped to the new ids once, when it loads. docs/cast.md lists the renames.
export const OLD_IDS = {
  zanele: 'zoe',
  sipho: 'ethan',
  kea: 'kayla',
  thandi: 'chloe',
  lindiwe: 'leah',
  dr_mahlangu: 'dr_adams',
  amahle: 'mia',
  kabelo: 'daniel',
  auntie_pinky: 'mama_liz',
}
// The names that were shown (a save keeps some of them as text).
const OLD_NAMES = { Zanele: 'Zoe', Sipho: 'Ethan', Kea: 'Kayla', Thandi: 'Chloe', Lindiwe: 'Leah', Amahle: 'Mia', Kabelo: 'Daniel', 'Dr Mahlangu': 'Dr Adams', 'Auntie Pinky': 'Mama Liz' }

const rekey = (obj) => {
  if (!obj || typeof obj !== 'object') return obj
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    const id = OLD_IDS[k] || k
    // (two old ids can't meet: the new ids are all different)
    out[id] = out[id] ? { ...v, ...out[id] } : v
  }
  return out
}

// Maps a save's run in place. Returns true if it changed anything.
export function migrateCast(run) {
  if (!run) return false
  const before = JSON.stringify([run.people, run.contacts, run.crush, run.bestieName, run.arcs, run.character?.roommate])
  // (the first two roommates stay roommates: Zanele is Zoe, Sipho is Ethan)
  if (run.character && !run.character.roommate && (run.bestieName === 'Zanele' || run.bestieName === 'Sipho')) run.character = { ...run.character, roommate: OLD_IDS[run.bestieName.toLowerCase()] }
  if (run.people) run.people = rekey(run.people)
  if (Array.isArray(run.contacts)) run.contacts = run.contacts.map((c) => (c && OLD_IDS[c.id] ? { ...c, id: OLD_IDS[c.id], name: OLD_NAMES[c.name] || c.name } : c))
  if (run.crush) {
    const id = OLD_IDS[run.crush.id] || run.crush.id
    run.crush = { ...run.crush, id, name: OLD_NAMES[run.crush.name] || run.crush.name }
  }
  if (run.bestieName && OLD_NAMES[run.bestieName]) run.bestieName = OLD_NAMES[run.bestieName]
  return before !== JSON.stringify([run.people, run.contacts, run.crush, run.bestieName, run.arcs, run.character?.roommate])
}
