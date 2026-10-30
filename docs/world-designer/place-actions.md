# Place actions (design only)

Not wired. Do not change `activities.csv`, `hours.json`, or sim numbers from this doc. Effects below are targets in the existing stats: `money`, `energy`, `grades`, `social`, `hunger` (fullness). Empty `lines` in `data/campusville/place_actions.json` are for Content Writer.

## What the data does today

`places.csv` has 16 places. `activities.csv` has 17 rows. `hours.json` only clocks the cafeteria (07:00–17:00), library (08:00–22:00, open all night in exam week), sports centre (06:00–21:00), and the quad vendor action (07:00–19:00). Everywhere else has no clock, so it is phase-gated only.

Phases: wake 07:00–08:00, transit 08:00–09:00, lecture 09:00–13:00, social 13:00–15:00, leisure 15:00–21:00, night 21:00–23:00.

A row’s `place_id` is not always where it appears. Home-scoped actions (noodles, skip breakfast, phone, sleep, call home) follow the student’s residence. Course-scoped attend and back-row follow the course venue, even though the CSV says `smig`. `res_party` is any on-campus residence, not only R Block.

So a Law student in O Block already gets attend and back-row at the Law venue. Business Hall, Health Sciences, Science, and Engineering show those two only when the course points there. These seven CSV places have no row of their own: Health Sciences, Science, Law, Engineering, other on-campus blocks, off-campus res, Main Gate. Most other places have one row. Tapping them in the wrong phase says there is nothing here.

Shipped effects, for scale (do not retune them here):

| id | place | phase | effects |
| --- | --- | --- | --- |
| wake_noodles | home | wake | money −8, social −2, hunger +25 |
| wake_skip | home | wake | energy +5, hunger −15 |
| wake_phone | home | wake | social +5 |
| go_walk | bus | transit | energy −10, hunger −5 |
| go_bus | bus | transit | money −12, social +3 |
| lecture_attend | course venue | lecture | energy −10, grades +8, social +2, hunger −5 |
| lecture_back | course venue | lecture | energy −5, grades +2, social +5, hunger −5 |
| lecture_skip | quad | lecture | energy +5, grades −6, social +8, hunger −5 |
| quad_friends | quad | social | money −5, energy −5, social +12, hunger −5 |
| quad_vendor | quad | social, 07:00–19:00 | money −15, social +3, hunger +20 |
| cafeteria_meal | cafeteria | wake, social, leisure, until 17:00 | money −35, energy +5, social +4, hunger +40 |
| library_study | library | leisure, 08:00–22:00 | energy −15, grades +10, social −3, hunger −5 |
| sports_gym | sports | leisure, until 21:00 | money −10, energy −15, social +6, hunger −10 |
| res_party | on-campus res | leisure | money −20, energy −25, grades −4, social +15, hunger −5, 2 slots |
| job_shift | quad | leisure, from day 3 | money +120, energy −20, social +2, hunger −5, 2 slots |
| call_home | home | leisure | energy +5, social +6 |
| sleep | home | night | energy +60 on the next morning, hunger −20, ends the day |

## Priority

Content Writer owns these places (PR 3). Their ids and phases win. Lines are not copied here. Effects below are the numbers on their `activities.csv` rows, so this doc does not invent a second set. Each of those rows is marked written by Content Writer, see PR 3.

Course-scoped `lecture_attend` and `lecture_back` still ship for the student’s own venue. They are not replaced.

### Business Hall `smig`

| id | phase | effects | status |
| --- | --- | --- | --- |
| lecture_attend | lecture | shipped, course venue | already in the game |
| lecture_back | lecture | shipped, course venue | already in the game |
| smig_sitin | lecture | energy −8, grades +4, social +1, hunger −5 | written by Content Writer, see PR 3 |
| smig_board | lecture | energy −2, grades +1, social +1, 0 slots | written by Content Writer, see PR 3 |
| smig_steps | social | money −8, energy +2, social +7, hunger +15 | written by Content Writer, see PR 3 |
| smig_case | social | energy −8, grades +5, social +3, hunger −5 | written by Content Writer, see PR 3 |
| smig_lab | leisure | energy −12, grades +6, hunger −5 | written by Content Writer, see PR 3 |
| smig_beanbag | leisure | energy +7, social +2, hunger −3 | written by Content Writer, see PR 3 |

### Health Sciences `health_sciences`

