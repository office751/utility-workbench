/**
 * hats.ts — the "hats" Adam wears, used to categorize free-form tasks.
 *
 * Pure config (same spirit as lifecycles.ts). Add, rename, or reorder a hat
 * here and the Tasks tab + command center pick it up automatically. The `id`
 * is what gets stored on a Task's `category`, so don't change existing ids
 * without a migration — labels and icons are safe to edit anytime.
 */
export interface Hat {
  id: string
  label: string
  icon: string
}

export const HATS: Hat[] = [
  { id: 'construction', label: 'Construction', icon: '🏗️' },
  { id: 'it', label: 'IT', icon: '🖥️' },
  { id: 'office', label: 'Office', icon: '🗂️' },
  { id: 'supplies', label: 'Supplies', icon: '📦' },
  { id: 'research', label: 'Research', icon: '🔎' },
  { id: 'other', label: 'Other', icon: '📌' },
]

/** Look up a hat by id (falls back to a generic pin so the UI never breaks). */
export function hatOf(id: string): Hat {
  return HATS.find((h) => h.id === id) ?? { id, label: id || 'Other', icon: '📌' }
}
