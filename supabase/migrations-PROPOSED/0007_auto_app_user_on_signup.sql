-- ✅ APPROVED by Adam, June 24 2026 — SAFE TO RUN AS-IS in the Supabase SQL Editor.
--
-- ⚠️ RUN ORDER: the app build that knows the 'pending' role (and routes it to a
--    no-access screen) must be DEPLOYED FIRST. It is — so this is safe to run now.
--    Standalone: does NOT depend on the investor-portal migrations 0001–0005.
--    Idempotent: re-running is harmless.
--
-- 0007 · Auto-create an app_users row when a login is created (default: 'pending')
--
-- WHY: app_users rows were added by hand, so a new Supabase Auth user never
-- appeared on the 👥 People page — and worse, a login with no row was treated as
-- ADMIN by the frontend fallback. This trigger gives every new login a row
-- automatically, at the no-power 'pending' role: they land on a "your account
-- isn't set up yet" screen and can reach NOTHING until an admin promotes them in
-- 👥 People. Adam still creates the login (no self-signup); this just removes the
-- manual second step so new logins auto-appear.

-- 0. Allow the new 'pending' role (app_users had a 5-role check). MUST run before
--    the trigger/backfill insert 'pending', or those inserts would violate it.
alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users
  add constraint app_users_role_check
  check (role in ('admin', 'business_owner', 'project_manager', 'coworker', 'investor', 'pending'));

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
    'pending',  -- no-power default; promote in 👥 People
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
--    (the trigger only fires on FUTURE signups). They land as 'pending' too.
insert into public.app_users (user_id, role, display_name)
select u.id, 'pending', split_part(u.email, '@', 1)
from auth.users u
left join public.app_users a on a.user_id = u.id
where a.user_id is null
on conflict (user_id) do nothing;

-- 4. Carey is a coworker — set her role + name explicitly. Replace the email with
--    the one you created her with. (Or skip this: after step 3 she appears on the
--    👥 People page as 'Pending' and you flip her to Coworker there.)
update public.app_users
set role = 'coworker', display_name = 'Carey'
where user_id = (select id from auth.users where lower(email) = lower('CAREY_EMAIL_HERE'));
