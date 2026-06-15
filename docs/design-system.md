# Construction Lodestar — design system & UI plan

From the June 2026 design audit (10 reviewers, 55 code-verified findings). Goal:
turn ad-hoc CSS into ONE token-based design system — the clean base the Lodestar
visual identity (Claude Design) then builds on. Reusable across future ventures.

**Decisions (Adam, June 2026):** canonical danger red = `#c0492f`; investor
purple is promoted to a real second brand accent `--accent-2`. Execute phase by
phase, P1 first, each a build-verified commit.

## The token system (home: `src/index.css :root` + dark twin)

**Color** — semantic, each with a built-in dark value:
`--bg --panel --text --muted --border --accent` (existing) · `--on-accent` (text/glyph on any accent/filled fill — replaces 18 hard `#fff`) · `--accent-bg` (faint accent tint; was referenced but never defined) · `--danger/-bg/-border` (one red; folds in the 2nd red `#c0392b`) · `--success/-bg/-border` · `--warn/-bg/-strong` · `--info/-bg` · `--accent-2/-bg/-border` (investor purple) · `--star` (favorite ≠ warning) · chip hues `--chip-{green,blue,purple,amber,rust,teal,neutral}(-bg)` · `--shadow`.

**Type** — `--text-2xs(10) -xs(11) -sm(13) -base(14) -md(16) -lg(18) -xl(20) -2xl(24)`, weights `--weight-normal/-semibold/-bold` (400/600/700), `--lh-tight/-normal`, `--ls-label`, `--font-sans/-mono`.

**Spacing** — `--space-1..12` (2,4,6,8,10,12,14,16,18,20,24) + roles `--pad-card --pad-row --gap-list --stack`. Compact density just reassigns the role tokens.

**Radius** — `--radius-sm(6) --radius(8) --radius-md(10) --radius-lg(12) --radius-xl(16) --radius-pill(999)`.

**Touch/responsive** — `--tap-min: 44px`, `--fs-input: 16px` (iOS anti-zoom), `--bp-sm: 640px` (documented breakpoint).

**One button family** — `.btn` base + `--primary / --danger / --ghost / --link / --icon` + a single `.is-active` toggle + one `:disabled` rule. Replaces `.mini .contact .doc-btn .vendor-btn .order-send .primary .save-btn .add-btn .filter-btn` and the 6 hand-written active states.

**Shared recipes** — `.surface` (card), `.field` (input), `.alert` (banner/flag), `.section-h` (heading).

## Plan (build P1 → P2 → P3 → P4; P1 must land first — the rest reference its tokens)

- **P1 Tokens** — 1) define color tokens + dark twins; 2) sweep ~90 color literals onto them (collapses the 15-line dark `.badge` block, fixes the `.owner-chip.investor` dark bug, defines the missing `--accent-bg`); 3) add type/spacing/radius/touch tokens; 4) sweep size/spacing/radius literals; 5) make compact-density a token override (delete ~12 duplicated padding rules).
- **P2 Buttons** — 1) one `.btn` family + size/intent modifiers + single `:disabled`; 2) unify active state into `.btn.is-active` (fixes the invisible Tasks toggle); 3) point all current button classes at `.btn`, give `.save-btn` the token state machine.
- **P3 Per-screen** — 1) shared `.surface` card + `.section-h`; 2) define the dead `.card/.tasks-view/.today-section` classes; 3) shared `.field` form recipe; 4) move client-facing brand to brand.ts + fix the investor portal still showing "⚡ Iron Shield Construction" (not ⭐ Lodestar); 5) one `.alert` recipe + fix the unstyled `.s-ordered/.s-delivered` order tints + de-dup status logic.
- **P4 Mobile** — 1) split the 11-control header into scrollable nav + actions cluster; 2) enforce `--tap-min` + `--fs-input`; 3) fix mobile scroll/stack regions + centralize the breakpoint.

**Risk:** CSS + JSX-className refactor only — no state/schema/logic, no `migrate()` changes. Verify each step with `npm run build` (don't start a 2nd dev server; Adam's runs on 5173). Land in token-group-sized commits.

## Status
- [x] P1a — full token set defined in index.css; fixed 2 dark-mode bugs (--accent-bg, investor purple → --accent-2).
- [~] P1b — CORE semantic colors swept: danger/success/warn/info/star (solids, bg, border) now run through tokens (47 refs). **Light mode proven byte-identical** (tokens resolve back to the exact originals); dark overrides left in place. Remaining for a follow-up pass: context-sensitive `#fff` → `--on-accent` (2 of them are surfaces, handle per-line), the badge/chip hues + collapsing the dark `.badge` block, and the near-duplicate consolidations (#c0392b, the extra ambers).
- [ ] P1c — size / spacing / radius literal sweep + make compact-density a token override.
- [ ] P2 · P3 · P4 — as above.
- [ ] Then: Claude Design visual identity (claude.ai/design) layered on this base.
