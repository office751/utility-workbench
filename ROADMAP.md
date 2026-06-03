# Workbench Roadmap

Improvement backlog for the Iron Shield Utility Workbench. Check things off
as they land, add new ideas at the bottom of a section, reorder freely —
this file is the to-do list, the code is the truth.

> Tip: in a future session, just say "let's do the next roadmap item"
> (or name one) and Claude Code will pick it up from here.

## Up next (high value)

Suggested order: the UI sizing quick-wins first (small, no data risk), then
Permitting, then in-app notifications (needs the timestamp change below).

- [x] **UI sizing — two parts** *(June 2026)*: draggable list/detail divider
      (`hooks/useResizableSidebar.ts`, persists width) + compact/comfortable
      density toggle (`hooks/useDensity.ts`, flips `data-density` on <html>
      like dark mode). Both controls live in the header.
- [x] **Permitting — a 4th tab/stream** *(June 2026)*. `'permit'` stream with
      lifecycle (submitted → review → corrections → approved → issued),
      Responsible field (Us/Owner/GC), dashboard buckets, and a permit filter.
      Per-project **SharePoint folder** link (8 pre-matched in
      `data/sharepoint.ts`, editable for the rest) + editable **county permit
      page** link + a **Documents** upload UI (names-only placeholder until file
      storage is restructured). Permit status seeded by inferring from the
      permit number's format (numeric = issued, BLDR-/PB- = in review).
- [ ] **In-app notifications / stale-status flags.** A "⚠ Needs attention /
      overdue" dashboard bucket + header count badge for projects parked too
      long at a stage. Add per-stage expected-duration thresholds as config
      (lifecycles-style). **Depends on:** storing a machine timestamp
      (`doneAt`, ISO) on completed steps instead of today's display-only date
      string — small data-model change + migration (same pattern as the
      Add-project work). NOTE: alerts that reach you when the app is CLOSED
      (phone/email/push) require the Full-spec backend — see "Later".
- [ ] **SECO/Duke application packet generator** — port from the original
      HTML: ready-to-paste packet with legal description (Lot/Block/Sec/Twp/
      Rge), model sqft + tonnage (whole numbers for Duke), OH/UG, copy
      button. Data tables (`LEGAL`, `MODELS_DEFAULT`) live in
      `../Electric Applications Workbench.html`. ~one session.

## Later (when the need is real)

- [ ] **Phone / multi-device access + real notifications (the "Full" spec)** —
      hosted URL + shared database so field and office see the same data, AND
      the foundation for alerts that reach you when the app is closed
      (push/email/SMS). Swap the internals of `useProjects()` for API calls;
      UI stays. A few sessions. Trigger: when Export/Import shuffling annoys, or
      when in-app notifications aren't enough because you're not at the desk.

- [ ] **Phone / multi-device access (the "Full" spec)** — hosted URL +
      shared database so field and office see the same data. Swap the
      internals of `useProjects()` for API calls; UI stays. A few sessions.
      Trigger: when Export/Import shuffling starts to annoy.
- [ ] **Tests for the brains** — Vitest tests for `lib/shutoff.ts` (business-
      day math) and `lib/nextAction.ts` (bucket logic). ~an hour, great
      learning value. (Bonus: the stale-status math is another great test
      target once notifications land.)

## Polish (small, anytime)

- [ ] Count pills in the header (per-status totals, like the old tool)
- [ ] Print stylesheet — clean checklist printouts to take to the field
- [ ] Keyboard navigation — ↑/↓ moves through the project list
- [ ] "Reset to built-in roster" escape hatch (since localStorage owns the
      roster now)
- [ ] Edit a project's fixed facts (address/parcel/permit) from the detail
      view — today only progress fields are editable in-app

## Done

- [x] Milestones 1–6 — full React rebuild of the single-file workbench
      *(June 2026)*
- [x] Add/remove projects in the app — roster moved into saved state, with
      migration *(June 2026)*
- [x] Git + GitHub — version snapshots + off-machine backup; private repo at
      github.com/office751/utility-workbench *(June 2026)*

## Ideas parking lot

(things noticed but not committed to — promote them up when ready)

- SharePoint / Monday sync (was milestone 8 of the original Full spec)
- Auto-reminder to export a backup every N days
- **Real document storage for the permit tab** — the upload UI keeps file
  NAMES only right now. Wire to actual storage (ties into the planned file
  restructure / the Full-spec backend), and auto-fill the remaining
  per-project SharePoint folder links.
- Per-project SharePoint folders for the other ~41 projects (only ~8 matched
  so far; the rest need looking up per parcel under their owner entity).
