-- setup-selection-shares.sql · RUN ONCE
--
-- CLIENT SELECTIONS SHARE LINKS — the "fill it out on your phone" feature.
--
-- Two tables + two RPCs let a homeowner/investor open a private link (no
-- login), see their house's Selections form, and send choices back:
--
--   selection_shares       one row per share link. `token` is the unguessable
--                          link id; `payload` is a CURATED SNAPSHOT (address,
--                          model, resolved catalog, current choices) built by
--                          the app when staff click "Client link". The public
--                          page renders ONLY this payload — the workbench
--                          blob is never readable from outside.
--   selection_submissions  what the client sent back. Staff review these in
--                          the app and APPLY them to the blob themselves —
--                          nothing anonymous ever writes app state directly.
--
-- SECURITY MODEL (same "curate, don't expose" shape as the investor portal):
--   • RLS on both tables: internal staff only (is_internal(), the same
--     helper the workbench + backups policies use). Anonymous visitors have
--     NO table access at all — not even SELECT.
--   • The public page goes through the two SECURITY DEFINER functions below,
--     which accept only a share token and touch exactly that one share.
--     Guessing a token means guessing a random UUID (~2^122 tries).
--
-- HOW TO APPLY (pick one):
--   • Supabase dashboard → SQL Editor → paste this → Run, OR
--   • supabase db execute --file supabase/setup-selection-shares.sql

-- ---------------------------------------------------------------- tables --

create table if not exists public.selection_shares (
  token      uuid primary key default gen_random_uuid(),
  project_id bigint not null,          -- Project.id from the app roster
  payload    jsonb not null,           -- SelectionSharePayload (src/types.ts)
  revoked    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.selection_submissions (
  id           uuid primary key default gen_random_uuid(),
  token        uuid not null references public.selection_shares(token) on delete cascade,
  project_id   bigint not null,
  choices      jsonb not null,         -- ShareSubmissionChoices (src/types.ts)
  client_name  text not null default '',
  status       text not null default 'pending'
               check (status in ('pending', 'applied', 'dismissed')),
  submitted_at timestamptz not null default now()
);

create index if not exists selection_shares_project_idx
  on public.selection_shares (project_id, revoked);
create index if not exists selection_submissions_project_idx
  on public.selection_submissions (project_id, status);
create index if not exists selection_submissions_token_idx
  on public.selection_submissions (token);

-- ------------------------------------------------------------------- RLS --

alter table public.selection_shares enable row level security;
alter table public.selection_submissions enable row level security;

drop policy if exists "internal manage selection_shares" on public.selection_shares;
create policy "internal manage selection_shares" on public.selection_shares
  for all to authenticated
  using (public.is_internal()) with check (public.is_internal());

drop policy if exists "internal manage selection_submissions" on public.selection_submissions;
create policy "internal manage selection_submissions" on public.selection_submissions
  for all to authenticated
  using (public.is_internal()) with check (public.is_internal());

-- NOTE: no anon policies AT ALL — anonymous access exists only through the
-- two functions below.

-- ------------------------------------------------------------------ RPCs --

-- The public page's READ: hand in a token, get back that share's payload plus
-- the client's latest submission (so reopening the link shows what they
-- already sent). Returns NULL for unknown/revoked tokens — the page shows a
-- friendly "link not active" screen instead of an error.
create or replace function public.selection_share_fetch(share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'payload', s.payload,
    'last', (
      select jsonb_build_object(
        'choices', sub.choices,
        'clientName', sub.client_name,
        'submittedAt', sub.submitted_at
      )
      from selection_submissions sub
      where sub.token = s.token
      order by sub.submitted_at desc
      limit 1
    )
  )
  from selection_shares s
  where s.token = share_token
    and not s.revoked
$$;

-- The public page's WRITE: insert one submission for a valid share. Size- and
-- volume-capped so a leaked link can't be used to flood the table.
create or replace function public.selection_share_submit(
  share_token uuid,
  choices     jsonb,
  client_name text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
-- The params are named after the columns on purpose (they're the RPC's JSON
-- API). This directive says: where a name could be either, it's the PARAM.
#variable_conflict use_variable
declare
  s public.selection_shares%rowtype;
begin
  select * into s from selection_shares
    where token = share_token and not revoked;
  if not found then
    raise exception 'This link is not active.';
  end if;
  if pg_column_size(choices) > 100000 then
    raise exception 'Submission too large.';
  end if;
  if length(coalesce(client_name, '')) > 120 then
    raise exception 'Name too long.';
  end if;
  if (select count(*) from selection_submissions where token = share_token) >= 50 then
    raise exception 'Too many submissions for this link.';
  end if;
  insert into selection_submissions (token, project_id, choices, client_name)
  values (share_token, s.project_id, choices, coalesce(client_name, ''));
end
$$;

-- Callable by the anon key (the public page) and by signed-in app users.
revoke all on function public.selection_share_fetch(uuid) from public;
revoke all on function public.selection_share_submit(uuid, jsonb, text) from public;
grant execute on function public.selection_share_fetch(uuid) to anon, authenticated;
grant execute on function public.selection_share_submit(uuid, jsonb, text) to anon, authenticated;
