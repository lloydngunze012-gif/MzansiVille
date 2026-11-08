// Who we put on screen (CAST RULE, docs/cast.md): staff, regulars, neighbours and background people
// are an even mix of Black, white, Indian and coloured South Africans. Skin ids are the creator's
// (src/avatar.js skins). Every spawn list takes its skins from here, so the mix is set in ONE place
// and `npm run check` can test it (scripts/sim-check.mjs).
export const SKIN_MIX = ['deep', 'fair', 'amber', 'brown', 'ebony', 'sand', 'amber', 'brown']

// The skin for the n-th extra (campus crowd, lecture hall, queues).
export function skinFor(n) {
  return SKIN_MIX[Math.abs(Math.trunc(n)) % SKIN_MIX.length]
}

// The home street (src/world/home.js): four walkers on the pavements, two neighbours at a gate.
export const HOME_WALKERS = ['deep', 'fair', 'amber', 'brown']
export const HOME_CHATTERS = ['fair', 'ebony']
