# Monday is the system of record (Oct 2026)

Since Oct 16 2026 the Mac-side job in this folder writes to **Monday**
(account `the-network-empire`, workspace *Properties*), not to the Lodestar
blob and not to SharePoint. Lodestar stays up for what hasn't moved yet
(⚡ electric applications, cabinet layouts, selections).

## The one job: Permit Scan (on demand)

`scan.mjs --write` reads every permit on the county portal and sets each
house's **Permit Expires** date on the Construction Job List (matched by the
house's **Permit #**). A Monday automation then notifies Adam **30 days
before** a permit expires. That is the only thing written anywhere.

Run it when you want it — there is **no nightly job** any more:
- Desktop → Claude Commands → **Permit Scan.command** (double-click), or
- ask Claude, or `cd scanner && node scan.mjs --write`.

Holds and inspection results still print in the run's output for whoever
ran it, and nothing is done with them. Each permit's portal dates are kept
in `scanner/.portal-dates.json` (local, gitignored) so a run can say which
expiry dates moved since last time. A permit that isn't on the board is
listed and skipped — add the house to Monday and re-run.

Safety: previews by default (`--write` to change anything); only the Permit
Expires cell is touched; `--lodestar` is the old path (holds/inspections into
the Lodestar blob) if you ever need it.

## What was retired

- **Oct 16 2026 — Scan Josh** (`scan-josh.mjs` + the Desktop command): Adam
  would rather point Claude at specific texts than have a scanner guess.
  Josh's orders/asks are no longer filed anywhere automatically.
- **Oct 16 2026 — the nightly 5:30 AM permit scan** and its Monday writes of
  holds / inspection rows / comments: only the expiry date is wanted.
- **Oct 16 2026 — the SharePoint sync** (`sync-sharepoint.mjs`,
  `monday-to-sp.mjs`, `sp-list.mjs`): Monday is hand-maintained and was
  already ahead of Lodestar. The SharePoint lists were left intact; the
  "Project Docs" links on the Monday boards still point into SharePoint.

### Adam's one-time step: stop the old scheduled jobs

The scheduler still has the nightly permit scan and the SharePoint sync
loaded. Remove both once (the Permit Scan command above replaces them):

```bash
launchctl bootout gui/$(id -u)/com.ironshield.permitscanner; launchctl bootout gui/$(id -u)/com.ironshield.sharepointsync; rm -f ~/Library/LaunchAgents/com.ironshield.permitscanner.plist ~/Library/LaunchAgents/com.ironshield.sharepointsync.plist
```

Check: `launchctl list | grep ironshield` should show only `scanwatcher`,
`digest`, `improver`. (`scanwatcher` is Lodestar's 🔄 "Scan now" button —
it now runs this same expiry-only scan when pressed.)

## Still on Lodestar (next phases)

- `new-house.mjs`, `add-roster-projects.mjs`, `add-closing-dates.mjs` still
  write the blob (Lodestar's own roster). New lots are created on Monday by
  hand / Import.
- The Orders and Inspections boards keep the rows seeded in Sep 2026 and
  whatever people add by hand; nothing feeds them automatically now.
