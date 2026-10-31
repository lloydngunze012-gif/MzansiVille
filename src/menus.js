// What the vendors sell when you talk to them: real items, real prices. Some come
// in sizes ("Bunny chow please" -> "Quarter or half?"). Effects are what eating does.

export const MENUS = {
  auntie_pinky: {
    place: 'cafeteria',
    hello: 'What can I get you, baby?',
    items: [
      { id: 'bunny', name: 'Bunny chow', icon: '\u{1F35E}', ask: 'Quarter or half?', sizes: [
        { id: 'quarter', name: 'Quarter', price: 35, fx: { hunger: 35 } },
        { id: 'half', name: 'Half', price: 55, fx: { hunger: 55, energy: -3 } },
      ] },
      { id: 'pap', name: 'Pap and wors', icon: '\u{1F32D}', price: 30, fx: { hunger: 40 } },
      { id: 'chips', name: 'Slap chips and a Russian', icon: '\u{1F35F}', price: 28, fx: { hunger: 35, social: 1 } },
      { id: 'cooldrink', name: 'Cooldrink', icon: '\u{1F964}', price: 12, fx: { energy: 5, hunger: 5 } },
    ],
  },
  mam_gugu: {
    place: 'quad',
    hello: 'Yebo! Hot vetkoek, fresh from the pot. What will it be?',
    items: [
      { id: 'vetkoek', name: 'Vetkoek and mince', icon: '\u{1F95F}', price: 15, fx: { hunger: 25 } },
      { id: 'kota', name: 'Kota', icon: '\u{1F96A}', ask: 'Small or full house?', sizes: [
        { id: 'small', name: 'Small (chips and polony)', price: 25, fx: { hunger: 30 } },
        { id: 'full', name: 'Full house (everything)', price: 40, fx: { hunger: 50, energy: -2 } },
      ] },
      { id: 'amagwinya', name: 'Amagwinya x2', icon: '\u{1F369}', price: 10, fx: { hunger: 15 } },
      { id: 'mageu', name: 'Mageu', icon: '\u{1F95B}', price: 12, fx: { hunger: 10, energy: 3 } },
    ],
  },
}

export function menuFor(id) {
  return MENUS[id] || null
}

export function itemOf(vendorId, itemId, sizeId) {
  const item = MENUS[vendorId]?.items.find((i) => i.id === itemId)
  if (!item) return null
  if (item.sizes) {
    const size = item.sizes.find((s) => s.id === sizeId)
    return size ? { ...size, label: `${item.name} (${size.name.split(' (')[0].toLowerCase()})`, item } : null
  }
  return { ...item, label: item.name, item }
}
