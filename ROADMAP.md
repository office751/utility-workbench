# Workbench Roadmap

Improvement backlog for the Iron Shield Utility Workbench. Check things off
as they land, add new ideas at the bottom of a section, reorder freely —
this file is the to-do list, the code is the truth.

> Tip: in a future session, just say "let's do the next roadmap item"
> (or name one) and Claude Code will pick it up from here.

## Audit pass follow-ups *(4-audit review, June 27 2026)*

A full review ran June 27 across **UI/mobile, security, data-integrity, and
usability/flow/perf** — all shipped & deployed. Highlights: Materials order-row
redesign + the whole mobile-structure pass; a CRITICAL `migrate()` data-loss fix
(was dropping the Team `assignees` list every sync) + first Vitest suite incl. a
migrate round-trip guard; a 3-way concurrent-edit merge (`lib/mergeState.ts`) so
two operators no longer silently clobber each other; Vendors made owner-editable
(Settings → Vendor setup); contrast/aria-label a11y; `actionCenter` sewer-key fix;
and the pre-send confirmation gate (Carey-readiness #5). Memory + commits record
the details.

**⚠ Needs YOUR action / a decision (can't be done in-app):**
- [ ] **VERIFY the live RLS** (security audit). Confirm the `workbench` blob is
      locked to staff. In Supabase SQL editor: `select tablename,policyname,cmd,qual
      from pg_policies where tablename in ('workbench','objects');` — the workbench
      policies should use `is_internal()`. (The deployment record says this was
      applied June 12 + JWT-verified; this is just a belt-and-suspenders check.)
- [ ] **Apply the backups SQL** — paste `supabase/setup-workbench-backups.sql`
      into the SQL editor once → automatic every-save blob snapshots (last 100).
- [ ] **Financials = Decision A→B?** (security HIGH). Internal roles (incl.
      coworker = Carey) can fetch job-cost fields from the blob via the API even
      though the UI hides them. If that's not acceptable, move financials to their
      own RLS table. Decide before/when Carey is in daily.

**Open dev items (I can do these — not yet done):**
- [ ] **Focus indicator (a11y)** — add a global `:focus-visible` ring; custom
      buttons/tabs/links have none today (keyboard users can't see focus).
- [ ] **Code-splitting** — `React.lazy` the rare/heavy screens (Investor portal,
      Settings editors, Batch Apply, Status Report) to shrink the 655KB upfront
      bundle; helps first load on phones.

**Low / polish tail:**
- [ ] **Dark twin + full coverage for status tints** — `.s-toOrder` (#b06b00) is
      light-mode only and only 2 of 4 statuses are tinted (App.css ~1466).
- [ ] **Materials empty state** — add an "add your first order" call-to-action
      (MaterialsBody.tsx ~73) and a separator/heading above the add-order row.
- [ ] **Redundant vendor affordance** — a row shows BOTH a free-text "vendor…"
      box and a one-click ✉️; show the text box only when no known vendor matches.
- [ ] **Investor stream label** sits in a fixed 84px column — "PERMITTING" can
      wrap after the font bump (App.css ~3813 / InvestorView.tsx).
- [ ] **Touch targets** — small checkboxes / remove buttons (`.trow-check`,
      `.trow-x`, `.focus-check`) are under the 44px floor on phones.
- [ ] **Models / Selections cards** read dense on a single mobile column.
- [ ] **Tooltip-only labels** on the brand lockup + guide "who" pills (a11y).
- [ ] **Dead code**: remove unused `isUrgentTask` (lib/tasks.ts:45) and the
      legacy `.today-hero/.stat` CSS (App.css ~1803); `:focus-visible` rings on
      custom buttons would round out keyboard a11y.
- [ ] **Emoji → `<Icon>`** for interactive controls (✉️/📞/✕) so they theme
      consistently and read better to screen readers (aria-labels already added).

## Up next — Carey-readiness sprint *(scoped June 23 2026)*

Carey starts next week and takes over everything **except permitting**. The
login/role plumbing (the `coworker` role) is already live and works — tabs
gate, Settings/People/financials hide. What's NOT ready is everything she'd
actually *do*: the app is still built for one operator (you). Each item below
is what closes a verified day-one trap. Two of them (#1, #3) are also live
bugs that bite you today — those are the cheapest and I'd ship them first.

Recommended sequence: **1 → 3 → 2 → 4 → 5** (two quick bug-fixes, then the
keystone, then the safety/training layer). Effort tags: small ≈ <1 session,
medium ≈ 1–2 sessions.

- [x] **1. Re-wire QuickAdd into the Materials screen** *(small — also a live
      bug)* — **DONE June 23 2026**: mounted on the Projects landing (role-safe
      for the coworker tab set); `scan-josh` guide rewritten Quick-Add-first /
      any-device so it's correct for a Windows operator. **Was verified:**
      `QuickAdd.tsx` (exports a default at line 189) was
      imported by **zero** components — orphaned in the Calm-Canvas redesign;
      only the *parser* `parseQuickAdd` in `lib/orders.ts` is still wired.
      So today the ONLY working order-intake is `scanner/scan-josh.mjs`, pinned
      to the office Mac, and the in-app `scan-josh` guide literally tells the
      operator to walk over to it. Materials is Carey's flagship job — mount
      `QuickAdd` back into `MaterialsBody.tsx` (or Today) so she can capture an
      order from any device by typing/pasting what Josh texted. The logic +
      double-order guard already exist; this is re-mounting, not rebuilding.
      Also fix the `scan-josh` guide copy that points at the Mac.
      ⚠ Open question that changes scope: **is Carey on Mac or Windows?** If
      Windows, the scanner can't move to her at all → this item is mandatory.

- [x] **2. Give Carey a real queue (multi-operator model)** *(medium — the
      keystone)* — **DONE June 24 2026** (TASK-LEVEL): the signed-in name flows
      Root→App (`me`), `Task.assignedTo` added (additive, no migrate), Tasks tab
      gets a Show filter (My queue / Unassigned / per-person / Everyone) + an
      assign-to picker per row and in the capture form (team pulled from
      app_users), Today shows your tasks + the shared/unassigned pile with an
      "N up for grabs" note, and the waitingOn label is clarified. Fail-open
      verified (unassigned shows for everyone). NOTE: assignment is TASK-level;
      whole-HOUSE assignment (`ProjectState.assignedTo` + filtering the Today
      construction items) was deliberately deferred — see the deferred list at
      the end of this sprint.
      ORIGINAL SCOPE NOTES: Today the app is Adam-hardcoded: `Today.tsx` greets
      "Good morning, Adam", `buildActionCenter()` (`lib/actionCenter.ts`) merges ALL
      work for one person, and `Task` (`types.ts`) has no `assignedTo`
      (only `waitingOn`, which means who's blocking *you*). Two operators on
      one merged list → either both act on a house (double-order / duplicate
      application) or each assumes the other has it (missed permit-expiry /
      shut-off deadline). Add `assignedTo` to `Task` AND `ProjectState`, an
      operator switch on Today ("Viewing: Carey ▾"), and filter the action
      center by it. **Must fail OPEN** — unassigned work shows in BOTH queues
      with a visible "Unassigned (N)" bucket, never vanishes from both. While
      in there, fix the `waitingOn` label contradiction (field/header both say
      "waiting on you" but render "waiting on Mickey") so a two-person team
      can't misread who's blocking whom. Migration via `migrate()` as usual.

- [x] **3. Fix Duke EDA office routing** *(small — also a live bug)* —
      **DONE June 23 2026**: `dukeOfficeEmail()` (lib/loadForm.ts) is now the
      single source of truth and is exported; `ContactLinks` routes through it,
      the hardcoded `DUKE_EMAIL` constant is gone, and the EDA-office dropdown
      is required/blank-by-default with a subdivision hint + unset warning.
      **Was verified:** `ContactLinks.tsx` line 61 had hardcoded `DUKE_EMAIL`
      (= `DUKE_EMAIL_OCALA`, `contacts.ts:40`) for the "✉️ Email Duke" button
      and ignores `ps.dukeOffice`, while `loadForm.ts:29` (`dukeOfficeEmail`)
      routes Batch Apply + meter-notify to the correct office. Same house →
      two different EDA offices depending on which button is clicked, and a
      wrong-office reply never bounces (silent stall Carey can't diagnose).
      Fix: point ContactLinks at `dukeOfficeEmail(ps)` too, make the EDA-office
      dropdown in `ProjectSettings.tsx` required/blank-by-default with a
      subdivision hint ("most Marion → Ocala; western/Citrus → Inverness"),
      and add a `needsVerify`-style warning when utility=Duke and no office set.

- [x] **4. Water + Septic playbook guides + inline callouts** *(small)* —
      **DONE June 24 2026**: added `manage-water` + `manage-septic` guides to
      `data/guides.ts` and rendered them as inline `GuideCallout`s in WaterBody
      & SepticBody (Detail.tsx), mirroring Electric/Permit. Step 1 of each =
      "confirm the source in ⚙️ Settings first" (heads off the sewer-lot-DEP-
      septic-permit mistake); contacts named (MCU for city water/sewer, Georges
      Plumbing/Vicki Kirby for septic/INRB). They also show in the 📖 Guide
      screen automatically. ORIGINAL NOTES:
      Her two core streams had NO guide in `data/guides.ts` and NO inline
      `GuideCallout` in `WaterBody`/`SepticBody` — unlike Electric/Permit
      (your streams) which do. Worse: septic source defaults to "Septic", so
      `nextSepticAction` will walk her into a DEP septic-permit sequence even
      on a City-Sewer lot. Add `manage-water` + `manage-septic` guides
      (mirror `apply-seco`/`apply-duke` shape) and render them inline in the
      Water/Septic bodies. Step 1 of each = "confirm the source in ⚙️ Settings
      BEFORE doing anything." Name the right contacts (Marion County Utilities
      for city water/sewer, Georges Plumbing for septic/INRB, which Vicki
      notices matter) so she can't pick wrong.

- [x] **5. Pre-send confirmation gate on irreversible actions** *(medium —
      the safety net)* — **DONE June 27 2026** (audit pass 4). `src/lib/confirmSend.ts`
      shows a one-dialog checklist before the irreversible drafts fire:
      Batch Apply SECO/Duke ("right utility/office? attach signed load form +
      site plan"; Duke keeps WO# in subject), Jennifer handoff ("paste the file
      links over [PASTE HERE]"), meter-notify ("this email only LISTS the photos —
      attach them yourself"). Plus ✓ Mark applied is now gated behind a confirm
      when the row still shows a ⚠ warning. DELIBERATELY NOT gated: routine
      vendor-order emails (fire many times a day; a mis-sent order is easily
      recovered → a confirm there is friction without safety). Add it later if
      wanted by wrapping the `.order-send` / vendor-btn sends with `confirmSend`.

Not in this sprint (acknowledged, lower priority): **whole-HOUSE assignment**
(`ProjectState.assignedTo` so a whole house routes to Carey and the Today
*construction* items — permit/electric/etc. — filter by operator too; #2
shipped TASK-level only, which is what "her queue" needed for next week);
server-side RLS for financial-field hiding (today it's frontend-gated — fine
for a trusted operator, revisit if a less-trusted role appears); one-click
in-app invite (Carey's login is still created in the Supabase dashboard, then
role-assigned in 👥 People); per-stream scoping for the coworker role.

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
- [x] **SECO/Duke application flow — matched to the REAL process** *(June 2026)*.
      The packet generator from the original HTML was already ported
      (`lib/loadForm.ts` + `data/legal.ts`/`data/models.ts`); this pass instead
      fixed the *flow*, verified against Adam's actual email:
      • **SECO = email-first** — one email to newconstruction@ with the load
        form + site plan attached; templates now match his real short send.
      • **Duke = portal-first → reply** — apply on the Builder Portal, then Duke
        emails a WO# from the EDA office (Ocala *or* Inverness, new
        `ps.dukeOffice` picker in ⚙️ Settings); the Duke email is now that
        load-form REPLY (subject leads with WO#, gated until a WO# exists).
        ⚡ Batch Apply shows Duke's two steps explicitly.
      • **Post-submit** — new 📸 "Notify utility — ready for meter" email (green
        tag / downpipe / sweep / straps / clear-path photos) to SECO Engineering
        or the Duke EDA office, plus an additive `meternotify` electric step.

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

- [x] **SharePoint → project Files sync** *(June 11 2026)* — DONE: 1,033
      files (1.37 GB) backfilled into 58 projects' Files boxes via
      `scripts/sharepoint-files-sync.mjs`. Each project's SharePoint sharing
      LINK was resolved through Adam's signed-in Chrome (folder names follow
      no convention — links are the only truth; resolved map saved at
      `scripts/sp-paths.resolved.json`). SFR/ADU pairs share one upload via
      pointer reuse. Re-running is incremental (name-deduped) — later:
      schedule it nightly alongside the scanner for keep-in-sync.
- [x] **Vendor emails to fill in** *(June 11 2026)* — mined from Adam's sent
      mail: Tibbetts (Tina + CC Mark), Marion Masonry (dispatch@), FGT
      Cabinetry (orlando@), Florida Express (csr@ — dumpster AND porta-potty,
      one vendor). Categories without a one-click button left: Flooring,
      Lighting package, Bathroom tile, Garage door — add vendors when known.

## Ideas parking lot

(things noticed but not committed to — promote them up when ready)

- SharePoint / Monday sync (was milestone 8 of the original Full spec)
- Auto-reminder to export a backup every N days
- ~~**Real document storage for the permit tab**~~ — DONE: files live in the
  private Supabase `project-files` bucket (lib/files.ts), shareable via signed
  ~1-year links from the 📂 Files box and the 📨 Jennifer permit handoff.
- ~~**Pretty link copy in the 📂 Files box share menu**~~ — DONE *(June
  2026)*: "📋 Copy link" copies rich text via `lib/richCopy.ts` — pasting
  into Mail/Word/Teams shows the clickable file name; plain fields still get
  the raw URL.
- **Refresh permit dates/status** — `data/permitDates.ts` is a snapshot read
  from the county portal (2026-06-03) via Claude in Chrome. Re-read the portal
  pages to refresh; the checklist auto-syncs from it on load unless a step was
  manually toggled. (One BS&A-portal permit, PB26-0218 / 10530 SE 50th, wasn't
  readable — different jurisdiction site; enter its dates manually.)
