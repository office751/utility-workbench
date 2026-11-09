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
