# Iron Shield Utility Workbench — project context for Claude

A project hub for Iron Shield Construction's spec homes in Marion County, FL.
Tracks every house across five streams — ⚡ Electric · 💧 Water · 🚽 Septic ·
📋 Permit · 🛒 Materials — plus cross-project tasks, files, batch electric
applications, model takeoffs, and status reports.

- **Live app:** https://utility-workbench.vercel.app (Vercel auto-deploys `main`)
- **Owner:** Adam Stiles (office751). The original single-file
  `Electric Applications Workbench.html` (in Projects/Lodestar/construction-reference/genesis/, Mac only) is the
  historical data reference the app was rebuilt from.
- **Backlog:** `ROADMAP.md` — read it when Adam says "next roadmap item".

## Working with Adam

Adam is a beginner coder learning as we build — that shapes everything:

- Explain what you're doing and why; flag trade-offs candidly.
- Write generous comments aimed at someone learning React/TS.
- Stop at milestones, verify, then `git commit` each working checkpoint.
- Lead summaries with what shipped and how to use it, not implementation.

## Stack & architecture

Vite + React 19 + TypeScript SPA. No backend of our own — Supabase does
storage/auth; Vercel serves the static build.

The whole app state is **one JSON blob** in Supabase: table `workbench`,
single row `id='main'`, column `data jsonb` (RLS: authenticated only).
`src/hooks/useProjects.ts` owns ALL storage: load → `migrate()` → React state
→ debounced save to localStorage + Supabase, with realtime sync between open
tabs/devices. Files live in the private `project-files` Storage bucket
(signed URLs, see `src/lib/files.ts`).

Layering convention (keep it):

- `src/data/*` — **pure config** (projects roster, lifecycles, vendors,
  models, takeoffs, templates registry, contacts, legal descriptions).
  Adding a vendor/template/takeoff type = add an entry; UI follows.
- `src/lib/*` — **pure logic**, no React (nextAction, actionCenter,
  loadForm, statusReport, exportList, templates engine, takeoffs).
- `src/components/*` — React. `App.tsx` owns shared state and passes the
  `useProjects` updaters down as props.
- `src/types.ts` — every shared type, heavily commented.

Key flows: `buildActionCenter()` (lib/actionCenter.ts) drives the 🏠 Today
screen AND the status report's "next action" — one prioritization, never two.
`{{token}}` templates: defaults in `lib/templates.ts`, registry in
`data/templates.ts` (defaults live in lib/ to avoid an import cycle with
vendors.ts), user overrides in `WorkbenchState.templates`, edited in
🛠 Settings.

## Critical gotchas (each cost us a bug — don't relearn them)

1. **One setState per user action.** Calling two updaters that both read
   `state` from the closure (e.g. `toggleStep` twice) clobbers each other.
   For multi-field updates write a dedicated updater using
   `setState(prev => …)` — see `markApplied()` in useProjects.
2. **The cloud row is LIVE production data.** The dev server and any preview
   talk to the same Supabase row Adam uses daily. Never test by mutating
   state; verify logic with throwaway tsx scripts instead (below).
3. **State shape changes go through `migrate()`** in useProjects (normalize
   old blobs, seed new fields). One-time data merges get a flag
   (e.g. `extrasSeeded`).
4. **`scanner/` is isolated** — a Node/Playwright permit-portal scraper that
   must NEVER be imported by the Vite app. It runs nightly at 5:30 AM via
   launchd on Adam's Mac only (logged-in Tyler-SSO Chrome profile in
   `scanner/profile/`, Supabase service key in `scanner/.env` — none of that
   is in git; don't try to run it on other machines). Its sync is ADD-ONLY
   by default; clearing requires `--prune`. Never weaken the
   "never clear a category whose tab didn't render" rule in scan.mjs.
   **`mailclip/` is isolated the same way** — a launchd clipboard daemon
   (installed June 2026, Adam's Mac only) that makes Workbench file links
   paste as clickable names in Apple Mail. Read mailclip/README.md before
   changing clipboard/copy code — Mail's paste behavior depends on it.
5. **TS is strict**: unused params fail the build — name them `_p`.
   SheetJS must stay a lazy `await import('xlsx')` (bundle size).
6. **Vite dev server**: Adam usually has his own `npm run dev` on port 5173.
   Don't fight it; verify via build + scripts, not a second server.
7. Texting/email scans ("any new tasks?") read the **Mac's** Messages DB —
   macOS only; see the memory notes on Adam's machines.

## Verifying changes (the pattern that works here)

1. `npm run build` — must pass clean (it's fast, run it often).
2. For logic, write a throwaway `src/_check.ts` that imports the real
   modules + `data/projects.ts`/`data/seed.ts`, run
   `npx tsx src/_check.ts`, eyeball real-data output, then DELETE it.
3. Deploy = `git push` on `main`; confirm with
   `curl -s https://utility-workbench.vercel.app/ | grep -o '/assets/index-[^"]*\.js'`
   (hash changes when the new build is live).

## Domain cheat-sheet

- Houses are "projects"; static facts in `data/projects.ts` (roster also
  lives in saved state so added houses persist), per-house progress in
  `WorkbenchState.projects[id]` (steps per stream, orders, docs, notes).
- Electric utilities: SECO & Duke (Clay = phone). Applications =
  ⚡ Batch Apply (`lib/loadForm.ts` builds the exact SECO/Duke packets).
- Models (A…G, E2, Independence, Republic, Concord, Fire-House) carry
  sqft/tonnage in `data/models.ts`; per-model takeoff tracking in
  ⚙️ Settings (Republic + Concord started incomplete — that's real).
- Permits: Marion County EnerGov portal (see scanner). Scanner output split
  (June 2026): holds/warnings → tasks; inspection results → per-project
  `inspections` (🔍 Inspections tab, NOT tasks); FYIs → permit notifications.
  `listStatus`
  CO/Hold = finished/paused houses.
