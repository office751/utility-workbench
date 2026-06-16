/**
 * InvestorView.tsx — the ENTIRE app as an investor sees it.
 *
 * An investor lands here straight from login: no tabs, no project list, no
 * way to anywhere else. Everything on screen comes from the curated tables
 * (lib/investor.ts) — never the workbench blob — and Row Level Security on
 * the server decides what the queries return; this component is just the
 * picture frame.
 *
 * Calm Canvas "B & C mix" (Claude Design): a light, editorial/premium look
 * carrying warm, personal content. Mobile-first phone column —
 *   Hero (site photo + ★ Lodestar + portfolio switcher + address)
 *   → Current progress (the real stream statuses)
 *   → A note from the builder (the latest builder message)
 *   → Recent updates (the captioned photo feed)
 *   → a sticky "Message us" primary action.
 *
 * Honest by design: the app has no % / milestone-timeline / model+permit data
 * for an investor, so those design sections are omitted rather than faked.
 * Photos use 1-hour SIGNED URLs + loading="lazy" so the browser only pulls each
 * image when it scrolls into view.
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
import Icon from './Icon'

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
  const [switching, setSwitching] = useState(false)

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

  // The "note from the builder": the most recent project-level comment that
  // ISN'T the investor's own — real data, no fabrication. (Empty author = us.)
  const builderNote = [...projectComments]
    .reverse()
    .find((c) => !c.author_name || c.author_name.toLowerCase() !== name.toLowerCase())

  // First shared image becomes the hero backdrop; otherwise a warm gradient.
  const heroFile = files.find((f) => urls[f.id] && IMG_RE.test(f.name))
  const heroUrl = heroFile ? urls[heroFile.id] : null

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

  const box = (key: string, placeholder: string, id?: string) => (
    <div className="inv-box" id={id}>
      <textarea
        rows={2}
        value={drafts[key] ?? ''}
        onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
        placeholder={placeholder}
      />
      <button className="btn btn-primary btn-sm inv-post" onClick={() => post(key)} disabled={!(drafts[key] ?? '').trim()}>
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
          <button className="btn btn-secondary btn-sm" onClick={() => supabase?.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    )

  const streams: { ic: string; label: string; val?: string }[] = [
    { ic: 'description', label: 'Permitting', val: snap?.permitting },
    { ic: 'bolt', label: 'Electric', val: snap?.electric },
    { ic: 'water_drop', label: 'Water', val: snap?.water },
    { ic: 'plumbing', label: 'Septic', val: snap?.septic },
  ]

  return (
    <div className="ip-outer">
      <div className="ip-shell">
        {/* ── Hero: site photo (or warm gradient) + brand + switcher + address ── */}
        <div className={'ip-hero' + (heroUrl ? ' has-photo' : '')} style={heroUrl ? { backgroundImage: `url(${heroUrl})` } : undefined}>
          <div className="ip-hero-scrim" />
          <div className="ip-hero-top">
            <span className="ip-hero-brand">
              <Icon name="star" size={20} color="#e8b53a" fill />
              Lodestar
            </span>
            <span className="ip-hero-spacer" />
            {projects.length > 1 && (
              <div className="ip-switcher">
                <button
                  className="ip-switch-btn"
                  onClick={() => setSwitching((s) => !s)}
                  title="Switch home"
                >
                  Home {projects.indexOf(pid) + 1} of {projects.length}
                  <Icon name="expand_more" size={17} color="#fff" />
                </button>
                {switching && (
                  <div className="ip-switch-menu">
                    {projects.map((id, i) => (
                      <button
                        key={id}
                        className={'ip-switch-item' + (id === pid ? ' act' : '')}
                        onClick={() => {
                          setPid(id)
                          setSwitching(false)
                        }}
                      >
                        Home {i + 1}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button className="ip-signout" onClick={() => supabase?.auth.signOut()} title="Sign out">
              <Icon name="logout" size={18} color="#fff" />
            </button>
          </div>
          <div className="ip-hero-addr">
            <div className="ip-eyebrow">Your home</div>
            <h1 className="ip-addr">{snap?.address || 'Your project'}</h1>
            <div className="ip-sub">Investor portal · {name}</div>
          </div>
        </div>

        <div className="ip-body">
          {/* ── Current progress (real stream statuses; no fabricated %) ── */}
          <section className="ip-progress">
            {streams.map((s) => (
              <div key={s.label} className="ip-prow">
                <Icon name={s.ic} size={18} color="var(--rust)" />
                <span className="ip-prow-label">{s.label}</span>
                <span className="ip-prow-val">{s.val || '—'}</span>
              </div>
            ))}
            {snap?.updated_at && (
              <div className="ip-updated">Updated {new Date(snap.updated_at).toLocaleDateString()}</div>
            )}
          </section>

          {/* ── A note from the builder (latest builder message) ── */}
          {builderNote && (
            <div className="ip-note">
              <div className="ip-note-head">
                <span className="ip-avatar">{(builderNote.author_name || 'IS').slice(0, 1).toUpperCase()}</span>
                <div>
                  <div className="ip-note-who">A note from {builderNote.author_name || 'Iron Shield'}</div>
                  <div className="ip-note-when">Your builder · {new Date(builderNote.created_at).toLocaleDateString()}</div>
                </div>
              </div>
              <div className="ip-note-body">{builderNote.body}</div>
            </div>
          )}

          {/* ── Recent updates: the captioned photo feed ── */}
          <section>
            <div className="ip-section-title">Recent updates</div>
            {files.length === 0 && <p className="ip-empty">No photos shared yet — check back soon.</p>}
            <div className="ip-feed">
              {files.map((f) => (
                <article key={f.id} className="ip-update">
                  {urls[f.id] && IMG_RE.test(f.name) ? (
                    <img className="ip-update-photo" src={urls[f.id]} alt={f.caption || f.name} loading="lazy" decoding="async" />
                  ) : urls[f.id] ? (
                    <a className="ip-update-file" href={urls[f.id]} target="_blank" rel="noreferrer" download={f.name}>
                      <Icon name="description" size={18} color="var(--rust)" />
                      {f.name}
                    </a>
                  ) : (
                    <div className="ip-update-skel" aria-hidden="true" />
                  )}
                  <div className="ip-update-body">
                    <div className="ip-update-meta">
                      <span className="ip-update-title">{f.caption || f.name}</span>
                      <span className="ip-update-when">{new Date(f.created_at).toLocaleDateString()}</span>
                    </div>
                    {thread(fileComments(f.id))}
                    {box(f.id, 'Ask or comment on this photo…')}
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* ── Questions & comments ── */}
          <section>
            <div className="ip-section-title">Questions &amp; comments</div>
            {thread(projectComments)}
            {box('', 'Write a message to Iron Shield…', 'ip-msg')}
          </section>
        </div>

        {/* Sticky primary action — jumps to the message composer. */}
        <div className="ip-msgbar">
          <button
            className="ip-msg-btn"
            onClick={() => document.getElementById('ip-msg')?.querySelector('textarea')?.focus()}
          >
            <Icon name="chat_bubble" size={19} color="#fff" />
            Message us
          </button>
        </div>
      </div>
    </div>
  )
}

export default InvestorView
