-- Receipt upload page (public/receipt + supabase/functions/receipt-upload).
-- APPLIED to the live project Nov 12 2026 — kept here as the record.
-- Josh, Pam and Dylan each get their own link:  /receipt/?p=<person>&k=<link_key>
-- They snap or upload a receipt, say what it was for, and it is emailed from
-- office@ to that person's accounting inbox (send_to).
-- Both tables are locked (RLS on, no policies): only the edge function (service role) reads them.

create table if not exists public.receipt_people (
  person    text primary key,           -- 'josh', 'pam', 'dylan' (the ?p= in their link)
  name      text not null,              -- shows on the page + email subject
  company   text not null,              -- 'Iron Shield Construction' / 'Stonebridge Kitchen & Bath'
  send_to   text not null,              -- the accounting inbox their receipts go to
  link_key  text not null default encode(extensions.gen_random_bytes(9), 'hex'),  -- secret in their link
  -- What the page asks for:
  --   {"mode":"house"}  -> tap a house (search by house no. / parcel), or Gas, or Shop/general
  --   {"mode":"stonebridge","categories":[...]} -> customer/job, category, store, amount, card used
  config    jsonb not null default '{"mode":"house"}'::jsonb,
  active    boolean not null default true
);
alter table public.receipt_people enable row level security;

-- One row per receipt sent (no photos — the email in office@ Sent Items is the copy).
create table if not exists public.receipt_uploads (
  id          bigint generated always as identity primary key,
  person      text not null references public.receipt_people(person),
  details     jsonb not null,           -- what they filled in
  photo_count int not null,
  subject     text not null,
  emailed_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists receipt_uploads_person on public.receipt_uploads (person, created_at desc);
alter table public.receipt_uploads enable row level security;

insert into public.receipt_people (person, name, company, send_to, config) values
  -- Josh buys for two companies, so his page asks which one (added Nov 12):
  ('josh',  'Josh',  'Iron Shield Construction',    'data@ironshieldconstruction.com', '{"mode":"house","companies":["Iron Shield Construction LLC","Mr. Ocala Buys Houses LLC"]}'),
  ('pam',   'Pam',   'Iron Shield Construction',    'data@ironshieldconstruction.com', '{"mode":"house"}'),
  ('dylan', 'Dylan', 'Stonebridge Kitchen & Bath',  'data@stonebridgekitchenandbath.com',
     '{"mode":"stonebridge","categories":["Cabinets","Countertops","Hardware / supplies","Tools","Office","Gas","Other"]}'),
  -- Practice links: same pages, but the email goes to Adam with "TEST - " in the subject.
  ('testis', 'TEST Josh/Pam page',  'Iron Shield Construction',   'adam@ironshieldconstruction.com', '{"mode":"house","companies":["Iron Shield Construction LLC","Mr. Ocala Buys Houses LLC"]}'),
  ('testsb', 'TEST Dylan page',     'Stonebridge Kitchen & Bath', 'adam@ironshieldconstruction.com',
     '{"mode":"stonebridge","categories":["Cabinets","Countertops","Hardware / supplies","Tools","Office","Gas","Other"]}')
on conflict (person) do nothing;

-- Houses to pick come from public.sub_invoice_houses (synced daily from Monday — see setup-sub-invoices.sql).
-- Mail sign-in comes from public.sub_invoice_mail_keys() (vault secrets sub_invoice_graph_*).
-- Links:  select person, 'https://ironshield-invoice.vercel.app/receipt/?p=' || person || '&k=' || link_key from receipt_people;
