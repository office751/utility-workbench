# Investor portal — build status (resume here if the session died)

Goal: scoped external investor logins. First pairing: GTA Holdings ↔
#53 24028 SW North Beach Rd. Full plan + approved schema:
`supabase/migrations-PROPOSED/` (NOT yet run anywhere — see its README).

## Decisions made
- Investors NEVER read the workbench blob; they see projected tables only
  (shared_files / project_status_snapshot / comments) + a separate
  `investor-files` bucket. RLS at the DB layer; frontend filtering is not
  the security boundary.
- Migration 0002 (blob+storage → owner-only) MUST run before the GTA
  account is created.
- App code is feature-gated: until the migrations exist, all investor
  queries fail soft and the UI hides itself — safe to deploy ahead of schema.

## Checkpoints
- [x] 0. This status doc
- [x] 1. `src/lib/investor.ts` — typed helpers for the new tables (role,
        grants, shared files, snapshot publish, comments), all failing soft
- [x] 2. Root.tsx role gate: investor logins render InvestorView ONLY
- [x] 3. InvestorView: Current Progress card + captioned gallery (visible
        photos via investor-files download) + comments (project + per-photo)
- [x] 4. Owner curation: per-file "👁 Share with investor" (caption → copy
        bytes to investor-files → shared_files row), only on granted projects
- [x] 5. Snapshot publisher (owner session upserts statuses for granted
        projects on save) + Today "💬 Investor comments" unread section
- [ ] 6. Staging run of migrations (NEEDS Adam: staging choice + dashboard
        policy-name reconciliation for 0002 + GTA email) → then production

## Where the frontend pieces live (all deployed, all dormant pre-schema)
- `src/lib/investor.ts` — every query/mutation for the new tables
- `src/Root.tsx` — role gate (investor → InvestorView, else full app)
- `src/components/InvestorView.tsx` — the investor's whole world
- `src/components/InvestorCuration.tsx` — owner panel on a granted
  project's Overview (visibility/captions + conversation + replies)
- `src/components/DocumentsBox.tsx` — 🤝 Investor share button (granted only)
- `src/lib/investorPublish.ts` + App.tsx debounce — snapshot projection
- `src/components/InvestorInbox.tsx` — unread comments atop 🏠 Today

## Checkpoint 6 — decisions made (June 11 2026)
- Staging = a SECOND Supabase project (created: ref `rcchjqupvozyqkahhion`,
  name `workbench-staging-temp`, micro/us-east-1; DELETE when done).
- `test@ironshield.test` → DELETE (not carried through the lockdown). 0001
  now seeds only office@ironshieldconstruction.com as owner.
- 0002 reconciled to PRODUCTION policy names (read-only check June 11):
  workbench policy `authed_all`; storage `pf read/insert/update/delete`.
- Test investor login (GTA stand-in) = **adamdlstiles@gmail.com**, granted
  project #53. Real GTA email comes after staging→prod is proven.
- Run method: Supabase SQL Editor in Adam's signed-in Chrome (no scripted
  token reuse).

## Run order (do on STAGING first, then production)
1. 0001_roles_and_access.sql   2. 0002_tighten_existing_rls.sql
3. 0003_investor_content.sql   4. 0004_investor_storage.sql
(0005 seed is a template — create the auth user + grant #53 by hand.)
