/**
 * Dashboard.tsx — "what needs doing across ALL projects?" — per tab.
 *
 * Three dashboards (electric / water / septic), one per stream, sharing the
 * same building blocks: a Tile (clickable project card) and a Bucket (a
 * titled card full of tiles that hides itself when empty). The bucket
 * definitions mirror the original workbench exactly.
 */
import type { ReactNode } from 'react'
import type { Project, ProjectState } from '../types'
import {
  engineerOf,
  isPermitDone,
  isSepticDone,
  nextElectricAction,
  nextPermitAction,
  nextSepticAction,
  nextWaterAction,
  permitResponsibleOf,
  septicSourceOf,
  septicSystemOf,
  waterSourceOf,
} from '../lib/nextAction'
import { shutoffFor } from '../lib/shutoff'
import { permitExpiryFor } from '../lib/permitExpiry'
import { ordersOf } from '../lib/orders'
import type { OrderStatus, Stream } from '../types'
import { PermitBadge, SepticBadge, UtilityBadge, WaterBadge } from './Badges'

interface Props {
  stream: Stream
  projects: Project[] // the live roster from saved state
  getProjectState: (id: number) => ProjectState
  onSelect: (id: number) => void
}

/** One project + its saved state, computed once and passed around. */
interface Row {
  p: Project
  ps: ProjectState
}

/* ---------- shared building blocks ---------- */

function Tile({ row, badge, sub, onSelect }: { row: Row; badge: ReactNode; sub?: string; onSelect: (id: number) => void }) {
  return (
    <div className="tile" onClick={() => onSelect(row.p.id)}>
      <div className="tile-addr">{row.p.address}</div>
      <div className="tile-meta">
        {row.p.model} · {row.p.subdivision}
      </div>
      <div className="tile-badges">
        {badge}
        {sub && <span className="muted">{sub}</span>}
      </div>
    </div>
  )
}

function Bucket({ title, items }: { title: string; items: ReactNode[] }) {
  if (items.length === 0) return null // empty buckets vanish
  return (
    <div className="card">
      <h3>
        {title} ({items.length})
      </h3>
      <div className="tiles">{items}</div>
    </div>
  )
}

/* ---------- the per-stream dashboards ---------- */

function Dashboard({ stream, projects, getProjectState, onSelect }: Props) {
  // All rows, computed once for whichever dashboard renders below.
  const rows: Row[] = projects.map((p) => ({ p, ps: getProjectState(p.id) }))

  if (stream === 'electric') return <ElectricDashboard rows={rows} onSelect={onSelect} />
  if (stream === 'water') return <WaterDashboard rows={rows} onSelect={onSelect} />
  if (stream === 'permit') return <PermitDashboard rows={rows} onSelect={onSelect} />
  if (stream === 'materials') return <MaterialsDashboard rows={rows} onSelect={onSelect} />
  return <SepticDashboard rows={rows} onSelect={onSelect} />
}

interface DashProps {
  rows: Row[]
  onSelect: (id: number) => void
}

function ElectricDashboard({ rows, onSelect }: DashProps) {
  const next = (r: Row) => nextElectricAction(r.p, r.ps)
  const byKey = (key: string) => rows.filter((r) => next(r).key === key)

  const shutoffSoon = rows
    .map((r) => ({ r, so: shutoffFor(r.ps) }))
    .filter((x) => x.so !== null && x.so.daysLeft <= 10)
    .sort((a, b) => a.so!.daysLeft - b.so!.daysLeft)

  const other = rows.filter((r) => ['deposit', 'power'].includes(next(r).key))

  const ut = (r: Row) => <UtilityBadge p={r.p} ps={r.ps} />
  const tile = (r: Row, badge: ReactNode, sub?: string) => (
    <Tile key={r.p.id} row={r} badge={badge} sub={sub} onSelect={onSelect} />
  )

  return (
    <section className="detail dashboard">
      <h2>⚑ Electric dashboard</h2>
      <p className="meta">What needs doing across all active projects — click any tile to open it.</p>

      <Bucket
        title="⏰ Electric shut-off due (≤10 days)"
        items={shutoffSoon.map(({ r, so }) =>
          tile(
            r,
            <span className={so!.daysLeft <= 7 ? 'due' : 'warn'}>
              ⏰ {so!.daysLeft < 0 ? 'OVERDUE' : `${so!.daysLeft}d`} · {so!.date}
            </span>,
          ),
        )}
      />
      <Bucket
        title="🔴 Verify utility before applying"
        items={byKey('verify').map((r) => tile(r, <span className="due">⚠ verify</span>))}
      />
      <Bucket title="🟢 Ready to apply" items={byKey('apply').map((r) => tile(r, ut(r)))} />
      <Bucket
        title="⛔ Needs a house number"
        items={byKey('addr').map((r) => tile(r, <span className="muted">TBD address</span>))}
      />
      <Bucket title="🔔 Rough-plumbing notice due" items={byKey('rough').map((r) => tile(r, ut(r)))} />
      <Bucket title="🛠 Awaiting field work / meter" items={byKey('field').map((r) => tile(r, ut(r)))} />
      <Bucket
        title="⚙️ Awaiting engineer"
        items={byKey('eng').map((r) => tile(r, ut(r), engineerOf(r.p, r.ps)))}
      />
      <Bucket title="… Other in-progress" items={other.map((r) => tile(r, ut(r), next(r).label))} />
    </section>
  )
}

