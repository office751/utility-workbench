-- ============================================================================
-- setup-workbench-backups.sql — automatic point-in-time backups of the blob.
--
-- WHY: the whole app state is ONE row (public.workbench, id='main'). A bad write
-- or accidental delete has no easy recovery between the nightly Mac-scanner
-- backups (scanner/backups/, local-only). This adds server-side history that
-- captures EVERY save automatically — no app code, no Mac required.
--
-- HOW: a BEFORE UPDATE trigger snapshots the PREVIOUS blob into a history table
-- on every save, and trims to the most recent 100 versions so it can't grow
-- without bound. Internal staff can read it; investors cannot (mirrors the
-- workbench RLS). Run ONCE in the Supabase SQL editor (dashboard).
--
-- To restore a version:
--   update public.workbench set data = (
--     select data from public.workbench_backups order by taken_at desc limit 1 offset N
--   ) where id = 'main';
-- ============================================================================

create table if not exists public.workbench_backups (
  id bigint generated always as identity primary key,
  taken_at timestamptz not null default now(),
  data jsonb not null
);

alter table public.workbench_backups enable row level security;

-- Internal staff read only (same audience as the workbench blob). No INSERT
-- policy needed — the SECURITY DEFINER trigger below does the writing.
drop policy if exists "internal read workbench_backups" on public.workbench_backups;
create policy "internal read workbench_backups" on public.workbench_backups
  for select using (public.is_internal());

create or replace function public.snapshot_workbench()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Save the version being replaced.
  insert into public.workbench_backups (data) values (old.data);
  -- Keep only the 100 most recent snapshots.
  delete from public.workbench_backups
   where id not in (
     select id from public.workbench_backups order by taken_at desc limit 100
   );
  return new;
end;
$$;

drop trigger if exists workbench_backup_trg on public.workbench;
create trigger workbench_backup_trg
  before update on public.workbench
  for each row execute function public.snapshot_workbench();
