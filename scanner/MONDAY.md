# Monday is the system of record (Oct 2026)

Since Oct 16 2026 the Mac-side jobs in this folder write to **Monday**
(account `the-network-empire`, workspace *Properties*), not to the Lodestar
blob and not to SharePoint. Lodestar stays up for what hasn't moved yet
(⚡ electric applications, cabinet layouts, selections); its 🏠 Today /
✓ Tasks / 🔍 Inspections tabs are no longer fed by these jobs.

## What writes where

| Job | Trigger | Writes |
|---|---|---|
| `scan.mjs --write` (permit scanner) | launchd `com.ironshield.permitscanner`, 5:30 AM | **Inspections board**: one row per county inspection result (Result = Failed / Partial / Passed / Other) and per active hold (Result = **Hold**), linked to the house. **Comments on the house's Construction Job List row** for "Information…" FYIs and for a permit **expiration-date change**. Permit status/issued/expire dates → `scanner/.portal-dates.json` (local memory). |
| `scan-josh.mjs --write` (Scan Josh) | Desktop → Claude Commands → *Scan Josh.command* | **Orders board**: a row per clear "order this" text (To order, linked to the house and the vendor that covers the category, Josh's words in Note). **Comment on the house row** for every other ask. Asks that name no house are only printed. |
| `electric-scout.mjs` | by hand / Monday webhook | Electric Co. on the Construction Job List (see `docs/electric-scout.md`). |

Houses are matched by the Construction Job List's **Permit #** (scanner) or
by address + subdivision tokens (Scan Josh). A permit that isn't on the board
is skipped and listed in the run's output — add the house to Monday and the
next run picks it up.

## Safety rules (same as before, now on Monday)

- Every job **previews by default**; `--write` is required to change anything.
- **Add-only.** Resolved inspections/holds are only removed with `--prune`,
  and only for a permit whose portal tab actually rendered that night.
- **Never double-posts.** Inspections rows carry the scanner's `Source Key`;
  comments carry a `[portal:…]` / `[josh:…]` tag; Scan Josh skips a category
  the house already has an open order for.
- Writes go one at a time. Monday's **daily API budget** is a few thousand
  calls (hit it once, Sep 2026) — a normal night uses well under 200.
- `--lodestar` on either script writes the old way (the Lodestar blob) if you
  ever need to roll back. Same safety pattern: fresh read → backup → write.

## What was retired (Oct 16 2026)

- `sync-sharepoint.mjs` + `com.ironshield.sharepointsync.plist` — the nightly
  Lodestar → SharePoint fill. Its last weeks of logs show **0 fills, 47
  conflicts**: Monday is hand-maintained and already ahead of Lodestar on
  every column it synced, so there is nothing to replace it with.
- `monday-to-sp.mjs` — Monday → SharePoint backfill of new lots.
- `sp-list.mjs` — Claude's cell editor for the SharePoint list.

The SharePoint lists themselves were **left intact** (nothing deleted). If
the O365 tenant is ever wound down, the "Project Docs" links on the Monday
boards still point into SharePoint folders — that's the one dependency left.

### Adam's one step: stop the old nightly job

The scheduler still has the SharePoint job loaded (it now fails every night
because the script is gone — harmless, but noisy). Remove it once:

```bash
launchctl bootout gui/$(id -u)/com.ironshield.sharepointsync && rm ~/Library/LaunchAgents/com.ironshield.sharepointsync.plist
```

Check it's gone: `launchctl list | grep ironshield` should show only
`permitscanner`, `scanwatcher`, `digest`, `improver`.

## Still on Lodestar (next phases)

- The app's 🔄 "Scan now" button (`watch-scan-request.mjs`) still reads its
  request from the blob and runs `scan.mjs --write` — which now writes to
  Monday. The app's "scan ✓" stamp will stop updating; that banner retires
  with the Today screen.
- `new-house.mjs`, `add-roster-projects.mjs`, `add-closing-dates.mjs` still
  write the blob (roster + closing dates). New lots are created on Monday
  by hand / Import today — these scripts are for Lodestar's own roster only.
- Permit expiry → there is no date column on the Construction Job List for it
  any more (the Permit Issued / Permit Expires columns from Sep 8 are gone).
  The scanner raises a comment instead. Re-add a "Permit Expires" date column
  if you want the −30-day Monday reminder back.
