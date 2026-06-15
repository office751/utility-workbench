# Session primer — paste into any Claude session that lacks project context

Copy everything between the lines into a new session (claude.ai, another
machine, a session outside this repo), then put your actual ask at the end.
Sessions started INSIDE this repo on the Mac don't need it — CLAUDE.md and
Claude's memory load automatically.

---

I'm Adam Stiles, owner of Iron Shield Construction LLC (Ocala/Marion County,
FL — we build spec homes, ~50 active). I'm a beginner coder; explain what
you're doing, flag trade-offs, commit working checkpoints. My north-star is
becoming a licensed GC, and my custom-built command center is the **Iron
Shield Utility Workbench** — a Vite+React+TS app (live:
utility-workbench.vercel.app, auto-deploys from `main`; repo on my Mac at
`~/Documents/Claude/Projects/Lodestar/construction-lodestar` — **read
its CLAUDE.md first**: architecture, conventions, and critical gotchas,
including that the Supabase row is LIVE production data — never test by
mutating it).

The Workbench tracks every house across Electric/Water/Septic/Permit/
Materials, plus: 📐 Models (per-model specs, master-filed flags, shareable
plan files), 🔍 Inspections (county inspection results — deliberately NOT
tasks), Tasks, and a Today action center. Files live in a private Supabase
bucket; every file shares as a ~1-year signed link, and the 📋 Copy link
buttons paste as clickable file names.

Systems already built — don't reinvent these, use them:

- **Permits:** ALL new permits go to Jennifer's Permitting Service via the 📨
  button on a project's Permit tab (template auto-fills subs with county
  Contact IDs, septic + soil-tech routing via Craig Davis, CC's William;
  Jennifer records the NOC; only job cost + financing are hand-filled). Docs
  ride as download links pasted from the clipboard.
- **Duke electric:** the ⚡ button on a DUKE project preps the payload (incl.
  auto-computed driving directions from the nearest main road); Claude drives
  my Chrome through builderportal.duke-energy.app per
  `docs/duke-portal-walkthrough.md`. I only do the login click (per-tab
  session) and the final Submit. Trigger: "apply for Duke on [address]".
- **Material orders:** every to-order row has a one-click ✉️ button — full
  email, correct vendor, TO+CC (Tibbetts = Tina, CC Mark; Block = DZ Block;
  slab/lintels/sand = Marion Masonry; cabinets = FGT Orlando; dumpster +
  porta-potty = Florida Express). Wording in ⚙️ Settings → Templates.
- **Nightly permit scanner** (launchd, Mac-only) syncs the county portal:
  holds/warnings → tasks, inspection results → 🔍 Inspections, FYIs → permit
  notifications.
- **mailclip** (launchd daemon, Mac-only): makes Workbench file links paste
  as clickable names in Apple Mail — I use Apple Mail; don't suggest
  switching.
- **SharePoint:** every project's docs were bulk-synced into the app via
  `scripts/sharepoint-files-sync.mjs` (re-runs are incremental; resolved
  folder links live in `scripts/sp-paths.resolved.json`).

Hard rules: never type passwords for me (I click sign-ins); I press the final
Submit on anything filed with a utility or the county; never add "Thank you,
Adam Stiles…" signatures to email drafts — my mail client appends the real
one; verify changes with `npm run build` + throwaway scripts, not a second
dev server (mine runs on 5173).

My ask: [STATE YOUR ACTUAL REQUEST HERE]

---
