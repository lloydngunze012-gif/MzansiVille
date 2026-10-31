// Turns test-results/ux-audit/*.json (tests/e2e/ux-audit.spec.js) into one markdown table.
// Run: node scripts/ux-audit-md.mjs > docs/sprints/actions/ux-audit.md
import fs from 'node:fs'

const dir = 'test-results/ux-audit'
const rows = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).flatMap((f) => JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')))
const plain = (r) => r.result.startsWith('ok: ') ? (/\(to (#[^)]+)\)/.exec(r.result)?.[1] ? `opens ${/\(to (#[^)]+)\)/.exec(r.result)[1]}` : 'responds on screen') : r.result
const dead = rows.filter((r) => r.result.startsWith('DEAD'))
console.log(`# UX audit, Actions sprint (phone, 412x915)

Every button and tap target on every screen, tapped one by one from a fresh state (tests/e2e/ux-audit.spec.js). A tap that changes nothing visible is a dead end. **${rows.length} targets, ${dead.length} dead ends.**

| Screen | Button | What it does | Result |
|---|---|---|---|
${rows.map((r) => `| ${r.screen} | ${r.button.replace(/\|/g, '/')}${r.small ? ' (small)' : ''} | ${r.act} | ${plain(r)} |`).join('\n')}`)
