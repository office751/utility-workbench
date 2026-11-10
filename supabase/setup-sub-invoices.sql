-- Sub invoice page (public/factura + supabase/functions/sub-invoice).
-- ALREADY APPLIED to the live project Nov 9 2026 — kept here as the record.
-- Both tables are locked (RLS on, no policies): only the sub-invoice edge
-- function (service role) can read or write them.

create table if not exists public.sub_invoice_vendors (
  vendor     text primary key,          -- 'jose', 'aldali'
  name       text not null,             -- prints on the email subject
  prefix     text not null,             -- JM, AF
  link_key   text not null default encode(extensions.gen_random_bytes(9), 'hex'),  -- secret in their link
  reply_to   text,                      -- their email, if they have one
  send_to    text not null default 'data@ironshieldconstruction.com',
  start_n    int  not null default 1    -- first invoice number
);
alter table public.sub_invoice_vendors enable row level security;

create table if not exists public.sub_invoices (
  id           bigint generated always as identity primary key,
  vendor       text not null references public.sub_invoice_vendors(vendor),
  n            int  not null,
  invoice_date date not null,
  total        numeric(12,2) not null,
  lines        jsonb not null,
  emailed_at   timestamptz,
  created_at   timestamptz not null default now(),
  unique (vendor, n)                    -- the same number can never be used twice
);
alter table public.sub_invoices enable row level security;

-- To add a sub: insert a row here, then add them to VENDORS in public/factura/index.html.
-- Their link is  /factura/?v=<vendor>&k=<link_key>
insert into public.sub_invoice_vendors (vendor, name, prefix, reply_to) values
  ('jose',   'Jose Hernandez Maldonado',       'JM',   null),
  ('aldali', 'Aldali Flooring and Renovation', 'AF',   'daineralmenaresc@gmail.com'),
  ('test',   'TEST - please ignore',           'TEST', null)
on conflict (vendor) do nothing;

-- Mail-app sign-in, read from the encrypted vault (secrets named
-- sub_invoice_graph_tenant / _client / _secret). Service role only.
create or replace function public.sub_invoice_mail_keys()
returns table (name text, secret text)
language sql security definer set search_path = ''
as $$ select s.name, s.decrypted_secret from vault.decrypted_secrets s where s.name like 'sub_invoice_graph_%' $$;
revoke all on function public.sub_invoice_mail_keys() from public, anon, authenticated;
grant execute on function public.sub_invoice_mail_keys() to service_role;

-- Added Nov 10 2026 (also already applied):
-- Houses the subs can pick, searchable by house number or parcel. To add a house, insert a row.
create table if not exists public.sub_invoice_houses (
  address text primary key,     -- '888 NE 95TH ST, OCALA'
  parcel  text not null default '',
  active  boolean not null default true
);
alter table public.sub_invoice_houses enable row level security;

-- What each sub's page shows: {"name", "lines":[address lines], "mode":"presets"|"sqft",
-- "presets":[{"es","en","amount"}]  or  "rate" + "work":{"es","en"}}. Kept in the database so
-- one sub's link never carries another sub's details.
alter table public.sub_invoice_vendors add column if not exists config jsonb not null default '{}'::jsonb;

-- Added Nov 10 2026 (already applied): daily sync + duplicate flag.
-- 'monday' house rows are owned by scanner/sub-invoice-sync.mjs; 'manual' rows are never touched by it.
alter table public.sub_invoice_houses add column if not exists source text not null default 'manual';
-- Bills already in QuickBooks for each sub, refreshed by "Invoice Red Flags/sub_invoice_prior.py".
-- Only used to add POSSIBLE DUPLICATE to the email that goes to data@.
create table if not exists public.sub_invoice_prior (
  id bigint generated always as identity primary key,
  vendor text not null, house_no text not null, parcel text not null default '', address text not null,
  job text not null, cat text not null, txn_date date not null, amount numeric(12,2) not null, doc text not null default ''
);
create index if not exists sub_invoice_prior_lookup on public.sub_invoice_prior (vendor, house_no);
alter table public.sub_invoice_prior enable row level security;
alter table public.sub_invoice_vendors add column if not exists qbo_vendor_id text;   -- QuickBooks vendor Id (jose = 28, aldali = 729)
alter table public.sub_invoice_vendors add column if not exists history_of text;      -- practice links: whose history to check

-- Added Nov 10 2026 (already applied): the house sync also runs in the cloud, every day.
-- Edge function supabase/functions/sub-invoice-sync does the same job as scanner/sub-invoice-sync.mjs.
-- Vault secrets: sub_invoice_monday_token (copy of the Monday API token) and sub_invoice_cron_key
-- (random key the timer must present; made with vault.create_secret, never written down anywhere).
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.sub_invoice_sync_keys()
returns table (name text, secret text)
language sql security definer set search_path = ''
as $$ select s.name, s.decrypted_secret from vault.decrypted_secrets s where s.name in ('sub_invoice_monday_token', 'sub_invoice_cron_key') $$;
revoke all on function public.sub_invoice_sync_keys() from public, anon, authenticated;
grant execute on function public.sub_invoice_sync_keys() to service_role;

-- One row per run. Check it is alive:  select * from sub_invoice_sync_log order by id desc limit 5;
create table if not exists public.sub_invoice_sync_log (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  note text not null default ''
);
alter table public.sub_invoice_sync_log enable row level security;

-- What the timer runs. Run it by hand any time:  select public.sub_invoice_run_sync();
create or replace function public.sub_invoice_run_sync()
returns bigint language sql security definer set search_path = ''
as $$
  select net.http_post(
    url := 'https://vldxennmrjnfhrvrlzuh.supabase.co/functions/v1/sub-invoice-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'sub_invoice_cron_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000)
$$;
revoke all on function public.sub_invoice_run_sync() from public, anon, authenticated;

-- Every day at 10:30 UTC (5:30 am Eastern in winter, 6:30 am in summer).
-- To stop it:  select cron.unschedule('sub-invoice-daily-sync');
select cron.schedule('sub-invoice-daily-sync', '30 10 * * *', 'select public.sub_invoice_run_sync()');
