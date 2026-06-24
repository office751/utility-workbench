-- ✅ APPROVED by Adam, June 24 2026 — SAFE TO RUN AS-IS in the Supabase SQL Editor.
--
-- Unlike 0001–0005 in this folder, this one is STANDALONE and does NOT depend on
-- the investor-portal migrations. It only needs the app_users table + the 5-role
-- check from 0006, both already live in production. Re-running it is harmless
-- (idempotent: create-or-replace, drop-if-exists, on-conflict-do-nothing).
--
-- 0007 · Auto-create an app_users row when a login is created
--
-- WHY: app_users rows have always been added by hand, so a new Supabase Auth
-- user never appeared on the 👥 People page (and couldn't be assigned a role).
-- This trigger creates the row automatically the moment a login is made. Adam
-- still creates the login in the dashboard (there is NO self-signup); this just
-- removes the manual second step.
--
-- SECURITY: new rows default to the LEAST-privileged role — 'investor' with no
-- project grants, which sees NOTHING (the investor portal shows "no project
-- linked"). A login therefore can't reach any business data until Adam promotes
-- it in 👥 People. (If you'd rather new logins default to 'coworker' for
-- convenience, change the two 'investor' literals below — but that grants
-- workbench + data access to every new login immediately, so least-privilege is
-- the safer default.)

-- 1. The function. SECURITY DEFINER so it can write public.app_users from inside
--    the auth-schema trigger (bypasses RLS). search_path pinned per Supabase guidance.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_users (user_id, role, display_name)
  values (
    new.id,
    'investor',  -- least-privileged default; promote in 👥 People
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- 2. The trigger: fire once after each new auth user is created.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- 3. One-time backfill for logins that ALREADY exist without an app_users row
--    (the trigger only fires on FUTURE signups). Skips anyone who already has a row.
insert into public.app_users (user_id, role, display_name)
select u.id, 'investor', split_part(u.email, '@', 1)
from auth.users u
left join public.app_users a on a.user_id = u.id
where a.user_id is null
on conflict (user_id) do nothing;

-- 4. Carey is a coworker — set her role + name explicitly. Replace the email with
--    the one you created her with. (Or skip this step: after step 3 she appears on
--    the 👥 People page as 'investor' and you can flip her to coworker there.)
update public.app_users
set role = 'coworker', display_name = 'Carey'
where user_id = (select id from auth.users where lower(email) = lower('CAREY_EMAIL_HERE'));
