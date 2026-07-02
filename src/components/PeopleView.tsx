/**
 * PeopleView.tsx — the admin "People" screen (👥). Admin-only.
 *
 * Lists every login, lets the admin set each one's ROLE and — for roles that
 * are scoped to assigned projects (project manager, investor) — pick exactly
 * which projects they can see. Writes go straight to app_users / project_access
 * (RLS lets the admin do this). Everything fails soft, so before the RBAC
 * migration runs this simply shows an empty list.
 *
 * Creating the actual login still happens in the Supabase dashboard for now
 * (the browser can't mint Auth users) — once created, the person appears here
 * to assign. See docs/rbac-plan.md.
 */
import { useEffect, useState } from 'react'
import type { Project } from '../types'
import { ROLES, ROLE_ORDER, normalizeRole } from '../data/roles'
import {
  allProjectAccess,
  currentUserId,
  deleteUser,
  inviteUser,
  listAppUsers,
  setUserName,
  setUserProjects,
  setUserRole,
  type AppUserRow,
} from '../lib/admin'

// Roles you can hand out via the invite form — never 'admin' (create those in
// the Supabase dashboard) and never 'pending' (that's the auto holding state).
const INVITABLE = ROLE_ORDER.filter((r) => r !== 'admin' && r !== 'pending')

