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
- [x] 1. `0006_roles_rbac.sql` (PROPOSED): widen role check to 5 roles; rename
        office@ 'owner'→'admin'; add `is_admin()`/`is_internal()`; redefine
        `is_owner()` = admin|business_owner; blob + project-files → is_internal().
- [x] 2. Frontend role gate (Root routes investor→portal, all internal→App;
        App gates tabs + People by roleConfig). Ships dormant (office@ = admin).
- [x] 3. Admin "👥 People" screen (PeopleView + lib/admin.ts): set roles +
        investor project assignments. Auth-user CREATION stays in the dashboard.
- [x] R. Reconciled w/ Adam (June 12): PM sees ALL projects (scoped→false), so
        only investors are scoped → KEEP `investor_project_access` (no rename;
        dropped it from 0006, standardized admin.ts onto that name).
- [x] 4. Staged 0006 on `rcchjqupvozyqkahhion` (caught + fixed a statement-order
        bug), verified all 5 roles via JWT simulation, then ran on PRODUCTION
        (June 12 2026). Verified: office@=admin reads blob; investor locked out
        (0 blob rows) but still sees curated data. **RBAC is LIVE.**

## How to add a real person (admin)
1. Supabase dashboard → Authentication → Add user (set their email + password;
   tick Auto Confirm). Auth-user creation can't happen in the SPA (needs the
   service key) — this stays a dashboard step.
2. In the app, open **👥 People** (admin only) → set their role. For investors,
   also assign their project(s).
3. They sign in at utility-workbench.vercel.app and land in the right view.

## Decisions locked (June 12 2026)
- Trust model = A (internal roles read the blob; UI gates per role). Investors
  stay strictly server-isolated.
- PM = ALL active projects. Business owner = broad read incl financials.
- Financials: no structured cost field in the blob today, so canSeeFinancials
  is forward-looking (harden to B if one is added).
- First real non-investor users: Adam supplies emails when ready; create in the
  Supabase dashboard, then assign role in the 👥 People screen.
