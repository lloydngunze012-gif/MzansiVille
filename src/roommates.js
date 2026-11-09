// The roommate pool (owner, 9 Nov): four for the women's res, four for the men's. The player
// picks one in the creator ("Your roommate"); until they do, the default is the same gender as
// their res and the skin closest to theirs. Everything that shows the roommate (res morning,
// drop-off, lecture, Quad, talk) reads roommateFor(character). Data: data/campusville/roommates.json.
import DATA from '../data/campusville/roommates.json'
import { genderOf, skins } from './avatar.js'

export const ROOMMATES = [...DATA.women.map((r) => ({ ...r, gender: 'female' })), ...DATA.men.map((r) => ({ ...r, gender: 'male' }))]
export const roommateById = (id) => ROOMMATES.find((r) => r.id === id) || null

// The four who share a res with a student of this gender.
export const roommatesFor = (gender) => ROOMMATES.filter((r) => r.gender === (gender === 'male' ? 'male' : 'female'))

const skinIndex = (id) => Math.max(0, skins.findIndex((s) => s.id === id))

// The default: closest skin, the first in the pool on a tie.
export function defaultRoommate(avatar = {}) {
  const pool = roommatesFor(genderOf(avatar))
  const mine = skinIndex(avatar.skin || 'amber')
  return pool.reduce((best, r) => (Math.abs(skinIndex(r.skin) - mine) < Math.abs(skinIndex(best.skin) - mine) ? r : best), pool[0])
}

// The roommate of a character ({ avatar, roommate }): the chosen one if they share the player's res
// (a changed gender in Edit falls back to the default), else the default.
export function roommateFor(character = {}) {
  const avatar = character.avatar || {}
  const chosen = roommateById(character.roommate)
  if (chosen && chosen.gender === genderOf(avatar)) return chosen
  return defaultRoommate(avatar)
}

// How the roommate looks in 3D (cast.js, morning, drop-off, lecture).
export const roommateLook = (r) => ({ ...r.look, skin: r.skin, gender: r.gender })

