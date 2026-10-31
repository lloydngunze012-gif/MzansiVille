// Creator part 2: your story (spec section 5, 1:30). Each choice is saved on
// run.character and read later: funding sets money, the path drives identity,
// the dream sets the year goal, interest picks the crush.
import { DREAMS } from './engine/goals.js'

export const STORY_OPTS = [
  ['funding', 'How are you paying for varsity?', [
    ['nsfas', '\u{1F3DB}️ NSFAS', 'R1 500 · the allowance can run late'],
    ['bursary', '\u{1F4DC} Bursary', 'R2 200 · keep your marks up or lose it'],
    ['parents', '\u{1F46A} Parents', 'R1 000 · and a lot of calls home'],
  ]],
  ['hometown', 'Where are you from?', [
    ['township', '\u{1F3D8}️ A township', ''],
    ['rural', '\u{1F33E} A rural town', ''],
    ['suburb', '\u{1F3D9}️ A city suburb', ''],
  ]],
  ['past', 'In high school I was…', [
    ['quiet', '\u{1F92B} The quiet one', ''],
    ['clown', '\u{1F921} The class clown', ''],
    ['sporty', '⚽ The sporty one', ''],
    ['invisible', '\u{1F47B} The one nobody noticed', ''],
  ]],
  ['path', 'This year I want to be…', [
    ['scholar', '\u{1F4DA} The Scholar', "Lectures, library, Dean's List"],
    ['socialite', '\u{1F389} The Socialite', 'Parties, friends, being known'],
    ['hustler', '\u{1F4B0} The Hustler', 'Side hustles, money, deals'],
    ['leader', '\u{1F4E3} The Leader', 'SRC, societies, standing up'],
    ['creative', '\u{1F3A4} The Creative', 'Open mic, music, fashion'],
  ]],
  ['dream', 'Your dream for the year', Object.values(DREAMS).map((d) => [d.id, `${d.icon} ${d.label}`, ''])],
  ['interest', 'Who are you interested in?', [
    ['guys', 'Guys', ''],
    ['girls', 'Girls', ''],
    ['everyone', 'Everyone', ''],
    ['none', 'No romance', 'Friends only'],
  ]],
]

// The dream that fits a path, until the player picks one.
export const PATH_DREAM = { scholar: 'deans', socialite: 'famous', hustler: 'hustle', leader: 'src', creative: 'famous' }

export function storyWithDefaults(story = {}) {
  const path = story.path || 'scholar'
  return {
    funding: story.funding || 'nsfas',
    hometown: story.hometown || 'township',
    past: story.past || 'quiet',
    path,
    dream: story.dream || PATH_DREAM[path],
    interest: story.interest || 'everyone',
  }
}

// Starting money by funding (the district's start money is the NSFAS figure).
export const FUNDING_MONEY = { nsfas: 0, bursary: 700, parents: -500 }
