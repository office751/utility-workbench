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
- [ ] 2. App.tsx role gate: investor logins render InvestorView ONLY
- [ ] 3. InvestorView: Current Progress card + captioned gallery (visible
        photos via investor-files download) + comments (project + per-photo)
- [ ] 4. Owner curation: per-file "👁 Share with investor" (caption → copy
        bytes to investor-files → shared_files row), only on granted projects
- [ ] 5. Snapshot publisher (owner session upserts statuses for granted
        projects on save) + Today "💬 Investor comments" unread section
- [ ] 6. Staging run of migrations (NEEDS Adam: staging choice + dashboard
        policy-name reconciliation for 0002 + GTA email) → then production

## Still needed from Adam
- Staging choice (local Docker vs second Supabase project — recommended)
- Confirm deleting test@ironshield.test
- GTA investor email address