| id | phase | effects | status |
| --- | --- | --- | --- |
| lecture_attend | lecture | shipped when the course is Medicine or Nursing | already in the game |
| lecture_back | lecture | shipped with attend | already in the game |
| hs_sitin | lecture | energy −8, grades +4, social +1, hunger −5 | written by Content Writer, see PR 3 |
| hs_board | lecture | energy −2, grades +1, social +1, 0 slots | written by Content Writer, see PR 3 |
| hs_lawn | social | money −8, energy +2, social +7, hunger +15 | written by Content Writer, see PR 3 |
| hs_cards | social | energy −8, grades +5, social +3, hunger −5 | written by Content Writer, see PR 3 |
| hs_prac | leisure | energy −12, grades +6, hunger −5 | written by Content Writer, see PR 3 |
| hs_bob | leisure | energy +5, grades +2, social +2, hunger −3 | written by Content Writer, see PR 3 |

### Science `science`

| id | phase | effects | status |
| --- | --- | --- | --- |
| lecture_attend | lecture | shipped when the course is Science | already in the game |
| lecture_back | lecture | shipped with attend | already in the game |
| sci_sitin | lecture | energy −8, grades +4, social +1, hunger −5 | written by Content Writer, see PR 3 |
| sci_board | lecture | energy −2, grades +1, social +1, 0 slots | written by Content Writer, see PR 3 |
| sci_fountain | social | money −8, energy +2, social +7, hunger +15 | written by Content Writer, see PR 3 |
| sci_report | social | energy −8, grades +5, social +3, hunger −5 | written by Content Writer, see PR 3 |
| sci_open | leisure | energy −12, grades +6, hunger −5 | written by Content Writer, see PR 3 |
| sci_lawn | leisure | energy +7, social +2, hunger −3 | written by Content Writer, see PR 3 |

### Law `law`

| id | phase | effects | status |
| --- | --- | --- | --- |
| lecture_attend | lecture | shipped when the course is Law | already in the game |
| lecture_back | lecture | shipped with attend | already in the game |
| law_sitin | lecture | energy −8, grades +4, social +1, hunger −5 | written by Content Writer, see PR 3 |
| law_board | lecture | energy −2, grades +1, social +1, 0 slots | written by Content Writer, see PR 3 |
| law_steps | social | money −8, energy +2, social +7, hunger +15 | written by Content Writer, see PR 3 |
| law_moot | social | energy −8, grades +5, social +3, hunger −5 | written by Content Writer, see PR 3 |
| law_read | leisure | energy −12, grades +6, hunger −5 | written by Content Writer, see PR 3 |
| law_lurk | leisure | energy +5, grades +2, social +3, hunger −3 | written by Content Writer, see PR 3 |

### Engineering `engineering`

| id | phase | effects | status |
| --- | --- | --- | --- |
| lecture_attend | lecture | shipped when the course is Engineering | already in the game |
| lecture_back | lecture | shipped with attend | already in the game |
| eng_sitin | lecture | energy −8, grades +4, social +1, hunger −5 | written by Content Writer, see PR 3 |
| eng_board | lecture | energy −2, grades +1, social +1, 0 slots | written by Content Writer, see PR 3 |
| eng_bridge | social | energy +2, social +7, hunger −3 | written by Content Writer, see PR 3 |
| eng_eggdrop | social | energy −8, grades +5, social +3, hunger −5 | written by Content Writer, see PR 3 |
| eng_workshop | leisure | energy −12, grades +6, hunger −5 | written by Content Writer, see PR 3 |
| eng_print | leisure | energy +5, grades +2, social +2, hunger −3 | written by Content Writer, see PR 3 |

### Main Gate `gate`

No clock. Content Writer covered transit, leisure, and night. No wake or lecture rows in PR 3.

| id | phase | effects | status |
| --- | --- | --- | --- |
| gate_guard | transit | social +3, 0 slots | written by Content Writer, see PR 3 |
| gate_vetkoek | transit | money −10, social +1, hunger +20 | written by Content Writer, see PR 3 |
| gate_taxi | transit | energy +2, social +2, hunger −2 | written by Content Writer, see PR 3 |
| gate_spaza | leisure | money −25, energy −4, social +2, hunger +30 | written by Content Writer, see PR 3 |
| gate_wall | leisure | energy +6, social +3, hunger −3 | written by Content Writer, see PR 3 |
| gate_visitors | leisure | energy −3, social +5 | written by Content Writer, see PR 3 |
| gate_night | night | energy −2, social +3, hunger −3 | written by Content Writer, see PR 3 |
| gate_curfew | night | energy −8, social +4, hunger −3 | written by Content Writer, see PR 3 |

