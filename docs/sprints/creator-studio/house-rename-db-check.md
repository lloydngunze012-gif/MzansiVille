# House rename: what the live database holds (7 Nov, read with the anon key, nothing changed)

Project ouzczzrjcwsqjnkshgja. Read only through the public API (anon key): `profile_public`, `district_residences`, `district_places`, `chat_messages`, the `leaderboard()` function, and a probe for every other table that could hold a house.

| Where a house name could live | Live today |
| --- | --- |
| `profiles.residence` (leaderboards group and filter by it; read through `profile_public` and `leaderboard()`) | One visible profile, residence **"Cane Crescent"** (a pre-houses name, not Thekwini or Braam). Hidden/suspended rows can't be seen with the anon key. |
| `player_cards.house` | **The table does not exist** (the "Piece 1a" block of schema.sql was never run), so nothing stored. |
| `chat_messages` | Empty; no house column (the lobby is one room). |
| Chat rooms, communities, members | No such tables. |
| `district_residences`, `district_places` | Still the **pre-houses** data (O Block, R Block ... Cane Crescent..., 31 residences, 5 residence places). The game never reads them (only `scripts/seed.mjs` writes them), and the seed with the houses was never run, so Thekwini/Braam are not there either. |

So **no live row has "Thekwini House" or "Braam House"**; nothing is orphaned and nothing needed renaming today. Where the old names can appear: phones still on the production build (it deploys with the old names) write `profiles.residence = 'Thekwini House'` at each day end, and presence cards carry the name live.

## What was done
- Client: `src/houses.js` `canonicalHouse()` maps any old name, id or houses.json "was" name to the current house name. Leaderboard grouping and "my house" (`rankRows`), the card sheet's house colours and the card's house heading use it, so an old row or a card from an older build lands in the same house (sim check "a house renamed"). Saves already moved on load (`houseOf`, "was").
- SQL: a "House rename" block at the end of `supabase/schema.sql` (idempotent, swaps the name in `profiles.residence`, `player_cards.house` if the table exists, and the lookup tables). **Not run**: run it once in the SQL editor when the build with the new names goes live.
- `supabase/seed.sql` now says Wave House and Goldrush House.
