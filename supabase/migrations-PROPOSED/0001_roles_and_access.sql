-- ⚠️ PROPOSED — do not run without approval. See README.md in this folder.
--
-- 0001 · Roles + investor↔project access mapping
--
-- WHY: today every authenticated user is equal. To let an investor in, the
-- database itself must know "who is an owner" and "which projects may this
-- investor see" — so policies (0002/0003/0004) can enforce it server-side.

-- Every login gets exactly one role. Rows are created by Adam (dashboard or
-- owner UI) — there is still no self-signup anywhere.
create table public.app_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'investor')),
  display_name text not null default '',
  created_at timestamptz not null default now()
);
alter table public.app_users enable row level security;

-- An investor may be granted one OR MORE projects (generalizes beyond GTA).
-- project_id matches the Workbench roster id (integer, e.g. #53).
create table public.investor_project_access (
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
alter table public.investor_project_access enable row level security;

-- Helper functions the policies lean on. SECURITY DEFINER so they can read
-- the tables above even from inside another table's policy check;
-- search_path pinned per Supabase security guidance.
create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_users where user_id = auth.uid() and role = 'owner');
$$;

create or replace function public.has_project(pid int)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from investor_project_access where user_id = auth.uid() and project_id = pid);
$$;

-- Policies for the mapping tables themselves:
-- owners manage everything; an investor can only see their OWN rows (the app
-- uses that to discover which project to land on after login).
create policy "owners manage app_users" on public.app_users
  for all using (public.is_owner()) with check (public.is_owner());
create policy "users read own app_user row" on public.app_users
  for select using (user_id = auth.uid());

create policy "owners manage access map" on public.investor_project_access
  for all using (public.is_owner()) with check (public.is_owner());
create policy "investors read own grants" on public.investor_project_access
  for select using (user_id = auth.uid());

-- Seed the real login as owner. (Adam decided June 11 2026: the old
-- test@ironshield.test account gets DELETED, not seeded.)
insert into public.app_users (user_id, role, display_name)
select id, 'owner', 'Iron Shield' from auth.users
 where email = 'office@ironshieldconstruction.com'
on conflict (user_id) do nothing;