### The Quad `quad`

Friends, vendor, skip, and the day-3 shift still ship. The eight `quad_*` rows below are Content Writer’s, on their phases. Vendor clock stays 07:00–19:00 on the shipped vendor action only.

| id | phase | effects | status |
| --- | --- | --- | --- |
| lecture_skip | lecture | shipped | already in the game |
| quad_study | lecture | energy −5, grades +3, social +1, hunger −3 | written by Content Writer, see PR 3 |
| quad_src | lecture | energy −2, social +4, hunger −3, 0 slots | written by Content Writer, see PR 3 |
| quad_friends | social | shipped | already in the game |
| quad_vendor | social | shipped, 07:00–19:00 | already in the game |
| quad_busker | social | energy +3, social +6, hunger −3 | written by Content Writer, see PR 3 |
| quad_touch | social | energy −10, social +9, hunger −8 | written by Content Writer, see PR 3 |
| job_shift | leisure | shipped, day 3 | already in the game |
| quad_dance | leisure | energy −12, social +10, hunger −5 | written by Content Writer, see PR 3 |
| quad_clouds | leisure | energy +8, social +1, hunger −3 | written by Content Writer, see PR 3 |
| quad_lights | night | energy +2, social +5, hunger −3 | written by Content Writer, see PR 3 |
| quad_longway | night | energy −4, social +3, hunger −3 | written by Content Writer, see PR 3 |

## The other nine

Same rule: 2 actions in each phase the place is actually open. Home-scoped rows are listed once under the residence and not repeated as if they were glued to O Block only.

### Cafeteria `cafeteria`

Open wake through social, and leisure only until 17:00. Closed after that and all night.

| id | phase | label | effects | writer |
| --- | --- | --- | --- | --- |
| cafeteria_meal | wake, social, leisure before 17:00 | Cafeteria meal | shipped | no |
| caf_queue | wake | Stand in the breakfast queue | energy −3, social +2 | yes |
| caf_grab | transit | Grab something for the walk | money −20, hunger +20, energy −2 | yes |
| caf_between | lecture | Eat between classes | money −15, hunger +15, energy −2 | yes |
| caf_table | social | Sit with a table | money −25, hunger +10, energy −4, social +6 | yes |

One shipped meal plus one new action covers each open phase. Do not add a night row.

### Library `library`

Closed in wake (opens 08:00). Open transit through night until 22:00. Exam week the design can add wake study later. Not in this skeleton.

| id | phase | label | effects | writer |
| --- | --- | --- | --- | --- |
| lib_drop | transit | Leave your bag and breathe | energy −2 | yes |
| lib_between | lecture | Twenty pages between classes | grades +3, energy −4, social −1 | yes |
| lib_group | social | Group table | grades +3, energy −6, social +4 | yes |
| library_study | leisure | Study | shipped | no |
| lib_printer | leisure | Print the tutorial | money −5, energy −2 | yes |
| lib_night | night | Night section | grades +6, energy −12, social −2, hunger −4 | yes |

### Sports Centre `sports_centre`

Open wake through leisure. Closed at night (closes 21:00).

| id | phase | label | effects | writer |
| --- | --- | --- | --- | --- |
| sport_stretch | wake | Stretch on the court | energy +4 | yes |
| sport_pass | transit | Cut through on the way in | energy −2 | yes |
| sport_gap | lecture | A gap-hour lap | energy −6, social +2 | yes |
| sport_pickup | social | Pickup game | energy −10, social +6, hunger −6 | yes |
| sports_gym | leisure | Gym or sport | shipped | no |
| sport_watch | leisure | Watch from the stand | energy −3, social +4 | yes |

### Main Bus Station `bus_station`

No clock. The commute actions are transit only.

| id | phase | label | effects | writer |
| --- | --- | --- | --- | --- |
| bus_early | wake | Join the early queue | energy −2, social +1 | yes |
| go_walk | transit | Walk to campus | shipped | no |
| go_bus | transit | Take the bus | shipped | no |
| bus_timetable | transit | Read the timetable | energy −1, social +1 | yes |
| bus_back | lecture | A bus back for a forgotten book | energy −4, grades −2, money −12 | yes |
| bus_town | social | Ride into town | money −15, energy −6, social +4 | yes |
| bus_last | night | Last bus | money −12, energy −4, social +2 | yes |

