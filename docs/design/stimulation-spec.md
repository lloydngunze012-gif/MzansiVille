# Keeping Players Stimulated: Nudges and Radio

The activities in UMzansi are low-adrenaline: cook, study, queue, chat. That is the point of a life sim, and it is also its biggest risk. A player left alone with a quiet world and one goal line gets bored in three minutes. Lagos Life solves this by constantly talking to the player: how are you feeling, you look tired, go to the clinic. This spec gives UMzansi the same pulse.

**The rule:** the game should never be silent for more than about 60 seconds. Something should always be asking, pointing, playing or reacting.

**The counter-rule:** never more than one thing at once. Five popups is noise; one at a time is a companion.

---

## 1. The nudge system

One nudge on screen at a time, queued by priority. A nudge is a small card at the top of the screen with an icon, one line, and up to two buttons. It never blocks movement and never needs closing; it slides away on its own after 8 seconds or when acted on.

### Priority order
1. **Urgent needs.** A stat about to hit the red band. "You're running on empty. Grab something at the caf?" with a **Take me there** button.
2. **Things happening now.** A hunt starting in 5 minutes, a friend arriving, your lecture in 15 minutes.
3. **Mood check-ins.** Every 8 to 12 real minutes, a question with two or three answers: "How are you feeling?" (good / tired / stressed / broke). The answer changes what the game suggests next: tired gets the common-room couch, stressed gets the clinic or a friend, broke gets a shift.
4. **Suggestions.** When the player has been idle or wandering for about 45 seconds: one thing worth doing nearby, picked from the activities at the closest place, weighted toward the player's weakest stat.
5. **Little life moments.** Flavour with no action needed: "Someone's braaiing behind Braam House. Smells like heaven." These keep the world talking when nothing else is due.

### Rules
- Need nudges speak up early, at amber, not when the player is already in trouble.
- The same nudge never repeats within 10 minutes.
- Any nudge with a destination shows **Take me there**, which walks the player to it.
- Everything is data: nudges live in `data/campusville/nudges.json` with id, priority, trigger, text variants (at least three each, South African voice), buttons and cooldown. New nudges are added without code.
- A "Fewer tips" setting halves the rate. Never zero by default.

## 2. Guiding the eye

Text alone doesn't hook people. Movement on screen does.

- **A ground arrow** points toward the current goal or the last **Take me there**, fading when the player is within 10 m.
- **The destination glows**: a soft pulsing ring on the building or marker.
- **The goal line** at the top always names the next thing to do and the distance ("Lecture at Engineering · 120 m").
- **Stat pills** follow the colour rule already specified: green, amber, red, with only the single worst one pulsing.
- **Small rewards are visible**: when money or a stat changes, a quick +R50 or +5 floats up from the player.

## 3. Radio and sound

The current ambient loop becomes annoying within minutes. Replace it with variety and choice.

### Radios in the world
Positional speakers at: the taxi rank, each house common room, the cafeteria, the Quad, and one parked car with its door open. Volume rises as you approach and fades as you leave, so walking across campus changes the music. Each speaker plays a station.

### Stations
- **Amapiano**
- **Gqom**
- **Kwaito Throwbacks**
- **Gospel Sunday**
- **Hip Hop**
- **UMzansi FM**, the campus station: a DJ voice between tracks announces the next hunt, shouts out the last winner by name and student number, and reads the house leaderboard. This is retention disguised as music.

### Your phone radio
A small radio in the menu lets the player pick a station anywhere. In a hosted room, the host's speaker plays for everyone inside.

### Music rights
No commercial tracks. Commercial music needs label and SAMRO licences, and streaming a hit to thousands of players is a takedown waiting to happen. Sources, in order of preference:
1. **Unsigned South African producers**, credited in-game with a link. Free music, real local sound, and a partnership story.
2. Commissioned tracks.
3. Properly licensed royalty-free music, with the licence kept on file.

Every track's source and licence is recorded in `data/campusville/music.json`.

### Data and settings
- Tracks are compressed (about 64 kbps), cached after first download, and never re-downloaded.
- A **Save data** setting limits music to world radios and stops the phone radio streaming.
- Separate sliders for music, ambient and effects. Mute remembers its state.
- Ambient sound uses many short varied clips mixed randomly, never one loop.

---

## Build order
1. Nudge system with the five priorities and the data file, 20 starter nudges.
2. Ground arrow, destination glow, goal line with distance, floating rewards.
3. World radios with positional volume, two stations, volume sliders.
4. Phone radio, remaining stations, Save data.
5. UMzansi FM announcements (after the hunts exist).

Each step is played on the owner's phone before the next starts.
