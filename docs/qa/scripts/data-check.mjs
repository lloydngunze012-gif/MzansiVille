import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const root = 'C:/Users/organ/Projects/MzansiVille'
const { buildDistrict, coursePlaceId, homePlaceId } = await import('file:///' + root + '/src/engine/model.js')
const sim = await import('file:///' + root + '/src/engine/sim.js')
const dir = join(root, 'data', 'campusville'); const read = (n) => readFileSync(join(dir, n), 'utf8'); const J = (n) => JSON.parse(read(n))
const district = buildDistrict({ meta: J('meta.json'), places: read('places.csv'), activities: read('activities.csv'), residences: read('residences.csv'), events: J('events.json'), hours: J('hours.json'), courses: J('courses.json'), besties: J('besties.json'), twists: J('twists.json'), jobs: J('jobs.json'), shop: J('shop.json') })
const out = []; const log = (...a) => { out.push(a.join(' ')) }
const placeIds = new Set(district.places.map(p => p.id))
for (const a of district.activities) {
  if (!placeIds.has(a.placeId)) log('MISSING_PLACE', a.id, a.placeId)
  if (!a.phases.length) log('NO_PHASE', a.id)
}
log('ACTIVITY_DELTAS', JSON.stringify(district.activities.map(a => [a.id, a.name, a.deltas, a.slots, a.phases])))
const used = new Set(district.activities.map(a => a.placeId))
for (const p of district.places) if (!used.has(p.id)) log('PLACE_NO_ACTIVITY', p.id)
for (const k of Object.keys(district.hours.places)) if (!placeIds.has(k)) log('HOURS_UNKNOWN_PLACE', k)
for (const k of Object.keys(district.hours.actions)) if (!district.activities.find(a => a.id === k)) log('HOURS_UNKNOWN_ACTION', k)
// phase windows vs hours
const toM = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m }
for (const a of district.activities) {
  const h = district.hours.actions[a.id] || district.hours.places[a.placeId]
  if (!h) continue
  for (const ph of a.phases) {
    const P = district.meta.phases.find(p => p.id === ph)
    const s = toM(P.start), e = toM(P.end), o = toM(h.opens), c = toM(h.closes)
    const overlap = Math.min(e, c) - Math.max(s, o)
    log('HOURS', a.id, ph, `${P.start}-${P.end}`, `open ${h.opens}-${h.closes}`, overlap <= 0 ? 'NEVER_OPEN_IN_PHASE' : overlap < e - s ? 'PARTIAL' : 'OK')
  }
}
// residences x courses: can we reach each action in a simulated day
log('RESIDENCES', district.residences.length, district.residences.map(r => r.name + '=' + homePlaceId(district, r.name)).join('; '))
for (const c of district.courses) log('COURSE', c, coursePlaceId(district, c))
const ever = new Set()
for (const r of district.residences) for (const c of district.courses) {
  const run = sim.createRun(district, { name: 'QA', residence: r.name, course: c, avatar: {} }, new Date('2026-10-30T08:00:00'))
  run.mode = 'play'
  for (let guard = 0; guard < 12; guard++) {
    for (const p of district.places) for (const a of sim.actionsAt(district, run, p.id)) { const st = sim.actionState(district, run, a); if (!st.disabled) ever.add(a.id) }
    try { sim.advancePhase(district, run, () => 0.99) } catch (e) { log('ADVANCE_ERR', r.name, c, e.message); break }
    if (run.mode !== 'play') break
  }
}
for (const a of district.activities) if (!ever.has(a.id)) log('NEVER_AVAILABLE_DAY1', a.id, a.unlockDay ? 'unlockDay ' + a.unlockDay : a.unlockExam ? 'exam' : '')
console.log(out.join('\n'))