function PeopleView({
  roster,
  assignees,
  setAssignees,
}: {
  roster: Project[]
  /** Shared "Assign to" list (Tasks tab). We keep it in sync with the logins below. */
  assignees: string[]
  setAssignees: (names: string[]) => void
}) {
  const [users, setUsers] = useState<AppUserRow[]>([])
  const [access, setAccess] = useState<Record<string, number[]>>({})
  const [meId, setMeId] = useState('') // my own login id — used to block self-removal
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState('')
  // Invite form state.
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('coworker')
  const [inviting, setInviting] = useState(false)

  async function reload() {
    const [u, a, uid] = await Promise.all([listAppUsers(), allProjectAccess(), currentUserId()])
    setUsers(u)
    setAccess(a)
    setMeId(uid)
    setLoading(false)
  }
  useEffect(() => {
    reload()
  }, [])

  // Keep the shared "Assign to" list (✓ Tasks tab) in step with the people who
  // have a login here. Every INTERNAL teammate (not investors, not pending)
  // becomes assignable — and since that list lives in the shared blob, it looks
  // the SAME for everyone, no matter who's signed in. This is the fix for
  // "office@ only sees Adam + Unassigned": the team list was empty, so each
  // person only saw themselves plus names already sitting on a task. Union-only,
  // so manual names added in Settings → Team (e.g. a sub with no login) survive.
  useEffect(() => {
    const teamNames = users
      .filter((u) => {
        const r = normalizeRole(u.role)
        return !ROLES[r].usesInvestorPortal && r !== 'pending'
      })
      .map((u) => u.display_name.trim())
      .filter(Boolean)
    const have = new Set(assignees.map((a) => a.toLowerCase()))
    const merged = [...assignees]
    for (const n of teamNames) {
      if (!have.has(n.toLowerCase())) {
        have.add(n.toLowerCase())
        merged.push(n)
      }
    }
    // A union only grows the list, so a length change means we found new names.
    if (merged.length !== assignees.length) setAssignees(merged)
  }, [users]) // eslint-disable-line react-hooks/exhaustive-deps

  function note(msg: string) {
    setFlash(msg)
    setTimeout(() => setFlash((m) => (m === msg ? '' : m)), 2500)
  }

  async function sendInvite() {
    const email = inviteEmail.trim()
    if (!email) return
    setInviting(true)
    const res = await inviteUser(email, inviteRole, inviteName.trim())
    setInviting(false)
    if (res.ok) {
      note(res.error ? `Invited ${email} — heads up: ${res.error}` : `Invite sent to ${email}.`)
      setInviteEmail('')
      setInviteName('')
      reload()
    } else {
      note(res.error ?? 'Could not send the invite.')
    }
  }

  async function changeName(u: AppUserRow, name: string) {
    const trimmed = name.trim()
    if (!trimmed || trimmed === u.display_name) return
    if (await setUserName(u.user_id, trimmed)) {
      setUsers((prev) => prev.map((x) => (x.user_id === u.user_id ? { ...x, display_name: trimmed } : x)))
      note(`Renamed to "${trimmed}".`)
    } else {
      note('Could not save the name.')
    }
  }

  async function changeRole(u: AppUserRow, role: string) {
    if (await setUserRole(u.user_id, role)) {
      setUsers((prev) => prev.map((x) => (x.user_id === u.user_id ? { ...x, role } : x)))
      note(`${u.display_name || 'User'} is now ${ROLES[normalizeRole(role)].label}.`)
    } else {
      note('Could not save the role (is the RBAC migration in place?).')
    }
  }

  async function toggleProject(u: AppUserRow, pid: number) {
    const current = access[u.user_id] ?? []
    const next = current.includes(pid) ? current.filter((x) => x !== pid) : [...current, pid]
    setAccess((prev) => ({ ...prev, [u.user_id]: next })) // optimistic
    if (!(await setUserProjects(u.user_id, next))) {
      note('Could not save project access.')
      reload()
    }
  }

  async function removeUser(u: AppUserRow) {
    if (u.user_id === meId) return // never remove yourself (the button is hidden too)
    const label = u.display_name || 'this login'
    if (
      !window.confirm(
        `Remove ${label}?\n\nThey'll lose all access to Lodestar and disappear from this list. Their sign-in still exists but can't get in until you re-add them.`,
      )
    )
      return
    if (await deleteUser(u.user_id)) {
      setUsers((prev) => prev.filter((x) => x.user_id !== u.user_id))
      // Drop their name from the shared "Assign to" list too — unless another
      // remaining login happens to share that exact name.
      const name = (u.display_name || '').trim()
      if (name) {
        const stillUsed = users.some(
          (x) => x.user_id !== u.user_id && x.display_name.trim().toLowerCase() === name.toLowerCase(),
        )
        if (!stillUsed) setAssignees(assignees.filter((a) => a.toLowerCase() !== name.toLowerCase()))
      }
      note(`Removed ${label}.`)
    } else {
      note('Could not remove that login (is the RBAC migration in place?).')
    }
  }

  // Active projects make the assignment list manageable (skip C.O./Hold).
  const assignable = roster.filter((p) => p.listStatus !== 'CO' && p.listStatus !== 'Hold')

  return (
    <section className="detail people-view">
      <h2 className="detail-title">👥 People &amp; access</h2>
      <p className="meta">
        Set each login's role and — for project managers and investors — which projects they can see.
        Changes save automatically.
      </p>
      {flash && <div className="banner duke-next">{flash}</div>}

      {loading ? (
        <p className="summary">Loading people…</p>
      ) : users.length === 0 ? (
        <p className="summary">
          No logins to manage yet. Create a login in the Supabase dashboard (Authentication → Add user),
          then it'll appear here to assign a role.
        </p>
      ) : (
        <div className="people-list">
          {users.map((u) => {
            const cfg = ROLES[normalizeRole(u.role)]
            return (
              <div key={u.user_id} className="person card">
                <div className="person-head">
                  {/* Editable display name — saves on blur or Enter. */}
                  <input
                    className="person-name-input"
                    defaultValue={u.display_name || ''}
                    placeholder="(unnamed login)"
                    title="Edit this person's display name"
                    onBlur={(e) => changeName(u, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    }}
                  />
                  <div className="person-head-right">
                    <label className="person-role">
                      Role
                      <select value={u.role} onChange={(e) => changeRole(u, e.target.value)}>
                        {ROLE_ORDER.map((r) => (
                          <option key={r} value={r}>
                            {ROLES[r].label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {/* You can't remove your own login (that would lock you out). */}
                    {u.user_id === meId ? (
                      <span className="person-you" title="This is your own login — you can't remove yourself">
                        You
                      </span>
                    ) : (
                      <button
                        className="person-remove"
                        title={`Remove ${u.display_name || 'this login'} from Lodestar`}
                        onClick={() => removeUser(u)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <p className="person-desc muted">{cfg.description}</p>

                {cfg.scopedToAssignedProjects && (
                  <div className="person-projects">
                    <div className="tpl-preview-h">Assigned projects</div>
                    <div className="person-proj-grid">
                      {assignable.map((p) => {
                        const on = (access[u.user_id] ?? []).includes(p.id)
                        return (
                          <label key={p.id} className={'person-proj' + (on ? ' on' : '')}>
                            <input type="checkbox" checked={on} onChange={() => toggleProject(u, p.id)} />
                            {p.address}
                          </label>
                        )
                      })}
                    </div>
                    {(access[u.user_id] ?? []).length === 0 && (
                      <p className="muted">No projects assigned — this person sees nothing until you pick at least one.</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="people-add card">
        <div className="tpl-preview-h">Invite a teammate</div>
        <p className="meta">
          Enter their email + role. They get an email with a link to set their own password, then appear in the
          list above — promote or adjust them any time.
        </p>
        <div className="invite-row">
          <input
            type="email"
            className="invite-email"
            placeholder="name@ironshieldconstruction.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <input
            className="invite-name"
            placeholder="Name (optional)"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
          />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
            {INVITABLE.map((r) => (
              <option key={r} value={r}>
                {ROLES[r].label}
              </option>
            ))}
          </select>
          <button className="btn btn-primary btn-sm" onClick={sendInvite} disabled={inviting || !inviteEmail.trim()}>
            {inviting ? 'Sending…' : 'Send invite'}
          </button>
        </div>
        <p className="muted">
          Needs email set up in Supabase (custom SMTP) to actually send. Until then, create the login in the Supabase
          dashboard — the new account still auto-appears here as “Pending.”
        </p>
      </div>
    </section>
  )
}

export default PeopleView
