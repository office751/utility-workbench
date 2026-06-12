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

## ✅ STAGING REHEARSAL PASSED (June 12 2026, project rcchjqupvozyqkahhion)
Ran 0000→0004 + grant + sample data via the SQL editor, then verified RLS
by simulating each role's JWT (not a UI login):
- Investor (adamdlstiles@gmail.com, granted #53):
  · workbench blob → **0 rows** (cannot read the one-blob state) ✅
  · shared_files → **only slab.jpg** (hidden invoice + #99's file invisible) ✅
  · snapshots → **only #53** (#99's data invisible) ✅
  · CAN comment on #53 ✅ · CANNOT comment on #99 → RLS rejects (42501) ✅
- Owner (office@): is_owner()=true, reads blob + all 3 files + all 2 snaps ✅
Conclusion: migrations are correct. Safe to run on production (skip 0000).

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

## STAGING run order (faithful rehearsal on the blank second project)
0. **0000_staging_prep.sql** — STAGING ONLY. Recreates prod's starting
   shape (workbench table + `authed_all` policy + project-files bucket), so
   0002's DROP/CREATE has something real to act on. Skipping this makes
   0002 fail (the table/bucket don't exist on a fresh project).
1. Dashboard → Auth → create two users on STAGING:
   office@ironshieldconstruction.com (owner) + adamdlstiles@gmail.com (investor).
2. 0001_roles_and_access.sql  (seeds office@ as owner — must exist first)
3. 0002_tighten_existing_rls.sql
4. 0003_investor_content.sql
5. 0004_investor_storage.sql
6. Staging 0005: grant adamdlstiles@gmail.com → investor + project #53.
7. TEST: sign in as each; investor sees only #53's curated data, owner
   still sees the blob; investor REST call for workbench returns nothing.

## PRODUCTION run order (after staging passes)
- SKIP 0000 (prod already has the table/bucket).
- Delete test@ironshield.test (Auth → Users).
- 0001 → 0002 → 0003 → 0004, then create the real GTA login + grant #53.
- 0002 is the lock; it MUST precede any investor account existing.
