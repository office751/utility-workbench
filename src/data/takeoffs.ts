/**
 * takeoffs.ts — the takeoffs every house MODEL needs gathered before building
 * from it, plus which models are already established.
 *
 * Pure config. When a NEW model shows up (like Republic / Concord), each of
 * these has to be chased down from engineers and vendors — and if a permit for
 * that model is ISSUED before they're gathered, it becomes the most important
 * thing on that project (it'll sit at the top of Today until handled).
 *
 * Add a takeoff type = add a line; the Settings page + urgency logic follow.
 */
export interface TakeoffType {
  id: string
  label: string
  icon: string
}

export const TAKEOFF_TYPES: TakeoffType[] = [
  { id: 'truss', label: 'Truss engineering / takeoff', icon: '🏠' },
  { id: 'framing', label: 'Framing package takeoff', icon: '🪵' },
  { id: 'masonry', label: 'Block / lintel / slab takeoff', icon: '🧱' },
  { id: 'cabinets', label: 'Cabinet takeoff', icon: '🗄️' },
  { id: 'flooring', label: 'Flooring takeoff', icon: '🧱' },
]

/**
 * Models treated as fully gathered when this feature first runs (they've been
 * built repeatedly). Republic + Concord are deliberately NOT here — per Adam,
 * most of their takeoffs are still missing. Uncheck anything in ⚙️ Settings →
 * Takeoffs if one of these is actually incomplete.
 */
export const ESTABLISHED_MODELS = ['A', 'B', 'C', 'D', 'E2', 'F', 'G', 'Independence', 'Fire-House']
