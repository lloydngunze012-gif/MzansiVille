import { num, parseCsv } from './csv.js'
import { hashString } from './format.js'

const EMPTY_DELTAS = { money: 0, energy: 0, grades: 0, social: 0, hunger: 0 }

function asArray(value, parser) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return parser(value)
  return []
}

function phasesFor(phase, aliases) {
  if (aliases[phase]) return aliases[phase].slice()
  return [phase]
}

function deltasFrom(row) {
  return {
    money: num(row.money),
    energy: num(row.energy),
    grades: num(row.grades),
    social: num(row.social),
    hunger: num(row.hunger),
  }
}

export function buildDistrict(parts) {
  const meta = parts.meta
  const aliases = meta.phaseAliases || {}
  const scopes = meta.scopes || {}
  const scopeOf = {}
  for (const [scope, ids] of Object.entries(scopes)) {
    for (const id of ids) scopeOf[id] = scope
  }
  const tags = meta.tags || {}

  const places = asArray(parts.places, parseCsv).map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    x: num(row.x),
    y: num(row.y),
    blurb: row.what_happens_here || row.blurb || '',
  }))
  // The houses (houses.json) are the residences: each one is a building on the map.
  const houses = (parts.houses?.houses || []).map((h) => ({
    id: h.id,
    name: h.name,
    short: h.short || h.name,
    main: h.main || '#444444',
    accent: h.accent || '#ffffff',
    place: h.place || `house_${h.id}`,
    x: num(h.x),
    y: num(h.y),
    model: h.model || 'building-m',
    height: num(h.height) || 10,
    vibe: h.vibe || '',
    blurb: h.blurb || '',
    international: Boolean(h.international),
    was: h.was || [],
  }))
  for (const h of houses) {
    if (!places.some((p) => p.id === h.place)) places.push({ id: h.place, name: h.name, kind: 'residence', x: h.x, y: h.y, blurb: h.blurb, house: h.id })
  }

  const activities = asArray(parts.activities, parseCsv).map((row) => ({
    id: row.id,
    phases: phasesFor(row.phase, aliases),
    placeId: row.place_id,
    name: row.name,
    deltas: deltasFrom(row),
    slots: num(row.time_slots),
    twist: row.risk_or_twist || '',
    unlockDay: 0,
    weeklyLimit: 0,
    unlockExam: false,
    tags: (tags[row.id] || []).slice(),
    scope: scopeOf[row.id] || 'place',
  }))

  const jobs = Array.isArray(parts.jobs) ? parts.jobs : []
  for (const job of jobs) {
    const existing = activities.find((item) => item.id === job.id)
    const next = {
      id: job.id,
      phases: job.phases || existing?.phases || ['leisure'],
      placeId: job.placeId || existing?.placeId,
      name: job.name || existing?.name || job.id,
      deltas: {
        money: job.money ?? existing?.deltas.money ?? 0,
        energy: job.energy ?? existing?.deltas.energy ?? 0,
        grades: job.grades ?? existing?.deltas.grades ?? 0,
        social: job.social ?? existing?.deltas.social ?? 0,
        hunger: job.hunger ?? existing?.deltas.hunger ?? 0,
      },
      slots: job.slots ?? existing?.slots ?? 1,
      twist: job.twist || existing?.twist || '',
      unlockDay: job.unlockDay ?? existing?.unlockDay ?? 0,
      weeklyLimit: job.weeklyLimit ?? existing?.weeklyLimit ?? 0,
      unlockExam: job.unlockExam ?? existing?.unlockExam ?? false,
      tags: job.tags || existing?.tags || tags[job.id] || [],
      scope: job.scope || existing?.scope || scopeOf[job.id] || 'place',
    }
    if (existing) Object.assign(existing, next)
    else activities.push(next)
  }

  const twists = parts.twists || {}
  for (const activity of activities) {
    activity.twistDef = twists[activity.id] || null
    if (!activity.deltas) activity.deltas = { ...EMPTY_DELTAS }
  }

  // What the creator offers: the houses (a house's name is the player's residence).
  const residences = houses.map((h) => ({ name: h.name, type: 'house', distanceKm: null, notes: h.vibe, house: h.id }))

  const events = (parts.events || []).map((event) => ({
    id: event.id,
    title: event.title,
    text: event.text || event.body || '',
    placeholder: Boolean(event.placeholder),
    icon: event.icon || '',
    choices: (event.choices || []).map((choice) => ({
      label: choice.label,
      deltas: { ...EMPTY_DELTAS, ...(choice.deltas || {}) },
      result: choice.result || choice.label,
    })),
  }))

  return {
    meta,
    places,
    activities,
    residences,
    houses,
    events,
    hours: {
      places: parts.hours?.places || {},
      actions: parts.hours?.actions || {},
    },
    courses: parts.courses || [],
    besties: parts.besties || { names: ['Friend'], moments: [] },
    shop: parts.shop || { brand: 'Shop', url: '', codePrefix: 'ORG-', codeLength: 4, warning: 'This links to a real shop' },
  }
}

// The player's house: by its name; an old residence name belongs to the house that
// lists it in "was"; any other old name gets a house of its own, the same one every time.
export function houseOf(district, residence) {
  const houses = district.houses || []
  if (!houses.length) return null
  return houses.find((h) => h.name === residence || h.id === residence)
    || houses.find((h) => h.was.includes(residence))
    || houses[hashString(String(residence || '')) % houses.length]
}

export function homePlaceId(district, residence) {
  return houseOf(district, residence)?.place || null
}

export function coursePlaceId(district, course) {
  const map = district.meta.courseVenues || {}
  return map[course] || map.default
}

export function pickBestie(district, residence, salt) {
  const all = district.besties.names?.length ? district.besties.names : ['Friend']
  const mine = String(salt || '').trim().toLowerCase()
  const names = all.filter((name) => name.toLowerCase() !== mine)
  const pool = names.length ? names : all
  return pool[hashString(`${residence}|${salt}`) % pool.length]
}

export function withEventEdits(district, edits) {
  if (!edits?.length) return district
  const events = district.events.map((event) => {
    const edit = edits.find((item) => item.event_id === event.id)
    if (!edit) return event
    const labels = edit.choice_labels || []
    return {
      ...event,
      title: edit.title || event.title,
      text: edit.body || event.text,
      choices: event.choices.map((choice, index) => ({
        ...choice,
        label: labels[index] || choice.label,
      })),
    }
  })
  return { ...district, events }
}
