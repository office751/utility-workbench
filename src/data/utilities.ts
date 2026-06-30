/**
 * utilities.ts — EXTRA utility companies (Electric / Water / Sewer-septic)
 * beyond the built-in ones the app already knows how to handle:
 *   - Electric: SECO, Duke, Clay (data/contacts.ts UTILITY_PHONES + the
 *     bespoke SECO load-form / Duke web-portal automation)
 *   - Water/Sewer: Marion County Utilities (MCU)
 *   - Septic: Georges Plumbing (GEORGES)
 *
 * Those built-ins have real automation behind them (lib/secoForm.ts,
 * lib/loadForm.ts, lib/dukeWebApply.ts) and stay exactly as they are — this
 * file is purely for jobs whose territory is served by someone else. An entry
 * here behaves the way Clay already does today: a name + phone + email you
 * call/email by hand, no auto-filled application packet.
 *
 * Same owner-editable-roster pattern as data/vendors.ts: UTILITIES below is
 * just the code-default seed (empty — Adam adds his own companies from
 * Settings → Utility companies setup). Once saved, the cloud blob
 * (WorkbenchState.utilities) owns the list; this array only seeds first run.
 */

/** Which side of the house this extra company serves. */
export type UtilityKind = 'electric' | 'water' | 'sewer'

export interface UtilityCompany {
  /** Stable id — also the value stored on a project (e.g. ProjectState.electricCo
   *  for electric, or waterCompanyId/sewerCompanyId for water/sewer). */
  id: string
  kind: UtilityKind
  name: string
  phone?: string
  email?: string
  /** First name for the greeting ("Hi Dawn,") — falls back to the company name. */
  contact?: string
}

/** Empty on purpose — Adam adds his own extra companies in-app. */
export const UTILITIES: UtilityCompany[] = []
