# Notifications: what Lloyd sets up (once)

Message pings and the daily "new students from your area" summary need four things the code cannot do for you. Until they are done the game plays as before: the menu has no Notifications item until step 1 is done, and pings are not sent until step 3 is done. `#/health` shows both: "Social SQL" (step 1) and "Push keys (Vercel)" (steps 2 and 3).

## 1. Supabase: run the SQL again
Supabase, your project, **SQL Editor**, paste the whole of `supabase/chat.sql`, **Run**. (Re-runnable, as before. Its last block is NOTIFICATIONS.)

## 2. Make the push keys (on this PC, once)
In a terminal in the project folder:

```bash
npx web-push generate-vapid-keys
```

It prints a **Public Key** and a **Private Key**. Keep the private one secret: never paste it in chat, a file in the repo, or anywhere public.

## 3. Vercel: add five environment variables
Vercel, project **mzansiville**, **Settings**, **Environment Variables**. Add each for **Production** (and Preview if you test there):

| Name | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | the Public Key from step 2 |
| `VAPID_PRIVATE_KEY` | the Private Key from step 2 |
| `VAPID_SUBJECT` | `https://softlifeza.vercel.app` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase, **Project Settings**, **API Keys**: a **secret** key (`sb_secret_...`), or the legacy **service_role** key. Secret: it can read every table |
| `CRON_SECRET` | any long random text (say 40 letters and digits); Vercel sends it to the daily job so nobody else can start it |

The Supabase address is already there (`VITE_SUPABASE_URL`); the push server reads it too.

Then redeploy once (Vercel, **Deployments**, the newest, **Redeploy**; or tell Claude Code to deploy). Environment variables only reach a new deployment.

## 4. Check
Open `https://softlifeza.vercel.app/#/health`: "Social SQL: Yes" and "Push keys (Vercel): Yes". Then on an Android phone in Chrome: menu, Notifications, Pings for messages, allow. Close the game, and have someone message you.

## How it works (for the next engineer)
- The phone keeps its subscription on the server (`chat_push_sub`). After it sends a line it POSTs `{ id, secret, thread }` to `/api/push` (Vercel function, `api/push.js`).
- `/api/push` calls `chat_push_due` with the service role. Postgres decides who gets one: members of that thread who are not in the game (not seen for 60 s), not muted, not blocked either way, not The Quad or a post's replies, at most one per thread per 10 minutes (lines in between fold into the next: a group's push says how many are unread), not in quiet hours 23:00 to 07:00 SAST unless that player turned them off. It returns the subscriptions and the words to use; `api/_push.js` words them from `data/campusville/notify.json` and sends them with the `web-push` library.
- The daily summary: a Vercel cron (`vercel.json`, 16:00 UTC = 18:00 SAST) calls `/api/push-daily`, which calls `chat_push_digest`.
- iPhone: Safari only delivers web pushes to a game added to the Home Screen (iOS 16.4 and later). The game shows the Add to Home Screen steps when an iPhone player says Yes in Safari.
- Vercel Hobby allows one cron a day, which is what this uses.
