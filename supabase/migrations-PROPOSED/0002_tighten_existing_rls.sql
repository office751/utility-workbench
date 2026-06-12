-- ⚠️ PROPOSED — do not run without approval. See README.md in this folder.
--
-- 0002 · THE CRITICAL MIGRATION — lock the blob + owner files to owners only
--
-- WHY THIS MUST COME BEFORE ANY INVESTOR ACCOUNT EXISTS:
-- The entire Workbench state is ONE row (`workbench`, id='main') whose
-- current policy is "any authenticated user". The moment an investor login
-- exists, that policy would hand them EVERYTHING — every project, task,
-- inspection, note — via one REST call with their own JWT. Frontend
-- filtering cannot prevent that; only these policies can.
--
-- Policy names below were reconciled against PRODUCTION pg_policies on
-- June 11 2026 (read-only query): public.workbench has `authed_all` (ALL,
-- authenticated); storage.objects has `pf read/insert/update/delete`.
-- Verify after running:  select * from pg_policies
--                         where tablename in ('workbench','objects');

-- ---- the workbench blob: owners only ----
drop policy if exists "authed_all" on public.workbench;

create policy "owners read workbench" on public.workbench
  for select using (public.is_owner());
create policy "owners write workbench" on public.workbench
  for all using (public.is_owner()) with check (public.is_owner());

-- ---- the owner file locker (project-files bucket): owners only ----
-- (Investors get their OWN bucket in 0004 — they never touch this one.
--  The scanner/scripts use the service key, which bypasses RLS, unaffected.)
drop policy if exists "pf read" on storage.objects;
drop policy if exists "pf insert" on storage.objects;
drop policy if exists "pf update" on storage.objects;
drop policy if exists "pf delete" on storage.objects;

create policy "owners read project-files" on storage.objects
  for select using (bucket_id = 'project-files' and public.is_owner());
create policy "owners write project-files" on storage.objects
  for insert with check (bucket_id = 'project-files' and public.is_owner());
create policy "owners update project-files" on storage.objects
  for update using (bucket_id = 'project-files' and public.is_owner());
create policy "owners delete project-files" on storage.objects
  for delete using (bucket_id = 'project-files' and public.is_owner());

-- NOTE on signed URLs: links already shared with Jennifer/vendors keep
-- working — signed URLs bypass RLS by design (that's their purpose).
