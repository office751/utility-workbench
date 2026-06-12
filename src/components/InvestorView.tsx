/**
 * InvestorView.tsx — the ENTIRE app as an investor sees it.
 *
 * An investor lands here straight from login: no tabs, no project list, no
 * way to anywhere else. Everything on screen comes from the curated tables
 * (lib/investor.ts) — never the workbench blob — and Row Level Security on
 * the server decides what the queries return; this component is just the
 * picture frame.
 *
 * Layout: header (project address + sign out) → Current Progress card →
 * captioned photo gallery (each photo commentable) → project-level
 * conversation.
 */
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  addComment,
  commentsFor,
  investorFileUrl,
  myGrantedProjects,
  myRole,
  sharedFilesFor,
  snapshotFor,
  type InvestorComment,
  type SharedFile,
  type StatusSnapshot,
} from '../lib/investor'

const IMG_RE = /\.(png|jpe?g|gif|webp|heic)$/i

function InvestorView() {
  const [name, setName] = useState('')
  const [projects, setProjects] = useState<number[] | null>(null) // null = loading
  const [pid, setPid] = useState<number | null>(null)
  const [snap, setSnap] = useState<StatusSnapshot | null>(null)
  const [files, setFiles] = useState<SharedFile[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({}) // shared_file id → object URL
  const [comments, setComments] = useState<InvestorComment[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({}) // '' = project box
  const urlsRef = useRef<string[]>([])

  // Who am I + which project(s) may I see? Land on the first.
  useEffect(() => {
    ;(async () => {
      const me = await myRole()
      setName(me?.name || 'Investor')
      const ids = await myGrantedProjects()
      setProjects(ids)
      if (ids.length) setPid(ids[0])
    })()
  }, [])

  // Load everything for the selected project.
  useEffect(() => {
    if (pid == null) return
    ;(async () => {
      setSnap(await snapshotFor(pid))
      const fs = (await sharedFilesFor(pid)).filter((f) => f.investor_visible)
      setFiles(fs)
      setComments(await commentsFor(pid))
      // Fetch the photo bytes (RLS-gated downloads) → object URLs for <img>.
      const next: Record<string, string> = {}
      for (const f of fs) {
        const u = await investorFileUrl(f.storage_path)
        if (u) {
          next[f.id] = u
          urlsRef.current.push(u)
        }
      }
      setUrls(next)
    })()
    // Free the blob URLs when the project changes / view unmounts.
    return () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u))
      urlsRef.current = []
    }
  }, [pid])

  async function post(key: string) {
    const body = (drafts[key] ?? '').trim()
    if (!body || pid == null) return
    const ok = await addComment(pid, body, { sharedFileId: key || undefined, authorName: name })
    if (ok) {
      setDrafts((d) => ({ ...d, [key]: '' }))
      setComments(await commentsFor(pid))
    }
  }

  const projectComments = comments.filter((c) => !c.shared_file_id)
  const fileComments = (id: string) => comments.filter((c) => c.shared_file_id === id)

  const thread = (list: InvestorComment[]) => (
    <div className="inv-thread">
      {list.map((c) => (
        <p key={c.id} className="inv-comment">
          <b>{c.author_name || 'Iron Shield'}</b>
          <span className="muted"> · {new Date(c.created_at).toLocaleDateString()}</span>
          <br />
          {c.body}
        </p>
      ))}
    </div>
  )

  const box = (key: string, placeholder: string) => (
    <div className="inv-box">
      <textarea
        rows={2}
        value={drafts[key] ?? ''}
        onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
        placeholder={placeholder}
      />
      <button className="mini" onClick={() => post(key)} disabled={!(drafts[key] ?? '').trim()}>
        Post
      </button>
    </div>
  )

  if (projects === null)
    return (
      <div className="login-wrap">
        <p className="meta">Loading your project…</p>
      </div>
    )

  if (!projects.length || pid == null)
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>Iron Shield Construction</h1>
          <p className="meta">No project is linked to this account yet — please contact Iron Shield.</p>
          <button className="mini" onClick={() => supabase?.auth.signOut()}>⎋ Sign out</button>
        </div>
      </div>
    )

  return (
    <div className="app inv">
      <header className="app-header">
        <div>
          <h1>{snap?.address || 'Your project'}</h1>
          <p className="tagline">Iron Shield Construction — investor view · {name}</p>
        </div>
        <nav className="tabs">
          {projects.length > 1 &&
            projects.map((id) => (
              <button key={id} className={id === pid ? 'act' : ''} onClick={() => setPid(id)}>
                Project {id}
              </button>
            ))}
          <button onClick={() => supabase?.auth.signOut()}>⎋ Sign out</button>
        </nav>
      </header>

      {/* ── Current Progress ─────────────────────────────────────────── */}
      <section className="detail inv-progress">
        <h2 className="detail-title">Current Progress</h2>
        {snap ? (
          <div className="inv-stats">
            <div><span className="inv-k">📋 Permitting</span><span>{snap.permitting || '—'}</span></div>
            <div><span className="inv-k">⚡ Electric</span><span>{snap.electric || '—'}</span></div>
            <div><span className="inv-k">💧 Water</span><span>{snap.water || '—'}</span></div>
            <div><span className="inv-k">🚽 Septic</span><span>{snap.septic || '—'}</span></div>
          </div>
        ) : (
          <p className="summary">Status will appear here shortly.</p>
        )}
        {snap?.updated_at && (
          <p className="meta">Updated {new Date(snap.updated_at).toLocaleDateString()}</p>
        )}
      </section>

      {/* ── Photo gallery ────────────────────────────────────────────── */}
      <section className="detail">
        <h2 className="detail-title">Photos & updates</h2>
        {files.length === 0 && <p className="summary">No photos shared yet — check back soon.</p>}
        <div className="inv-gallery">
          {files.map((f) => (
            <figure key={f.id} className="inv-photo">
              {urls[f.id] && IMG_RE.test(f.name) ? (
                <img src={urls[f.id]} alt={f.caption || f.name} />
              ) : (
                <a className="inv-file" href={urls[f.id]} download={f.name}>📄 {f.name}</a>
              )}
              <figcaption>
                <b>{f.caption || f.name}</b>
                <span className="muted"> · {new Date(f.created_at).toLocaleDateString()}</span>
              </figcaption>
              {thread(fileComments(f.id))}
              {box(f.id, 'Ask or comment on this photo…')}
            </figure>
          ))}
        </div>
      </section>

      {/* ── Project conversation ─────────────────────────────────────── */}
      <section className="detail">
        <h2 className="detail-title">Questions & comments</h2>
        {thread(projectComments)}
        {box('', 'Write a message to Iron Shield…')}
      </section>
    </div>
  )
}

export default InvestorView
