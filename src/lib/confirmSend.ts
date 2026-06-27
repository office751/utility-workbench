/**
 * confirmSend — a one-dialog pre-send gate for irreversible email drafts.
 *
 * Carey-readiness #5: every outbound draft (SECO/Duke apply, the Jennifer
 * permit handoff, meter-notify, vendor orders) used to fire the moment you
 * clicked — no preview, no second pair of eyes. This restates the load-bearing
 * facts and returns true ONLY if the operator confirms.
 *
 * Uses window.confirm on purpose: synchronous (so a click handler can gate on
 * its boolean), keyboard-accessible, and zero-dependency — exactly the "one
 * dialog before the draft opens" the workflow asks for. Swap the body for a
 * custom modal here later and every call site upgrades at once.
 */
export function confirmSend(title: string, facts: string[] = []): boolean {
  const lines = [title]
  if (facts.length) lines.push('', ...facts.map((f) => '• ' + f))
  lines.push('', 'Open the email draft now?')
  return window.confirm(lines.join('\n'))
}
