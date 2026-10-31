#!/usr/bin/env bash
# Look-test: play the main scenes on a phone-sized screen and tile the
# screenshots into test-results/look-sheet.png. Usage: scripts/look-sheet.sh <ffmpeg>
set -e
FF="$1"
npx playwright test tests/e2e/layout.spec.js tests/e2e/talk-people.spec.js tests/e2e/activities.spec.js tests/e2e/scenes.spec.js tests/e2e/places.spec.js tests/e2e/morning.spec.js \
  -g "creator|talk to|quad_friends|cafeteria_meal|law_sitin|sleep|quad at 12|cafeteria at 12|top view of quad at 12|room to campus" \
  --config playwright.edge.config.js --workers=1 --reporter=line | grep -E "passed|failed" || true
cd test-results
set -- layout/2-creator morning/morning_1_room_wake morning/morning_2_kettle_walk morning/morning_10_campus talk/1-gugu-line talk/4-roommate-answer scenes/cafeteria_meal-3s scenes/law_sitin-7s scenes/sleep-7s activities/quad_friends-4.5s places/quad-12 places/top-quad-12
args=""; n=0
for f in "$@"; do [ -f "$f.png" ] && { args="$args -i $f.png"; n=$((n+1)); }; done
layout=""; filt=""; ins=""
for i in $(seq 0 $((n-1))); do layout="$layout|$(( (i%6)*206 ))_$(( (i/6)*458 ))"; filt="$filt[$i:v]scale=206:458[s$i];"; ins="$ins[s$i]"; done
"$FF" -y -loglevel error $args -filter_complex "${filt}${ins}xstack=inputs=$n:layout=${layout#|}" look-sheet.png
echo "sheet: $n shots"
