// Builds data/campusville/countries.json (every country: African ones first, then the rest of the world,
// each alphabetical). Keeps the hand-written welcome lines. Run: node scripts/countries-build.mjs
import fs from 'node:fs'
const FILE = 'data/campusville/countries.json'
const old = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const welcomes = Object.fromEntries(old.countries.map((c) => [c.id, c.welcome]))
const AFRICA = 'DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW'.split(' ')
const WORLD = 'AF AL AD AG AR AM AU AT AZ BS BH BD BB BY BE BZ BT BO BA BR BN BG KH CA CL CN CO CR HR CU CY CZ DK DM DO EC SV EE FJ FI FR DE GR GD GT GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KI KW KG LA LV LB LI LT LU MY MV MT MH MX FM MD MC MN ME MM NR NP NL NZ NI KP MK NO OM PK PW PS PA PG PY PE PH PL PT QA RO RU KN LC VC WS SM SA RS SG SK SI SB KR ES LK SR SE CH SY TW TJ TH TL TO TT TR TM TV AE GB US UY UZ VU VA VE VN YE'.split(' ')
const names = new Intl.DisplayNames('en', { type: 'region' })
const FIX = { CD: 'DR Congo', CG: 'Republic of Congo', MM: 'Myanmar', FM: 'Micronesia', PS: 'Palestine', CV: 'Cabo Verde', CI: "Côte d'Ivoire", TR: 'Turkey', SZ: 'Eswatini', TL: 'East Timor', VA: 'Vatican City', KN: 'St Kitts and Nevis', LC: 'St Lucia', VC: 'St Vincent and the Grenadines', ST: 'São Tomé and Príncipe', AG: 'Antigua and Barbuda', BA: 'Bosnia and Herzegovina', TT: 'Trinidad and Tobago' }
// (the flags src/from.js ART draws)
const DRAWN = new Set(['South Africa', 'Zimbabwe', 'Nigeria', 'Kenya', 'Ghana', 'Botswana', 'Lesotho', 'Eswatini', 'Namibia', 'Mozambique', 'Malawi', 'Zambia', 'DR Congo', 'Uganda', 'Tanzania', 'Cameroon', 'Ethiopia', 'Angola', 'Egypt', 'United Kingdom', 'United States', 'India', 'China', 'Germany', 'Netherlands', 'France', 'Portugal', 'Brazil', 'Australia', 'Canada'])
const nm = (c) => FIX[c] || names.of(c).replace(/’/g, "'")
const make = (codes, region) => codes.map((iso) => ({ id: nm(iso), iso, region })).sort((a, b) => (a.id === 'South Africa' ? -1 : b.id === 'South Africa' ? 1 : a.id.localeCompare(b.id, 'en')))
const list = [...make(AFRICA, 'africa'), ...make(WORLD, 'world')].map((c) => ({
  ...c,
  flag: DRAWN.has(c.id) ? c.id : c.region === 'africa' ? 'Elsewhere in Africa' : 'Overseas',
  welcome: welcomes[c.id] ?? (c.id === 'South Africa' ? '' : `All the way from ${c.id}? You'll love it here.`),
}))
const out = { ...old, note: "Where you are from (owner, 9 Nov). Every country: African ones first (South Africa on top, then alphabetical), then the rest of the world, alphabetical. Built by scripts/countries-build.mjs; edit the welcome lines here. 'iso' gives the flag emoji in the dropdown; 'flag' is the place name src/from.js draws the name-tag flag for (a globe where none is drawn). 'welcome' is the one line your roommate says at the house door on day 1 when you are not from South Africa; a country without its own line gets: All the way from {country}? You'll love it here.", countries: list }
const rows = list.map((c) => `    { "id": ${JSON.stringify(c.id)}, "iso": "${c.iso}", "region": "${c.region}", "flag": ${JSON.stringify(c.flag)}, "welcome": ${JSON.stringify(c.welcome)} }`)
fs.writeFileSync(FILE, JSON.stringify({ ...out, countries: 'ROWS' }, null, 2).replace('"ROWS"', `[\n${rows.join(',\n')}\n  ]`) + '\n')
console.log(list.length, 'countries;', list.filter((c) => c.flag === c.id).length, 'drawn flags')
