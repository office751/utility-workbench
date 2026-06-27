# PROPOSED migrations — ⚠️ STALE PLANNING ARTIFACT · DO NOT RUN VERBATIM

These were the original review files for the investor portal. **The live
database was later configured BY HAND in the Supabase dashboard and has since
moved to the 5-role model** (admin · business_owner · project_manager ·
coworker · investor — see `0006_roles_rbac.sql` and the `invite-user` edge
function, which gates on `role = 'admin'`). So:

- These files are **out of date and internally inconsistent** with production:
  `0001`/`0002` describe a 2-role `owner`/`investor` model where
  `is_owner()` = `role = 'owner'`. That role no longer exists. **Re-running
  `0002` verbatim would lock the admin out of the blob.**
- The repo does NOT contain the actual live policies (they were hand-created).
  There is no source-of-truth schema dump here.

**Before trusting or touching anything in this folder, confirm the live state:**

```sql
select tablename, policyname, cmd, qual
from pg_policies
where tablename in ('workbench','objects');
```

The `workbench` policies SHOULD use `is_internal()` (staff-only; investors
excluded). If they still read `authenticated` / `authed_all`, the blob is NOT
isolated and any investor/coworker login can read+write everything — fix that
first. Once confirmed, dump the live schema to a committed file and delete this
folder so the next person isn't misled.

| file | what |
|---|---|
| 0001_roles_and_access.sql | who is an owner vs investor + which projects an investor may see |
| 0002_tighten_existing_rls.sql | ⚠️ THE CRITICAL ONE — blob + project-files become owner-only |
| 0003_investor_content.sql | curated tables: shared_files (caption + investor_visible), status snapshots, comments |
| 0004_investor_storage.sql | separate `investor-files` bucket + per-project read policy |
| 0005_seed_gta.sql | the one GTA ↔ #53 grant (template — needs the investor's email) |
