-- ⚠️ PROPOSED — do not run without approval. Stage on the second project first
-- (rcchjqupvozyqkahhion), verify each role by JWT simulation, THEN production.
--
-- 0006 · Multi-user roles (RBAC) — see docs/rbac-plan.md
--
-- Extends the investor-portal foundation to five roles:
--   admin · business_owner · project_manager · coworker · investor
-- Implements "Decision A" (frontend gating for internal roles; investors stay
-- fully RLS-isolated). Internal roles read/write the workbench blob; the app
-- hides tabs + financial fields per role. Investors never touch the blob.

-- ---- 1. widen the role set + migrate the existing admin row ----
-- ORDER MATTERS: drop the OLD check (which only allows owner|investor) BEFORE
-- renaming office@ 'owner'→'admin' — otherwise the UPDATE to 'admin' violates
-- the still-active old constraint. Then add the new 5-role check last.
alter table public.app_users drop constraint if exists app_users_role_check;
update public.app_users set role = 'admin' where role = 'owner';
alter table public.app_users
  add constraint app_users_role_check
  check (role in ('admin', 'business_owner', 'project_manager', 'coworker', 'investor'));

-- ---- 2. project assignments ----
-- Adam (June 12): PMs and all other internal staff see EVERY project, so only
-- investors are scoped. We KEEP investor_project_access as-is (no rename) — the
-- name is accurate (investor assignments only) and it avoids a frontend/DB
-- deploy-ordering hazard. has_project() reads it unchanged (below).

-- ---- 3. role-aware helper functions ----
-- is_admin: the one super-user (office@). is_internal: any staff role (NOT an
-- investor) — these are the people who use the workbench itself.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_users where user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_internal()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from app_users
     where user_id = auth.uid()
       and role in ('admin', 'business_owner', 'project_manager', 'coworker')
  );
$$;

-- is_owner() is referenced by the existing investor-content policies as "who
-- may curate/manage". Redefine it as "admin or business owner" so curation
-- keeps working and the business owner can manage too. (has_project unchanged
-- except it now reads the renamed table.)
create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from app_users where user_id = auth.uid() and role in ('admin', 'business_owner')
  );
$$;

create or replace function public.has_project(pid int)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from investor_project_access where user_id = auth.uid() and project_id = pid);
$$;

-- ---- 4. the workbench blob: any INTERNAL role (Decision A) ----
-- Replaces the admin-only (was owner-only) policies from 0002 so coworkers /
-- PMs can actually use the app. Investors are still excluded (is_internal()
-- is false for them) and continue to see only the curated projection.
drop policy if exists "owners read workbench" on public.workbench;
drop policy if exists "owners write workbench" on public.workbench;
create policy "internal read workbench" on public.workbench
  for select using (public.is_internal());
create policy "internal write workbench" on public.workbench
  for all using (public.is_internal()) with check (public.is_internal());

-- ---- 5. the owner file bucket: internal roles too ----
drop policy if exists "owners read project-files" on storage.objects;
drop policy if exists "owners write project-files" on storage.objects;
drop policy if exists "owners update project-files" on storage.objects;
drop policy if exists "owners delete project-files" on storage.objects;
create policy "internal read project-files" on storage.objects
  for select using (bucket_id = 'project-files' and public.is_internal());
create policy "internal write project-files" on storage.objects
  for insert with check (bucket_id = 'project-files' and public.is_internal());
create policy "internal update project-files" on storage.objects
  for update using (bucket_id = 'project-files' and public.is_internal());
create policy "internal delete project-files" on storage.objects
  for delete using (bucket_id = 'project-files' and public.is_internal());

-- NOTE — two things to settle before this ships (docs/rbac-plan.md):
--   • Decision A vs B for FINANCIALS: under A, a coworker/PM could fetch the
--     blob's job-cost fields via the API even though the UI hides them. If
--     that's not acceptable, financials must move to their own RLS table (B).
--   • CONCURRENT WRITES: the workbench is one row; multiple internal editors
--     are last-writer-wins. The __origin sync stops self-echo but not two
--     people editing at once. Fine for a few trusted staff; revisit if many.
