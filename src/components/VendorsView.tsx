/**
 * VendorsView.tsx — the 🚚 Vendors directory (reached from the header More
 * menu). A read-only reference of every supplier: what they supply, which order
 * categories they cover, and one-tap 📞 call / ✉️ email.
 *
 * This is the "who do we call for cabinets?" lookup. The per-project,
 * PRE-FILLED order emails still live on each house's 🛒 Materials tab — the
 * email here is a blank draft (no project context), since the directory is
 * global. Add/edit a supplier in data/vendors.ts and it shows up here.
 */
import { VENDORS, vendorCallHref, vendorPlainMailto } from '../data/vendors'
import { ORDER_CATEGORIES } from '../data/orders'

function VendorsView() {
  // Categories no vendor covers yet — surfaced so they're easy to fill in
  // (set a vendor's `categories` in data/vendors.ts and it lights up here +
  // on the Materials tab's one-click order button).
  const covered = new Set(VENDORS.flatMap((v) => v.categories ?? []))
  const uncovered = ORDER_CATEGORIES.filter((c) => !covered.has(c))

  return (
    <section className="vendors-view">
      <h2>🚚 Vendors</h2>
      <p className="muted">
        Your suppliers — tap to call or start an email. The pre-filled, per-house order emails live on each
        project's 🛒 Materials tab; this is the quick "who do we call for…" lookup.
      </p>

      <div className="vendor-cards">
        {VENDORS.map((v) => {
          const call = vendorCallHref(v)
          const email = vendorPlainMailto(v)
          return (
            <div key={v.id} className="vendor-card">
              <div className="vendor-card-head">
                <span className="vendor-card-icon">{v.icon}</span>
                <span className="vendor-card-name">{v.name}</span>
              </div>
              <p className="vendor-card-supplies muted">{v.supplies}</p>
              {v.categories && v.categories.length > 0 && (
                <div className="vendor-cats">
                  {v.categories.map((c) => (
                    <span key={c} className="vendor-cat-chip">
                      {c}
                    </span>
                  ))}
                </div>
              )}
              <div className="vendor-card-actions">
                {call ? (
                  <a className="contact" href={call}>
                    📞 {v.phone}
                  </a>
                ) : (
                  <span className="muted vendor-nophone">no phone on file</span>
                )}
                {email && (
                  <a className="contact" href={email}>
                    ✉️ Email{v.contact ? ` ${v.contact}` : ''}
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {uncovered.length > 0 && (
        <div className="vendor-gap">
          <h3>Categories still needing a supplier</h3>
          <p className="muted">
            No vendor covers these yet — add one in <code>data/vendors.ts</code> (set its <code>categories</code>) and
            it lights up here and on the Materials tab's one-click order button.
          </p>
          <div className="vendor-cats">
            {uncovered.map((c) => (
              <span key={c} className="vendor-cat-chip gap">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export default VendorsView
