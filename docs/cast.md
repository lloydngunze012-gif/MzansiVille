# Cast: every named character

Single source of truth (CLAUDE.md CAST RULE). Soft Life is an international game that starts in South Africa, not an "African game": every place must feel open to every player. Staff, regulars, neighbours and background people are an even mix of Black, white, Indian and coloured South Africans; names are English by default with a mix of backgrounds. Change a name anywhere and update this file in the same commit.

Skins are the creator's ids (src/avatar.js: fair, sand, amber, brown, deep, ebony). Extras (campus crowd, lecture hall, house folk) take their skin from `src/world/skinmix.js` (SKIN_MIX); named people from src/world/cast.js; the home street from skinmix.js and data/campusville/homes.json. `npm run check` fails if a spawn list has fewer than 3 skin tones.

"Keep or rename?" was the owner's call. **Decided 9 Nov** for every row below (renames and skin changes in the table; everything else kept as is).

Old ids still in a save are mapped to the new ones when it loads (src/cast-ids.js OLD_IDS): zanele -> zoe, sipho -> ethan, kea -> kayla, thandi -> chloe, lindiwe -> leah, dr_mahlangu -> dr_adams, amahle -> mia, kabelo -> daniel, auntie_pinky -> mama_liz.

## Named people (data/campusville/people.json unless noted)

| Id | Name | Role | Home | Where | Skin in game | Keep or rename? |
|---|---|---|---|---|---|---|
| (the roommate pool, below) | | Roommate | South Africa | Morning, drop-off, lecture, Quad | see pool | decided 9 Nov |
| lethabo | Lethabo | Open-mic poet | South Africa | Quad | deep | decided 9 Nov |
| kayla | Kayla (was Kea; now a woman) | Accounting student | South Africa | Campus | brown (was deep) | decided 9 Nov |
| amir | Amir | Engineering student | South Africa | Campus | amber | decided 9 Nov |
| naledi | Naledi | Law student | South Africa | Campus | deep | decided 9 Nov |
| luke | Luke | Sports science student | South Africa | Campus | fair (was sand) | decided 9 Nov |
| chloe | Chloe (was Thandi) | Psychology student | South Africa | Campus | fair (was amber) | decided 9 Nov |
| jordan | Jordan | Drama student | South Africa | Campus | brown | decided 9 Nov |
| priya | Priya | Medicine student | South Africa | Campus | amber | decided 9 Nov |
| noah | Noah | Computer science student | South Africa | Campus | ebony | decided 9 Nov |
| aya | Aya | Fashion design student | South Africa | Campus | brown | decided 9 Nov |
| mam_gugu | Mam' Gugu | Runs the vetkoek stall | South Africa | Quad | deep (was brown) | decided 9 Nov |
| mama_liz | Mama Liz (was Auntie Pinky, retired) | Cafeteria counter, hot meals | South Africa | Cafeteria | deep | decided 9 Nov |
| prof_naidoo | Prof Naidoo | Lecturer, Law | South Africa | Law venue | amber | decided 9 Nov |
| dr_adams | Dr Adams (was Dr Mahlangu) | Lecturer, Science | South Africa | Science venue | brown (was deep) | decided 9 Nov |
| prof_vanwyk | Prof van Wyk | Lecturer, Engineering | South Africa | Engineering venue | sand | decided 9 Nov |
| dr_khumalo | Dr Khumalo | Lecturer, Health Sciences | South Africa | Health Sci venue | brown | decided 9 Nov |
| dr_moodley | Dr Moodley | Lecturer, SMIG | South Africa | SMIG venue | amber | decided 9 Nov |
| bongani | Bongani | SRC campaigner, Ubuntu Forward | South Africa | Quad | deep | decided 9 Nov |
| leah | Leah (was Lindiwe) | SRC campaigner, Free Food Fridays | South Africa | Quad | fair (was brown) | decided 9 Nov |
| ruan | Ruan | SRC campaigner, Fix-It Society | South Africa | Quad | sand | decided 9 Nov |
| mia | Mia (was Amahle) | Crush (src/crush.js) | South Africa | Bus stop, campus | brown | decided 9 Nov |
| daniel | Daniel (was Kabelo) | Crush (src/crush.js) | South Africa | Bus stop, campus | deep | decided 9 Nov |

## International students (new, 9 Nov; people.json, classmates)

Three first-years who show up in lectures, on the Quad and as Caf regulars. Friendly lines only (3-5 each): no stereotypes and no jokes at their country's expense; light rivalry (jollof, football) is welcome and goes both ways. Home country is in people.json (`country`) and shows as a small flag beside their name.

| Id | Name | Home | Role | Where | Skin in game | Note |
|---|---|---|---|---|---|---|
| david | David Okafor | Nigeria | First-year engineering | Caf terrace, Engineering lecture | deep | loud about jollof |
| grace | Grace Wanjiru | Kenya | Runs the study group | Quad, library, lectures | deep | early riser |
| tendai | Tendai Moyo | Zimbabwe | Campus DJ | Quad | brown | knows everyone |

## Roommates (data/campusville/roommates.json, src/roommates.js)

