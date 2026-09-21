# ⚡ Electric scout — "who powers this lot?" from Monday

Marion County publishes the electric companies' territory boundaries as a GIS
layer. This asks that layer instead of you calling SECO to find out, which is
how 14845 SW 77th Ave got bounced: it sits in a mostly-SECO subdivision but
about a mile the Duke side of the seam.

There are two ways to run it. Both use the same lookup code (`api/_gis.js`),
which is also the same logic as the app's ⚡ Verify button, so none of the
three can give you different answers.

## 1. From Monday (a button on the row)

**What happens:** you flip the row's scout cell, and a few seconds later the
row's **Electric Co.** fills in and an update appears saying where the answer
came from. Near a territorial boundary it deliberately does *not* fill the
cell — it posts an update telling you to confirm. A wrong power company means
a wrong application, and the county polygons are good but not survey-grade.

### One-time setup

**a) Two environment variables in Vercel** (Project → Settings → Environment
Variables), then redeploy:

| Name | Value |
|---|---|
| `MONDAY_API_TOKEN` | a Monday personal API token — Monday avatar → Developers → My access tokens |
| `SCOUT_SECRET` | any long random string you invent; it's just a password for the URL |

**b) A trigger column on the Construction Job List.** Add a Status column
called `Electric Scout` with a label like `Find it`.

**c) The automation.** On the board: **Automate → Add automation → search
"webhook"** → recipe *"When a column changes, send a webhook"*. Set the column
to `Electric Scout` and the URL to:

```
https://<your-vercel-domain>/api/electric-scout?key=<the SCOUT_SECRET you chose>
```

Monday will immediately post a challenge to that URL to prove it exists; the
endpoint answers it automatically, so the recipe should save without fuss.

### Using it
Set a row's **Electric Scout** cell to `Find it`. Watch the row's updates.

## 2. From the terminal (a whole group at once)

Better when you've just added a batch of lots and want them all answered.

```bash
node scanner/electric-scout.mjs                       # dry run, Pre-Permitting
node scanner/electric-scout.mjs --apply               # write the confident ones
node scanner/electric-scout.mjs --group "Permitting"
node scanner/electric-scout.mjs --parcel 1801-006-013 # just look one up
node scanner/electric-scout.mjs --all                 # re-check rows already filled
```

Fill-only: a row that already names a company is skipped unless you pass
`--all`. Rows near a seam are listed but not written unless you add
`--apply-cautious`.

## How it decides

1. **Find the lot.** By parcel number against the county's ParcelCentroids
   layer — that works for vacant `TBD` lots the big geocoders can't place.
   Falls back to the county address locator.
2. **Ask who serves that point** from the Electric Service Areas polygons.
3. **Measure the nearest other provider** by re-asking in rings — 100 m, 250 m,
   500 m, 800 m, 1200 m, 1 mile — so you get "Duke is ~820 ft away" rather than
   a vague warning. Within ~820 ft, a human confirms.

Two failure modes it handles rather than hides: the county endpoints
occasionally return a short response under a sweep (one retry, then it reports
*inconclusive* instead of a false all-clear), and an unrecognised provider name
is reported verbatim rather than guessed into a code.

Sep 2026 baseline: all 32 Rainbow Lakes pre-permitting lots are **SECO**, 23 of
them clear of any seam.
