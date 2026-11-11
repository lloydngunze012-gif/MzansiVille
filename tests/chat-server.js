// The chat's server for tests (Chat sprint, 11 Nov): supabase/chat.sql running on a real Postgres in this
// process (PGlite, as scripts/sql-check.mjs does), answering the game's chat_* function calls. A phone under test
// calls https://<project>.supabase.co/rest/v1/rpc/chat_send as always; routeChat() answers it from here, so the
// real limits, membership checks, blocks and the word filter are what the test meets, and nothing is written to
// the live project. Realtime nudges still travel over the real Supabase Realtime, on the test's own ?room.
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

export async function chatServer() {
  const db = new PGlite()
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    create or replace function public.is_admin() returns boolean language sql as $$ select false $$;
    -- (the base schema's filter: a slur refuses the message, swearing is starred out)
    create or replace function public.clean_chat_body(raw text) returns text language plpgsql as $$
    begin if raw ~* '\\m(kaffir|slurword)' then raise exception 'Message not allowed'; end if; return trim(regexp_replace(raw, '\\mshit\\M', '***', 'gi')); end $$;
  `)
  await db.exec(readFileSync('supabase/chat.sql', 'utf8'))
  let chain = Promise.resolve()
  const calls = []
  // One call at a time, as the function name and its named arguments: { status, body }.
  const call = (fn, args) => {
    const job = chain.then(async () => {
      if (!/^chat_[a-z_]+$/.test(fn)) return { status: 404, body: { message: `Could not find the function public.${fn} in the schema cache` } }
      const keys = Object.keys(args || {}).filter((k) => /^p_[a-z_]+$/.test(k))
      const values = keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]))
      try {
        const res = await db.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, values)
        calls.push({ fn, reason: res.rows[0].r?.reason || '' })
        return { status: 200, body: res.rows[0].r }
      } catch (e) {
        calls.push({ fn, error: String(e.message) })
        return { status: 400, body: { message: String(e.message), code: 'P0001' } }
      }
    })
    chain = job.catch(() => {})
    return job
  }
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' }
  // Answer this context's (or page's) chat calls from here.
  const routeChat = (target) => target.route(/\/rest\/v1\/rpc\/chat_[a-z_]+/, async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const fn = new URL(req.url()).pathname.split('/').pop()
    const out = await call(fn, JSON.parse(req.postData() || '{}'))
    return route.fulfill({ status: out.status, headers: cors, contentType: 'application/json', body: JSON.stringify(out.body) })
  })
  const rows = async (sql, params) => (await db.query(sql, params)).rows
  return { db, call, calls, routeChat, rows }
}
