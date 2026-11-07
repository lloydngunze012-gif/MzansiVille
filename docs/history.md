# MzansiVille: history

Old instructions moved out of CLAUDE.md so they aren't lost. Done work, kept for the record.

## Owner's decisions

- **7 Nov: characters stay our Quaternius modular students.** Ara 3D Gen and Universal Base Characters were tested and declined: about 6x the download and 33x the texture memory on the creator, and every outfit would be made twice. Spikes: docs/sprints/characters-ara/, docs/sprints/creator-studio/. (The Ara test hook window.mzansiThree and the spike test were removed from the code; they are in git at 4e194fb.)

## The first plan's opening and STEP 0 (moved from CLAUDE.md, 6 Nov)

This was the top of CLAUDE.md, from "You're the only developer" to the end of the STEP 0 merge list. The rest of that plan (items 1-9 and the owner's additions) follows below; it moved out of CLAUDE.md on 6 Nov too. Today: Claude Code is the engineer and Cursor is the content designer (docs/team.md).

You're the only developer on MzansiVille (GitHub: lloydngunze012-gif/MzansiVille), a 3D campus life-sim set at a South African university, benchmarked against Lagos Life and The Sims. Other agents are stopped.

First: save this whole message into CLAUDE.md at the repo root, so future sessions remember the plan and rules.

Rules: work on main. Commit and push after each item. After each push, reply with three lines: what changed, what to test on my phone, what's still broken.

STEP 0, set up and bring in finished work:
- checkpoint-b has nothing committed. Switch to main and pull the latest from GitHub.
- Merge origin/content-writer. On conflicts in day1_morning.json and day1_lecture.json, keep main's version. Make sure the game uses the new activities.csv (108 actions) so every place has things to do.
- From origin/world-designer, take ONLY public/audio/ (sounds + CREDITS.md) and docs/world-designer/. Do not take its src/ changes, places.csv, residences.csv or seed.sql.
- Merge origin/qa-reports (docs only). Read docs/benchmark.md; it's our target.
- Leave origin/backend unmerged.

THEN, in order:
1. Clock bug: the morning ends at e.g. 08:42 but campus loads at 09:00. Keep the time where the morning ended.
2. Remove the Zanele bestie card after the morning; the player already met her as their roommate.
3. Fix the dark label cut off on the left edge of the campus screen after arriving.
4. Real names: change "Business Hall" back to SMIG everywhere, including the route hint. Keep Westville, O/R/S Block, the Quad and NSFAS. No official university logos or crests anywhere, including the share card.
5. Sound: wire up public/audio. Footsteps while walking, kettle at the kettle, door when leaving, bus engine for the bus, crowd on campus, background music, and a mute toggle in the menu.
6. Replace the capsule avatar with a free rigged low-poly character (Quaternius or Kenney, CC0) with arms, legs, and walk, idle and sit animations. Recolour from the character creator, including the Organt tee.
7. Other students on campus: 10–15 people walking between buildings and sitting at the Quad, using the same character model.
8. Walking into SMIG starts a playable 9:00 lecture: walk in, find a seat, something happens, a choice, a result.
9. Bugs from QA (B02): sending a chat message lands on the rules page, and the sign-in link resets the player.

Golden rule: every tap must show movement or something happening, never just a progress bar and numbers.

Added by the owner during the build (keep these):
- Characters have a gender, picked in the creator. The day 1 roommate is the same gender: Zanele for female students, Sipho for male students.
- Include feminine clothing (Dress, Skirt & top, Shweshwe so far) and keep adding variety.
- In the character creator the student dances and South African house music plays. A mute button is fine, but music and dancing are the default.

Status: the first plan (Step 0 and items 1-9) is done and pushed (up to 86d3a1a).
