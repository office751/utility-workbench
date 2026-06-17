# SharePoint sync — setup (one-time, ~10 min)

Pushes electric + core-fact data from the Workbench (the Supabase blob) into the
**"Construction Jobs Permitting"** SharePoint List on the *ProcesstoBuildingaHouse*
site. Runs on your Mac, like the nightly permit scanner — it is NEVER imported by
the web app.

It needs a Microsoft Graph credential so a headless job can write to the list.
That credential comes from a one-time **Azure app registration** (only you, the
M365 admin, can create it). Do the steps below, paste three values into
`scanner/.env`, and tell Claude — Claude then runs a **dry run** (shows exactly
what it would change, writes nothing), you approve, then it applies + schedules.

---

## 1. Create the Azure app registration

1. Go to <https://entra.microsoft.com> → **Applications → App registrations → New registration**.
   - Name: `Lodestar SharePoint Sync`
   - Supported account types: **Single tenant** (this org only)
   - Redirect URI: leave blank → **Register**.
2. On the app's **Overview** page, copy:
   - **Application (client) ID**
   - **Directory (tenant) ID**
3. **Certificates & secrets → Client secrets → New client secret** → 24-month expiry →
   **copy the Value immediately** (you can't see it again). This is the client secret.

## 2. Grant it permission to write SharePoint

4. **API permissions → Add a permission → Microsoft Graph → Application permissions**
   → search **`Sites.ReadWrite.All`** → check it → **Add permissions**.
5. Click **Grant admin consent for <your org>** → **Yes**. The Sites.ReadWrite.All
   row should show a green "Granted" check.

   > Tighter alternative (optional): use **`Sites.Selected`** instead, then grant the
   > app write access to only the ProcesstoBuildingaHouse site. More secure, one extra
   > step — tell Claude if you want this and it'll handle the site-grant call.

## 3. Drop the credential into `scanner/.env`

Add these three lines (the Supabase keys are already there):

```
GRAPH_TENANT_ID=<Directory (tenant) ID>
GRAPH_CLIENT_ID=<Application (client) ID>
GRAPH_CLIENT_SECRET=<the secret Value from step 3>
```

`.env` is git-ignored — these never leave your Mac.

## 4. Tell Claude "creds are in"

Claude will then:
1. Resolve the site + "Construction Jobs Permitting" list, read its columns
   (display → internal field names) and items.
2. **Dry run**: print every proposed change — fills + any conflicts where the app
   and the list disagree — and write nothing.
3. After you approve, apply the changes, then schedule it (nightly, alongside the
   permit scanner, or on-demand).

---

## What it syncs (matched by Permit #)

| List column | App source | Rule |
|---|---|---|
| Street Address / City / Zipcode / Subdivision / House Model / Parcel ID | project core facts | fill when list is blank or "TBD…"; flag conflicts |
| Electric Co. | utility (SECO/DUKE/CLAY) | fill blank / flag |
| Engineer | assigned engineer | fill blank / flag |
| Electric Type? | OH / UG | fill blank / flag |
| Electric – Current Stage | applied status + date | set "Applied [date]" only when list = "Not Applied"/blank; never overwrite a note |

Match key: **Permit #** (normalized — trailing "(SFR)"/"(ADU)" stripped), falling
back to exact Street Address. Rows with no app match are skipped.

Safety: every run defaults to a dry run; real writes need an explicit `--apply`,
and existing non-empty cells are never overwritten (conflicts are reported, not
clobbered) until you opt a field into overwrite mode.
