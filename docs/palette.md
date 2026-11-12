# Palette

The rule for the whole game (owner, 11 Nov). A test checks it: `tests/palette.js` (`paletteFaults(page, root)`), used by `tests/e2e/chat-v2.spec.js`.

## The rule

1. **Light surfaces carry ink text.** Cream `#F4EFE4` and white `#FFFFFF` (and the game's other pale surfaces) carry ink `#1C1915`. Secondary words (times, labels, "last line" in a list) may be a dark warm grey, never lighter than `#6B6359`.
2. **Yellow carries ink.** A yellow `#F0C400` button, tab or badge has ink `#1C1915` text. Never white or cream on yellow.
3. **Dark surfaces carry white text only.** On ink `#1C1915` (or any dark surface) text is white `#FFFFFF`. No gold, yellow or lilac text on dark.
4. **No purple or navy buttons.** A button is yellow with ink text, light with ink text, or (rarely) ink with white text.
5. **Every text-on-background pair is 4.5:1 or better** (WCAG AA for normal text).

## Colours in use

| Use | Colour |
| --- | --- |
| Ink (text, dark pills) | `#1C1915` |
| Cream (page, bars) | `#F4EFE4` |
| White (cards, rows, bubbles, banners) | `#FFFFFF` |
| Yellow (primary buttons, selected tab, unread badge in a list) | `#F0C400` |
| Secondary text on light | `#6B6359`, `#5F5A52` |
| Hairlines on light | `#E3D8C4` |
| Chat wall | `#DCEBF5` with doodles at low opacity |
| My bubble | `#D9F2C7` |
| Online | `#0F7A40` text, `#1F9D55` dot |
| Alert count on the chat button, low stat | `#C62828`, `#D32F2F`-range reds with white text |
| WhatsApp button | `#0F7A40` with white text |

## What the test measures

For every piece of text on screen it finds the surface under it (the element's own solid background, or the nearest ancestor's) and checks rules 1, 2, 3 and 5; for every button it checks rule 4. Text drawn straight over the 3D picture, a photo or a gradient has no surface to measure and is left out, so such text must sit on a pill or a card of its own. Emoji are left out (they carry their own colours).

## Where it is checked today

- The chat, all of it: the list, a DM, a group, the Quad, the new-message banner (`chat-v2.spec.js` V2 to V5).
- The screens that are always there: campus (top bar, view buttons, the "Open now" bar, Talk), the menu, the Caf, SunnyBay (V1).

## Not swept yet

These screens have not been run through the check, and some still use plum and gold from before the rule: the character screen and the rest of the enrolment steps, the title screen, Settings, the profile and the full player card, place sheets and result cards, the lecture and morning cards, the SunnyBay map and the Things to do sheets, the toasts (`.g-toast` is cream on plum), the house bar, the loading curtain's plum background (its words are white now), the leaderboard and Daily pop-ups. To sweep one: open it in a test and `expect(await paletteFaults(page)).toEqual([])`, then fix what it lists.

## Changed for the rule on 12 Nov

The time pill (was gold on purple: now white on ink), the "Open now" bar (yellow on purple: white on ink), "Leave the Caf" (yellow on purple: ink on yellow), SunnyBay's district chip (yellow on plum: white on ink), the menu's title (gold on cream, 3.9:1: dark grey), the loading line (yellow: white), and in the chat: the tabs, every button, the unread badges, my bubble, names, the wake-up and ask cards, the WhatsApp button (4.3:1: darker green).
