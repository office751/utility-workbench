/**
 * InvestorView.tsx — the ENTIRE app as an investor sees it.
 *
 * An investor lands here straight from login: no tabs, no project list, no
 * way to anywhere else. Everything on screen comes from the curated tables
 * (lib/investor.ts) — never the workbench blob — and Row Level Security on
 * the server decides what the queries return; this component is just the
 * picture frame.
 *
 * Built mobile-first (most investors open this on a phone): a clean top bar,
 * the project title, a Current Progress card, a captioned photo gallery, and
 * a conversation. Photos use 1-hour SIGNED URLs + loading="lazy", so the
 * browser only pulls each image when it scrolls into view — fast on cellular,
 * and it scales as photos pile up.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  addComment,
  commentsFor,
  investorFileUrls,
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
  const [urls, setUrls] = useState<Record<string, string>>({}) // shared_file id → signed URL
  const [comments, setComments] = useState<InvestorComment[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({}) // '' = project box

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
    let alive = true
    ;(async () => {
      setSnap(await snapshotFor(pid))
      const fs = (await sharedFilesFor(pid)).filter((f) => f.investor_visible)
      if (!alive) return
      setFiles(fs)
      setComments(await commentsFor(pid))
      // One batched call signs every photo's URL (no bytes pulled yet); the
      // <img loading="lazy"> fetches each only when it nears the viewport.
      const byPath = await investorFileUrls(fs.map((f) => f.storage_path))
      if (!alive) return
      const byId: Record<string, string> = {}
      for (const f of fs) if (byPath[f.storage_path]) byId[f.id] = byPath[f.storage_path]
      setUrls(byId)
    })()
    return () => {
      alive = false
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

  const thread = (list: InvestorComment[]) =>
    list.length > 0 && (
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
      <button className="mini inv-post" onClick={() => post(key)} disabled={!(drafts[key] ?? '').trim()}>
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
    <div className="inv">
      {/* Thin portal bar: brand left, sign-out right — reads like a client
          portal, not the owner app. */}
      <header className="inv-topbar">
        <span className="inv-brand">⚡ Iron Shield Construction</span>
        <button className="inv-signout" onClick={() => supabase?.auth.signOut()}>
          ⎋ Sign out
        </button>
      </header>

      <div className="inv-page">
        {/* Project title + (if more than one) a chip row to switch. */}
        <div className="inv-titlewrap">
          <h1 className="inv-title">{snap?.address || 'Your project'}</h1>
          <p className="inv-sub">Investor portal · {name}</p>
          {projects.length > 1 && (
            <div className="inv-chips">
              {projects.map((id) => (
                <button key={id} className={'inv-chip' + (id === pid ? ' act' : '')} onClick={() => setPid(id)}>
                  Project {id}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Current Progress ───────────────────────────────────────── */}
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
          {snap?.updated_at && <p className="meta">Updated {new Date(snap.updated_at).toLocaleDateString()}</p>}
        </section>

        {/* ── Photo gallery ──────────────────────────────────────────── */}
        <section className="detail">
          <h2 className="detail-title">Photos &amp; updates</h2>
          {files.length === 0 && <p className="summary">No photos shared yet — check back soon.</p>}
          <div className="inv-gallery">
            {files.map((f) => (
              <figure key={f.id} className="inv-photo">
                {urls[f.id] && IMG_RE.test(f.name) ? (
                  <img src={urls[f.id]} alt={f.caption || f.name} loading="lazy" decoding="async" />
                ) : urls[f.id] ? (
                  <a className="inv-file" href={urls[f.id]} target="_blank" rel="noreferrer" download={f.name}>
                    📄 {f.name}
                  </a>
                ) : (
                  <div className="inv-photo-skel" aria-hidden="true" />
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

        {/* ── Project conversation ───────────────────────────────────── */}
        <section className="detail">
          <h2 className="detail-title">Questions &amp; comments</h2>
          {thread(projectComments)}
          {box('', 'Write a message to Iron Shield…')}
        </section>
      </div>
    </div>
  )
}

export default InvestorView
