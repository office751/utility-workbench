# Automation: morning digest + weekly improvement loop

Two Mac jobs built July 6 2026. Both are **ready but inactive** — each needs
the one-time steps below (deliberately: a human flips them on).

## What they are

**☀️ Morning digest** (`com.ironshield.digest`, daily 6:30 AM) — emails each
person in `scanner/digest.config.json` their morning picture from office@:
company-wide fires (permit expiry, shut-offs, stalls, order-NOW — the exact
Today ranking), scanner health, THEIR task queue (yours + unassigned), and
the numbers. Brain: `src/lib/digest.ts` (tested); sender:
`scripts/send-digest.ts`. Preview anytime, sends nothing: `npm run digest`.
**Costs zero Claude usage** — it's a plain script.

**🔧 Improvement loop** (`com.ironshield.improver`, Mondays 7:00 AM) — a
headless Claude Code session in a throwaway worktree: three proposer agents
(backlog / code health / operators' week) → an adversarial judge picks ONE →
small+safe items get BUILT on an `improve/<date>` branch with tests passing
(NEVER main — you review and merge), everything else arrives as a
recommendation. Report emailed + saved to `scanner/logs/improve-<date>.md`.
**Costs Claude usage weekly** (one session's worth). Wrapper:
`automation/improve.sh`; the agent's rules: `automation/improve-prompt.md`.

## One-time activation steps (Adam)

1. **Grant Mail.Send** (unlocks BOTH jobs' email):
   entra.microsoft.com → App registrations → the app whose client id matches
   `GRAPH_CLIENT_ID` in `scanner/.env` → API permissions → Add a permission →
   Microsoft Graph → **Application permissions** → `Mail.Send` → Add →
   **Grant admin consent**. (Today it only has Sites.ReadWrite.All — verified.)
2. **Test the digest**: `npm run digest` (preview), then `npm run digest:send`
   — check your inbox. Then install the job:
   `cp scanner/com.ironshield.digest.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.ironshield.digest.plist`
3. **Log the CLI in** (improvement loop only): run `claude` in Terminal → `/login`
   → browser sign-in → quit. (CLI is installed; it doesn't share the desktop
   app's login.)
4. **Supervised first loop run**: `automation/improve.sh` — watch it, read the
   report in `scanner/logs/`. Happy? Install:
   `cp scanner/com.ironshield.improver.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.ironshield.improver.plist`
5. When Carey should get the digest: put her email in
   `scanner/digest.config.json` and flip `"enabled": true`. Her `name` must
   match her 👥 People display name (that's what filters her task queue).

## Safety properties (why this can't hurt production)

- Digest + loop both read the blob **read-only**; neither ever writes it.
- The loop agent works in a throwaway worktree on an allowlisted toolset —
  it can edit/test/commit there, it cannot push, merge, touch `main`,
  `scanner/`, `supabase/`, or the cloud-sync code (`automation/improve-prompt.md`
  hard rules + the tool allowlist in `improve.sh`).
- Only the wrapper pushes, and only the `improve/<date>` branch. Vercel builds
  branch PREVIEWS; production deploys from `main` only — which stays yours.
- Every built branch must pass `npx vitest run` (the brains suite,
  docs/BRAINS.md) + `npm run build` before it's even committed.
