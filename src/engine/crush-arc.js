// The crush arc, days 1 to 5 (spec section 3, arc 2): the bus-stop meet-cute
// (morning.js), then one beat a day at the Quad. Each beat is a short chat with
// choices; replies change closeness and set flags that later beats read.
// run.crush = { id, name, romance, met, nameKnown, closeness, opener, sat, beats: { [day]: reply }, ... }

const R = (text, close, answer, set = {}, social = 0) => ({ text, close, answer, set, social })

function beat(run) {
  const c = run.crush
  const romance = c.romance !== false
  switch (Math.min(run.day, 6)) {
    case 1:
      if (!c.nameKnown) {
        return {
          line: c.met ? 'Oh! Bus stop. You survived the 8:20.' : 'Hey. You look as lost as I was last year.',
          replies: [
            R('I’m {you}. And you are…?', 3, '{name}. Took you long enough.', { nameKnown: true }, 1),
            R('Same bus tomorrow?', 2, 'If it ever comes. Bring snacks.'),
            R('Just saying hi.', 1, 'Hi, just-saying-hi.'),
          ],
        }
      }
      return {
        line: '{you}! Did the lecture eat you alive?',
        replies: [
          R('Barely. Want a vetkoek?', 4, 'Mam’ Gugu’s? Only if you’re buying.', {}, 2),
          R('I sat in the front row. Like a nerd.', 3, 'Respect. I sat at the back like a coward.'),
          R('Can’t stop, sorry!', -1, 'Okay… see you around.'),
        ],
      }
    case 2:
      return {
        line: c.sat || c.opener === 'headphones' ? 'You left these on the bus seat yesterday. \u{1F3A7}' : 'We have to stop running into each other. People will talk.',
        replies: [
          R('My hero. Coffee on me?', 4, 'A coffee date? Bold. I like it.', { coffee: true }, 1),
          R(c.sat || c.opener === 'headphones' ? 'Keep them. They suit you.' : 'Let them talk.', 3, 'Smooth. Very smooth.'),
          R('Oh. Thanks.', 1, 'Wow. Riveting chat. See you.'),
        ],
      }
    case 3:
      return {
        line: 'Test on Friday, right? I study at the library every afternoon. Join me?',
        replies: [
          R('Yes. 15:00?', 4, '15:00. Don’t be late, I bring the good highlighters.', { studyDate: true }),
          R('Only if you quiz me.', 3, 'Deal. I’m a strict quizzer.', { studyDate: true }),
          R('I study better alone.', 0, 'Fair. The offer stands.'),
        ],
      }
    case 4:
      return {
        line: 'Did you see Thabo hogging me all morning? He wants my notes. Again.',
        replies: [
          R(romance ? 'Should I be jealous?' : 'Want me to rescue you next time?', 3, c.closeness >= 8 ? 'Maybe a little. \u{1F60F}' : 'Ha! Relax, it’s just notes.', { jealous: true }),
          R('Your notes ARE good.', 2, 'Finally, someone who appreciates my work.'),
          R('He’s alright.', 0, 'Hm. Okay.'),
        ],
      }
    case 5: {
      const close = c.closeness >= 10
      return {
        line: close ? 'So… the test is done. What now?' : 'Friday! We survived the week.',
        replies: [
          romance
            ? R('Want to go out Saturday?', close ? 6 : 1, close ? 'Yes. Finally. I thought you’d never ask.' : 'Maybe… let’s get to know each other first.', { asked: close ? 'yes' : 'soon' }, 2)
            : R('Study buddies next term?', 4, 'Obviously. You’re stuck with me.', { buddies: true }, 2),
          R('Friends celebrate too, right?', 3, 'Always. Shisanyama on me.', { friends: true }),
          R('I need sleep for a week.', 0, 'Same. Text me when you wake up.'),
        ],
      }
    }
    default:
      return {
        line: c.asked === 'yes' ? 'There you are. I saved you a seat.' : 'Hey you. What’s the plan today?',
        replies: [
          R('Walk with me?', 2, 'Lead the way.'),
          R('Just came to say hi.', 1, 'Hi. Again. I don’t mind.'),
          R('Busy day, later!', 0, 'Later then.'),
        ],
      }
  }
}

function fill(text, run) {
  return String(text).replace(/\{name\}/g, run.crush.name).replace(/\{you\}/g, run.character?.name || 'you')
}

// Today's beat is a one-off: after it, the generic line.
export function crushChat(run) {
  const c = run.crush
  if (!c) return null
  const done = c.beats?.[run.day] !== undefined
  const b = done && run.day <= 5 ? beat({ ...run, day: 6 }) : beat(run)
  return { line: fill(b.line, run), replies: b.replies.map((r) => ({ ...r, text: fill(r.text, run), answer: fill(r.answer, run) })), beatDay: done ? 0 : run.day }
}

export function crushReply(run, index) {
  const c = run.crush
  const chat = crushChat(run)
  const reply = chat?.replies[index]
  if (!reply) return null
  Object.assign(c, reply.set)
  c.closeness = Math.max(0, (c.closeness || 0) + reply.close)
  if (chat.beatDay) c.beats = { ...(c.beats || {}), [chat.beatDay]: index }
  return reply
}
