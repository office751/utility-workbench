# Workbench Roadmap

Improvement backlog for the Iron Shield Utility Workbench. Check things off
as they land, add new ideas at the bottom of a section, reorder freely —
this file is the to-do list, the code is the truth.

> Tip: in a future session, just say "let's do the next roadmap item"
> (or name one) and Claude Code will pick it up from here.

## Up next (high value)

- [ ] **Git + GitHub** — version snapshots + off-machine backup; prerequisite
      for any deploy. ~an evening, no app code changes.
- [ ] **SECO/Duke application packet generator** — port from the original
      HTML: ready-to-paste packet with legal description (Lot/Block/Sec/Twp/
      Rge), model sqft + tonnage (whole numbers for Duke), OH/UG, copy
      button. Data tables (`LEGAL`, `MODELS_DEFAULT`) live in
      `../Electric Applications Workbench.html`. ~one session.

## Later (when the need is real)

- [ ] **Phone / multi-device access (the "Full" spec)** — hosted URL +
      shared database so field and office see the same data. Swap the
      internals of `useProjects()` for API calls; UI stays. A few sessions.
      Trigger: when Export/Import shuffling starts to annoy.
- [ ] **Tests for the brains** — Vitest tests for `lib/shutoff.ts` (business-
      day math) and `lib/nextAction.ts` (bucket logic). ~an hour, great
      learning value.

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

## Ideas parking lot

(things noticed but not committed to — promote them up when ready)

- SharePoint / Monday sync (was milestone 8 of the original Full spec)
- Auto-reminder to export a backup every N days
