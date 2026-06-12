/**
 * InvestorCuration.tsx — the OWNER's control panel for what an investor sees
 * on one project. Renders on the project Overview ONLY when the project has
 * an investor grant (so 99% of projects never show it).
 *
 * Three jobs:
 *   1. list what's currently shared (with 👁 visibility toggles + captions)
 *   2. show the investor conversation + let Adam reply
 *   3. (the share ACTION lives on each Files-box row — see DocumentsBox's
 *      onShareInvestor prop, wired in Detail.tsx)
 *
 * Everything here is owner-side; RLS lets owners do all of it.
 */
import { useEffect, useState } from 'react'
import {
  addComment,
  commentsFor,
  markCommentRead,
  sharedFilesFor,
  updateSharedFile,
  type InvestorComment,
  type SharedFile,
} from '../lib/investor'

interface Props {
  projectId: number
  /** bumps when a new file is shared from the Files box → reload the list */
  refreshKey: number
}

function InvestorCuration({ projectId, refreshKey }: Props) {
  const [shared, setShared] = useState<SharedFile[]>([])
  const [comments, setComments] = useState<InvestorComment[]>([])
  const [reply, setReply] = useState('')

  useEffect(() => {
    ;(async () => {
      setShared(await sharedFilesFor(projectId))
      setComments(await commentsFor(projectId))
    })()
  }, [projectId, refreshKey])

  async function toggle(f: SharedFile) {
    if (await updateSharedFile(f.id, { investor_visible: !f.investor_visible }))
      setShared(await sharedFilesFor(projectId))
  }

  async function recaption(f: SharedFile) {
    const caption = prompt('Caption the investor sees:', f.caption)
    if (caption === null) return
    if (await updateSharedFile(f.id, { caption }))
      setShared(await sharedFilesFor(projectId))
  }

  async function postReply() {
    const body = reply.trim()
    if (!body) return
    if (await addComment(projectId, body, { authorName: 'Iron Shield', asOwner: true })) {
      setReply('')
      setComments(await commentsFor(projectId))
    }
  }

  // Nothing shared AND no conversation → stay out of the way entirely
  // (also covers "migrations not run yet": both queries fail soft to []).
  if (!shared.length && !comments.length) return null

  return (
    <div className="docs inv-curation">
      <div className="docs-head">
        🤝 Investor view of this project
        <span className="docs-note">what they see · their questions — share more from the file rows above</span>
      </div>

      {shared.length > 0 && (
        <ul className="doc-list">
          {shared.map((f) => (
            <li key={f.id}>
              <div className="doc-row">
                <span className="doc-name">
                  {f.investor_visible ? '👁' : '🚫'} {f.name}
                  {f.caption && <span className="muted"> — “{f.caption}”</span>}
                </span>
                <span className="doc-actions">
                  <button className="doc-btn" onClick={() => toggle(f)}>
                    {f.investor_visible ? 'Hide' : 'Show'}
                  </button>
                  <button className="doc-btn" onClick={() => recaption(f)}>
                    ✏️ Caption
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {comments.length > 0 && (
        <div className="inv-thread" style={{ marginTop: 8 }}>
          {comments.map((c) => (
            <p key={c.id} className={'inv-comment' + (c.read_by_owner ? '' : ' unread')}>
              <b>{c.author_name || 'Investor'}</b>
              <span className="muted"> · {new Date(c.created_at).toLocaleDateString()}</span>
              {!c.read_by_owner && (
                <button
                  className="mini"
                  style={{ float: 'right' }}
                  onClick={async () => {
                    await markCommentRead(c.id)
                    setComments(await commentsFor(projectId))
                  }}
                >
                  ✓ Mark read
                </button>
              )}
              <br />
              {c.body}
            </p>
          ))}
        </div>
      )}

      <div className="inv-box">
        <textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to the investor…" />
        <button className="mini" onClick={postReply} disabled={!reply.trim()}>
          Post
        </button>
      </div>
    </div>
  )
}

export default InvestorCuration
