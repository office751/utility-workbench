/**
 * QuickAdd.tsx — capture "ready to order" items in seconds.
 *
 * Two ways to use it:
 *   • Type one shorthand ("almond slab") and Enter.
 *   • Paste a whole BLOCK (one project per line) — e.g. items a sub texted
 *     over — and it processes every line at once.
 *
 * Two guards make it trustworthy:
 *   • Per-line project + item matching (parseQuickAdd), with a picker when a
 *     single typed line is ambiguous.
 *   • DUPLICATE CHECK — it won't re-add an item a project already has. If it's
 *     already "Ordered", it tells you (with the date) instead of double-ordering.
 */
import { useState } from 'react'
import type { OrderStatus, Project, ProjectState } from '../types'
import { ordersOf, parseQuickAdd } from '../lib/orders'

interface Props {
  projects: Project[]
  getProjectState: (id: number) => ProjectState
  addOrder: (id: number, order: { category: string; status: OrderStatus }) => void
}

const STATUS_WORD: Record<OrderStatus, string> = {
  toOrder: 'already on the To-order list',
  ordered: 'already Ordered',
  delivered: 'already Delivered',
  installed: 'already Installed',
}

/** What happened to every line we processed — shown back to the user. */
interface Results {
  added: string[]
  dups: string[] // skipped — already exists (the double-order guard)
  ambiguous: string[] // couldn't pin the project (multi-line case)
  noItem: string[] // no item keyword found
}

function QuickAdd({ projects, getProjectState, addOrder }: Props) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState<{ categories: string[]; candidates: Project[] } | null>(null)
  const [results, setResults] = useState<Results | null>(null)

  /**
   * Add categories to a project, skipping any it already has. `batch` tracks
   * what we added during THIS submit so two lines can't double-add either.
   */
  function addForProject(project: Project, categories: string[], r: Results, batch: Set<string>) {
    const existing = ordersOf(getProjectState(project.id))
    for (const category of categories) {
      const key = `${project.id}|${category.toLowerCase()}`
      const dupe = existing.find((o) => o.category.toLowerCase() === category.toLowerCase())
      if (dupe) {
        r.dups.push(`${category} → ${project.address} (${STATUS_WORD[dupe.status]})`)
      } else if (batch.has(key)) {
        // already added this same item earlier in this paste — ignore quietly
      } else {
        addOrder(project.id, { category, status: 'toOrder' })
        batch.add(key)
        r.added.push(`${category} → ${project.address}`)
      }
    }
  }

  function submit() {
    setError('')
    setResults(null)
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return

    const r: Results = { added: [], dups: [], ambiguous: [], noItem: [] }
    const batch = new Set<string>()
    const parsedLines = lines.map((line) => ({ line, parse: parseQuickAdd(line, projects) }))

    // A single ambiguous line → show the interactive picker (the typed-one-off case).
    if (parsedLines.length === 1) {
      const { line, parse } = parsedLines[0]
      if (parse.categories.length === 0) {
        setError("Couldn't spot an item — try a word like “slab”, “trusses”, “cabinets”.")
        return
      }
      if (parse.confident && parse.matches.length >= 1) {
        addForProject(parse.matches[0], parse.categories, r, batch)
        finish(r)
        return
      }
      setPending({ categories: parse.categories, candidates: parse.matches.length ? parse.matches : projects })
      void line
      return
    }

    // Multiple lines → process each independently, no pickers; summarize at the end.
    for (const { line, parse } of parsedLines) {
      if (parse.categories.length === 0) r.noItem.push(line)
      else if (parse.confident && parse.matches.length >= 1) addForProject(parse.matches[0], parse.categories, r, batch)
      else r.ambiguous.push(line)
    }
    finish(r)
  }

  /** Clear the box and show the summary. */
  function finish(r: Results) {
    setResults(r)
    setText('')
    setPending(null)
  }

  return (
    <div className="quickadd">
      <div className="qa-row">
        <textarea
          className="qa-input"
          rows={text.includes('\n') ? Math.min(text.split('\n').length + 1, 10) : 1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          // Enter submits; Shift+Enter makes a new line (for building a block).
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Quick add — type “almond slab”, or paste a block (one project per line). Enter to capture."
        />
        <button className="primary" onClick={submit}>
          ＋ Capture
        </button>
      </div>

      {error && <p className="qa-error">{error}</p>}

      {pending && (
        <div className="qa-pick">
          <span className="muted">
            Add <b>{pending.categories.join(', ')}</b> to which project?
          </span>
          <div className="qa-cands">
            {pending.candidates.slice(0, 8).map((p) => (
              <button
                key={p.id}
                className="mini"
                onClick={() => {
                  const r: Results = { added: [], dups: [], ambiguous: [], noItem: [] }
                  addForProject(p, pending.categories, r, new Set())
                  finish(r)
                }}
              >
                {p.address}
              </button>
            ))}
          </div>
          <button className="mini" onClick={() => setPending(null)}>
            Cancel
          </button>
        </div>
      )}

      {/* Summary of what the capture did. */}
      {results && (
        <div className="qa-results">
          {results.added.length > 0 && (
            <p className="qa-done">
              ✓ Added as “To order”: {results.added.join(' · ')}
            </p>
          )}
          {results.dups.length > 0 && (
            <p className="qa-dup">⏭ Skipped (already have it): {results.dups.join(' · ')}</p>
          )}
          {results.ambiguous.length > 0 && (
            <p className="qa-error">
              ❓ Couldn't pin a project — add by hand: {results.ambiguous.join(' · ')}
            </p>
          )}
          {results.noItem.length > 0 && (
            <p className="qa-error">No item keyword: {results.noItem.join(' · ')}</p>
          )}
          {results.added.length === 0 &&
            results.dups.length === 0 &&
            results.ambiguous.length === 0 &&
            results.noItem.length === 0 && <p className="muted">Nothing to add.</p>}
        </div>
      )}
    </div>
  )
}

export default QuickAdd
