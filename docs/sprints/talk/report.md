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

## Part 2: player chat (5 Nov)

Tap another player: their card (Wave, Say hi, Add friend, Block, Report). Say hi closes the card and opens the chat panel at the bottom; the two-shot stays on above it. A round Talk button (bottom right, above Stop) opens the same panel anywhere on campus (the two-shot frames whoever is within 4 m). What you say shows as a speech bubble over your head (15 px, readable at arm's length) for everyone within 15 m, fades out and is gone after 8 s, and goes into a small scrollable log. Eight quick phrases plus a 120-character text box. Phone numbers, links (WhatsApp too) and social handles are taken out with the reason; a slur blocks the message. A name in the log opens that player's card: Block hides their body, bubbles, lines and card for you; Report sends their line with it.

T3 (two phones side by side, real touch, own test channel): all checks pass.

| Check | Result |
| --- | --- |
| Say hi opens the text box | the chat opens; B's two-shot stays (both heads in, above the panel, under the HUD) |
| Quick phrase | "Howzit! 👋" in both logs; B's bubble over B on A's phone and B's own, 15 px |
| Free text with contacts | "call me 082 555 1234 or ig: kabelo_99 see www.kabelo.co.za tonight" arrives as "call me or see tonight"; B is told phone numbers, links and handles were taken out |
| Slur | not sent (on neither phone); "That word isn't allowed here. Nothing was sent." |
| 120 characters | the box stops at 120 |
| 8 s | A's bubble on B: shown, fading at 7.4 s, gone at 9.2 s; the line stays in the log |
| Block (from the log) | A's body, bubbles and lines are gone on B; A's next line never reaches B |
| 15 m | A walks 20.6 m away; B's line reaches B's log only |
| Report (from the log) | the report goes to Supabase with "call me or see tonight" (client_errors, 201: the player_reports table isn't set up yet, see below); B disappears for A |

FPS (this PC, two phones drawing at once): 13-24 per phone.

Supabase: run the "Piece 1a" and "Piece 3" blocks at the end of supabase/schema.sql in the SQL editor. Until then cards still travel with presence and reports land in client_errors (kind player_report, message = reason and the line).

Files: T3-1-quick.png, T3-2-filter.png, T3-3-answer.png, T3-4-blocked.png, T3-5-reported.png, T3-chat.webm in docs/sprints/talk/.
