/**
 * permitDates.ts — live permit status + issued/expiration dates, read from the
 * Marion County permit portal (selfservice.marionfl.org) via Claude in Chrome.
 *
 * Keyed by permit number. `status` is the county's authoritative status;
 * `issued`/`expires` are ISO dates ('' when the permit isn't issued yet).
 * These drive the permit checklist, the Issued/Expires fields, and the
 * expiry alerts — overridable by typing into the app (ps.permit* wins).
 *
 * Snapshot captured 2026-06-03. To refresh, re-read the portal pages and
 * regenerate. (County building permits have no fixed expiration on their PDFs;
 * the portal is the only source, which is why we read it live.)
 */
export interface PermitInfo {
  status: string
  issued: string // YYYY-MM-DD, or '' if not issued
  expires: string // YYYY-MM-DD, or '' if not issued
}

/* ===================================================================
   LIVE PORTAL DATES (July 2026)
   The nightly permit scanner now records each permit's summary fields
   (status / issue date / EXPIRE date) into the saved blob
   (WorkbenchState.portalDates) on every run — so an extension approved at
   the county updates the app's expiry countdown by itself, no snapshot
   regeneration needed. The static PERMIT_DATES below stays as the baked
   fallback (and the scanner's day-one comparison baseline).

   Same module-global pattern as lifecycles.ts step overrides: App.tsx (and
   migrate(), which runs before first render) call applyPortalDates() so the
   pure getters everywhere — permitExpiry, nextAction, seed's checklist
   inference — see live data without threading state through every signature.
   =================================================================== */
let LIVE: Record<string, Partial<PermitInfo>> = {}

/** Sync the module copy from saved state. Call before anything reads dates. */
export function applyPortalDates(d: Record<string, Partial<PermitInfo>> | undefined): void {
  LIVE = d ?? {}
}

/**
 * The EFFECTIVE county record for a permit: live scanner data merged over the
 * baked snapshot, FIELD BY FIELD with non-empty-wins. A live field the scanner
 * couldn't read ('' or absent) must never erase baked knowledge — same
 * fail-open-toward-county-data bias as permitStatus. Returns undefined only
 * when neither source knows the permit at all.
 */
export function permitInfoOf(permit: string): PermitInfo | undefined {
  const live = LIVE[permit]
  const base = PERMIT_DATES[permit]
  if (!live) return base
  return {
    status: live.status || base?.status || '',
    issued: live.issued || base?.issued || '',
    expires: live.expires || base?.expires || '',
  }
}

export const PERMIT_DATES: Record<string, PermitInfo> = {
  '2025020809': { status: 'Issued', issued: '2025-08-21', expires: '2026-08-10' },
  '2025070284': { status: 'Issued', issued: '2025-12-29', expires: '2026-07-06' },
  '2025070270': { status: 'Fees Paid', issued: '2025-08-21', expires: '2026-10-14' },
  '2025082884': { status: 'Issued', issued: '2025-10-21', expires: '2026-11-02' },
  '2025070381': { status: 'Issued', issued: '2026-02-03', expires: '2026-07-06' },
  'BLDR-26-02-06113': { status: 'Issued', issued: '2026-02-13', expires: '2026-08-12' },
  '2025070269': { status: 'Issued', issued: '2025-08-19', expires: '2026-08-12' },
  '2025070278': { status: 'Inspect', issued: '2025-11-05', expires: '2026-11-30' },
  '2025094128': { status: 'Issued', issued: '2026-01-13', expires: '2026-11-12' },
  'BLDR-26-02-06112': { status: 'Issued', issued: '2026-02-12', expires: '2026-11-18' },
  '2025100114': { status: 'Issued', issued: '2026-01-30', expires: '2026-11-25' },
  '2025093375': { status: 'Fees Paid', issued: '2026-01-13', expires: '2026-11-18' },
  '2025093582': { status: 'Fees Paid', issued: '2025-12-15', expires: '2026-11-02' },
  '2025093945': { status: 'Issued', issued: '2026-02-09', expires: '2026-11-18' },
  '2025093484': { status: 'Issued', issued: '2026-01-05', expires: '2026-11-16' },
  '2025094106': { status: 'Issued', issued: '2026-02-10', expires: '2026-11-30' },
  'BLDR-26-01-04117': { status: 'Issued', issued: '2026-02-25', expires: '2026-11-30' },
  'BLDR-26-01-04896': { status: 'Issued', issued: '2026-02-16', expires: '2026-08-15' },
  'BLDR-26-02-05775': { status: 'Issued', issued: '2026-03-17', expires: '2026-11-10' },
  'BLDR-26-02-05844': { status: 'Issued', issued: '2026-02-27', expires: '2026-10-27' },
  'BLDR-26-02-05942': { status: 'Issued', issued: '2026-03-19', expires: '2026-11-10' },
  'BLDR-26-02-06334': { status: 'Issued', issued: '2026-03-20', expires: '2026-11-23' },
  'BLDR-26-02-06340': { status: 'In Review', issued: '', expires: '' },
  'BLDR-26-02-07169': { status: 'Issued', issued: '2026-03-20', expires: '2026-11-17' },
  'BLDR-26-02-06620': { status: 'Issued', issued: '2026-03-25', expires: '2026-11-02' },
  'BLDR-26-02-06622': { status: 'Issued', issued: '2026-03-25', expires: '2026-11-02' },
  'BLDR-26-03-08003': { status: 'Fees Paid', issued: '', expires: '' },
  'BLDR-26-03-08782': { status: 'In Review', issued: '', expires: '' },
  'BLDR-26-03-10141': { status: 'Fees Due', issued: '', expires: '' },
  'BLDR-26-06-15391': { status: 'In Review', issued: '', expires: '' },
  'BLDR-26-06-15394': { status: 'In Review', issued: '', expires: '' },
  'BLDR-26-06-15398': { status: 'In Review', issued: '', expires: '' },
  'BLDR-26-04-10835': { status: 'Issued', issued: '2026-04-20', expires: '2026-10-17' },
  'BLDR-26-03-10145': { status: 'In Review', issued: '', expires: '' },
  'BLDR-26-03-10140': { status: 'Issued', issued: '2026-05-01', expires: '2026-10-28' },
  'BLDR-26-03-10135': { status: 'In Review', issued: '', expires: '' },
  'BLDR-26-04-10839': { status: 'Issued', issued: '2026-04-20', expires: '2026-11-25' },
  'BLDR-26-03-09317': { status: 'Issued', issued: '2026-04-20', expires: '2026-11-16' },
  'BLDR-26-03-09354': { status: 'Issued', issued: '2026-04-20', expires: '2026-11-30' },
  'BLDR-26-03-10132': { status: 'Issued', issued: '2026-05-07', expires: '2026-11-16' },
  '2025092242': { status: 'Issued', issued: '2026-05-05', expires: '2026-11-30' },
  '2025092246': { status: 'Issued', issued: '2026-05-26', expires: '2026-11-23' },
  '2025092275': { status: 'Issued', issued: '2026-05-05', expires: '2026-11-30' },
  'BLDR-26-04-11591': { status: 'Issued', issued: '2026-05-13', expires: '2026-11-09' },
  // 10530 SE 50th (Fire-House) — Belleview BS&A portal, entered manually:
  // applied 4/6/2026, under review (not issued).
  'PB26-0218': { status: 'In Review', issued: '', expires: '' },
}