Leisure can reuse `bus_town` if someone extends the phase later. Not duplicated here.

### O Block `res_o`

Always open. Wake already has three home actions. Night already has sleep.

| id | phase | label | effects | writer |
| --- | --- | --- | --- | --- |
| wake_noodles | wake | Noodles | shipped, home | no |
| wake_skip | wake | Skip breakfast | shipped, home | no |
| wake_phone | wake | Check your phone | shipped, home | no |
| res_o_lock | transit | Lock up and go | energy −1 | yes |
| res_o_notes | lecture | Run back for notes | grades +1, energy −6 | yes |
| res_o_corridor | social | Corridor conversation | social +4, energy −3 | yes |
| res_o_cook | leisure | Cook in the kitchen | money −10, hunger +15, energy −4 | yes |
| sleep | night | Sleep | shipped, home | no |
| res_o_late_chat | night | Talk through the wall | energy −4, social +3 | yes |

`res_party` also appears here in leisure because it is any on-campus res.

### R Block `res_r`

Quiet block. Same home actions if the student lives here. Party is already on every campus res in leisure.

| id | phase | label | effects | writer |
| --- | --- | --- | --- | --- |
| res_r_breakfast | wake | Quiet breakfast | money −5, hunger +10, energy +4, social −1 | yes |
| res_r_out | transit | Leave without waking the corridor | energy −1 | yes |
| res_r_reading | lecture | Read on the bed between classes | grades +3, energy −4, social −2 | yes |
| res_r_tea | social | Tea with one person | hunger +5, social +3, energy −2 | yes |
| res_party | leisure | Res party | shipped, campus res | no |
| res_r_lights | night | Lights-out corridor | energy +2, social −1 | yes |

### S Block `res_s`

| id | phase | label | effects | writer |
| --- | --- | --- | --- | --- |
| res_s_fridge | wake | Something from the shared fridge | money −4, hunger +12, social +2 | yes |
| res_s_out | transit | Walk out with the courtyard | energy −2, social +2 | yes |
| res_s_ball | lecture | Five minutes with the ball | energy −4, social +3 | yes |
| res_s_stoep | social | Sit on the stoep | social +5, energy −3 | yes |
| call_home | leisure | Call home | shipped, home, wherever they live | no |
| res_s_kitchen | night | Late kitchen | hunger +8, energy −3, social +2 | yes |

### Other on-campus blocks `res_other`

Inherits home actions for whoever is housed here, plus `res_party` in leisure.

| id | phase | label | effects | writer |
| --- | --- | --- | --- | --- |
| res_other_kettle | wake | Kettle at the end of the passage | money −6, hunger +12, energy +2 | yes |
| res_other_out | transit | Find the right stair and go | energy −2 | yes |
| res_other_quiet | lecture | Empty room, one chapter | grades +3, energy −5 | yes |
| res_other_floor | social | Your floor, someone new | social +4, energy −2 | yes |
| res_other_wash | night | Late laundry chat | social +2, energy −3 | yes |

### Off-campus res `off_campus`

Home actions if the student lives off campus. No res party.

| id | phase | label | effects | writer |
| --- | --- | --- | --- | --- |
| off_pack | wake | Pack the bag by the door | energy −2 | yes |
| off_stop | transit | Walk to the bus from home | energy −4 | yes |
| off_return | lecture | You forgot the textbook | energy −8, grades −1, money −12 | yes |
| off_supper | social | Supper before the ride back | money −25, hunger +20, social +3 | yes |
| off_couch | leisure | An hour on the couch | energy +6, social −2, grades −1 | yes |
| off_late | night | Key in the gate | energy −3 | yes |

## Content Writer

The 46 rows for Business Hall, Health Sciences, Science, Law, Engineering, Main Gate, and the Quad are written by Content Writer, see PR 3. Their ids and phases are the ones in the skeleton. Their lines are not copied into this file.

Still to write: every row below with `needs_lines: true`. Those places are the bus station, cafeteria, library, sports centre, O Block, R Block, S Block, other on-campus blocks, and off-campus res. Caption, result, and twist (twist may stay blank). Do not rewrite shipped rows.

Tone for the remaining lines: Westville Campus, Durban, no real university, no real residence brand.

## Out of scope

Do not import `place_actions.json` in the client. Do not change `activities.csv` numbers. Course routing stays in `meta.json`.
