# Permit Scanner

Reads each Marion County permit's portal record for **active holds** and
**inspection / review rejections**, and (Stage 2) turns them into permit-linked
tasks in the Workbench. Runs on your Mac; nothing here ships to the web app.

It logs in the same way you do (Tyler ID) **once**, saves that browser session
locally, and reuses it. No password is stored or typed by the script.

---

## One-time setup

```bash
cd scanner
npm install                       # installs Playwright + Supabase client
npx playwright install chromium   # downloads the browser Playwright drives
cp .env.example .env              # then open .env and fill it in (see below)
```

**`.env`** (gitignored — never commit it):
- `SUPABASE_URL` — already filled in.
- `SUPABASE_SERVICE_KEY` — leave blank for now; needed only for Stage 2 (writing).
  Get it later from Supabase → Project Settings → API → **service_role**.
- `PROFILE_DIR` — leave as `./profile`.

## Log in (do this now, and again whenever it says it's logged out)

```bash
npm run login
```

A Chrome window opens on the county portal. Log in normally, then press **Enter**
in the terminal. Your session is saved to `./profile`.

## Scan (Stage 1 — dry run, prints findings, writes nothing)

```bash
npm run scan -- --permit 2025020809   # test one permit first
npm run scan -- --permit 2025020809 --headed   # watch it in a visible window
npm run scan                          # all permits
```

You'll see lines like:
```
● 2025020809  (1 item)
   🚧 HOLD: Final Hold — Impact fees must be paid prior to final inspection [02/10/2025]
```

---

## What's next (Stage 2)

Once the dry run looks right:
1. Fill in `SUPABASE_SERVICE_KEY`.
2. The scan will upsert each finding as a permit-linked task (de-duped by
   `sourceKey`, cleared automatically when the hold/rejection goes away).
3. Schedule it nightly with the included launchd job.

## Notes
- **Belleview** permits (bsaonline.com) aren't included — that site blocks automation.
- `permit-portals.json` maps permit# → portal record. Regenerate it from a fresh
  Construction Job List export when you add permits.
