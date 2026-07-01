/**
 * guides.ts — the Playbook: plain-English, step-by-step "how to run each
 * workflow" guides, written so a brand-new operator (a successor to Adam) can
 * use the app with no prior knowledge.
 *
 * Pure config (same spirit as vendors.ts / orders.ts): add or edit a guide
 * here and the 📖 Guide screen + the inline "How this works" callouts follow.
 * Both the screen (GuideView) and the callouts (GuideCallout) render straight
 * from this file — one source of truth.
 *
 * Every step is tagged with WHO does it, so the "which Claude?" / "who's on the
 * hook?" questions are answered right on the page.
 */

export type GuideWho = 'you' | 'claude' | 'app' | 'wait'

/** The badge shown next to each step. `claude` is specifically the assistant in
 *  the Chrome SIDE-PANEL on the web page — not the office-Mac dev assistant. */
export const WHO: Record<GuideWho, { icon: string; label: string }> = {
  you: { icon: '🧑', label: 'You' },
  claude: { icon: '💬', label: 'Claude (in Chrome)' },
  app: { icon: '⚙️', label: 'Automatic' },
  wait: { icon: '⏳', label: 'Then' },
}

export interface GuideStep {
  who: GuideWho
  text: string
}

export interface Guide {
  id: string
  icon: string
  title: string
  /** One line: when the operator reaches for this. */
  when: string
  steps: GuideStep[]
  /** Optional closing gotcha. */
  tip?: string
}

