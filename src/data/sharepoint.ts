/**
 * sharepoint.ts — links to each project's SharePoint folder.
 *
 * These are the folders I could confidently match from your SharePoint
 * (keyed by the roster's PARCEL number). They act as DEFAULTS: the permit
 * tab shows this folder unless you've typed a different URL in the app,
 * which overrides it (same override pattern as engineer / water source).
 *
 * Folders live under different owner entities (Iron Shield Construction,
 * Mr. Ocala Buys Houses, Alleviation Services…), so the rest can't be
 * auto-derived — fill them in per project as you go, or paste them here.
 */
const BASE =
  'https://netorg13901770-my.sharepoint.com/personal/office_ironshieldconstruction_com/Documents/BACKUP/Projects'

export const PROJECT_FOLDERS: Record<string, string> = {
  '8003-0299-02': `${BASE}/Iron Shield Construction/8003-0299-02`,
  '1801-015-012': `${BASE}/Iron Shield Construction/1801-015-012`,
  '8011-1368-27': `${BASE}/Iron Shield Construction/8011-1368-27`,
  '9010-0011-06': `${BASE}/Iron Shield Construction/9010-0011-06`,
  '8005-0809-13': `${BASE}/Mr. Ocala Buys Houses/8005-0809-13`,
  // roster stores this parcel with an extra leading zero; the SharePoint
  // folder omits it — point at the real folder name:
  '9023-0489-016': `${BASE}/Mr. Ocala Buys Houses/9023-0489-16`,
  '1328-014-006': `${BASE}/Alleviation Services/1328-014-006`,
}
