# PROPOSED migrations — investor portal · ⚠️ NOT YET RUN ANYWHERE

These are REVIEW FILES for the external-investor feature (first pairing:
GTA Holdings ↔ #53 24028 SW North Beach Rd). Nothing here has touched any
database. Do not run against production until:

1. Adam approves the plan,
2. they've been exercised against a NON-production Supabase (local
   `supabase start` — requires Docker Desktop — or a free second Supabase
   project used as staging),
3. `0002` is reconciled against the dashboard's ACTUAL current policy names
   (the existing policies were created by hand in the dashboard and are not
   in this repo, so the DROP statements use IF EXISTS guesses).

Run order matters. `0002` (locking the blob + storage down to owners) MUST
be applied before any investor account is created — until then, ANY
authenticated user can read the whole workbench blob.

| file | what |
|---|---|
| 0001_roles_and_access.sql | who is an owner vs investor + which projects an investor may see |
| 0002_tighten_existing_rls.sql | ⚠️ THE CRITICAL ONE — blob + project-files become owner-only |
| 0003_investor_content.sql | curated tables: shared_files (caption + investor_visible), status snapshots, comments |
| 0004_investor_storage.sql | separate `investor-files` bucket + per-project read policy |
| 0005_seed_gta.sql | the one GTA ↔ #53 grant (template — needs the investor's email) |
