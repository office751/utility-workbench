/**
 * InvestorInbox.tsx — unread investor messages, surfaced on 🏠 Today.
 *
 * Investors write comments in their portal; this is where Adam first sees
 * them. Each unread message shows which house it's about, the text, a
 * reply box, and ✓ Mark read. Replying also marks it read (you've clearly
 * seen it). Renders NOTHING when there's nothing unread — and before the
 * portal migrations run, unreadComments() fails soft to [], so this whole
 * component stays invisible.
 */
import { useEffect, useState } from 'react'
import type { Project } from '../types'
import {
  addComment,
  markCommentRead,
  unreadComments,
  type InvestorComment,
} from '../lib/investor'

function InvestorInbox({ roster }: { roster: Project[] }) {
  const [unread, setUnread] = useState<InvestorComment[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({}) // comment id → reply text

  useEffect(() => {
    unreadComments().then(setUnread)
  }, [])

  if (unread.length === 0) return null

  const addressOf = (pid: number) => roster.find((p) => p.id === pid)?.address ?? `Project ${pid}`

  async function dismiss(c: InvestorComment) {
    if (await markCommentRead(c.id)) setUnread(await unreadComments())
  }

  async function reply(c: InvestorComment) {
    const body = (drafts[c.id] ?? '').trim()
    if (!body) return
    const ok = await addComment(c.project_id, body, {
      // Reply in the same place they asked — on the photo or the project.
      sharedFileId: c.shared_file_id ?? undefined,
      authorName: 'Iron Shield',
      asOwner: true,
    })
    if (ok) {
      setDrafts((d) => ({ ...d, [c.id]: '' }))
      await dismiss(c) // replying = you've read it
    }
  }

  return (
    <section className="detail inv-inbox">
      <h2 className="detail-title">
        💬 Investor comments <span className="muted">({unread.length} unread)</span>
      </h2>
      {unread.map((c) => (
        <div key={c.id} className="inv-comment unread">
          <p style={{ margin: 0 }}>
            <b>{c.author_name || 'Investor'}</b>
            <span className="muted">
              {' '}· {addressOf(c.project_id)} · {new Date(c.created_at).toLocaleDateString()}
              {c.shared_file_id ? ' · on a photo' : ''}
            </span>
            <button className="mini" style={{ float: 'right' }} onClick={() => dismiss(c)}>
              ✓ Mark read
            </button>
          </p>
          <p style={{ margin: '4px 0' }}>{c.body}</p>
          <div className="inv-box">
            <textarea
              rows={2}
              value={drafts[c.id] ?? ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
              placeholder="Reply…"
            />
            <button className="mini" onClick={() => reply(c)} disabled={!(drafts[c.id] ?? '').trim()}>
              Post
            </button>
          </div>
        </div>
      ))}
    </section>
  )
}

export default InvestorInbox
