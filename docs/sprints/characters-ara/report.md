# Characters spike 3b: Ara 3D Gen as the second candidate (owner, 7 Nov)

Pushed, nothing adopted, nothing in `public/`. The models stay where they are (Ara exports in `C:\Users\organ\Downloads`, the Universal Base Characters pack unzipped in a scratch folder); a throwaway local server hands them to the page, and nothing was copied into the repo.

## Read this first
- **The woman is in now** (the owner re-exported her at 16:35): `Athletic_woman.glb`, 4.5 MB, a real GLB, African, ponytail, casual-suit outfit, Low detail, game rig, A-pose, with 3 built-in clips (the "Rigged + animations" option; we ignore them). She is measured below and in the lineup. The first attempt left a 4.8 KB web page under that name (my failed save); that is gone.
- **I could not find the first candidate's test (3a).** Nothing in the repo, `docs/` or git history mentions "Universal Base Characters Teen" or a "1 player + 20 NPC" test. So I wrote the fps test myself (below) and ran it on all three kinds, so the comparison is consistent with itself, but it isn't necessarily the same test as 3a's.
- **There is no Teen in the pack I have.** `Universal Base Characters[Standard].zip` (in Downloads) holds the adult "Superhero" male and female, hairstyles, eyebrows and a beard. I used those as the Universal Base Characters stand-in. The Teen set must be a separate download.
- **Age:** I picked "Young adult, 24" (the youngest adult in Quick build; its Teen is 16). The Detailed tab and the JSON import take an exact age (12 to 90), so an 18 or 19-year-old first-year is possible; I didn't do it.
- The woman's export is a slightly different build from the man's (a ponytail and a different suit, 26,136 triangles, one rig, the same 69 bones), so treat the two as a pair, not as identical twins.

## The three, side by side

| | Current student (Quaternius modular) | Universal Base Characters (Standard, male) | Ara 3D Gen (man, Low detail) |
| --- | --- | --- | --- |
| Triangles (as drawn) | about 5,000 (about 9,500 with the shadow pass) | 14,318 (female 15,060) | **27,032** (woman 27,388) |
| Draw calls per person | about 16 | 3 (about 6 with shadows) | **10 (about 23 with shadows)** |
| File | outfit 381 KB + head 255 KB | 0.7 MB .bin + **14.4 MB** of 2048 px PNGs | **4.5 MB** GLB, textures embedded |
| Textures | none (flat colours, recoloured in code) | 7 (five at 2048 px, incl. 4 MB normal maps) | **12** (five at 2048 px) |
| Texture memory once on the GPU | about 0 | 107 MB | **132 MB** |
| Rig | its own 62 bones (`UpperArm.L` names) | the UAL rig, same 65 bones and names | 69 bones, **Mixamo names without a prefix** (`Hips`, `LeftArm`, ...) |
| UAL clips play | already retargeted by the game | **as they are, zero work** | **only after retargeting** |
| Height | 1.80 m | 1.82 m | 1.86 m |
| Clothes | modelled, recolourable | none: bare, underwear-only base bodies | 12 outfits plus separate tops, bottoms and shoes |
| Licence | CC0 | CC0 | Code MIT; MakeHuman data **CC0**; "exports may be used commercially without attribution" |

**Ara woman** (measured on her file): 26,136 triangles, 17,007 vertices, 10 parts and 12 textures, 4,637 KB on disk (images 3.3 MB: skin 2048 px 227 KB, hair 2048 px **1,220 KB**, teeth 2048 px 681 KB, outfit 2048 px diffuse and normal), the same 69 Mixamo-named bones, 20 of 20 mapped bones present, the same rest-pose fix as the man, 1.70 m on screen, 132 MB of decoded texture on the GPU. The retargeted idle plays on her as on him.

Where Ara's 27,032 triangles go (Low is "about 5k" for the **body**, not the dressed person): Outfit 7,168 · **Teeth 7,120** · Shoes 4,128 · Hair 3,344 · Skin 3,140 · Skin details 952 · Tongue 448 · Eyelashes 368 · Eyebrows 192 · Eyes 172. The teeth alone are more than a quarter of the model, and 16,637 vertices are shared by all ten parts. Textures in the GLB: skin 2048 (204 KB), hair 2048 (1,401 KB), teeth 2048 (681 KB), outfit 2048 diffuse and normal, eyes 1024 and others, 3.4 MB of images in all.

