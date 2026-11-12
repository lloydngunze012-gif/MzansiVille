-- LAUNCH RESET (owner, 12 Nov, job I). Lloyd runs this ONCE, in the Supabase SQL editor, just before launch.
-- It wipes every test player and everything they made, so launch day starts empty:
--   players (chat, cards, handles, scores), messages, DMs and chat requests, groups players made, Board posts,
--   follows, friends, blocks, reports, invites, push subscriptions, the activity log and the weekly boards.
-- It KEEPS: the game's own data (score rules, district data), the Quad thread and its pinned topic, the 12 interest
-- groups ('i:...', emptied), the 20 posts by the game's named people ('npc:...'), the word filter, admins and
-- sign-in accounts (profiles / auth), the error log, the smoothness reports and the feedback (lines at the end,
-- commented out, clear those too if you want).
-- It cannot be undone. Supabase keeps daily backups on paid plans (Database > Backups) if you need to go back.
-- Safe to run twice; a table that does not exist yet is skipped.
begin;

do $$
declare
  t text;
  wipe text[] := array[
    -- chat (supabase/chat.sql)
    'chat_lines', 'chat_members', 'chat_line_reports', 'chat_blocks', 'chat_friends', 'chat_events', 'chat_refs',
    'chat_group_asks', 'chat_group_bans', 'chat_group_snoozes', 'chat_group_reports', 'chat_dm_asks',
    'chat_push_subs', 'chat_welcomes', 'chat_stamps', 'chat_post_reports', 'chat_follows', 'chat_players',
    -- cards, handles, reports (supabase/schema.sql)
    'player_cards', 'player_card_keys', 'player_handles', 'player_reports', 'chat_messages', 'blocks', 'reports',
    -- the leaderboard (supabase/launch.sql)
    'activity_log', 'score_badges', 'score_weeks_closed', 'score_players'
  ];
begin
  foreach t in array wipe loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I', t);
      raise notice 'emptied %', t;
    end if;
  end loop;
  -- threads: DMs, groups players made, the per-room Quads (quad:2, quad:3...) and post replies go; the Quad and the
  -- interest groups stay, with nothing in them
  if to_regclass('public.chat_threads') is not null then
    delete from public.chat_threads where id <> 'quad' and id not like 'i:%';
    update public.chat_threads set last_id = 0, last_at = null, flame = 0, flame_day = null where id = 'quad' or id like 'i:%';
  end if;
  -- Board posts: players' go; the named people's seeded posts stay, with no stamps
  if to_regclass('public.chat_posts') is not null then
    delete from public.chat_posts where author not like 'npc:%';
  end if;
end $$;

-- Also clear these if you want launch day's reports to start from zero:
-- delete from public.client_errors;
-- delete from public.smooth_reports;
-- delete from public.feedback;

commit;
