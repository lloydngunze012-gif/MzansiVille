// Greenway Grocer and your house fridge (owner, 6 Nov). The shop, its prices, the
// recipes and the starter fridge live in data/campusville/greenway.json; this is the
// logic. No DOM, no Three.js.
//   - Groceries go in the fridge as portions (chicken R70 = 4 portions): run.fridge.
//   - Common-room cooking needs the recipe's ingredients and uses them up; some cooking
//     makes leftovers. Out of something: the action says what's missing and offers
//     "Take me to Greenway" (actionState returns missing + greenway).
//   - Essentials and treats count at once: stat effects, and phone credit
//     (run.credit) that calls and messages (the phone actions) need.

export function grocer(district) {
  return district.greenway || null
}

// The run's fridge and credit, made on first use (an old save gets the starter fridge).
export function stock(district, run) {
  const g = grocer(district)
  if (!run.fridge) run.fridge = { ...(g?.starter?.fridge || {}) }
  if (run.credit === undefined) run.credit = g?.starter?.credit ?? 0
  return run.fridge
}

export function itemOf(district, id) {
  return grocer(district)?.items.find((item) => item.id === id) || null
}

// A fridge item's name ("chicken", "leftovers"), for "Out of chicken".
export function fridgeName(district, id) {
  const g = grocer(district)
  const item = itemOf(district, id)
  return (item ? item.name.replace(/\s*\(.*\)$/, '') : g?.fridgeNames?.[id] || id).toLowerCase()
}

function listText(names) {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// What an action needs that you haven't got: { missing: [ids], reason } or null.
export function shortfall(district, run, action) {
  const g = grocer(district)
  if (!g) return null
  const recipe = g.recipes?.[action.id]
  if (recipe) {
    const fridge = run.fridge || g.starter?.fridge || {}
    const missing = Object.entries(recipe.uses || {}).filter(([id, n]) => (fridge[id] || 0) < n).map(([id]) => id)
    if (missing.length) return { missing, reason: `Out of ${listText(missing.map((id) => fridgeName(district, id)))}` }
  }
  if (needsCredit(district, action)) {
    const credit = run.credit ?? g.starter?.credit ?? 0
    if (credit < 1) return { missing: ['airtime'], reason: 'No airtime or data' }
  }
  return null
}

export function needsCredit(district, action) {
  const g = grocer(district)
  if (!g) return false
  return (g.phoneActions || []).includes(action.id) || (g.phoneTags || []).some((t) => action.tags?.includes(t))
}

// After an action is done: the recipe's ingredients used up, its leftovers made, phone
// credit spent, credit an action gives (borrowed airtime).
export function useFor(district, run, action) {
  const g = grocer(district)
  if (!g) return
  stock(district, run)
  const recipe = g.recipes?.[action.id]
  if (recipe) {
    for (const [id, n] of Object.entries(recipe.uses || {})) run.fridge[id] = Math.max(0, (run.fridge[id] || 0) - n)
    for (const [id, n] of Object.entries(recipe.makes || {})) run.fridge[id] = (run.fridge[id] || 0) + n
  }
  if (needsCredit(district, action)) run.credit = Math.max(0, run.credit - 1)
  const gives = g.actionGives?.[action.id]
  if (gives?.credit) run.credit += gives.credit
}

// Buy one item at the till. applyStats: the sim's stat clamp. Returns { ok, text, item }.
export function buyItem(district, run, id, applyStats) {
  const item = itemOf(district, id)
  if (!item) return { ok: false, text: 'Not on the shelf' }
  if ((run.stats.money || 0) < item.price) return { ok: false, text: `Not enough money for ${item.name}`, item }
  stock(district, run)
  applyStats(run, { money: -item.price })
  if (item.shelf === 'groceries') {
    run.fridge[item.id] = (run.fridge[item.id] || 0) + (item.portions || 1)
    return { ok: true, item, text: `${item.icon} ${item.name} in your fridge (${run.fridge[item.id]} ${item.unit || ''})`.replace(/\s+\)/, ')') }
  }
  if (item.effects) applyStats(run, item.effects)
  if (item.gives?.credit) run.credit += item.gives.credit
  const said = item.says || Object.entries(item.effects || {}).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${k === 'hunger' ? 'Fullness' : k[0].toUpperCase() + k.slice(1)}`).join(' · ')
  return { ok: true, item, text: `${item.icon} ${item.name}: ${said}` }
}

// What a recipe costs at Greenway prices (for the cheaper-than-the-caf check).
export function mealCost(district, actionId) {
  const g = grocer(district)
  const recipe = g?.recipes?.[actionId]
  if (!recipe) return null
  let cost = 0
  for (const [id, n] of Object.entries(recipe.uses || {})) {
    const item = itemOf(district, id)
    if (!item) return null // (leftovers: already paid for)
    cost += (item.price / (item.portions || 1)) * n
  }
  return Math.round(cost * 100) / 100
}
