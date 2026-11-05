# Piece 3: talking to each other

Videos and screenshots stay on the dev machine (never committed); they're named by file below.

## Part 1: the conversation camera (5 Nov)

Talking to someone within 4 m (tap a person on campus, tap a real player, or open the chat next to someone) moves the camera to a two-shot: about 2.5 m back, 1.7 m up, angled across the pair, both heads between the HUD and the card. Same in Top, Sims and Eye. It eases in over 0.4 s and back out to the view you had when the conversation ends. Eye view no longer sits at your own eye height looking at a torso.

| Check | Result |
| --- | --- |
| T1 NPC, Eye | two-shot 2.87 m back, 1.70 m up; both heads on screen, under the HUD, nothing in front; eased in on time, back out in 0.42 s, back to Eye |
| T1 NPC, Sims | 2.51 m back, 1.70 m up; both heads in; eased in and out on time |
| T1 NPC, Top | 3.14 m back, 1.69 m up; both heads in; eased in and out on time |
| T2 real player, B in Eye view | B taps A 2.2 m away: two-shot 3.78 m back, 1.70 m up (was 1.35 m, eye height); both heads in; in 467 ms, out 445 ms; back to B's Eye view |
| K4 talk to 5 people | pass (28 fps) |
| K7 camera, player never hidden | pass (21 fps) |
| M7a-c heads in frame (conversation, studying, eating) | pass (24-27 fps) |
| K10 cards then the stick | the stick moves you on the first frame after every card; "event" took 109 ms at 23 fps (one frame); two re-runs INCONCLUSIVE (18-19 fps, machine load) |

FPS (this PC, real GPU): T1 37 fps; T2 14-15 fps per phone (two phones drawing at once).

Files: T1-eye.png, T1-sims.png, T1-top.png (+ -after), T1-twoshot.webm in docs/sprints/basics/; T2-before.png (Eye view framing a torso, before), T2-card.png, T2-after.png, T2-player-twoshot.webm in docs/sprints/talk/.

Also: real players' name tags shrink up close (never wider than about a head and a half), so A's tag no longer covers the two-shot.
