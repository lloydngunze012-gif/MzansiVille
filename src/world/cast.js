// How each named person looks (extras get a random look of their gender).
import { personInfo } from '../engine/people.js'

const LOOKS = {
  zanele: { model: 'female-b', skin: 'deep', outfit: 'hoodie', topColor: '#d9534f', hairColor: '#f0c400', bottomColor: '#2b3a55', gender: 'female' },
  sipho: { model: 'male-a', skin: 'brown', outfit: 'jacket', topColor: '#1d7fb8', bottomColor: '#3a2f4f', gender: 'male' },
  lethabo: { model: 'male-f', skin: 'deep', outfit: 'shirt', topColor: '#ff8a3d', gender: 'male' },
  kea: { model: 'male-a', skin: 'deep', outfit: 'hoodie', topColor: '#1d7fb8', gender: 'male' },
  amir: { model: 'male-d', skin: 'amber', outfit: 'jacket', topColor: '#4a5a6a', gender: 'male' },
  naledi: { model: 'female-d', skin: 'deep', outfit: 'shweshwe', gender: 'female' },
  luke: { model: 'male-d', skin: 'sand', outfit: 'organt', gender: 'male' },
  thandi: { model: 'female-b', skin: 'amber', outfit: 'skirt', gender: 'female' },
  jordan: { model: 'male-f', skin: 'brown', outfit: 'shirt', topColor: '#7b3fe4', gender: 'male' },
  priya: { model: 'female-f', skin: 'amber', outfit: 'hoodie', topColor: '#2e8b57', gender: 'female' },
  noah: { model: 'male-a', skin: 'ebony', outfit: 'jacket', gender: 'male' },
  aya: { model: 'female-d', skin: 'brown', outfit: 'dress', topColor: '#f0c400', gender: 'female' },
  mam_gugu: { model: 'female-d', skin: 'brown', outfit: 'dress', topColor: '#e8497a', hairColor: '#7b3fe4', gender: 'female' },
  auntie_pinky: { model: 'female-f', skin: 'deep', outfit: 'dress', topColor: '#f7f4ee', hairColor: '#e8497a', gender: 'female' },
  dr_moodley: { model: 'male-d', skin: 'amber', outfit: 'jacket', topColor: '#5b4a3a', bottomColor: '#2b2b2b', gender: 'male' },
  bongani: { model: 'male-a', skin: 'deep', outfit: 'hoodie', topColor: '#1f7a3a', bottomColor: '#1c1915', gender: 'male' },
  lindiwe: { model: 'female-f', skin: 'brown', outfit: 'hoodie', topColor: '#c62828', bottomColor: '#7a0e0e', gender: 'female' },
  ruan: { model: 'male-d', skin: 'sand', outfit: 'hoodie', topColor: '#1e5bb8', bottomColor: '#0d3473', gender: 'male' },
}

const TOPS = ['#2e8b57', '#ff8a3d', '#1d7fb8', '#e8497a', '#7b3fe4', '#f7f4ee', '#d9534f', '#2456a6', '#1c1915']
const SKINS = ['sand', 'amber', 'brown', 'deep', 'ebony']

export function lookForPerson(id, seed = 0) {
  if (LOOKS[id]) return LOOKS[id]
  const info = personInfo(id)
  const female = info?.gender === 'female'
  const models = female ? ['female-b', 'female-d', 'female-f'] : ['male-a', 'male-d', 'male-f']
  const outfits = female ? ['hoodie', 'skirt', 'dress', 'shirt', 'shweshwe', 'jacket'] : ['hoodie', 'shirt', 'jacket']
  return {
    model: models[seed % models.length],
    gender: female ? 'female' : 'male',
    skin: SKINS[(seed * 3) % SKINS.length],
    outfit: outfits[(seed * 5) % outfits.length],
    topColor: TOPS[(seed * 7) % TOPS.length],
  }
}

export function nameOf(id) {
  return personInfo(id)?.name || ''
}
