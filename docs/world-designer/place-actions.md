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

### Business Hall `smig`

No clock. Class in lecture. A short stay in leisure. Not a night venue.

| id | phase | label | effects | writer |
| --- | --- | --- | --- | --- |
| lecture_attend | lecture | Attend lecture | shipped | no |
| lecture_back | lecture | Sit at the back | shipped | no |
| smig_notes | lecture | Share notes with the row | grades +2, social +4, energy −4 | yes |
| smig_tutorial | leisure | Stay for the tutorial | grades +4, energy −8, hunger −4 | yes |
| smig_society | leisure | Business society table | money −10, energy −6, social +6 | yes |

`smig_notes` is the moment: a classmate asks. One result line for yes.

### Health Sciences `health_sciences`

Same window as Business Hall. Attend and back-row already show for Medicine and Nursing.

| id | phase | label | effects | writer |
| --- | --- | --- | --- | --- |
| lecture_attend | lecture | Attend lecture | shipped, course-scoped | no |
| lecture_back | lecture | Sit at the back | shipped | no |
| hs_cold_call | lecture | Answer the cold call | grades +4, energy −6, social +1 | yes |
| hs_skills | leisure | Skills-lab hour | grades +5, energy −12 | yes |
| hs_debrief | leisure | Walk a friend through the practical | grades +2, social +4, energy −6 | yes |

`hs_cold_call` needs two result lines later (you knew it / you did not). Skeleton has one slot.

### Science `science`

| id | phase | label | effects | writer |
| --- | --- | --- | --- | --- |
| lecture_attend | lecture | Attend lecture | shipped for Science | no |
| lecture_back | lecture | Sit at the back | shipped | no |
| sci_demo | lecture | Help with the demo | grades +6, energy −8, social +2 | yes |
| sci_writeup | leisure | Finish the lab sheet | grades +6, energy −10, hunger −4 | yes |
| sci_society | leisure | Science society | money −5, energy −6, social +5 | yes |

### Law `law`

| id | phase | label | effects | writer |
| --- | --- | --- | --- | --- |
| lecture_attend | lecture | Attend lecture | shipped for Law | no |
| lecture_back | lecture | Sit at the back | shipped | no |
| law_moot | lecture | Take the moot point | grades +3, energy −6, social +6 | yes |
| law_read | leisure | Read the case in the back row | grades +5, energy −8, social −2 | yes |
| law_chambers | leisure | Walk a friend through the facts | grades +2, social +4, energy −4 | yes |

### Engineering `engineering`

| id | phase | label | effects | writer |
| --- | --- | --- | --- | --- |
| lecture_attend | lecture | Attend lecture | shipped for Engineering | no |
| lecture_back | lecture | Sit at the back | shipped | no |
| eng_phone | lecture | Phone buzzes under the desk | choice: pocket it (grades +2, energy −2) or look (social +3, grades −2) | yes, two results |
| eng_problem | leisure | Problem set in the workshop | grades +6, energy −10 | yes |
| eng_club | leisure | Build-club hour | money −15, energy −10, social +6 | yes |

### Main Gate `gate`

No clock. It is open in every phase. Nothing is shipped.

| id | phase | label | effects | writer |
| --- | --- | --- | --- | --- |
| gate_card | wake | Show your student card | energy −2, social +1 | yes |
| gate_wait | wake | Wait for a res friend | energy −2, social +3 | yes |
| gate_stream | transit | Join the stream onto campus | energy −4, social +2 | yes |
| gate_directions | transit | Ask which way to your hall | social +2, energy −1 | yes |
| gate_late | lecture | Explain why you are late | energy −6, grades −2, social +1 | yes |
| gate_point | lecture | Guard points you up the path | social +2 | yes |
| gate_visitor | social | Meet someone from town | money −10, energy −4, social +6 | yes |
| gate_flyer | social | Take a club flyer | social +2 | yes |
| gate_club | leisure | Stop for the club table | social +4, energy −3 | yes |
| gate_town | leisure | Walk out for air | money −20, energy −8, social +3 | yes |
| gate_security | night | Chat with night security | energy −3, social +2 | yes |
| gate_sign_in | night | Sign in late | energy −4, social −1 | yes |

### The Quad `quad`

No place clock. Vendor action is 07:00–19:00. Friends, skip, vendor, and the day-3 shift are shipped.

| id | phase | label | effects | writer |
| --- | --- | --- | --- | --- |
| quad_board | wake | Read the noticeboard | social +1 | yes |
| quad_coffee | wake | Morning tea at the vendor | money −10, hunger +15, social +2 | yes |
| quad_cut | transit | Cut across to class | energy −3 | yes |
| quad_lost | transit | Point a lost first-year | social +4, energy −2 | yes |
| lecture_skip | lecture | Skip and chill | shipped | no |
| quad_between | lecture | Ten minutes on the grass | energy −2, social +3 | yes |
| quad_friends | social | Meet friends | shipped | no |
| quad_vendor | social | Buy from the vendors | shipped | no |
| quad_campaign | social | Listen to an SRC pitch | energy −4, social +6 | yes |
| job_shift | leisure | Work a shift | shipped, day 3 | no |
| quad_music | leisure | Someone’s speaker | energy −6, social +5 | yes |
| quad_late | night | The quad after dark | energy −8, hunger −4, social +6 | yes |

`quad_coffee` fits the vendor clock (opens 07:00). It is a new wake action, not a change to `quad_vendor`.

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

Write caption, result, and twist (twist may stay blank) for every skeleton row with `needs_lines: true`. Do not rewrite shipped rows. Tone: Westville Campus, Durban, no real university, no real residence brand, no NSFAS logo. NSFAS may be named the way students already say it in the phone action.

Priority order for the lines: Business Hall, Health Sciences, Science, Law, Engineering, Main Gate, the Quad, then the rest.

## Out of scope

Do not import `place_actions.json` in the client. Do not change `activities.csv` numbers. Course routing stays in `meta.json`.
