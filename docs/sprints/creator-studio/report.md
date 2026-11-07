# Creator studio spike (owner, 7 Nov)

Part 1 is on `main` (commit 139a621, pushed, not deployed). Parts 2 and 3 are on the branch `spike/creator-studio` (pushed, not merged, not deployed). Nothing was added to `public/`; the Ara models stay in Downloads (both are real: man 4.62 MB, woman 4.75 MB, not 4.8 KB).

## Curvy (on main)
**What was wrong.** Tapping Curvy did change the student, but only by scaling the thigh and hip *bones* (thighs x1.3, hips x1.12). Measured on the 3D student that was **+13% at the hips and +16% behind** on the hoodie, and next to nothing under a dress or skirt, in a dance pose where it read as "nothing". Also, the Body row was the last row and the Next bar sat *over* the rows (the rows had a higher z-index than the bar), so on a phone the Body row ran under or over the Next button. In the emulated phones (390x844, 360x740, 390x664 with a browser toolbar) the row could still be reached by scrolling, so I could not make the tap itself fail; the layout bug is real and is fixed anyway.

**Fix.**
- Curvy now reshapes the outfit's own mesh (hips and thighs wider, behind rounder than the front, slightly slimmer waist), weighted by each vertex's skin weights, so arms, shoes and head do not move and the skeleton is untouched (walking, sitting and seat fits as before). Hips **+19 to 20%**, behind **+38 to 42%** on all seven women's outfits, from the front and the side (`curvy-after-*`, `lineup`).
- Body row moved up next to Skin; the Next bar is above the rows and only the button takes taps.
- **Men:** Curvy is hidden for men (the creator offers no Body row, and a man's saved "curvy" is ignored). Why: it is a women's silhouette; on a man it would still have shown nothing. A men's body option ("Broad", "Stocky") would need its own design: not done.
- Test (fails before, passes after): `tests/creator/curvy.spec.js` C1 (hips x1.13/behind x1.16 before: fails; passes after), C2 (Body row reachable above Next and the tap reaches the preview at three phone sizes; this passed before too), C3 (men), and `curvy-play.spec.js` C4 (a curvy student in a hoodie and in a dress walks, and sits on the SMIG steps with her seat 0.3 to 0.7 cm off the step).

## The studio (branch)
- **Turn:** a full turn in 10.0 s (measured), still dancing; drag across the stage to turn by hand (a vertical swipe still scrolls the page); 2 s after you let go the turn carries on; picking an outfit or anything else eases to the front and holds 1.5 s. Tests S1 to S3 (`studio.spec.js`, real touch).
- **Look:** soft warm key, cool fill, two rim lights, a drawn soft contact shadow (not a shadow map: no second pass), a round plinth with a gold ring, a clean cream backdrop (stairs gone). Colours of the clothes are untouched (no tone mapping).
- **Organt print:** 1024x768 on the creator only (campus keeps 256x192); 8x anisotropy.
- **Range:** a Fair skin (lighter than Sand) and a Hair colour row: black, dark brown, brown, auburn, blond, platinum, pink, blue. A chosen colour is no longer one flat colour: the hair vertices get light and dark shades (darker towards the roots, a little different from neighbours) and the eyebrows follow in a darker shade. The blond, fair guy reads as a person, not a painted cap (`studio-ours-blond-*`). This tone also applies to anyone in the game who has a hair colour set (the cast: Zanele's yellow, Mam' Gugu's purple...), so those hairs got more texture too.
- **Fixed on the way:** the women's hoodie now reads from the front (a thick hood ring, drawstrings with tips, ribbed cuffs, bigger hood behind).
- **Not done:** the creator's `creator-still.png` (the picture shown for a moment before the 3D loads) is still the old figure without the plinth; it crossfades away.

## Ara in the same studio (branch, test harness only)
Same lights, camera, plinth and turn (`tests/creator/studio.html`; Ara is loaded from Downloads, retargeted with the spike 3b method, UAL `Dance_Loop` baked at 30 fps). Both are in a tee with the **MakeHuman logo removed**: the tee and the jeans are one mesh and one 2048 px texture, so the tee's own triangles are drawn in a plain colour (logo gone, fabric normal map kept) and the jeans keep their texture. **The Organt print is on Ara's tee** (a plane on the spine bone, same 1024x768 print): about 40 minutes, not two hours. Caveats: the woman's export has worn holes in the tee that I did not fix (and the print partly sinks into her bust at some angles); the hands are splayed open (fingers are not retargeted); Ara's dance is UAL's `Dance_Loop`, ours is the pack's wave.

## Numbers: ours vs Ara on the creator
Slow 4G = 1.6 Mbit/s down, 150 ms round trip (Lighthouse preset), empty cache. Frame times: this PC's real GPU, frame cap off, studio stage at phone size, 3 runs of 6 s, median run.

| | Ours (woman / man) | Ara (woman / man) |
| --- | --- | --- |
| Download for one student | 700 / 672 KB (anim + outfit + head) | **4,637 / 4,516 KB** (one GLB; the baked dance clip would add about 60 KB) |
| Time for the student's files, Slow 4G | 4.0 / 4.0 s | **25.7 / 24.1 s** |
| Time to first student, whole creator, Slow 4G | **12.1 s** measured (built game, 2.2 MB in all, 1.4 MB of it student models: the default student plus the outfit icons) | not run end to end; about the 12 s shell plus roughly 22 s more, so **about 30 to 35 s** (an estimate) |
| GPU texture memory (decoded, with mips) | 4.1 MB (almost all the 1024 px Organt print) | **136 MB** |
| Triangles / draw calls | 7.7k / 14 (woman), 7.2k / 14 (man) | 27.9k / 17 and 28.8k / 17 |
| Frame time, median / slowest 10% | 1.9 ms (526 fps) / 3.6 ms | 3.2 ms (313 fps) / 5.1 ms (woman); 2.7 ms / 4.3 ms (man) |

The GPU frame times are for one student, so both are far under budget here; the gap that matters on a cheap phone is the 136 MB of textures and the 26 s download, not the frame time (spike 3b measured about 5x our cost for twenty on a weak GPU).

## What Ara on the creator would cost to do properly
- **Every outfit, hair and Organt design made twice** (once for the creator in Ara, once for campus in our flat style, or Ara everywhere, which spike 3b advised against). Ara outfits are painted textures, not colours: seven outfits x two genders x any house colours, hoodie, shweshwe and Organt each need painted textures instead of today's colour swap. The tee trick above only works for a plain tee; a hoodie or dress is a new mesh and texture each.
- **Hair colours:** Ara's hair is a 2048 px painted texture; eight colours means recolouring in a shader or eight textures.
- **Texture cuts:** 512 px or KTX2 for every part to get 136 MB down to about 10 to 20 MB and 4.6 MB down to about 1 MB: a day of pipeline work plus checking faces and skin still look right.
- **Rig work from 3b:** the retarget runs once per rig as a bake script (about a day for dance, idle, walk, sit and stand), plus fingers, plus the sit foot-locking (another day). Creator only would need just the dance.
- **Curvy, skin range, the print** would all be redone in Ara's terms (blend shapes or a body morph on its mesh; skin as texture sets).

## My call
**Stay with ours for the creator.** Product-shot quality is mostly the stage (lights, turn, plinth, shadow), and that is now in. Ara looks like a real person but it is a different game: a photo-textured, stern-faced person on a cartoon plinth, 6x the download, 33x the texture memory, and every future outfit twice. If Lloyd wants a realistic creator, Ara is a workable source, but the honest price is a new art pipeline, not a spike. Lloyd decides from the screenshots.

## Files (docs/sprints/creator-studio/, not committed)
- before: `creator-before-female.png`, `creator-before-male.png`; curvy before and after, front and side, jeans and dress: `curvy-{before,after}-{jeans,dress}-{front,side}.png` (Regular left, Curvy right); `curvy-seated-{hoodie,dress}.png`
- studio, Organt tee: `studio-ours-{female,male}-{front,threequarter}.png`; blond fair guy: `studio-ours-blond-{crop,curls}-{front,threequarter}.png`; full creator page: `creator-after-{female,male}.png`, `page-top.png`, `page-bottom.png`; hoodie: `hoodie-front.png`, `hoodie-34.png`
- Ara: `ara-studio-{woman,man}-{front,threequarter}.png`; the sheet: `sheet-ours-vs-ara.png`
- videos: `video-ours-turn-and-drag.webm`, `video-ara-turn-and-drag.webm`; numbers: `measure.json`

## Not caused by this work
`tests/e2e/avatar.spec.js` fails on `main` before and after (it expects the Dreads hair on the long-hair head; the code gives the bob head). `tests/e2e/cream.spec.js` timed out in the campus step on this branch (I did not run it on `main`).

## Re-running
```bash
npx playwright test tests/creator --config playwright.gpu.config.js --workers=1          # C1-C4, S1-S3, shots
TAG=after npx playwright test tests/creator/shots.spec.js --config playwright.gpu.config.js --workers=1
npx playwright test tests/creator/shots2.spec.js --config playwright.gpu.config.js --workers=1     # Ara, sheet, videos
npm run build && npx playwright test tests/creator/measure.spec.js --config playwright.spike.config.js --workers=1
```
