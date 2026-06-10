# Workbench Roadmap

Improvement backlog for the Iron Shield Utility Workbench. Check things off
as they land, add new ideas at the bottom of a section, reorder freely —
this file is the to-do list, the code is the truth.

> Tip: in a future session, just say "let's do the next roadmap item"
> (or name one) and Claude Code will pick it up from here.

## Up next (high value)

Suggested order: the SECO/Duke packet generator is the natural next item
(~one session — note its source data tables live in the original HTML file
on the Mac, so plan it for a Mac session).

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
- [x] **Permit issued/expiration dates + expiry alert** *(June 2026)*. Issued
      & expiration date fields per permit; `lib/permitExpiry.ts` (twin of
      shutoff.ts) computes days-left; expiring-within-7-days (or expired) shows
      as a detail banner, a top "⏰ Permit expiring (≤7 days)" dashboard bucket,
      and an ⏰ marker in the permit list. Groundwork for full notifications.
- [x] **In-app notifications / stale-status flags** *(June 2026)*. Landed in
      two passes: the Today command-center work brought the `doneAt` machine
      timestamps + migration, `data/thresholds.ts` (per-step expected
      durations), and the `lib/staleness.ts` engine; this pass finished the
      item — a dedicated "⚠ Gone quiet — overdue at a stage" section on
      🏠 Today (split out from the 🔥 deadlines so stalls can't bury a real
      deadline), a count badge on the 🏠 Today tab (red when anything is
      critical), and stalled severity that escalates warn → crit at 2× the
      expected duration. Tune the day-counts in `data/thresholds.ts`.
      NOTE: alerts that reach you when the app is CLOSED (phone/email/push)
      still require the Full-spec backend — see "Later".
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
- [ ] **Tests for the brains** — Vitest tests for `lib/shutoff.ts` (business-
      day math) and `lib/nextAction.ts` (bucket logic). ~an hour, great
      learning value. (Bonus: now that the stale-status flags have landed,
      `lib/staleness.ts` and the attention ranking in `lib/actionCenter.ts`
      are two more great targets.)

## Polish (small, anytime)

- [ ] Count pills in the header (per-status totals, like the old tool)
- [ ] Print stylesheet — clean checklist printouts to take to the field
- [ ] Keyboard navigation — ↑/↓ moves through the project list
- [ ] "Reset to built-in roster" escape hatch (since localStorage owns the
      roster now)
- [ ] Edit a project's fixed facts (address/parcel/permit) — natural home is
      now the ⚙️ Project settings panel (add a "Project info" section to it)

## Done

- [x] Milestones 1–6 — full React rebuild of the single-file workbench
      *(June 2026)*
- [x] Add/remove projects in the app — roster moved into saved state, with
      migration *(June 2026)*
- [x] Git + GitHub — version snapshots + off-machine backup; private repo at
      github.com/office751/utility-workbench *(June 2026)*
- [x] Permit links from the SharePoint list export *(June 2026)* — generated
      `data/sharepoint.ts` (57 portal + 57 docs links, keyed by permit#) from
      the Construction Job List CSV; auto-fills the permit page + folder fields.
      Regenerate with `node scripts/gen-sharepoint.mjs "<exported csv>" src/data/sharepoint.ts`.
- [x] Permit issued/expiry dates + live status *(June 2026)* — read all 44
      permit portal pages via Claude in Chrome into `data/permitDates.ts`;
      auto-fills the Issued/Expires fields, drives the expiry alert, and makes
      the permit checklist reflect the county's authoritative status.
- [x] ⚙️ Project settings panel *(June 2026)* — a gear in the detail header
      opens `ProjectSettings.tsx`, a project-wide editor for all four streams'
      config (utility/service/engineer, water source, septic type, permit
      responsible/links/dates). Detail bodies are now read-only summaries +
      action buttons; the raw SharePoint/permit URLs stay hidden behind the gear.

## Materials / project-hub (in progress)

- [x] **Materials/Orders tab + Quick-Add** *(June 2026)* — 5th tab. Per-project
      orders list (category · status · vendor), a 🛒 dashboard grouped by
      To order / Ordered / Delivered, and a **Quick-Add bar**: paste Josh's
      text or type shorthand → it matches the project + item(s) and creates
      "To order". Config in `data/orders.ts`, parser in `lib/orders.ts`.
- [ ] **Lead-time "order now" alerts** — per-category lead times + a needed-by
      date so trusses/cabinets flag before they're late (fold into Action Center).
- [ ] **Model order templates** — seed a model's standard order list when a
      project is added (spec homes repeat: A/B/E2/F…).
- [ ] **Vendor directory + order email shortcuts** — supplier per category with
      click-to-call / pre-filled order email (reuse the ContactLinks pattern).
- [x] **"Claude pulls from Messages"** capture path *(June 2026)* — Full Disk
      Access granted; `scripts/read-josh-orders.mjs` reads Josh & Mickey's texts
      (+ their group chats) from the Mac Messages DB, decodes binary-text
      messages, tells orders apart from questions/status, matches project + item,
      and prints proposed orders + paste-lines. Run: `node scripts/read-josh-orders.mjs --since YYYY-MM-DD`.
- [x] **Multi-line Quick-Add paste + duplicate guard** *(June 2026)* — Quick-Add
      box is now a textarea; paste the script's whole block (one project per
      line) and each line is parsed to its own project. Won't re-add an item a
      project already has — if it's already Ordered it says so and skips (stops
      double-orders when Josh asks twice). Enter submits, Shift+Enter = new line.
- [ ] **New order categories surfaced from texts** — Dumpster, Porta-potty,
      Garage door, Sand added to `data/orders.ts`. Consider grouping "site
      services" separately from materials in the UI.
- [ ] **Fully-automatic Messages→orders** — needs the backend (a small service
      watching for Josh's texts); until then it's the on-request script above.
- [x] **Action Center** *(June 2026)* — `lib/actionCenter.ts` + the 🏠 Today
      command center aggregate permit expiry, electric shut-offs, stalled
      stages, and materials to order across all projects — one prioritization
      feeding both the view and the header badge.

## Ideas parking lot

(things noticed but not committed to — promote them up when ready)

- SharePoint / Monday sync (was milestone 8 of the original Full spec)
- Auto-reminder to export a backup every N days
- **Real document storage for the permit tab** — the upload UI keeps file
  NAMES only right now. Wire to actual storage (ties into the planned file
  restructure / the Full-spec backend).
- **Refresh permit dates/status** — `data/permitDates.ts` is a snapshot read
  from the county portal (2026-06-03) via Claude in Chrome. Re-read the portal
  pages to refresh; the checklist auto-syncs from it on load unless a step was
  manually toggled. (One BS&A-portal permit, PB26-0218 / 10530 SE 50th, wasn't
  readable — different jurisdiction site; enter its dates manually.)
