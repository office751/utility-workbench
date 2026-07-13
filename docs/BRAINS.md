# The Brains — how Lodestar decides things

This is the canonical spec for every pure-logic module in `src/lib/` (the
"brains"). **Read this before changing any of them.** Every rule below is
enforced by a test in `src/lib/*.test.ts` — `npm test` is the gate. If you
change a rule on purpose, change its test AND this doc in the same commit;
if a test fails and you didn't mean to change behavior, your change is wrong,
not the test.

Written July 2026 as part of the brains-coverage pass. Tests: 127 across 12
files (`npx vitest run`, ~250 ms).

## Global invariants (break these and real houses get hurt)

1. **One prioritization, never two.** `buildActionCenter()` is THE ranking.
   Today, the 🏠 tab badge, the status report's next-action headline, and the
   morning digest all inherit it. Never re-rank downstream.
2. **Fail open.** Work that can't be attributed must surface EVERYWHERE, never
   nowhere: unassigned tasks show in every operator's queue; a customized
   checklist's pending step always counts as "our move".
3. **"Can't tell" beats guessing.** When there's no machine timestamp
   (staleness) or no date (expiry, shut-off, lead times), return `null` and
   show nothing — never fabricate an estimate.
4. **Whose-move judgment lives in ONE place**: `OUR_COURT` in
   `lib/nextAction.ts`, shared by the Today command center and the
   project-list dots. (These were once two hand-copied lists that drifted —
   that's why it's centralized.)

## Date-math conventions (every brain follows these)

- **Parse `YYYY-MM-DD` as LOCAL midnight** via `new Date(dateStr + 'T00:00:00')`.
  A bare date string parses as UTC and shifts a day for anyone west of
  Greenwich.
- **Countdowns use `Math.ceil((target − now) / day)`**, so a deadline landing
  today reads **0 all day long** (it must not flip negative at 12:01 AM), and
  overdue is negative. `Math.ceil(-0.5)` is `-0` — every ceil site adds `+ 0`
  to normalize.
- **Business days = Mon–Fri only. There is NO holiday awareness** — Jan 1
  counts as a business day (deliberate: rare, and a day early beats a day
  late). Known judgment call, tested as such in `shutoff.test.ts`.
- Ages (staleness) use `Math.floor` — a stage isn't "16 days quiet" until the
  16th day has fully passed.

## shutoff.ts — electric shut-off after closing

- Rule: shut off / transfer power **2 business days after the closing date**.
- `shutoffFor` returns `null` when there's no closing date or the account is
  already transferred.
- A Saturday closing walks from Saturday: +2 business days = Tuesday.

## permitExpiry.ts — permit expiration countdown

- Effective date precedence: **typed-in `ps.permitExpiresDate` → county
  snapshot (`data/permitDates.ts`) → none**.
- **Escape hatch (deliberate):** blanking the field to `''` silences the alert
  for that house even when county data exists (`''` is a value, `??` keeps it).
