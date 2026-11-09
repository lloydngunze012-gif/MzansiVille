// How each named person looks (extras get a random look of their gender).
import { personInfo } from '../engine/people.js'
import { CRUSHES } from '../crush.js'
import { skinFor } from './skinmix.js'
import { ROOMMATES, roommateLook } from '../roommates.js'

const LOOKS = {
  // (the eight roommates: data/campusville/roommates.json)
  ...Object.fromEntries(ROOMMATES.map((r) => [r.id, roommateLook(r)])),
  lethabo: { model: 'male-f', skin: 'deep', outfit: 'shirt', topColor: '#ff8a3d', gender: 'male' },
  kayla: { model: 'female-b', skin: 'brown', outfit: 'hoodie', topColor: '#1d7fb8', gender: 'female' },
  amir: { model: 'male-d', skin: 'amber', outfit: 'jacket', topColor: '#4a5a6a', gender: 'male' },
  naledi: { model: 'female-d', skin: 'deep', outfit: 'shweshwe', gender: 'female' },
  luke: { model: 'male-d', skin: 'fair', outfit: 'organt', gender: 'male' },
  chloe: { model: 'female-b', skin: 'fair', outfit: 'skirt', gender: 'female' },
  jordan: { model: 'male-f', skin: 'brown', outfit: 'shirt', topColor: '#7b3fe4', gender: 'male' },
  priya: { model: 'female-f', skin: 'amber', outfit: 'hoodie', topColor: '#2e8b57', gender: 'female' },
  noah: { model: 'male-a', skin: 'ebony', outfit: 'jacket', gender: 'male' },
  aya: { model: 'female-d', skin: 'brown', outfit: 'dress', topColor: '#f0c400', gender: 'female' },
  mam_gugu: { model: 'female-d', skin: 'deep', outfit: 'dress', topColor: '#e8497a', hairColor: '#7b3fe4', gender: 'female' },
  mama_liz: { model: 'female-f', skin: 'deep', outfit: 'dress', topColor: '#f7f4ee', hairColor: '#e8497a', gender: 'female' },
  // (the Caf's other staff, for when the Caf scene is staffed: docs/cast.md)
  aunty_premi: { model: 'female-d', skin: 'amber', outfit: 'dress', topColor: '#e8a33d', hairColor: '#1c1915', gender: 'female' },
  uncle_jaco: { model: 'male-d', skin: 'fair', outfit: 'shirt', topColor: '#2e8b57', bottomColor: '#3a3a3a', gender: 'male' },
  kyle: { model: 'male-a', skin: 'brown', outfit: 'shirt', topColor: '#7b3fe4', bottomColor: '#1c1915', gender: 'male' },
  dr_moodley: { model: 'male-d', skin: 'amber', outfit: 'jacket', topColor: '#5b4a3a', bottomColor: '#2b2b2b', gender: 'male' },
  prof_naidoo: { model: 'female-f', skin: 'amber', outfit: 'jacket', topColor: '#6b1d1d', bottomColor: '#1c1915', gender: 'female' },
  dr_adams: { model: 'male-a', skin: 'brown', outfit: 'shirt', topColor: '#f7f4ee', bottomColor: '#2b3a55', gender: 'male' },
  prof_vanwyk: { model: 'male-f', skin: 'sand', outfit: 'shirt', topColor: '#d97a1d', bottomColor: '#3a3a3a', gender: 'male' },
  dr_khumalo: { model: 'female-d', skin: 'brown', outfit: 'jacket', topColor: '#2e8b57', bottomColor: '#1c1915', gender: 'female' },
  bongani: { model: 'male-a', skin: 'deep', outfit: 'hoodie', topColor: '#1f7a3a', bottomColor: '#1c1915', gender: 'male' },
  leah: { model: 'female-f', skin: 'fair', outfit: 'hoodie', topColor: '#c62828', bottomColor: '#7a0e0e', gender: 'female' },
  ruan: { model: 'male-d', skin: 'sand', outfit: 'hoodie', topColor: '#1e5bb8', bottomColor: '#0d3473', gender: 'male' },
  mia: CRUSHES.mia.look,
  daniel: CRUSHES.daniel.look,
  // The international students (docs/cast.md)
  david: { model: 'male-d', skin: 'deep', outfit: 'hoodie', topColor: '#008751', bottomColor: '#1c1915', gender: 'male' },
  grace: { model: 'female-b', skin: 'deep', outfit: 'jacket', topColor: '#bb0000', bottomColor: '#2b3a55', hairColor: '#1c1915', gender: 'female' },
  tendai: { model: 'male-f', skin: 'brown', outfit: 'shirt', topColor: '#f0c400', bottomColor: '#1c1915', gender: 'male' },
}

const TOPS = ['#2e8b57', '#ff8a3d', '#1d7fb8', '#e8497a', '#7b3fe4', '#f7f4ee', '#d9534f', '#2456a6', '#1c1915']

export function lookForPerson(id, seed = 0) {
  if (LOOKS[id]) return LOOKS[id]
  const info = personInfo(id)
  const female = info?.gender === 'female'
  const models = female ? ['female-b', 'female-d', 'female-f'] : ['male-a', 'male-d', 'male-f']
  const outfits = female ? ['hoodie', 'skirt', 'dress', 'shirt', 'shweshwe', 'jacket'] : ['hoodie', 'shirt', 'jacket']
  return {
    model: models[seed % models.length],
    gender: female ? 'female' : 'male',
    skin: skinFor(seed),
    outfit: outfits[(seed * 5) % outfits.length],
    topColor: TOPS[(seed * 7) % TOPS.length],
  }
}

export function nameOf(id) {
  return personInfo(id)?.name || ''
}