Licence note: the Ara README says the character data is MakeHuman, CC0 (Data Collection AB, Joel Palmius, Jonas Hauquier, 2020). Its motion-capture clips (CMU) carry a "may not be resold, even converted" term; we would not use them (our clips are UAL's). Nothing here is in `docs/credits.md` because nothing is adopted.

## Can Ara play our UAL clips? How much work?
- **By renaming the bones: no.** Renaming the UAL tracks (`pelvis` to `Hips` and so on) puts every mapped bone **114 degrees** off on average and up to **180** (legs and feet flipped). On screen the character falls on its face: see `gpu-ara-walk-baked-vs-renamed.png` (left, retargeted; right, renamed). The two rigs have different bone axes and different rest poses.
- **By retargeting: yes, and it's small.** The game's own method (each bone takes the clip bone's turn from its rest pose, in world space) needs two changes for Ara:
  1. a name map, UAL to Ara, **20 entries, one to one** (`pelvis` Hips, `spine_01..03` Spine, Spine1, Spine2, `neck_01` Neck, `Head` Head, clavicle/upperarm/lowerarm/hand to Shoulder/Arm/ForeArm/Hand, thigh/calf/foot to UpLeg/Leg/Foot, both sides). All 20 exist on Ara's rig, none missing;
  2. a **rest-pose fix**: Ara is in an A-pose and UAL is not, so before applying the clip each bone is turned so its rest direction matches UAL's (shortest arc towards the child bone). The fixes are up to 63 degrees at the hands, 59 at the forearms, 49 at the upper arms, 36 at the shoulders and 35 at the hips. Without it the arms cross over the chest. About 25 lines.
- **Baking.** I sample the retargeted pose at 30 fps into an ordinary three.js clip for Ara's skeleton (21 tracks, 40 frames for the walk, 75 for the idle; 9 to 15 ms in the browser). That runs once per rig, so it can be a build script writing an animation GLB beside the character, like `female_anim.glb`. After that it's a normal `AnimationMixer`, no per-frame retargeting.
- **What I tested:** Idle_Loop and Walk_Loop, in the Quad, from the front (screenshots). Natural, feet planted. **Not tested:** the sit clips (hips onto a seat, the foot lock), talking idle, getting up, and **fingers** (not in the map: they stay in the A-pose bind, so hands would sit open and splayed unless the finger bones are mapped too).
- **My estimate:** about a day of engineering to put it in the game for walk, idle, sit and stand (map, bake script, loader, seats checked one by one), plus a day for the hands and the sit foot-locking to look right. That is **on top of** the art and memory work below, which is the bigger job.

## fps: the Quad plus 20 NPCs of one kind (walking small loops, a third standing), the player in the scene
The same Quad, camera at the game's own distance, fresh page for every run, three rounds in different orders, median shown. The game's own crowd is still in the scene.

| | Control (nothing added) | +20 current | +20 UBC male | +20 Ara man | +20 Ara woman |
| --- | --- | --- | --- | --- | --- |
| **Real GPU, frame cap off** (typical / worst 10%) | 55 / 29 | 44 / 35 | 45 / 30 | **39 / 27** | **40 / 32** |
| Frame time | 18.2 ms | 22.5 | 22.1 | 25.6 | 25.0 |
| What 20 people add | | +4.3 ms | +3.9 ms | **+7.4 ms** | **+6.8 ms** |
| Draw calls, triangles in the frame | 672, 269k | 986, 455k | 803, 849k | 1,130, 1,373k | 1,115, 1,329k |
| **Software renderer** (a stand-in for a weak phone GPU), ms a frame | 266 | 366 | 716 | **816** | not run |
| What 20 people add on the software renderer | | +100 ms | +450 ms | **+550 ms** | |

- On this PC's GPU (the run above; three rounds each, different orders, a fresh page each time) **Ara adds about 1.7 times what our current students add**: +7 ms against +4 ms for twenty, 39 to 40 fps against 44. The Universal Base Characters cost the same as ours here (+3.9 ms) because they have only 3 parts and 6 draw calls a person. The woman costs the same as the man. An earlier run on the same PC while it was busier read 34 fps for the control and 30 for Ara, with the same order, so the ranking holds.
- When the GPU is the limit, as it will be on cheap phones, **Ara costs about five times what our current students do** (+550 ms against +100 ms for twenty, man only; I didn't repeat the 8-minute software run for the woman) and the Universal Base Characters about four times. Per person: current 16 draw calls and about 9.5k triangles in the frame; UBC 6 and 29k; Ara 23 and 55k (the shadow pass draws everyone twice).
- Both runs share the limitation: the 20 are clones of one person (shared textures). Twenty different Ara students would each carry their own skin, outfit and hair textures: **132 MB each once decoded, about 2.6 GB for twenty**. A phone can't hold that; textures would have to be cut to 512 px or compressed (KTX2), about a day of pipeline work, and the download is 4.5 MB per distinct student.
- Frame limit off: `playwright.spike.config.js` (Edge, Direct3D 11, `--disable-frame-rate-limit --disable-gpu-vsync`). Software run: `playwright.edge.config.js` (about 4 fps for the control).

## Does the realistic style fit our world or fight it? (my judgement)
**It fights it.** The Quad is flat-shaded, faceted and cartoon-bright: trees are cut gems, benches are boxes, and our students are flat-coloured low-poly figures. An Ara student is a photo-textured person with pores, a stern default face and a real cotton tee, standing in that. In the lineup (`gpu-creator-all.png`) the Ara man reads as a person from another game pasted in; at the game's own camera (`gpu-crowd-distance-sims.png`) he's passable, and twenty of him in a crowd (`gpu-crowd20-ara_man.png`) are obviously the same man cloned next to our stylised named students, with the faces and skin looking like a different art direction. The close-up (`gpu-face-ara_man.png`) is the clearest: a realistic face on a cartoon campus is uncanny rather than charming.

Smaller things in Ara's favour: dark skin comes out properly dark (the app's African heritage uses a photo skin; the UBC "Dark" skin is a mid-brown and lighter than our "deep"), and it has African clothing options (ankara, aso-ebi, buba) and braids and cornrows. Against it, beyond the style: **the default tees carry a MakeHuman logo** (the woman's blue tee wears it large, with brown wear marks on the tee and jeans), outfits are texture-mapped so the Organt tees, the house hoodies and shweshwe would each need painted textures instead of the colour swap the game does now, the memory above, and the 3 to 4 times larger draw cost.

The Universal Base Characters are a halfway house: the same rig as our UAL clips (no retargeting), 14k triangles, and a stylised-realistic look that sits closer to our world than Ara does; but the pack gives bare base bodies and only hair, brows and a beard (so every outfit, including the Organt tee, would have to be made), and its textures are 14 MB a character. The Teen set (not on this machine) is the one that might match first-years.

**Recommendation:** don't adopt Ara for the students. If the art direction moves towards semi-realistic, Ara is a workable source for a handful of hero characters (the lecturers, the crush, the roommate) rather than the crowd, at the texture and cost price above. For the crowd, stay with the stylised modular characters.

## Screenshots (in `docs/sprints/characters-ara/`, not committed)
`gpu-creator-{current,ubc_male,ubc_female,ara_man,ara_woman}.png` and `gpu-creator-all.png` (creator distance, about 2.7 and 5 m, in the Quad); `gpu-crowd-distance-sims.png` and `gpu-crowd-distance-top.png` (the game's own cameras); `gpu-face-*.png` (close-ups, now including the woman); `gpu-ara-walk-baked-vs-renamed.png`; `gpu-crowd20-{none,current,ubc_male,ara_man}.png` (the fps scenes on a phone-sized screen) and the `software-` copies. Raw numbers: `gpu-look-results.json`, `gpu-fps-results.json`, `software-fps-results.json`.

## Re-running it
```bash
UBC_DIR="<the pack's 'Base Characters/Godot - UE' folder, with T_Hair_1_Normal.png and T_Eye_Normal.png copied to ..._png.png>" SPIKE_GPU=1 npx playwright test tests/spike/characters.spec.js --config playwright.spike.config.js --workers=1
```
and, for the software renderer, `npx playwright test tests/spike/characters.spec.js --config playwright.edge.config.js --workers=1` (with `UBC_DIR`, without `SPIKE_GPU`). `ARA_DIR` defaults to Downloads. The lineup has all five: current, UBC male, UBC female, Ara man, Ara woman. The only change to `src/` is a read-only test hook, `window.mzansiThree`, in `src/world/scene.js`.
