// Who drives you to UMzansi on day 1 (owner, 12 Nov, job I: "two players arriving together had identical cars and
// the same mum in the same clothes"). Each player gets one of homes.json's drivers (mum, dad, aunt, uncle, gogo, an
// older sibling) in one of their outfits and colours, and one of its family cars in a colour of its own: picked from
// the player's id, so it is the same at home at breakfast, in the car and at the gate, every time the day is played.
// The family's skin and hair colour are the player's (as before); gogo's hair is grey.
import HOMES from '../data/campusville/homes.json' with { type: 'json' }

function hash(text) {
  let h = 2166136261
  for (const ch of String(text || 'student')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) }
  return h >>> 0
}
const pick = (list, n) => list[n % list.length]

// seed: the player's id (presence.js myIdentity().id). styleId: suburban | township.
// Returns { role, gender, call, outfit, top, bottom, hair, hairColor?, car: { model, colour } }.
export function familyFor(seed, styleId) {
  const style = HOMES.styles[styleId] || HOMES.styles[HOMES.default]
  const drivers = HOMES.drivers?.length ? HOMES.drivers : [{ role: style.parent.role, gender: 'female', call: { [styleId]: style.parent.call }, looks: [{ outfit: style.parent.outfit, top: style.parent.top, bottom: style.parent.bottom }] }]
  const h = hash(`${seed}:${styleId}`)
  const d = pick(drivers, h)
  const look = pick(d.looks || [{}], h >>> 5)
  const cars = HOMES.familyCars?.length ? HOMES.familyCars : [{ model: style.street.familyCar, colours: [style.street.familyCarColour] }]
  const car = pick(cars, h >>> 9)
  return {
    role: d.role,
    gender: d.gender || 'female',
    call: (d.call && (d.call[styleId] || d.call.default)) || style.parent.call,
    outfit: look.outfit || style.parent.outfit,
    top: look.top || style.parent.top,
    bottom: look.bottom || style.parent.bottom,
    hair: look.hair || (d.gender === 'male' ? 'crop' : 'curls'),
    hairColor: d.grey ? '#d8d4cc' : undefined,
    car: { model: car.model, colour: pick(car.colours || ['#d9dde2'], h >>> 13) },
  }
}

// The driver's look in your family's skin (me: the player's avatar).
export function familyLook(who, me = {}) {
  const gender = who.gender || (who.role === 'mom' || who.role === 'sister' ? 'female' : 'male')
  const outfit = gender === 'male' && !['hoodie', 'shirt', 'jacket', 'organt'].includes(who.outfit) ? 'shirt' : who.outfit
  return { gender, skin: me.skin, skinColor: me.skinColor, hairColor: who.hairColor || me.hairColor, hair: who.hair || (gender === 'female' ? 'curls' : 'crop'), outfit, topColor: who.top, bottomColor: who.bottom, body: me.body }
}