The roommate is chosen in the creator ("Your roommate": four cards for your res, one pre-selected) and saved as `character.roommate`. Default: the same gender as the player's res, and the skin closest to the player's (ties: the first in this list). Every scene that uses the roommate (res morning, drop-off, lecture, Quad) reads the chosen one. Lines are written for all eight (no name-specific jokes; the lecture and morning lines swap she/he).

| Res | Id | Name | Skin | Keep or rename? |
|---|---|---|---|---|
| Women's | zoe | Zoe (was Zanele) | deep | decided 9 Nov |
| Women's | megan | Megan | fair | decided 9 Nov |
| Women's | jade | Jade | brown | decided 9 Nov |
| Women's | anisha | Anisha | amber | decided 9 Nov |
| Men's | ethan | Ethan (was Sipho) | fair | decided 9 Nov |
| Men's | marcus | Marcus | deep | decided 9 Nov |
| Men's | ryan | Ryan | brown | decided 9 Nov |
| Men's | ravi | Ravi | amber | decided 9 Nov |

## Quick-start students (player presets, 9 Nov; data/campusville/quickstart.json)

The one screen a new player sees offers eight ready-made students. The names are only suggestions (the player types their own); none is a roommate or a named student above, and each woman and man has one of the four skins (deep, fair, brown, amber), so the first screen is an even mix like the cast.

| Look | Name suggested | Skin | Notes |
|---|---|---|---|
| Woman | Naledi | deep | dreads, shweshwe |
| Woman | Emma | fair | blond bob, jacket |
| Woman | Amy | brown | curly bun, dress |
| Woman | Priya | amber | bob, hoodie |
| Man | Thabo | deep | fade, hoodie |
| Man | Sam | fair | parted brown hair, jacket |
| Man | Jason | brown | crop, tee |
| Man | Dev | amber | fade, the 031 Organt tee |

## Where you're from (player, 9 Nov)

Character creation has "Where are you from?" as a dropdown on the first (look) page, not a page of its own (9 Nov): every country, African ones first (South Africa on top and the default), then the rest of the world, each alphabetical; no "Other". A country without its own welcome line gets "All the way from {country}? You'll love it here." Saved as `character.country`; its flag (drawn, no image downloads: src/from.js) shows on the player's name tag over their head, on the student card and on the profile. On day 1, a player who is not from South Africa gets one welcome line from the roommate at the house door (data/campusville/countries.json).

## Home (data/campusville/homes.json)

| Who | Style | Role | Skin | Keep or rename? |
|---|---|---|---|---|
| Mom / Grace (sister) | suburban | family | the player's own | decided 9 Nov |
| Ma / Nathan (brother) | township | family | the player's own | decided 9 Nov |
| Mrs Pillay | suburban | neighbour with the hose | amber (was brown) | decided 9 Nov |
| Mrs Bennett | township | neighbour with the hose | brown (was deep) | decided 9 Nov |
| Biscuit / Tiger | suburban / township | the dog | n/a | decided 9 Nov |
| 4 pavement walkers, 2 gate chatters | both | background | deep, fair, amber, brown / fair, ebony | n/a (unnamed) |

Note: the home scene's sibling is "Grace" in the suburban home and the new international student is Grace Wanjiru; the home family is the player's own and never on campus, so both stay.

## Cafeteria (names from the Caf world doc, docs/world-designer/caf-world.md)

Mama Liz takes the cafeteria counter on the campus (id mama_liz). Aunty Premi, Uncle Jaco and Kyle are in src/world/cast.js with their skins, ready for when the Caf scene is staffed (people.json entries are added then).

| Id | Name | Role | Where | Background | Skin in game |
|---|---|---|---|---|---|
| mama_liz | Mama Liz | Hot meals (counter) | Cafeteria | Black South African | deep |
| aunty_premi | Aunty Premi | Indian kitchen | Cafeteria | Indian South African | amber |
| uncle_jaco | Uncle Jaco | Grill | Cafeteria | white South African | fair |
| kyle | Kyle | Coffee | Cafeteria | coloured South African | brown |

The extra student who was called Kyle is now Brandon, so the barista is the only Kyle.

## SunnyBay place staff and patrons (City job B, 10 Nov)

The 18 open places each have one staff member and 2 to 4 patrons. They have **no names**: a role only (Barista, Teller, Nurse, Librarian, Stylist, Lounge host, Salesperson, Till worker, Rank marshal, Pump attendant, Stadium steward, Driving instructor, Ice-cream vendor, Park keeper...), in `data/campusville/city_places.json` (`staffRole`). Their skins come from `src/world/skinmix.js` through the city's `npcLook`, three or more tones in every place (`npm run check`). If a place's staff is ever given a name, it goes in this file first.

## Extra students (people.json extra_names, ids x0..x19)

Sizwe, Palesa, Karabo, Hannah (was Megan), Tumi, Ayanda, Nomsa, Brandon (was Kyle), Lerato, Dineo, Musa, Farah, Bandile, Zinhle, Thabo, Refilwe, Liam (was Ethan), Nandi, Sello, Ayesha. Three were renamed on 9 Nov only so they no longer share a name with a roommate (Megan, Ethan) or the barista (Kyle). Skins are set by position (skinmix.js), not by name, so a name never forces a look.

Also named in besties.json (suggested friends): Chloe, Lethabo, Aya, Ethan, Naledi, Jordan, Priya, Luke, Zoe, Noah, Kayla, Amir.
