# Iron Shield Utility Workbench

Tracker for utility hookups (Electric / Water / Septic) on spec homes in
Marion County, FL. This is the React rebuild of the original single-file
`Electric Applications Workbench.html`.

Planned improvements live in [ROADMAP.md](ROADMAP.md).

## Running it

```bash
npm run dev      # start the dev server, then open the printed localhost URL
npm run build    # type-check + bundle for production (output goes to dist/)
```

> Tip: if `npm` says "command not found", open a **new** terminal window —
> Node is loaded by `~/.zshrc`, which only runs when a terminal starts.

## What every file/folder is

```
utility-workbench/
├── index.html          The single real HTML page. Nearly empty — just a
│                       <div id="root"> that React fills in. (SPA = Single
│                       Page App: one HTML file, JS draws everything.)
├── package.json        The project manifest: its name, the commands
│                       (`npm run dev` etc.), and the list of dependencies.
├── package-lock.json   Auto-generated exact versions of every dependency.
│                       Never edit by hand.
├── node_modules/       The downloaded dependencies themselves. Big, ignored
│                       by git, recreated any time with `npm install`.
├── vite.config.ts      Settings for Vite (the dev server / bundler).
├── tsconfig*.json      Settings for TypeScript (how strict, what syntax).
├── eslint.config.js    Settings for ESLint (warns about common mistakes).
├── public/             Static files served as-is (favicon).
└── src/                ★ OUR CODE — the only folder you'll edit day-to-day
    ├── main.tsx        Entry point: mounts <App /> into index.html.
    ├── App.tsx         Top-level component (will own tabs + dark mode).
    ├── App.css         Styles for App.tsx.
    ├── index.css       Global styles + the CSS color variables.
    └── vite-env.d.ts   One-line TypeScript helper for Vite. Ignore it.
```

## Planned structure (added in later milestones)

```
src/
├── data/
│   ├── projects.ts     Project roster (migrated from the HTML workbench)
│   └── lifecycles.ts   Step definitions per stream/source/type (pure config)
├── hooks/
│   └── useProjects.ts  Load/save to localStorage — the ONE place storage lives
├── components/
│   ├── ProjectList.tsx Sidebar list
│   ├── Detail.tsx      Checklist + notes for the selected project
│   ├── Dashboard.tsx   Action-bucket tiles
│   └── Filters.tsx     Per-tab filters
└── lib/
    ├── nextAction.ts   Compute the next incomplete step
    └── shutoff.ts      "2 business days after closing" calculation
```

## Milestones

1. ✅ Scaffold + hello shell
2. ✅ `Project` type, real roster (49 projects), `useProjects()` localStorage hook
3. ✅ Electric tab (list + detail + checklist + shut-off reminder)
4. ✅ Dashboard tiles + dark mode + filters
5. ✅ Water tab + Septic tab (incl. INRB conditional step)
6. ✅ Contact shortcuts + Export/Import JSON

**All six milestones complete** — the React rebuild now covers everything the
original single-file workbench did (except the SECO/Duke application packet
generator, which is a candidate future enhancement).

### Post-milestone additions

- **Add/remove projects in the app** — the roster lives in saved state now
  (seeded from `src/data/projects.ts` on first run, with a migration for
  older saves). "+ Add project" in the sidebar; "Remove this project" at the
  bottom of the detail view. New projects ride along with Export/Import.
