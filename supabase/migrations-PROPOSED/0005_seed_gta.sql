-- ⚠️ PROPOSED — do not run without approval. See README.md in this folder.
--
-- 0005 · Seed the first pairing: GTA Holdings ↔ #53 24028 SW North Beach Rd
--
-- PRE-REQUISITE (manual, dashboard): create the investor's login under
-- Authentication → Users → "Invite user" / "Create user" — exactly like the
-- existing accounts were made. No self-signup exists anywhere. Then fill in
-- the email below.

-- >>> REPLACE before running <<<
-- \set gta_email 'investor@gtaholdings.example'

insert into public.app_users (user_id, role, display_name)
select id, 'investor', 'GTA Holdings'
  from auth.users where email = '<GTA_INVESTOR_EMAIL>'
on conflict (user_id) do update set role = 'investor', display_name = 'GTA Holdings';

insert into public.investor_project_access (user_id, project_id)
select id, 53  -- #53 = 24028 SW North Beach Rd (verified against the roster)
  from auth.users where email = '<GTA_INVESTOR_EMAIL>'
on conflict do nothing;

-- Granting a SECOND project to the same investor later is one more row here.
-- Granting a NEW investor = dashboard user + one app_users row + grants.
