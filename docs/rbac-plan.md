# Multi-user roles (RBAC) — plan & status

Goal: real per-person logins. office@ = **admin**; others get a scoped login
as **business owner**, **project manager**, **coworker**, or **investor**.
"Different people only need certain information."

Builds directly on the investor portal (app_users / is_owner() / has_project()
/ RLS). The role model lives in `src/data/roles.ts` (the matrix below) and the
DB mirrors it.

## Permission matrix (starting defaults — tune freely in roles.ts)

| Role | Sees projects | Tabs | Financials | Settings | Manage users | Data path |
|---|---|---|---|---|---|---|
| **Admin** (office@) | all | all | ✅ | ✅ | ✅ | full workbench |
| **Business owner** | all | all | ✅ | ❌ | ❌ | full workbench |
| **Project manager** | assigned only | all | ❌ | ❌ | ❌ | workbench, scoped |
| **Coworker** | all | today/tasks/projects/inspections | ❌ | ❌ | ❌ | workbench |
| **Investor** | assigned only | — (own portal) | ❌ | ❌ | ❌ | curated projection (RLS) |

## The key architectural decision (flagged for Adam)

The whole workbench is ONE json blob. Anyone who can read it can read all of
it via the API. So there are two ways to separate internal roles:

- **A — Frontend gating (proposed default):** internal roles read the blob;
  the app hides tabs + financial fields per role. Fast, simple. Caveat: a
  determined internal user could read hidden fields via direct API calls. Fine
  when all *internal* staff are trusted (financials are the only real concern).
- **B — True server-side separation:** split sensitive data (job cost,
  financing) out of the blob into its own RLS-protected table, like we did for
  investors. Bulletproof, but a bigger build.

Recommendation: **A for internal roles now** (with financials as the one thing
we can harden to B later if a coworker/PM shouldn't even be able to fetch it),
and **investors stay fully on B** (already shipped — never weaken it).

## Build checkpoints

- [x] 0. Role model + matrix (`src/data/roles.ts`) + this plan
- [ ] 1. `0006_roles_rbac.sql` (PROPOSED): widen role check to the 5 roles;
        rename office@ 'owner'→'admin'; generalize `investor_project_access`
        into `project_access` (user→project) for PMs + investors; add
        `is_internal()` / `is_admin()` helpers; keep is_owner() working.
- [ ] 2. Frontend role gate: `useRole()` → AppRole; Root routes investor→portal,
        everyone else→App; App reads `roleConfig` to gate tabs + a
        `canSeeFinancials` check on job-cost fields; scoped roles see only
        assigned projects.
- [ ] 3. Admin "People" screen: create/assign logins + roles + project
        assignments (admin only). Until then, assign via dashboard + SQL.
- [ ] 4. Stage on `rcchjqupvozyqkahhion`, verify each role with JWT simulation
        (as we did for investors), then run on prod with Adam's go-ahead.

## Decisions still needed from Adam
- Approve matrix defaults (esp. coworker = all projects vs assigned; business
  owner sees financials yes).
- Decision A vs B for internal financials.
- Who the first real non-investor users are (emails) when we're ready.
