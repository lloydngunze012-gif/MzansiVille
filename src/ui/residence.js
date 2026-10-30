import { formatMoney } from '../engine/format.js'
import { homePlaceId } from '../engine/model.js'

// Turns the residence sheet into words. Nothing here changes a stat.
export function residenceFacts(row) {
  const distance = row.distanceKm == null ? 'Distance varies' : `${row.distanceKm} km`
  const rent = row.monthlyRent == null ? 'Rent varies' : `${formatMoney(row.monthlyRent)} / month`
  const vibe = row.vibe || 'Your own vibe'
  return {
    distance,
    rent,
    vibe,
    line: `${distance} · ${rent} · ${vibe}`,
    tendency: tendency(row),
  }
}

function tendency(row) {
  const parts = []
  const add = (n, up, down) => {
    if (!n) return
    const size = Math.abs(n) >= 4 ? 'much ' : Math.abs(n) === 1 ? 'a little ' : ''
    parts.push(size + (n > 0 ? up : down))
  }
  add(row.modEnergy, 'easier sleep', 'rougher nights')
  add(row.modSocial, 'louder socially', 'quieter socially')
  add(row.modGrades, 'kinder to grades', 'harder on grades')
  add(row.modHunger, 'fuller plates', 'thinner meals')
  if (!parts.length) return 'No built-in lean. It is just a room.'
  if (parts.length === 1) return `Tends toward ${parts[0]}.`
  const last = parts.pop()
  const joiner = parts.length > 1 ? ', and ' : ' and '
  return `Tends toward ${parts.join(', ')}${joiner}${last}.`
}

export function residencesAt(district, placeId) {
  return district.residences.filter((row) => homePlaceId(district, row.name) === placeId)
}

export function pinResidenceLine(district, placeId, homeName) {
  const homes = residencesAt(district, placeId)
  if (!homes.length) return { chip: '', detail: '' }
  if (homes.length === 1) {
    const facts = residenceFacts(homes[0])
    const rent = homes[0].monthlyRent == null ? 'Rent varies' : formatMoney(homes[0].monthlyRent)
    const mine = homes[0].name === homeName
    return {
      // Full line on your own pin. The other blocks only show rent, so the south of the map stays readable.
      // Distance, vibe, and the tendency are on every pin's tooltip and on the place card.
      chip: mine ? `${facts.distance} · ${rent} · ${facts.vibe}` : rent,
      detail: `${homes[0].name}. ${facts.line}. ${facts.tendency}`,
    }
  }
  const mine = homes.find((row) => row.name === homeName)
  if (mine) {
    const facts = residenceFacts(mine)
    return {
      chip: `${mine.name} · ${facts.vibe}`,
      detail: `${mine.name}. ${facts.line}. ${facts.tendency}`,
    }
  }
  return {
    chip: `${homes.length} homes`,
    detail: `${homes.length} homes. Open this stop for each name, distance, rent, and vibe.`,
  }
}
