# MzansiVille: history

Old instructions moved out of CLAUDE.md so they aren't lost. Done work, kept for the record.

## The first plan's opening and STEP 0 (moved from CLAUDE.md, 6 Nov)

This was the top of CLAUDE.md, from "You're the only developer" to the end of the STEP 0 merge list. Items 1-9 of that plan ("THEN, in order") are still in CLAUDE.md. Today: Claude Code is the engineer and Cursor is the content designer (docs/team.md).

You're the only developer on MzansiVille (GitHub: lloydngunze012-gif/MzansiVille), a 3D campus life-sim set at a South African university, benchmarked against Lagos Life and The Sims. Other agents are stopped.

First: save this whole message into CLAUDE.md at the repo root, so future sessions remember the plan and rules.

Rules: work on main. Commit and push after each item. After each push, reply with three lines: what changed, what to test on my phone, what's still broken.

STEP 0, set up and bring in finished work:
- checkpoint-b has nothing committed. Switch to main and pull the latest from GitHub.
- Merge origin/content-writer. On conflicts in day1_morning.json and day1_lecture.json, keep main's version. Make sure the game uses the new activities.csv (108 actions) so every place has things to do.
- From origin/world-designer, take ONLY public/audio/ (sounds + CREDITS.md) and docs/world-designer/. Do not take its src/ changes, places.csv, residences.csv or seed.sql.
- Merge origin/qa-reports (docs only). Read docs/benchmark.md; it's our target.
- Leave origin/backend unmerged.
