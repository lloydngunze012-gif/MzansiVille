// Enrolment, tapped through like a player (src/ui/enrol.js): look -> where you are from -> your
// roommate -> who you are -> your vibe -> your card -> Enter campus. Shared by every test that needs a new student.
// t: a page or a frame. house: 1-based, in houses.json order (the old house list's
// index); course: 1-based index into the course list, or a course name.
export async function enrolUI(t, { name = 'Thandi', house = 1, course = 1, gender, bio, vibe, looking, from, country, roommate, skin } = {}) {
  await t.locator('.en[data-step="look"]').waitFor({ timeout: 30000 })
  if (gender) await t.locator(`[data-gender="${gender}"]`).first().tap()
  if (skin) await t.locator(`[data-act="avatar"][data-part="skin"][data-id="${skin}"]`).tap()
  await t.locator('[data-act="enrol-next"]').tap()
  // (where are you from: South Africa is pre-selected; then your roommate: the default is pre-selected)
  await t.locator('.en[data-step="country"]').waitFor()
  if (country) await t.locator(`[data-k="country"][data-v="${country}"]`).tap()
  await t.locator('[data-act="enrol-next"]').tap()
  await t.locator('.en[data-step="roommate"]').waitFor()
  if (roommate) await t.locator(`[data-roommate="${roommate}"]`).tap()
  await t.locator('[data-act="enrol-next"]').tap()
  await t.locator('.en[data-step="who"] #name').fill(name)
  await t.locator('[data-house-pick]').nth(Math.max(0, (house || 1) - 1)).tap()
  // (where you're from: the picker that lists it, South Africa / Rest of Africa / World)
  if (from) await t.locator(`select[data-from]:has(option[value="${from}"])`).selectOption(from)
  await t.locator('[data-act="enrol-next"]').tap()
  await t.locator('.en[data-step="vibe"]').waitFor()
  if (typeof course === 'string') await t.locator(`[data-pick="course"][data-v="${course}"]`).tap()
  else await t.locator('[data-pick="course"]').nth(Math.max(0, (course || 1) - 1)).tap()
  if (vibe) await t.locator(`[data-pick="vibe"][data-v="${vibe}"]`).tap()
  if (looking) await t.locator(`[data-pick="looking"][data-v="${looking}"]`).tap()
  if (bio) await t.locator('#bio').fill(bio)
  await t.locator('[data-act="enrol-next"]').tap()
  await t.locator('.en[data-step="card"]').waitFor()
  await t.locator('[data-act="enrol-enter"]').tap()
}
