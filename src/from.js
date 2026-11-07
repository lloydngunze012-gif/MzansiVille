// "Where you're from" (owner, 7 Nov): the nine provinces, then Elsewhere in Africa, then Overseas.
// Saves from before keep their old answer (a city); it shows as its province, and the day-1 home
// style still finds it in data/campusville/homes.json.
export const FROM = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape', 'Elsewhere in Africa', 'Overseas']
// The old answers, and the province each is in.
export const FROM_WAS = { Durban: 'KwaZulu-Natal', Joburg: 'Gauteng', Soweto: 'Gauteng', Pretoria: 'Gauteng', 'Cape Town': 'Western Cape' }

// What to show (and keep pressed) for a saved answer.
export function fromPlace(from) {
  return FROM_WAS[from] || from || ''
}

// The answer to look up in homes.json's "from": the answer itself, else (a province that file
// doesn't name yet) the first old city in that province that it does name.
export function fromKey(from, table = {}) {
  if (!from || table[from]) return from
  const city = Object.keys(FROM_WAS).find((c) => FROM_WAS[c] === from && table[c])
  return city || from
}