function WaterDashboard({ rows, onSelect }: DashProps) {
  const src = (r: Row) => waterSourceOf(r.p, r.ps)
  const dn = (r: Row, id: string) => Boolean(r.ps.steps.water[id]?.done)
  const isCity = (r: Row) => src(r) === 'City' || src(r) === 'CityWM'

  const unknown = rows.filter((r) => !src(r))
  const cityApply = rows.filter((r) => isCity(r) && !dn(r, 'capply'))
  const wmPending = rows.filter((r) => src(r) === 'CityWM' && !dn(r, 'cwmbuilt'))
  const wellPending = rows.filter((r) => src(r) === 'Well' && !dn(r, 'wdrilled'))
  const cityConn = rows.filter((r) => isCity(r) && dn(r, 'capply') && !dn(r, 'cconn'))

  const tile = (r: Row) => (
    <Tile
      key={r.p.id}
      row={r}
      badge={<WaterBadge p={r.p} ps={r.ps} />}
      sub={nextWaterAction(r.p, r.ps).label}
      onSelect={onSelect}
    />
  )

  return (
    <section className="detail dashboard">
      <h2>💧 Water dashboard</h2>
      <p className="meta">Source, application, well install, and main-extension status. Click a tile to open it.</p>

      <Bucket title="🔴 Set water source" items={unknown.map(tile)} />
      <Bucket title="🚰 City water — application needed" items={cityApply.map(tile)} />
      <Bucket title="🛠 Water-main extension pending" items={wmPending.map(tile)} />
      <Bucket title="⛏ Well — not yet installed" items={wellPending.map(tile)} />
      <Bucket title="🔧 City water — finish connection" items={cityConn.map(tile)} />
    </section>
  )
}

function SepticDashboard({ rows, onSelect }: DashProps) {
  const dn = (r: Row, id: string) => Boolean(r.ps.steps.septic[id]?.done)
  const septic = rows.filter((r) => septicSourceOf(r.ps) === 'Septic')

  const needPermit = septic.filter((r) => !dn(r, 'sissued'))
  const needCounty = septic.filter((r) => dn(r, 'sissued') && !dn(r, 'scounty'))
  const needNrb = septic.filter(
    (r) => septicSystemOf(r.ps) === 'INRB' && dn(r, 'scounty') && !dn(r, 'snrb'),
  )
  const needInstall = septic.filter((r) => dn(r, 'scounty') && !dn(r, 'sinstalled'))
  const needNotify = septic.filter(
    (r) => dn(r, 'sinstalled') && !(dn(r, 'snwell') && dn(r, 'snwater') && dn(r, 'snsod')),
  )
  const needApproval = septic.filter((r) => dn(r, 'sinstalled') && !dn(r, 'sapproved'))
  const sewerOpen = rows.filter((r) => septicSourceOf(r.ps) === 'Sewer' && !isSepticDone(r.ps))

  const tile = (r: Row) => (
    <Tile
      key={r.p.id}
      row={r}
      badge={<SepticBadge ps={r.ps} />}
      sub={nextSepticAction(r.ps).label}
      onSelect={onSelect}
    />
  )

  return (
    <section className="detail dashboard">
      <h2>🚽 Septic / sewer dashboard</h2>
      <p className="meta">DEP permit → County → install → Georges Plumbing notifications → final approval.</p>

      <Bucket title="📝 DEP permit — apply / get issued" items={needPermit.map(tile)} />
      <Bucket title="🏛 Submit issued permit to County" items={needCounty.map(tile)} />
      <Bucket title="📄 Send recorded NRB notice to Georges Plumbing" items={needNrb.map(tile)} />
      <Bucket title="🔧 Install septic system" items={needInstall.map(tile)} />
      <Bucket title="📣 Notify Vicki (well / water / SOD)" items={needNotify.map(tile)} />
      <Bucket title="✅ Final inspection / DEP approval" items={needApproval.map(tile)} />
      <Bucket title="🚰 City sewer — in progress" items={sewerOpen.map(tile)} />
    </section>
  )
}

