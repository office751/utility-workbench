-- ⚠️ PROPOSED — do not run without approval. See README.md in this folder.
--
-- 0003 · The investor-visible world: curated files, status snapshots, comments
--
-- DESIGN PRINCIPLE: investors never read the blob. Everything they may see
-- is an explicit PROJECTION into real tables, curated by Adam:
--   shared_files            ← photos/docs Adam chose, with captions
--   project_status_snapshot ← the "Current Progress" numbers, published by
--                              the owner app whenever it saves
--   comments                ← two-way, on the project or on a single photo

-- ---- curated files (caption + the explicit visibility switch) ----
create table public.shared_files (
  id uuid primary key default gen_random_uuid(),
  project_id int not null,
  storage_path text not null,           -- object in the investor-files bucket (0004)
  name text not null,
  caption text not null default '',     -- e.g. "Slab poured"
  investor_visible boolean not null default false,  -- Adam flips this ON per photo
  created_at timestamptz not null default now()
);
alter table public.shared_files enable row level security;

create policy "owners manage shared_files" on public.shared_files
  for all using (public.is_owner()) with check (public.is_owner());
-- investors: ONLY rows that are (a) for a granted project AND (b) marked visible
create policy "investors read visible shared files" on public.shared_files
  for select using (investor_visible and public.has_project(project_id));

-- ---- Current Progress snapshot (one row per shared project) ----
-- The owner app already computes these statuses for its own UI; a small
-- publisher upserts them here (via the owner's session) whenever state saves.
create table public.project_status_snapshot (
  project_id int primary key,
  address text not null default '',
  permitting text not null default '',  -- e.g. "Issued 5/12 — expires 11/8"
  electric text not null default '',
  water text not null default '',
  septic text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.project_status_snapshot enable row level security;

create policy "owners manage snapshots" on public.project_status_snapshot
  for all using (public.is_owner()) with check (public.is_owner());
create policy "investors read own project snapshot" on public.project_status_snapshot
  for select using (public.has_project(project_id));

-- ---- comments: on the project page, or on one photo ----
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id int not null,
  shared_file_id uuid references public.shared_files (id) on delete cascade, -- null = project-level
  author_user_id uuid not null references auth.users (id),
  author_name text not null default '',
  body text not null check (length(body) between 1 and 4000),
  read_by_owner boolean not null default false,  -- drives Adam's Today notification
  created_at timestamptz not null default now()
);
alter table public.comments enable row level security;

create policy "owners manage comments" on public.comments
  for all using (public.is_owner()) with check (public.is_owner());
-- investors read the whole conversation on their project…
create policy "investors read own project comments" on public.comments
  for select using (public.has_project(project_id));
-- …and may WRITE comments only as themselves, only on their project, and —
-- when commenting on a photo — only on a photo that's actually visible to them.
create policy "investors write comments" on public.comments
  for insert with check (
    author_user_id = auth.uid()
    and public.has_project(project_id)
    and (
      shared_file_id is null
      or exists (select 1 from public.shared_files f
                  where f.id = shared_file_id
                    and f.project_id = comments.project_id
                    and f.investor_visible)
    )
  );
-- (No investor UPDATE/DELETE — comments are append-only from their side.)
