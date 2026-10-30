# Morning comparison (read only)

Compared `origin/world-designer` with the live morning on `origin/main` (`src/world/morning.js`, `tests/e2e/morning.spec.js`). Nothing was ported. `main` was not edited.

The live morning is ahead as a playable scene: 3D walk, a hinged door, a bus that drives in on a clock, a tuck-shop choice, on-time versus late arrival, and an end-to-end test. The notes below are only the pieces on this branch that are better as design data. They are not a request to replace the 3D slice.

## Better on world-designer

| File | Lines | What is better here | Why |
| --- | --- | --- | --- |
| `data/campusville/morning.json` | 1–29 | Named anchors and walk order for the room and the stop | Live positions are unnamed numbers inside `src/world/morning.js` (room build 174–220, door 243–249, bus 301–314, wake pose 428–436, kettle tap 451, stop walk 517–520, board tap 551). A designer can retune bed, kettle, shelf, roommate, door, bench, sign, waiting spot, bus lane, and the gate without editing Three.js. |
| `src/ui/morning.js` | 102–154 and 156–195 | Props are placed from those anchors | The bed, door, kettle, noodle shelf, bench, campus sign, and bus lane are drawn from `morning.json`. On `main` the packet sits on the counter beside the kettle (`packet.position.set` at line 629) and there is no separate shelf point. |
| `src/ui/morning.js` | 16–68 and 216–221 | One step table, and the stolen-packet line | `MORNING_FLOW` is the tap order. After a steal, the shelf line is “The shelf is bare. Your roommate got the last packet.” Live copy is a longer bubble at `src/world/morning.js` 463, which is fine in the 3D scene; this one-line version matches the empty shelf. |
| `src/main.js` | 537–578 | Noodles and the bus call `applyAction` | The 15% packet twist and the money, fullness, and social changes stay the ones in `activities.csv` and `twists.json`. Live `changeStats` uses its own numbers (`src/world/morning.js` 484, 490, 506, 579) and rolls the roommate at 35% (line 425), not the twist’s 15%. |
| `data/campusville/places.csv` | 4 and 7 | Bus and lecture names stay fictional | The bus goes “into town and back to off-campus res”. The hall is “SMIG”, not a real school. Live `places.csv` still says “the other campuses” and “SMIG” / “School of Management IT and Governance”. |
| `data/campusville/residences.csv` | 1–2 | O Block has a vibe, and the housing list is fictional | “Loud and cheap” fits the noodle room. Live `residences.csv` is still “confirm block letter” plus real street addresses (Dunstaple Heights, Varsity Drive, Reservoir Hills, and the rest of that list). |

Flat-vector colours in `src/ui/morning.js` 109–114 and 197–208, and the walk, steam, and bus motion in `src/ui/game.css` 207–227, match the campus map (purple `#5b23c9` / `#7b3fe4`, gold `#ffd23f`, warm floor). The live room already uses close colours (`0x6b3fa0`, `0xf0c400` at `src/world/morning.js` 193 and 206). The 3D motion is the one to keep. These lines are only a palette reference.

## Not better here

Do not lift the flat scene over the 3D one. Live `src/world/morning.js` already walks the player, opens the door, drives the bus, and offers a real choice when the packet is gone (467–491). `tests/e2e/morning.spec.js` covers that path. Our gold button only slides a sprite between percentages.

Our captions in `src/ui/morning.js` 16–68 are shorter than both the live bubbles and Content Writer’s `data/campusville/day1_morning.json` on `origin/content-writer`. That file is the copy to wire, not these placeholders.

## Zanele and the lecture slice

Nothing on this branch builds either one. Both are on hold.

Zanele is only a name in the bestie pool, `data/campusville/besties.json` line 2. There is no portrait, no roommate line, and no rule that O Block’s bestie is Zanele. The morning roommate in `src/ui/morning.js` 233–246 is an unnamed figure.

There is no `data/campusville/lecture.json` and no lecture scene. The only reusable hall name is `data/campusville/places.csv` line 7: `smig` is displayed as SMIG, “Business, management, and IT lectures.”