- "Expiring soon" = **within 7 days** (7 counts, 8 doesn't) or already expired.

## staleness.ts — "has this project gone quiet?"

- Waiting-on step = **first unchecked** step of the effective (possibly
  owner-edited) list. Permit `corrections` is an optional aside — never the
  waited-on step.
- Age = days since the **newest `doneAt`** in the stream. No `doneAt` anywhere
  (seeded / county-inferred steps only have a display `date`) → `null`,
  invariant 3. Unparseable `doneAt` is ignored.
- Threshold per step from `data/thresholds.ts` (default **14 days**; tuned
  overrides e.g. electric `engineer` 30, permit `review` 30). Tune numbers
  there, not here.
- Materials isn't a lifecycle → always `null`.

## nextAction.ts — "what's the next move" per stream

- **Electric walk** (default list): verify territory → apply (needs a house #
  first if the address is TBD) → pay deposit → *await engineer* → notify on
  rough-plumbing pass → meter-notify photos → *await meter set* → *await power
  on* → done. Clay lots short-circuit (`clay` — phone-only utility). NOTE: the
  default brain deliberately does NOT consult `fieldsched`/`fielddone` — field
  work is bundled into "awaiting meter set".
- Ambiguous-territory subdivisions (`VERIFY_RE`: Silver Springs, Marion Oaks,
  Ocala Waterway, Coral Ridge, Hidden Lake, Woods & Lakes) — or any lot with
  no utility set — demand `verify` first. Confirming = setting `ps.electricCo`
  OR checking the verify step.
- **Electric done** = final step checked AND `transferred` (the account must
  leave Iron Shield's name after sale).
- **Water** resolves its checklist by source: Well = one step (`wdrilled`);
  City skips the water-main-extension (`wmOnly`) steps; CityWM includes them.
  No source set → the move is *choosing* one.
- **Septic** resolves by source/system: Sewer lots use the sewer list; the
  INRB notice step exists only when `septicSystem === 'INRB'`.
- **Permit**: `corrections` skipped in the walk; `issued` checked = done even
  if earlier boxes weren't ticked (believe the county). `permitNeedsAction`
  only while WE are responsible (`Owner`/`GC` lots are tracked, not on us).
- **`permitStatus` — the coarse bucket** behind the Projects-list permit
  filter chips and row pills. Precedence: `listStatus 'CO'` → **co** ›
  done/typed-or-county issued date → **issued** (blanking the typed date
  silences the county, same escape hatch as expiry) › `Owner`/`GC`
  responsible → **not-ours** › ANY application evidence (a checked step, a
  county record, or a permit # on file — the county assigns numbers at
  application) → **in-review** › else **not-applied**. Deliberately fail-open
  toward county data: most of the roster predates the app, so unchecked
  boxes must not read as "not applied".
- **Customized lists** (owner edited a checklist in Settings): the hand-coded
  walks step aside; next action = first pending step of THEIR list, and any
  pending step counts as our move (invariant 2).
- Precedence for facts: user override in `ProjectState` wins over the roster
  (`utilityOf`, `waterSourceOf`, `engineerOf`, `serviceTypeOf`; service type
  additionally falls back to subdivision defaults — Rainbow Lakes UG, Regal
  Park OH).

## actionCenter.ts — the Today ranking (THE prioritization)

Two lists per build, walked once across all non-CO/non-Hold projects
(`stats.projects` still counts the whole roster — it's "houses tracked", not
"active"):

**attention** (fires — deadline/stall alerts), ranked by:
1. **Severity**: crit > warn > info.
2. **Within a severity, hard deadlines outrank stalls** (`staleLast`): their
   day-scales aren't comparable — a permit expired 3 days ago must beat a
   30-days-overdue stall.
3. Then `sortDays` ascending (smaller/more negative = more urgent).

Item rules:
- **Missing takeoffs on an ISSUED permit** = crit with `sortDays −9999` —
  nothing outranks it (it blocks ordering everything for that house).
  Before issuance it's just an info move ("gather takeoffs").
- **Permit expiry**: surfaces within a **14-day** lookahead; crit when
  expired, warn ≤ 7 days, else info.
- **Shut-off**: surfaces within **10 days**; crit when overdue, else warn.
- **Stalls**: warn past threshold, **crit at ≥ 2× threshold** (also turns the
  🏠 badge red).
- **Lead times**: `late` (order-by date passed) = crit "Order NOW"; `soon`
  (within 7 days) = warn; `ok` stays silent (the Materials pill covers it).

**moves** (our-court to-dos), clustered by kind: takeoffs → stream to-dos →
the shopping list ("Order N materials"). A stream to-do appears only when
`OUR_COURT` says the pending key is ours (waiting on a utility/county/driller
is not a to-do).

`streamActionCounts` rolls this up per stream for tab badges: `count` =
distinct projects, `fire` = any attention item in that stream.

## leadTimes.ts — "order it early enough"

- `order-by = neededBy − lead time (calendar days)`; per-category lead times
  in `data/orders.ts` (`LEAD_TIME_DAYS`, default 7 for unknown categories).
- Status: `late` if order-by passed, `soon` within 7 days (`SOON_WINDOW_DAYS`),
  else `ok`. Only `toOrder` lines WITH a needed-by date get a status.
- Day comparison is midnight-to-midnight with `Math.round` (absorbs DST).

## orders.ts — Quick-Add parsing + order summaries

- Project match: score = identifying tokens (address + subdivision, minus
  street-suffix stopwords) found in the text; **numbers count double** (a
  house # is the strongest signal). `confident` = sole match OR top score
  strictly beats #2 — **a tie never auto-picks**.
- Category match: keyword substrings from `CATEGORY_KEYWORDS`, including
  Josh's spellings (`lentil`→Lintels, `slap`→Slab, `sand`→Lintels because sand
  ships with the lintel package).
- Materials done = **has orders and all installed** — zero orders is NOT done.

## tasks.ts — the two-operator queue

- **Fail-open queue rule** (invariant 2): `forOperator` returns *mine +
  unassigned*; blank/whitespace assignee = unassigned = visible to everyone;
  no signed-in operator → nothing hidden.
- Names compare case- and whitespace-insensitively.
- Due math mirrors the date conventions; `dueSoonTasks` window = overdue or
  due within **2 days** by default.
- Uncategorized tasks group under the real `other` hat (never an `undefined`
  React key).
- Paste format: `<text> | waiting:<name> | due:<today|tomorrow|YYYY-MM-DD> |
  hat:<id> | company:<co>` — aliases `who`, `assign`/`for`, `co`, `cat`;
  unknown hats file under `other`; garbage dues are dropped, not guessed.

## scanHealth.ts — is the nightly scanner alive?

- `ok` < 36 h, `warn` ≥ 36 h, `crit` ≥ 72 h since `scanMeta.lastScanAt`.
  36 not 24 because a day of jitter is normal; never-stamped → `null` (old
  saves don't cry wolf).
- "Scan now" requests count as pending only if newer than the last completed
  scan AND under 30 minutes old — the Mac watcher uses the same 30-minute
  clock so the two sides can't disagree.

## mergeState.ts / migrate() — concurrency + shape changes

- Two operators editing concurrently merge 3-way (never last-write-wins
  clobber) — see `mergeState.test.ts`.
- **`mergeWorkbench` must return EVERY `WorkbenchState` field.** A field left
  off its return object is silently dropped on every concurrent save (July
  2026 bug: `customOrderCategories` / `utilities` / `scanMeta` /
  `vendorCatalogsSeeded` — all added to types.ts after the merge was written).
  Enforced twice: the test fixture is typed `Required<WorkbenchState>` (a new
  field won't compile until the fixture has it) and the COMPLETENESS test
  asserts the merge's output keys equal the fixture's.
- Every state-shape change goes through `migrate()` in `useProjects.ts`
  (tested round-trip in `hooks/migrate.test.ts`). The June 2026 data-loss bug
  (dropped `assignees`) lives in test form there — don't repeat it.
- **Cloud-write invariant (CRITICAL, from the blob-clobber incident): never
  write the cloud before a successful read.** Not a lib/ module, but it
  belongs in any list of rules that must survive.

## Testing gotchas

- `data/lifecycles.ts` keeps owner step-edits in a **module-global**
  (`applyStepOverrides`). Any test that customizes a list MUST reset with
  `applyStepOverrides(undefined)` in `afterEach` or it poisons later tests.
- Clock-dependent brains are tested with `vi.useFakeTimers()` +
  `vi.setSystemTime(...)` — never against the real clock.
- `src/lib/testUtils.ts` builds fixtures that stay OUT of the data files
  (model `ZZZ`, permit `X-NONE`) so data edits can't silently change tests;
  override fields to opt INTO a behavior.

## Open questions for Adam (judgment calls, not bugs)

- **Holidays in business-day math**: shut-off deadlines count Jan 1 / July 4
  as business days. Fine (a day early), or should there be a holiday list?
- **Blank-out escape hatch**: clearing a permit-expiry date silences that
  house's alert even though the county still reports a date. Keep as a
  deliberate mute, or should county data always win?
- **`stats.projects` counts CO/Hold houses.** "62 projects" on Today means
  tracked, not active. Rename or leave?