export const GUIDES: Guide[] = [
  {
    id: 'apply-duke',
    icon: '⚡',
    title: 'Apply for Duke electric',
    when: 'A Duke-territory house needs its new electric service application started. (SECO houses use a different, email-first flow.)',
    steps: [
      { who: 'you', text: 'Open the house → Electric tab. Confirm the summary line reads DUKE. If not, open ⚙️ Settings and set the Utility to Duke.' },
      { who: 'you', text: 'Click "Duke portal — new service application". The app copies the fill data to your clipboard and opens the Builder Portal in a new browser tab.' },
      { who: 'you', text: 'On that new Duke tab, click Sign In yourself. Never let Claude type a password — and sign in on THIS tab, since Duke only keeps you logged in here.' },
      { who: 'you', text: 'In the Claude side-panel on that Duke tab, say: "apply for Duke on [house address]". ⚠️ This is the Claude in the browser side-panel — NOT the office-Mac assistant.' },
      { who: 'claude', text: 'Claude fills every page of the application and stops at the summary, flagging any judgment calls it had to make — the nearest cross street, the "OH lines adjacent" answer, and the heat type.' },
      { who: 'you', text: 'Review the summary, check the attestation box, and click Submit. Claude never presses the final Submit — that part is always you.' },
      { who: 'wait', text: 'About one business day later, Duke emails a Work Order # from EDA-Ocala or EDA-Inverness. Watch for that email.' },
      { who: 'you', text: 'Open the house\'s ⚙️ Settings: type the number into "Duke WO# (if any)" and set "Duke EDA office" to Ocala (EDA-Ocala) or Inverness (EDA-Inverness) — whichever office emailed you.' },
      { who: 'you', text: 'On the Electric tab (or Batch apply → ⚡ Duke), click 📄 Load form (PDF). It downloads Duke\'s Residential Service Information Form already filled in from the project — no retyping into the blank Duke sent. Open it to double-check, sign if you like.' },
      { who: 'you', text: 'Click Step 2 "✉️ Send load form" (unlocks once the WO# is set). Attach two files — the downloaded Duke load form and the house\'s site plan — keep "WO#…" in the subject line, send, then click ✓ Mark applied.' },
    ],
    tip: 'Two different Claudes: the side-panel Claude ON the Duke web page fills the form; the office-Mac assistant never touches the portal. Always give "apply for Duke on…" to the side-panel Claude on the Duke tab.',
  },
  {
    id: 'apply-seco',
    icon: '⚡',
    title: 'Apply for SECO electric',
    when: 'A SECO-territory house needs its electric service application submitted.',
    steps: [
      { who: 'you', text: 'From the Projects screen, open Batch apply, and find the house under the ⚡ SECO group.' },
      { who: 'you', text: 'Click 📄 Load form (PDF) on the row. It downloads the SECO load form already filled in from the project.' },
      { who: 'you', text: 'Open the PDF and tick the three boxes it leaves for you — Single Family, the service type, and E-mail as the preferred contact — then sign, date, and save it.' },
      { who: 'you', text: 'Back on the row, click ✉️ Draft email. Your mail app opens a message to SECO (the office is CC\'d) with the subject and a short body pre-filled.' },
      { who: 'you', text: 'Attach two files — the signed SECO load form and the house\'s site plan — and send it.' },
      { who: 'you', text: 'Click ✓ Mark applied on the row. It checks off the electric steps and drops the house off the list.' },
    ],
    tip: 'If a row shows a yellow ⚠ warning (e.g. "legal description needs lookup"), fix it first — that field will be blank on the downloaded form. The 👁 Preview button shows the full form data before you draft anything.',
  },
  {
    id: 'permit-jennifer',
    icon: '📋',
    title: 'Hand a new permit to Jennifer',
    when: 'A house is ready for permitting and you want Jennifer\'s Permitting Service to submit it.',
    steps: [
      { who: 'you', text: 'First, make sure the plan set, surveys, and the signed authorization form are uploaded in the 📂 Files box on the project\'s OVERVIEW tab — the email shares them as download links, so anything missing won\'t reach her.' },
      { who: 'you', text: 'Go to the project\'s 📋 Permit tab and click "Email Jennifer — permit package". It briefly shows "Creating download links…".' },
      { who: 'app', text: 'A ready-to-send email to Jennifer opens (William is CC\'d), pre-filled with the address, parcel, model, the standard subcontractor lineup, and the septic line — and the file links are copied to your clipboard as clickable names.' },
      { who: 'you', text: 'In the email, paste (Cmd+V) over the [PASTE HERE] line — the clickable file names replace it. (If the note under the button says it couldn\'t copy, share the links from the 📂 Files box instead.)' },
      { who: 'you', text: 'Fill the two [FILL IN] blanks — the job cost (contract $) and the financing (cash, or lender name & address). These are the only details the app can\'t pre-fill.' },
      { who: 'you', text: 'Send it.' },
      { who: 'wait', text: 'Jennifer prepares and records the Notice of Commencement, obtains any documents you didn\'t send, and submits the permit to the county.' },
    ],
    tip: 'Don\'t send before pasting over [PASTE HERE] — the file links only become clickable names after you paste, or Jennifer gets no documents.',
  },
  {
    id: 'order-materials',
    icon: '🛒',
    title: 'Order materials / reach a vendor',
    when: 'A house needs materials ordered, or you just need to call or email a supplier.',
    steps: [
      { who: 'you', text: 'Need to capture a batch fast? The Quick add bar at the top of the Projects tab files items as "To order" across any houses at once — type "almond slab" or paste a block from Josh\'s texts (see "Capture orders from Josh\'s texts").' },
      { who: 'you', text: 'Open the house → Materials tab. Items still needing to be ordered are highlighted at the top.' },
      { who: 'you', text: 'On a "To order" row, click ✉️ Order from [vendor] (it names the supplier, e.g. ✉️ Order from Tibbetts Lumber).' },
      { who: 'app', text: 'A fully-written, fully-addressed email opens — correct supplier, any CC added, material details already in the body. Read it over, then just press Send.' },
      { who: 'you', text: 'Prefer to call? Click the 📞 button on that same row to dial the supplier (it shows when a number is on file).' },
      { who: 'you', text: 'After you place an order, move the row\'s status from To order → Ordered (then Delivered / Installed as it goes), and set the Ordered date.' },
      { who: 'you', text: 'To add an item that isn\'t listed, use the row at the bottom: pick the material (or a Florida Express site service like a dumpster), set the date, and click ＋ Add order.' },
      { who: 'you', text: 'Just need a supplier\'s number or a quick blank email? Open the More menu → 🚚 Vendors — every supplier with a 📞 and an ✉️.' },
    ],
    tip: 'If a "To order" row has no ✉️ Order button, no supplier is assigned to that material yet — call it in from 🚚 Vendors, or have the dev team add the vendor.',
  },
  {
    id: 'meter-ready',
    icon: '📸',
    title: 'Tell the utility a home is ready for the meter',
    when: 'A home passes its electrical inspection (gets its green tag) and you need the power company to set the meter.',
    steps: [
      { who: 'you', text: 'Open the house → Electric tab. Confirm the summary line shows SECO or DUKE. If it says "utility?", set the utility in ⚙️ Settings first — the button won\'t work otherwise.' },
      { who: 'you', text: 'Click "Notify utility — ready for meter" (the 📸 camera button).' },
      { who: 'app', text: 'A new email opens, already addressed to the right place — SECO Engineering, or the Duke EDA office (Ocala/Inverness) — with the subject "Ready for meter set — [address]" and the photo checklist in the body.' },
      { who: 'you', text: 'Attach a photo of each item listed: the passed-inspection green tag, the downpipe (weatherhead), the sweep, the straps, and a clear path to the meter can. Then send.' },
    ],
    tip: 'The email LISTS the photos but doesn\'t attach them — you must add the actual pictures, or the utility won\'t schedule the meter set. Don\'t add a sign-off; your mail app appends your signature.',
  },
  {
    id: 'manage-water',
    icon: '💧',
    title: 'Set up water for a house',
    when: 'A new house needs its water sorted — a well, city water, or city water that needs a main extension.',
    steps: [
      { who: 'you', text: 'FIRST, in ⚙️ Settings set the Water source: Well, City, or City + main extension (CityWM). Everything below depends on this — the checklist and the "Next" step change with the source — so set it before you start. A house with no source set shows no checklist at all.' },
      { who: 'you', text: 'WELL: once the driller finishes, just check off "Well drilled & installed." Nothing to apply for.' },
      { who: 'you', text: 'CITY water: use the 📞 / ✉️ buttons on the Water tab to confirm availability with Marion County Utilities (MCU), then submit the city water application — checking each step off as it\'s done.' },
      { who: 'you', text: 'CITY + MAIN EXTENSION (CityWM): the main must be extended first — sign the agreement and pay the fees, and that construction happens BEFORE the tap/meter. The extra steps appear on the checklist and the orange flag on the tab reminds you.' },
      { who: 'wait', text: 'Work the checklist top-down — the "Next:" line always names the one thing to do now.' },
    ],
    tip: 'If the source is wrong, the whole checklist is wrong — confirm it in ⚙️ Settings first. Marion County Utilities (MCU) is who you contact for any CITY water; a Well needs no utility.',
  },
  {
    id: 'manage-septic',
    icon: '🚽',
    title: 'Set up septic (or sewer) for a house',
    when: 'A new house needs waste handled — either a septic system or a city sewer connection.',
    steps: [
      { who: 'you', text: 'FIRST, in ⚙️ Settings confirm Septic vs Sewer. IMPORTANT: a house defaults to "Septic" until you change it — so if this lot is actually on CITY SEWER and you don\'t switch it, the app walks you into a DEP septic-permit process you don\'t need. Check this before anything else.' },
      { who: 'you', text: 'SEPTIC: our provider is Georges Plumbing & Excavating (Vicki Kirby) — her contact is on the Septic tab. The flow is site/soil evaluation → apply for the DEP construction permit → permit issued → system installed.' },
      { who: 'you', text: 'SEPTIC + INRB system: if you set the system type to INRB in ⚙️ Settings, an extra step appears — a recorded INRB notice must be sent to Georges (the flag on the tab explains it).' },
      { who: 'you', text: 'SEPTIC, near the end: notify Vicki when the water line is hooked up and when the sod is laid (both are checklist steps) so Georges can finish and inspect.' },
      { who: 'you', text: 'SEWER instead: set the source to Sewer and the checklist switches — confirm sewer availability with Marion County Utilities, submit the sewer application, then pay the tap/connection fees.' },
      { who: 'wait', text: 'Work the checklist top-down — the "Next:" line names the one thing to do now.' },
    ],
    tip: 'The #1 mistake: leaving a sewer lot set to "Septic" (the default) and starting a DEP permit you don\'t need. Confirm the source in ⚙️ Settings FIRST. Septic → Georges Plumbing / Vicki Kirby; sewer & city-water availability → Marion County Utilities.',
  },
  {
    id: 'daily-routine',
    icon: '🏠',
    title: 'Run your day (the Today screen)',
    when: 'First thing each morning, and any time you sit back down to see what needs you.',
    steps: [
      { who: 'you', text: 'Open the Today tab. A count badge means urgent items are waiting on you; a red badge means at least one is critical.' },
      { who: 'app', text: 'Today builds itself from every active house, so you never go house-to-house. Four chips across the top — Focus, Attention, Waiting, To move — show the size of your day.' },
      { who: 'you', text: 'Start with ⭐ Today\'s focus — the must-dos you personally starred. (Empty? Click Open Tasks and star a few.)' },
      { who: 'you', text: 'Then 🔥 Needs attention — the real-deadline list (overdue / due-soon tasks, expiring permits, electric shut-offs). Work it top-down; it\'s already sorted by urgency, red = critical, orange = soon.' },
      { who: 'you', text: 'Click a task\'s checkbox to finish it; click a construction row to jump straight to that house on the exact tab that needs you.' },
      { who: 'you', text: 'Then ⚠ Gone quiet — houses stuck at a stage longer than expected. Open each one and nudge it forward (call the sub, chase the utility).' },
      { who: 'you', text: 'Then ⏳ Waiting on you — items where someone else is blocked until you act (the chip on the right names who).' },
      { who: 'you', text: 'Finish with ✅ Ready for your move — your routine backlog, grouped by action. Expand a group, open a house, do the step.' },
    ],
    tip: 'Always work top-down — the list is pre-sorted by urgency, so trust the order instead of scanning around.',
  },
  {
    id: 'scan-josh',
    icon: '💬',
    title: 'Capture orders from Josh\'s texts',
    when: 'Each morning, or whenever Josh texts that a house needs something — get his orders into the app fast.',
    steps: [
      { who: 'you', text: 'Open the Projects tab. The Quick add bar sits at the very top of the house list.' },
      { who: 'you', text: 'Type the order in plain words — "almond slab", "trusses for the Oak St house" — or paste several of Josh\'s lines at once (one house per line). Press Enter (Shift+Enter adds another line).' },
      { who: 'app', text: 'It matches each line to the right house + material and files it as "To order" on that house\'s 🛒 Materials. It SKIPS anything the house already has on order, so you can\'t double-order, and shows a summary of what it added, skipped, or couldn\'t pin to a house.' },
      { who: 'you', text: 'If a line couldn\'t be matched, the summary says so — open that house\'s Materials tab and add it by hand.' },
      { who: 'you', text: 'Then send each new order with its ✉️ Order button (see "Order materials / reach a vendor").' },
    ],
    tip: 'The Quick add bar works on ANY device you\'re signed in on — phone, Windows laptop, anywhere. (Separately, Adam\'s office Mac runs an automatic "Scan Josh" button that reads Messages directly and files orders without typing — but that is Mac-only, so the Quick add bar is the way everyone else captures orders.)',
  },
]

/** Look one up by id (for the inline callouts). */
export function guideById(id: string): Guide | undefined {
  return GUIDES.find((g) => g.id === id)
}
