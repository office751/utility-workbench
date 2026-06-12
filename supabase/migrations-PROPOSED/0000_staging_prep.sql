-- ⚠️ STAGING ONLY — DO NOT RUN ON PRODUCTION.
--
-- 0000 · Recreate just enough of PRODUCTION's shape on a blank staging
-- project so the real migrations (esp. 0002, which DROPs + recreates the
-- workbench/storage policies) can be rehearsed faithfully.
--
-- Production already has all of this — running it there would be a no-op at
-- best and confusing at worst. It exists solely so a fresh second Supabase
-- project mirrors the starting point 0002 expects.
--
-- What production looks like today (confirmed June 11 2026, read-only):
--   • public.workbench: one row id='main', column data jsonb, RLS on,
--     single policy `authed_all` (ALL, role authenticated)
--   • storage bucket 'project-files' (private), policies pf read/insert/
--     update/delete (all authenticated)

-- ---- the one-blob state table ----
create table if not exists public.workbench (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.workbench enable row level security;

-- the pre-investor policy 0002 will drop: any authenticated user, everything
drop policy if exists "authed_all" on public.workbench;
create policy "authed_all" on public.workbench
  for all to authenticated using (true) with check (true);

-- a stand-in 'main' row so an owner read in the rehearsal returns something
insert into public.workbench (id, data)
values ('main', '{"roster": [], "projects": {}}'::jsonb)
on conflict (id) do nothing;

-- ---- the owner file bucket + its current authenticated policies ----
insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;

drop policy if exists "pf read" on storage.objects;
drop policy if exists "pf insert" on storage.objects;
drop policy if exists "pf update" on storage.objects;
drop policy if exists "pf delete" on storage.objects;

create policy "pf read" on storage.objects
  for select to authenticated using (bucket_id = 'project-files');
create policy "pf insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'project-files');
create policy "pf update" on storage.objects
  for update to authenticated using (bucket_id = 'project-files');
create policy "pf delete" on storage.objects
  for delete to authenticated using (bucket_id = 'project-files');
