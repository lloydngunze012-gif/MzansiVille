# Cast: every named character

Single source of truth (CLAUDE.md CAST RULE). Soft Life is an international game that starts in South Africa, not an "African game": every place must feel open to every player. Staff, regulars, neighbours and background people are an even mix of Black, white, Indian and coloured South Africans; names are English by default with a mix of backgrounds. Change a name anywhere and update this file in the same commit.

Skins are the creator's ids (src/avatar.js: fair, sand, amber, brown, deep, ebony). Extras (campus crowd, lecture hall, house folk) take their skin from `src/world/skinmix.js` (SKIN_MIX); named people from src/world/cast.js; the home street from skinmix.js and data/campusville/homes.json. `npm run check` fails if a spawn list has fewer than 3 skin tones.

"Keep or rename?" is the owner's call. Nothing in that column has been renamed yet.

## Named people (data/campusville/people.json unless noted)

| Id | Name | Role | Where | Skin in game | Keep or rename? |
|---|---|---|---|---|---|
| zanele | Zanele | Roommate (women's res) | Morning, drop-off, lecture, Quad | deep | owner decides |
| sipho | Sipho | Roommate (men's res) | same | brown | owner decides |
| lethabo | Lethabo | Open-mic poet | Quad | deep | owner decides |
| kea | Kea | Accounting student | Campus | deep | owner decides |
| amir | Amir | Engineering student | Campus | amber | owner decides |
| naledi | Naledi | Law student | Campus | deep | owner decides |
| luke | Luke | Sports science student | Campus | sand | owner decides |
| thandi | Thandi | Psychology student | Campus | amber | owner decides |
| jordan | Jordan | Drama student | Campus | brown | owner decides |
| priya | Priya | Medicine student | Campus | amber | owner decides |
| noah | Noah | Computer science student | Campus | ebony | owner decides |
| aya | Aya | Fashion design student | Campus | brown | owner decides |
| mam_gugu | Mam' Gugu | Runs the vetkoek stall | Quad | brown | owner decides |
| auntie_pinky | Auntie Pinky | Cafeteria counter | Cafeteria | deep | owner decides |
| prof_naidoo | Prof Naidoo | Lecturer, Law | Law venue | amber | owner decides |
| dr_mahlangu | Dr Mahlangu | Lecturer, Science | Science venue | deep | owner decides |
| prof_vanwyk | Prof van Wyk | Lecturer, Engineering | Engineering venue | sand | owner decides |
| dr_khumalo | Dr Khumalo | Lecturer, Health Sciences | Health Sci venue | brown | owner decides |
| dr_moodley | Dr Moodley | Lecturer, SMIG | SMIG venue | amber | owner decides |
| bongani | Bongani | SRC campaigner, Ubuntu Forward | Quad | deep | owner decides |
| lindiwe | Lindiwe | SRC campaigner, Free Food Fridays | Quad | brown | owner decides |
| ruan | Ruan | SRC campaigner, Fix-It Society | Quad | sand | owner decides |
| amahle | Amahle | Crush (src/crush.js) | Bus stop, campus | brown | owner decides |
| kabelo | Kabelo | Crush (src/crush.js) | Bus stop, campus | deep | owner decides |

## Home (data/campusville/homes.json)

| Who | Style | Role | Skin | Keep or rename? |
|---|---|---|---|---|
| Mom / Grace (sister) | suburban | family | the player's own | owner decides |
| Ma / Nathan (brother) | township | family | the player's own | owner decides |
| Mrs Pillay | suburban | neighbour with the hose | amber (was brown) | owner decides |
| Mrs Bennett | township | neighbour with the hose | brown (was deep) | owner decides |
| Biscuit / Tiger | suburban / township | the dog | n/a | owner decides |
| 4 pavement walkers, 2 gate chatters | both | background | deep, fair, amber, brown / fair, ebony | n/a (unnamed) |

## Cafeteria (names from the Caf world doc, 8 Nov; not yet in the game)

The Caf world doc is docs/world-designer/caf-world.md (not committed yet). There was no "Mam' Thandi" or "Uncle Bra Joe" anywhere in code or data, so nothing was replaced. Auntie Pinky (counter) and Mam' Gugu (Quad stall) are the only caf-side staff today. When the caf is staffed, use these four and add them to src/world/cast.js and people.json:

| Name | Role | Where | Background |
|---|---|---|---|
| Mama Liz | Hot meals | Cafeteria | Black South African |
| Aunty Premi | Indian kitchen | Cafeteria | Indian South African |
| Uncle Jaco | Grill | Cafeteria | white South African |
| Kyle | Coffee | Cafeteria | coloured South African |

An extra student called Kyle already exists in extra_names ("hustler"): rename one of the two when the caf is staffed.

## Extra students (people.json extra_names, ids x0..x19)

Sizwe, Palesa, Karabo, Megan, Tumi, Ayanda, Nomsa, Kyle, Lerato, Dineo, Musa, Farah, Bandile, Zinhle, Thabo, Refilwe, Ethan, Nandi, Sello, Ayesha. Keep or rename? Owner decides: the list leans towards Black South African names; the rule (English by default, a mix) would swap about half. Skins are set by position (skinmix.js), not by name, so a name never forces a look.

Also named in besties.json (suggested friends): Thandi, Lethabo, Aya, Sipho, Naledi, Jordan, Priya, Luke, Zanele, Noah, Kea, Amir.
