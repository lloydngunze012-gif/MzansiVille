# The Soft Life team: who does what

Read this first, whichever tool you are. It is the shared brain: if any one of us runs out of credits, the others carry on from here without losing anything.

## The game in one paragraph

**Soft Life: University of Mzansi (UMzansi)** is a 3D mobile-browser life sim (Vite + Three.js) set at a fictional South African university anyone can join. Live at softlifeza.vercel.app (mzansiville.vercel.app redirects). Repo `lloydngunze012-gif/MzansiVille`, owner's PC `C:\Users\organ\Projects\MzansiVille`. Supabase project `ouzczzrjcwsqjnkshgja`. Brand tie-in: Organt. Seven houses (Thekwini, Peak, Oakwinds, Braam, Jakaranda, Kingsway, Mzansi House), student numbers 26 + six digits, Founders badge for the first 500. Tap-to-move with a Stop button, swipe to look, presence over Supabase Realtime, local chat bubbles, player cards, 145 activities, cream theme.

**Month 1 focus:** `docs/design/month1-focus.md`. Three things only: activity flow, conversations that keep going, music.

## Roles

| Who | Role | Owns | Never does |
|---|---|---|---|
| **Lloyd** | Director and final playtester | What gets built and when, the rules, approval, the phone verdict | Anyone else's job |
| **Claude (chat)** | Designer and QA lead | Specs, prompts for Claude Code and Cursor, the QA pass after every push, `docs/design/`, `docs/backlog.md` | Write game code |
| **Claude Code** | Engineer | Everything in `src/`, `tests/`, `scripts/`, `supabase/`; running the GPU tests on the owner's PC | Decide what to build, write dialogue or content |
| **Cursor** | Content designer | Everything in `data/`: dialogue, activities, people, prices, nudges, music list, quick phrases, the South African voice; balancing numbers | Touch `src/` |

Two tools never edit the same files in the same piece. If a piece needs both code and content, Claude (chat) writes two prompts: Claude Code goes first and names the exact keys it reads, and Cursor fills them.

## How a piece moves

1. Lloyd: the idea, in plain words.
2. Claude (chat): a short spec and the prompts (one for `src/`, one for `data/` if needed).
3. Claude Code builds and tests, then pushes. **Push, don't deploy until Lloyd says so.**
4. Cursor fills the content, runs `npm run check`, then pushes.
5. Claude (chat): the QA pass (below), with a bug list and fix prompts.
6. Lloyd plays it on the phone. Done, or back to step 2 with the bugs.
7. Whoever finishes a step updates `docs/now.md`.

**Standing rules:** one piece at a time. Out-of-scope problems go to `docs/backlog.md`, not into the piece. No movement test counts below 20 fps. Lloyd's phone verdict beats any test. Test videos and screenshots are never committed.

## Speed rules

- Hotfix: if a live bug hurts players, Lloyd uses Vercel Instant Rollback first; then one bug per prompt, medium effort, only that area's tests, 10-15 min.
- Build: one or two items per prompt, medium effort (high only for design and database), screenshots at 390x844 unless layout work; the full test run once, before going live.
- Cursor: data/ plus small self-contained jobs in one screen or file. 3D, saves, database and tests stay with Claude Code.
- No open-ended audits unless Lloyd asks for one.

## The QA pass ("run checks")

Every time, in this order, nothing skipped:

1. **Pull and build.** List what changed since the last pass (commits and files).
2. **Sim checks:** `npm run check`, all of them, not stopping at the first failure.
3. **Code review:** read every changed file in `src/`. Look for bugs, slow code, things that break later, and code that silently does nothing (an empty object where a model should be, a missing key with a fallback).
4. **Content check:** every key, model, sound and line the code asks for actually exists in `data/` and `public/`. Watch the console for warnings like `home: no model`.
5. **Screenshots:** look at every new or changed screenshot in `docs/sprints/` the way a player would. Check for people floating or sitting on air, missing furniture, text covering faces, the camera inside walls or trees, and HUD clutter.
6. **Rules audit:** see the rules below.
7. **Automated tests:** run what can run. Say clearly which results don't count (anything below 20 fps, or any sandbox without a GPU). For those, give Lloyd the GPU command to hand to Claude Code: `npx playwright test <spec> --config playwright.gpu.config.js --workers=1`.
8. **Report:** each bug with its severity (blocker / bad / polish), how to repeat it, who fixes it (Claude Code or Cursor), and a ready-to-paste prompt.

## Rules that never bend

- No real university names or logos. Houses are styled after real universities, nothing more.
- No real brands (Woolies etc.). Invented ones only (Greenway Grocer, Organt).
- No real photos on player cards. No age on cards (year of study instead).
- Bios and chat strip phone numbers, links and social handles. Slurs are blocked.
- No voice notes until moderation exists.
- No commercial music. Unsigned SA producers with credit, commissioned or properly licensed tracks only, each recorded in `data/campusville/music.json`.
- CC0 or properly licensed models only, recorded in `docs/credits.md`.

## Where things live

- `CLAUDE.md`: Claude Code's working notes, newest sprint at the top.
- `docs/now.md`: **the current state**: the piece in progress, the last phone verdict, what's next. Short, always current.
- `docs/design/`: player-experience-spec, retention-spec, build-plan, stimulation-spec (nudges and radio), scaling-plan, month1-focus.
- `docs/backlog.md`: everything parked.
- `docs/sprints/<piece>/report.md`: each piece's report.
- `src/`: code. `data/campusville/`: content. `public/`: models, audio, images. `tests/`: Playwright. `scripts/sim-check.mjs`: the sim checks.

## If someone runs out of credits

Claude Code and Claude (chat) may share one Claude plan, so plan for both going quiet at once.

**Claude runs out (chat and Code):** Cursor takes over both jobs until Claude is back.
- Building: read `CLAUDE.md` and `docs/now.md` first. Same rules: one piece, tests, push, don't deploy.
- QA: run the QA pass above after every push.
- Log everything done this way in `docs/now.md` so Claude can pick it up.

**Cursor runs out:** Claude Code also edits `data/`, in separate commits from code. Claude (chat) writes the content prompts.

**Claude (chat) only runs out:** Cursor writes the specs and runs the QA pass.

**Before ending any session, every tool:** update `docs/now.md`, push, and leave no uncommitted work on the owner's PC.
