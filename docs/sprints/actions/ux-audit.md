# UX audit, Actions sprint (phone, 412x915)

Every button and tap target on every screen, tapped one by one from a fresh state (tests/e2e/ux-audit.spec.js). A tap that changes nothing visible is a dead end. **295 targets, 0 dead ends.**

| Screen | Button | What it does | Result |
|---|---|---|---|
| Campus (3D) | Open the campus map | button | responds on screen |
| Campus (3D) | Home | home | opens #/title |
| Campus (3D) | Leaderboards (small) | link #/board | opens #/board |
| Campus (3D) | Campus lobby (small) | link #/chat | opens #/chat |
| Campus (3D) | Menu | gear | responds on screen |
| Campus (3D) | Money R1 500 | stat | responds on screen |
| Campus (3D) | Energy 100 | stat | responds on screen |
| Campus (3D) | Fullness 70 | stat | responds on screen |
| Campus (3D) | Grades 50 | stat | responds on screen |
| Campus (3D) | Social 30 | stat | responds on screen |
| Campus (3D) | ▣ Top (small) | view | responds on screen |
| Campus (3D) | ◢ Sims (small) | view | responds on screen |
| Campus (3D) | ◉ Eye (small) | view | responds on screen |
| Campus (3D) | 🗺️ Map (small) | view | responds on screen |
| Campus (3D) | Skip to Free 15:00 | phase | responds on screen |
| Campus lobby (chat) | Home | home | opens #/title |
| Campus lobby (chat) | Leaderboards (small) | link #/board | opens #/board |
| Campus lobby (chat) | Campus lobby (small) | link #/chat | responds on screen |
| Campus lobby (chat) | Menu | gear | responds on screen |
| Campus lobby (chat) | Money R1 500 | stat | responds on screen |
| Campus lobby (chat) | Energy 100 | stat | responds on screen |
| Campus lobby (chat) | Fullness 70 | stat | responds on screen |
| Campus lobby (chat) | Grades 50 | stat | responds on screen |
| Campus lobby (chat) | Social 30 | stat | responds on screen |
| Campus lobby (chat) | ← Back to campus | link #/play | opens #/play |
| Campus lobby (chat) | Try again | chat-retry | responds on screen |
| Campus map (2D) | Home | home | opens #/title |
| Campus map (2D) | Leaderboards (small) | link #/board | opens #/board |
| Campus map (2D) | Campus lobby (small) | link #/chat | opens #/chat |
| Campus map (2D) | Menu | gear | responds on screen |
| Campus map (2D) | Money R1 500 | stat | responds on screen |
| Campus map (2D) | Energy 100 | stat | responds on screen |
| Campus map (2D) | Fullness 70 | stat | responds on screen |
| Campus map (2D) | Grades 50 | stat | responds on screen |
| Campus map (2D) | Social 30 | stat | responds on screen |
| Campus map (2D) | ▣ Top (small) | view | responds on screen |
| Campus map (2D) | ◢ Sims (small) | view | responds on screen |
| Campus map (2D) | ◉ Eye (small) | view | responds on screen |
| Campus map (2D) | 🗺️ Map (small) | view | responds on screen |
| Campus map (2D) | The Quad | place-open | responds on screen |
| Campus map (2D) | Cafeteria | place-open | responds on screen |
| Campus map (2D) | Bus station | place-open | responds on screen |
| Campus map (2D) | Sports Centre | place-open | responds on screen |
| Campus map (2D) | Library | place-open | responds on screen |
| Campus map (2D) | 💼 SMIG | place-open | responds on screen |
| Campus map (2D) | ⚕️ Health Sci | place-open | responds on screen |
| Campus map (2D) | 🔬 Science | place-open | responds on screen |
| Campus map (2D) | ⚖️ Law | place-open | responds on screen |
| Campus map (2D) | ⚙️ Engineering | place-open | responds on screen |
| Campus map (2D) | O O Block · home | place-open | opens #/place/res_o |
| Campus map (2D) | R R Block | place-open | responds on screen |
| Campus map (2D) | S S Block | place-open | responds on screen |
| Campus map (2D) | + Other blocks | place-open | responds on screen |
| Campus map (2D) | BUS Off-campus res | place-open | responds on screen |
| Campus map (2D) | Main Gate opens 15:00 | place-open | responds on screen |
| Campus map (2D) | Skip to Free 15:00 | phase | responds on screen |
| Cover | New student | start | opens #/rules |
| Cover | Sign in | nav | not tapped (leaves the game or signs out) |
| Cover | Settings | nav | opens #/settings |
| Cover | Rules (small) | link #/rules | opens #/rules |
| Cover | Privacy (small) | link #/privacy | opens #/privacy |
| Cover | Terms (small) | link #/terms | opens #/terms |
| Creator: look | ‹ Back (small) | link #/ | opens #/ |
| Creator: look | Rules (small) | link #/rules | opens #/rules |
| Creator: look | ♀Female | avatar | responds on screen |
| Creator: look | ♂Male | avatar | responds on screen |
| Creator: look | Sand | avatar | responds on screen |
| Creator: look | Amber | avatar | responds on screen |
| Creator: look | Brown | avatar | responds on screen |
| Creator: look | Deep | avatar | responds on screen |
| Creator: look | Ebony | avatar | responds on screen |
| Creator: look | Regular | avatar | responds on screen |
| Creator: look | Curvy | avatar | responds on screen |
| Creator: look | Crop | avatar | responds on screen |
| Creator: look | Curls | avatar | responds on screen |
| Creator: look | Fade | avatar | responds on screen |
| Creator: look | Braids | avatar | responds on screen |
| Creator: look | Hoodie | avatar | responds on screen |
| Creator: look | Shirt | avatar | responds on screen |
| Creator: look | Jacket | avatar | responds on screen |
| Creator: look | Organt | avatar | responds on screen |
| Creator: look | Dress | avatar | responds on screen |
| Creator: look | Skirt & top | avatar | responds on screen |
| Creator: look | Shweshwe | avatar | responds on screen |
| Creator: look | Mute music (small) | sound | responds on screen |
| Creator: look | Next: your story › | begin | responds on screen |
| Creator: story | ‹ Look | story-back | responds on screen |
| Creator: story | Rules (small) | link #/rules | opens #/rules |
| Creator: story | 🏛️ NSFASR1 500 · the allowance can run late | story | responds on screen |
| Creator: story | 📜 BursaryR2 200 · keep your marks up or lose it | story | responds on screen |
| Creator: story | 👪 ParentsR1 000 · and a lot of calls home | story | responds on screen |
| Creator: story | 🏘️ A township | story | responds on screen |
| Creator: story | 🌾 A rural town | story | responds on screen |
| Creator: story | 🏙️ A city suburb | story | responds on screen |
| Creator: story | 🤫 The quiet one | story | responds on screen |
| Creator: story | 🤡 The class clown | story | responds on screen |
| Creator: story | ⚽ The sporty one | story | responds on screen |
| Creator: story | 👻 The one nobody noticed | story | responds on screen |
| Creator: story | 📚 The ScholarLectures, library, Dean's List | story | responds on screen |
| Creator: story | 🎉 The SocialiteParties, friends, being known | story | responds on screen |
| Creator: story | 💰 The HustlerSide hustles, money, deals | story | responds on screen |
| Creator: story | 📣 The LeaderSRC, societies, standing up | story | responds on screen |
| Creator: story | 🎤 The CreativeOpen mic, music, fashion | story | responds on screen |
| Creator: story | 🎓 Make the Dean's List | story | responds on screen |
| Creator: story | 💼 Build a hustle to R5,000 | story | responds on screen |
| Creator: story | 📣 Win an SRC seat | story | responds on screen |
| Creator: story | 💘 Find love | story | responds on screen |
| Creator: story | ⭐ Become campus famous | story | responds on screen |
| Creator: story | Guys | story | responds on screen |
| Creator: story | Girls | story | responds on screen |
| Creator: story | Everyone | story | responds on screen |
| Creator: story | No romanceFriends only | story | responds on screen |
| Creator: story | Mute music (small) | sound | responds on screen |
| Creator: story | Walk onto campus | begin | opens #/play |
| Goals card | Open the campus map | button | covered (behind the open menu or card, not tappable now) |
| Goals card | Home | home | covered (behind the open menu or card, not tappable now) |
| Goals card | Leaderboards (small) | link #/board | covered (behind the open menu or card, not tappable now) |
| Goals card | Campus lobby (small) | link #/chat | covered (behind the open menu or card, not tappable now) |
| Goals card | Menu | gear | covered (behind the open menu or card, not tappable now) |
| Goals card | Money R1 500 | stat | covered (behind the open menu or card, not tappable now) |
| Goals card | Energy 100 | stat | covered (behind the open menu or card, not tappable now) |
| Goals card | Fullness 70 | stat | covered (behind the open menu or card, not tappable now) |
| Goals card | Grades 50 | stat | covered (behind the open menu or card, not tappable now) |
| Goals card | Social 30 | stat | covered (behind the open menu or card, not tappable now) |
| Goals card | Today's goals (small) | goals | covered (behind the open menu or card, not tappable now) |
| Goals card | ▣ Top (small) | view | covered (behind the open menu or card, not tappable now) |
| Goals card | ◢ Sims (small) | view | covered (behind the open menu or card, not tappable now) |
| Goals card | ◉ Eye (small) | view | covered (behind the open menu or card, not tappable now) |
| Goals card | 🗺️ Map (small) | view | covered (behind the open menu or card, not tappable now) |
| Goals card | (icon) | dismiss | covered (behind the open menu or card, not tappable now) |
| Goals card | Let's go | dismiss | responds on screen |
| Leaderboards | Home | home | opens #/title |
| Leaderboards | Leaderboards (small) | link #/board | responds on screen |
| Leaderboards | Campus lobby (small) | link #/chat | opens #/chat |
| Leaderboards | Menu | gear | responds on screen |
| Leaderboards | Money R1 500 | stat | responds on screen |
| Leaderboards | Energy 100 | stat | responds on screen |
| Leaderboards | Fullness 70 | stat | responds on screen |
| Leaderboards | Grades 50 | stat | responds on screen |
| Leaderboards | Social 30 | stat | responds on screen |
| Leaderboards | ← Back to campus | link #/play | opens #/play |
| Leaderboards | 💰 Richest | board-tab | responds on screen |
| Leaderboards | 🎓 Dean's List | board-tab | responds on screen |
| Leaderboards | ⚖️ Most Balanced | board-tab | responds on screen |
| Leaderboards | Overall (small) | board-scope | responds on screen |
| Leaderboards | My res (small) | board-scope | responds on screen |
| Leaderboards | Res vs res (small) | board-scope | responds on screen |
| Leaderboards | Try again | board-retry | responds on screen |
| Menu (gear) | Open the campus map | button | covered (behind the open menu or card, not tappable now) |
| Menu (gear) | Home | home | covered (behind the open menu or card, not tappable now) |
| Menu (gear) | Leaderboards (small) | link #/board | covered (behind the open menu or card, not tappable now) |
| Menu (gear) | Campus lobby (small) | link #/chat | covered (behind the open menu or card, not tappable now) |
| Menu (gear) | Menu | gear | covered (behind the open menu or card, not tappable now) |
| Menu (gear) | Money R1 500 | stat | covered (behind the open menu or card, not tappable now) |
| Menu (gear) | Energy 100 | stat | covered (behind the open menu or card, not tappable now) |
| Menu (gear) | Fullness 70 | stat | covered (behind the open menu or card, not tappable now) |
| Menu (gear) | Grades 50 | stat | covered (behind the open menu or card, not tappable now) |
| Menu (gear) | Social 30 | stat | covered (behind the open menu or card, not tappable now) |
| Menu (gear) | (icon) | gear | covered (behind the open menu or card, not tappable now) |
| Menu (gear) | 🔊 Sound: On | sound | responds on screen |
| Menu (gear) | Milestones | nav | opens #/milestones |
| Menu (gear) | Student card | nav | opens #/profile |
| Menu (gear) | Leaderboard | nav | opens #/board |
| Menu (gear) | Campus chat | nav | opens #/chat |
| Menu (gear) | Community rules | nav | opens #/rules |
| Menu (gear) | Privacy | nav | opens #/privacy |
| Menu (gear) | Edit character | edit-char | opens #/new |
| Menu (gear) | Settings | nav | opens #/settings |
| Menu (gear) | Save progress / sign in | nav | opens #/save |
| Menu (gear) | Close | gear | responds on screen |
| Menu (gear) | ▣ Top (small) | view | covered (behind the open menu or card, not tappable now) |
| Menu (gear) | ◢ Sims (small) | view | covered (behind the open menu or card, not tappable now) |
| Menu (gear) | ◉ Eye (small) | view | covered (behind the open menu or card, not tappable now) |
| Menu (gear) | 🗺️ Map (small) | view | covered (behind the open menu or card, not tappable now) |
| Menu (gear) | Skip to Free 15:00 | phase | covered (behind the open menu or card, not tappable now) |
| Milestones | Home | home | opens #/title |
| Milestones | Leaderboards (small) | link #/board | opens #/board |
| Milestones | Campus lobby (small) | link #/chat | opens #/chat |
| Milestones | Menu | gear | responds on screen |
| Milestones | Money R1 500 | stat | responds on screen |
| Milestones | Energy 100 | stat | responds on screen |
| Milestones | Fullness 70 | stat | responds on screen |
| Milestones | Grades 50 | stat | responds on screen |
| Milestones | Social 30 | stat | responds on screen |
| Milestones | ← Back to campus | link #/play | opens #/play |
| Place sheet: Cafeteria | Open the campus map | button | covered (behind the open menu or card, not tappable now) |
| Place sheet: Cafeteria | Home | home | opens #/title |
| Place sheet: Cafeteria | Leaderboards (small) | link #/board | opens #/board |
| Place sheet: Cafeteria | Campus lobby (small) | link #/chat | opens #/chat |
| Place sheet: Cafeteria | Menu | gear | responds on screen |
| Place sheet: Cafeteria | Money R1 500 | stat | responds on screen |
| Place sheet: Cafeteria | Energy 100 | stat | responds on screen |
| Place sheet: Cafeteria | Fullness 70 | stat | responds on screen |
| Place sheet: Cafeteria | Grades 50 | stat | responds on screen |
| Place sheet: Cafeteria | Social 30 | stat | responds on screen |
| Place sheet: Cafeteria | Close (small) | close-sheet | opens #/play |
| Place sheet: Cafeteria | 🧍 Food queue (small) | spot | opens #/play |
| Place sheet: Cafeteria | 🍽️ Terrace tables (small) | spot | opens #/play |
| Place sheet: Cafeteria | 📋 Menu board (small) | spot | opens #/play |
| Place sheet: Cafeteria | 🍛⏱ 40 min R35 Cafeteria meal ⚡ +5🍽 +40👥 +4 Leaves 4 of 5  | do | responds on screen |
| Place sheet: Cafeteria | 🍛⏱ 40 min R25 Sit down at a full table ⚡ -4🍽 +10👥 +6 Leav | do | responds on screen |
| Talk: a goodbye reply | Open the campus map | button | responds on screen |
| Talk: a goodbye reply | Home | home | opens #/title |
| Talk: a goodbye reply | Leaderboards (small) | link #/board | opens #/board |
| Talk: a goodbye reply | Campus lobby (small) | link #/chat | opens #/chat |
| Talk: a goodbye reply | Menu | gear | responds on screen |
| Talk: a goodbye reply | Money R1 500 | stat | responds on screen |
| Talk: a goodbye reply | Energy 100 | stat | responds on screen |
| Talk: a goodbye reply | Fullness 70 | stat | responds on screen |
| Talk: a goodbye reply | Grades 50 | stat | responds on screen |
| Talk: a goodbye reply | Social 29 | stat | responds on screen |
| Talk: a goodbye reply | 👋 Bye, Naledi | talk-bye | responds on screen |
| Talk: a student | Open the campus map | button | covered (behind the open menu or card, not tappable now) |
| Talk: a student | Home | home | opens #/title |
| Talk: a student | Leaderboards (small) | link #/board | opens #/board |
| Talk: a student | Campus lobby (small) | link #/chat | opens #/chat |
| Talk: a student | Menu | gear | responds on screen |
| Talk: a student | Money R1 500 | stat | responds on screen |
| Talk: a student | Energy 100 | stat | responds on screen |
| Talk: a student | Fullness 70 | stat | responds on screen |
| Talk: a student | Grades 50 | stat | responds on screen |
| Talk: a student | Social 30 | stat | responds on screen |
| Talk: a student | 🍽 “Let’s get something to eat”Caf queue together · 30 min | talk-act | responds on screen |
| Talk: a student | 📚 “Let’s study”+Grades · +Social · 45 min | talk-act | responds on screen |
| Talk: a student | 🪑 Sit with them+Social · closer · 30 min | talk-act | responds on screen |
| Talk: a student | 🚶 “Walk with me”Walk there together · 10 min | talk-act | responds on screen |
| Talk: a student | 📱 Swap numbersThey go in your phone | talk-act | responds on screen |
| Talk: a student | Can I sit next to the owner? | talk-reply | responds on screen |
| Talk: a student | That's not how law works. | talk-reply | responds on screen |
| Talk: a student | Whatever. | talk-reply | responds on screen |
| Talk: a student | 👋 Walk away (small) | talk-bye | responds on screen |
| Talk: after a reply | Open the campus map | button | covered (behind the open menu or card, not tappable now) |
| Talk: after a reply | Home | home | opens #/title |
| Talk: after a reply | Leaderboards (small) | link #/board | opens #/board |
| Talk: after a reply | Campus lobby (small) | link #/chat | opens #/chat |
| Talk: after a reply | Menu | gear | responds on screen |
| Talk: after a reply | Money R1 500 | stat | responds on screen |
| Talk: after a reply | Energy 100 | stat | responds on screen |
| Talk: after a reply | Fullness 70 | stat | responds on screen |
| Talk: after a reply | Grades 50 | stat | responds on screen |
| Talk: after a reply | Social 31 | stat | responds on screen |
| Talk: after a reply | 🍽 “Let’s get something to eat”Caf queue together · 30 min | talk-act | responds on screen |
| Talk: after a reply | 📚 “Let’s study”+Grades · +Social · 45 min | talk-act | responds on screen |
| Talk: after a reply | 🪑 Sit with them+Social · closer · 30 min | talk-act | responds on screen |
| Talk: after a reply | 🚶 “Walk with me”Walk there together · 10 min | talk-act | responds on screen |
| Talk: after a reply | 📱 Swap numbersThey go in your phone | talk-act | responds on screen |
| Talk: after a reply | 👋 Bye | talk-bye | responds on screen |
| Talk: after a reply | Keep talking | talk-more | responds on screen |
| Talk: Mam’ Gugu | Open the campus map | button | covered (behind the open menu or card, not tappable now) |
| Talk: Mam’ Gugu | Home | home | opens #/title |
| Talk: Mam’ Gugu | Leaderboards (small) | link #/board | opens #/board |
| Talk: Mam’ Gugu | Campus lobby (small) | link #/chat | opens #/chat |
| Talk: Mam’ Gugu | Menu | gear | responds on screen |
| Talk: Mam’ Gugu | Money R1 500 | stat | responds on screen |
| Talk: Mam’ Gugu | Energy 100 | stat | responds on screen |
| Talk: Mam’ Gugu | Fullness 70 | stat | responds on screen |
| Talk: Mam’ Gugu | Grades 50 | stat | responds on screen |
| Talk: Mam’ Gugu | Social 30 | stat | responds on screen |
| Talk: Mam’ Gugu | 🥟 Vetkoek and minceR15🍽 +25 | talk-item | responds on screen |
| Talk: Mam’ Gugu | 🥪 Kotafrom R25Small or full house? | talk-item | responds on screen |
| Talk: Mam’ Gugu | 🍩 Amagwinya x2R10🍽 +15 | talk-item | responds on screen |
| Talk: Mam’ Gugu | 🥛 MageuR12⚡ +3🍽 +10 | talk-item | responds on screen |
| Talk: Mam’ Gugu | 👋 Nothing for now, thanks (small) | talk-bye | responds on screen |
| Talk: numbers swapped | Open the campus map | button | covered (behind the open menu or card, not tappable now) |
| Talk: numbers swapped | Home | home | opens #/title |
| Talk: numbers swapped | Leaderboards (small) | link #/board | opens #/board |
| Talk: numbers swapped | Campus lobby (small) | link #/chat | opens #/chat |
| Talk: numbers swapped | Menu | gear | responds on screen |
| Talk: numbers swapped | Money R1 500 | stat | responds on screen |
| Talk: numbers swapped | Energy 100 | stat | responds on screen |
| Talk: numbers swapped | Fullness 70 | stat | responds on screen |
| Talk: numbers swapped | Grades 50 | stat | responds on screen |
| Talk: numbers swapped | Social 30 | stat | responds on screen |
| Talk: numbers swapped | 🍽 “Let’s get something to eat”Caf queue together · 30 min | talk-act | responds on screen |
| Talk: numbers swapped | 📚 “Let’s study”+Grades · +Social · 45 min | talk-act | responds on screen |
| Talk: numbers swapped | 🪑 Sit with them+Social · closer · 30 min | talk-act | responds on screen |
| Talk: numbers swapped | 🚶 “Walk with me”Walk there together · 10 min | talk-act | responds on screen |
| Talk: numbers swapped | 👋 Bye | talk-bye | responds on screen |
| Talk: numbers swapped | 📱 See your phone | talk-phone | opens #/profile |
| You (student card) | Home | home | opens #/title |
| You (student card) | Leaderboards (small) | link #/board | opens #/board |
| You (student card) | Campus lobby (small) | link #/chat | opens #/chat |
| You (student card) | Menu | gear | responds on screen |
| You (student card) | Money R1 500 | stat | responds on screen |
| You (student card) | Energy 100 | stat | responds on screen |
| You (student card) | Fullness 70 | stat | responds on screen |
| You (student card) | Grades 50 | stat | responds on screen |
| You (student card) | Social 30 | stat | responds on screen |
| You (student card) | Share card | nav | opens #/share |
| You (student card) | Save your progress | nav | covered (behind the open menu or card, not tappable now) |
| You (student card) | Admin | nav | not tapped (leaves the game or signs out) |
| You (student card) | Map | nav | opens #/play |
| You (student card) | You | nav | responds on screen |
| You (student card) | Board | nav | opens #/board |
| You (student card) | Chat | nav | opens #/chat |