function PermitDashboard({ rows, onSelect }: DashProps) {
  const dn = (r: Row, id: string) => Boolean(r.ps.steps.permit[id]?.done)
  const isUs = (r: Row) => permitResponsibleOf(r.ps) === 'Us'

  // Our open permits, split by where they are in the lifecycle.
  const ours = rows.filter((r) => isUs(r) && !isPermitDone(r.ps))
  const notSubmitted = ours.filter((r) => !dn(r, 'submitted'))
  const underReview = ours.filter((r) => dn(r, 'submitted') && !dn(r, 'corrections') && !dn(r, 'approved'))
  const corrections = ours.filter((r) => dn(r, 'corrections') && !dn(r, 'approved'))
  const approvedPending = ours.filter((r) => dn(r, 'approved') && !dn(r, 'issued'))

  // Permits someone else is handling — visibility, not our action.
  const othersOpen = rows.filter((r) => !isUs(r) && !isPermitDone(r.ps))

  const tile = (r: Row) => (
    <Tile
      key={r.p.id}
      row={r}
      badge={<PermitBadge ps={r.ps} />}
      sub={nextPermitAction(r.ps).label}
      onSelect={onSelect}
    />
  )

  // Permits expiring within a week (or already expired), soonest first.
  // Shown across ALL permits — a deadline matters whoever's handling it.
  const expiring = rows
    .map((r) => ({ r, e: permitExpiryFor(r.p, r.ps) }))
    .filter((x) => x.e !== null && x.e.daysLeft <= 7)
    .sort((a, b) => a.e!.daysLeft - b.e!.daysLeft)

  return (
    <section className="detail dashboard">
      <h2>📋 Permitting dashboard</h2>
      <p className="meta">Submitted → review → corrections → approved → issued. Click a tile to open it.</p>

      <Bucket
        title="⏰ Permit expiring (≤7 days)"
        items={expiring.map(({ r, e }) => (
          <Tile
            key={r.p.id}
            row={r}
            badge={
              <span className={e!.daysLeft <= 7 ? 'due' : 'warn'}>
                ⏰ {e!.daysLeft < 0 ? 'EXPIRED' : `${e!.daysLeft}d`} · {e!.date}
              </span>
            }
            onSelect={onSelect}
          />
        ))}
      />
      <Bucket title="🔴 Not submitted" items={notSubmitted.map(tile)} />
      <Bucket title="🏛 Under county review" items={underReview.map(tile)} />
      <Bucket title="✏️ Corrections requested" items={corrections.map(tile)} />
      <Bucket title="📋 Approved — awaiting issue / pickup" items={approvedPending.map(tile)} />
      <Bucket title="👥 Handled by owner / GC" items={othersOpen.map(tile)} />
    </section>
  )
}

function MaterialsDashboard({ rows, onSelect }: DashProps) {
  // Flatten to one entry per ORDER (with its project), so the action list is
  // "things to order," not "projects." Group by status.
  type OrderRow = { r: Row; orderId: string; category: string; vendor?: string }
  const byStatus = (status: OrderStatus): OrderRow[] =>
    rows.flatMap((r) =>
      ordersOf(r.ps)
        .filter((o) => o.status === status)
        .map((o) => ({ r, orderId: o.id, category: o.category, vendor: o.vendor })),
    )

  const toOrder = byStatus('toOrder')
  const ordered = byStatus('ordered')
  const delivered = byStatus('delivered')

  // A flat clickable row (jumps to the project's Materials detail).
  const line = (or: OrderRow) => (
    <div key={or.orderId} className="orderline" onClick={() => onSelect(or.r.p.id)}>
      <span className="ol-cat">{or.category}</span>
      <span className="ol-addr">{or.r.p.address}</span>
      {or.vendor && <span className="muted">{or.vendor}</span>}
    </div>
  )

  const section = (title: string, items: OrderRow[]) =>
    items.length > 0 && (
      <div className="card">
        <h3>
          {title} ({items.length})
        </h3>
        <div className="orderlines">{items.map(line)}</div>
      </div>
    )

  const nothing = toOrder.length + ordered.length + delivered.length === 0

  return (
    <section className="detail dashboard">
      <h2>🛒 Materials dashboard</h2>
      <p className="meta">
        Capture orders up top; they land in “To order.” Click any line to open that project.
      </p>

      {nothing && <p className="muted">No orders yet — use the Quick-Add bar above to capture one.</p>}
      {section('🟠 To order', toOrder)}
      {section('📦 Ordered — awaiting delivery', ordered)}
      {section('🚚 Delivered — to install', delivered)}
    </section>
  )
}

export default Dashboard
