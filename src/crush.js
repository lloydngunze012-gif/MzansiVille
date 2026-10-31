// The crush: first seen at the bus stop on day 1 (spec section 3, arc 2).
// Who it is follows "who you're interested in" from the creator; until that is
// picked, it is someone of the other gender. run.crush remembers how it went.
import { genderOf } from './avatar.js'

export const CRUSHES = {
  amahle: {
    id: 'amahle',
    name: 'Amahle',
    gender: 'female',
    look: { model: 'female-d', gender: 'female', skin: 'brown', outfit: 'skirt', topColor: '#f2c14e', bottomColor: '#2b3a55', hairColor: '#1c1915' },
  },
  kabelo: {
    id: 'kabelo',
    name: 'Kabelo',
    gender: 'male',
    look: { model: 'male-d', gender: 'male', skin: 'deep', outfit: 'tee', topColor: '#2a9d8f', bottomColor: '#1c1915', hairColor: '#1c1915' },
  },
}

// interest: 'guys' | 'girls' | 'everyone' | 'none' (none: the same person, as a friend).
export function crushFor(character = {}) {
  const interest = character.interest
  if (interest === 'guys') return CRUSHES.kabelo
  if (interest === 'girls') return CRUSHES.amahle
  return genderOf(character.avatar) === 'male' ? CRUSHES.amahle : CRUSHES.kabelo
}

// The name the game shows: their name once you know it, "Bus stop stranger" before.
export function crushLabel(run) {
  const c = run?.crush
  if (!c) return ''
  return c.nameKnown ? c.name : 'Bus stop stranger'
}

export function newCrush(character) {
  const c = crushFor(character)
  return { id: c.id, name: c.name, gender: c.gender, romance: character?.interest !== 'none', met: null, nameKnown: false, closeness: 0, opener: null, sat: null }
}
