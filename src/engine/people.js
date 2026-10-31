// Talking to people: who they are, what they say this time, and what a reply does.
// Memory lives on the run: run.people[id] = { chats, close, mood, last }.
// Ids are named people ("zanele") or extra students ("x3", from extra_names).
import DATA from '../../data/campusville/people.json'
import { CRUSHES } from '../crush.js'
import { crushChat, crushReply } from './crush-arc.js'
import { identityTitle } from './identity.js'

export function personInfo(id) {
  if (DATA.people[id]) return { id, ...DATA.people[id] }
  if (CRUSHES[id]) return { id, name: CRUSHES[id].name, gender: CRUSHES[id].gender, role: 'Second year', bio: 'Takes the 8:20. Judges the timetable.', chats: [] }
  const m = /^x(\d+)$/.exec(id || '')
  const extra = m && DATA.extra_names[Number(m[1]) % DATA.extra_names.length]
  if (!extra) return null
  const [name, gender, type] = extra
  const arch = DATA.archetypes[type]
  return { id, name, gender, role: 'Student', bio: arch.bio, chats: arch.chats, archetype: type }
}

export function extraCount() {
  return DATA.extra_names.length
}

export function memoryOf(run, id) {
  return run.people?.[id] || { chats: 0, close: 0, mood: 0 }
}

export function levelOf(close) {
  let label = DATA.levels[0].label
  for (const level of DATA.levels) if (close >= level.min) label = level.label
  return label
}

function fill(text, info, run) {
  return String(text || '').replace(/\{name\}/g, info.name).replace(/\{you\}/g, run.character?.name || 'you')
}

// What this person says now, and the replies on offer.
export function chatFor(run, id) {
  const info = personInfo(id)
  if (!info) return null
  if (CRUSHES[id]) return crushChatFor(run, id)
  const mem = memoryOf(run, id)
  const chat = info.chats[Math.min(mem.chats, info.chats.length - 1)]
  let line = chat.line
  if (mem.chats === 1) line = mem.mood < 0 ? chat.cold : chat.warm
  if (chat.lines) line = chat.lines[(mem.chats - 2) % chat.lines.length]
  // People react to who you're becoming: strangers have heard of you.
  const title = identityTitle(run)
  if (title.level !== 'new' && mem.chats === 0 && info.archetype) {
    line = `${title.level === 'known' ? `Hey, it's ${title.path.name}!` : `Aren't you the one people call ${title.path.name}?`} ${line}`
  }
  return {
    id,
    name: info.name,
    role: info.role,
    bio: info.bio,
    met: mem.chats > 0,
    close: mem.close,
    level: levelOf(mem.close),
    line: fill(line || chat.line || chat.warm, info, run),
    replies: chat.replies.map((r) => ({ text: fill(r.text, info, run), social: r.social, close: r.close })),
  }
}

// Apply a reply: Social and closeness change, the person remembers.
export function replyTo(run, id, index) {
  if (CRUSHES[id]) return crushReplyTo(run, id, index)
  const info = personInfo(id)
  const now = chatFor(run, id)
  if (!info || !now) return null
  const mem = memoryOf(run, id)
  const chat = info.chats[Math.min(mem.chats, info.chats.length - 1)]
  const reply = chat.replies[index]
  if (!reply) return null
  run.people = run.people || {}
  const close = Math.max(0, Math.min(100, mem.close + (reply.close || 0)))
  run.people[id] = { chats: mem.chats + 1, close, mood: Math.sign(reply.close || 0), last: index, day: run.day }
  const social = reply.social || 0
  if (social) run.stats.social = Math.max(0, Math.min(100, (run.stats.social || 0) + social))
  return {
    answer: fill(reply.answer, info, run),
    social,
    closeDelta: close - mem.close,
    close,
    level: levelOf(close),
    levelUp: levelOf(close) !== levelOf(mem.close) && close > mem.close,
    tone: (reply.close || 0) > 0 ? 'good' : (reply.close || 0) < 0 ? 'bad' : 'neutral',
  }
}

// The crush has an arc, not a fixed chat list (engine/crush-arc.js). Closeness
// lives on run.crush (about 0-30); the talk card shows it on the usual 0-100 scale.
function crushChatFor(run, id) {
  if (!run.crush || run.crush.id !== id) return null
  const c = run.crush
  const chat = crushChat(run)
  const close = Math.min(100, (c.closeness || 0) * 4)
  return {
    id,
    name: c.nameKnown ? c.name : 'Bus stop stranger',
    role: c.met ? 'From the bus stop' : 'Second year',
    bio: '',
    met: Boolean(run.people?.[id]?.chats),
    close,
    level: levelOf(close),
    line: chat.line,
    replies: chat.replies.map((r) => ({ text: r.text, social: r.social, close: r.close })),
  }
}

function crushReplyTo(run, id, index) {
  if (!run.crush || run.crush.id !== id) return null
  const before = Math.min(100, (run.crush.closeness || 0) * 4)
  const reply = crushReply(run, index)
  if (!reply) return null
  const close = Math.min(100, run.crush.closeness * 4)
  const mem = memoryOf(run, id)
  run.people = run.people || {}
  run.people[id] = { chats: mem.chats + 1, close, mood: Math.sign(reply.close || 0), last: index, day: run.day }
  const social = reply.social || 0
  if (social) run.stats.social = Math.max(0, Math.min(100, (run.stats.social || 0) + social))
  return {
    answer: reply.answer,
    social,
    closeDelta: close - before,
    close,
    level: levelOf(close),
    levelUp: levelOf(close) !== levelOf(before) && close > before,
    tone: reply.close > 0 ? 'good' : reply.close < 0 ? 'bad' : 'neutral',
  }
}
