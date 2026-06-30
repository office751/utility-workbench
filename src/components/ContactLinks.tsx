/**
 * ContactLinks.tsx — the 📞 call and ✉ email buttons in the detail view.
 *
 * These are ordinary <a> links with special URL schemes the OS understands:
 *   tel:+13525699594     → opens the phone app (FaceTime on Mac, dialer on phone)
 *   mailto:...?subject=…&body=…  → opens a pre-filled draft in your mail app
 *
 * encodeURIComponent() makes text safe to embed in a URL (spaces, newlines,
 * “&” etc. would otherwise break it).
 *
 * Which buttons appear depends on the tab + the project's utility/source —
 * same behavior as the original workbench.
 */
import type { Project, ProjectState, Stream } from '../types'
import type { UtilityCompany } from '../data/utilities'
import { septicSourceOf, utilityOf, waterSourceOf } from '../lib/nextAction'
import { GEORGES, MARION_PERMITTING, MCU, OFFICE_CC, SECO_EMAIL, UTILITY_PHONES } from '../data/contacts'
import { dukeOfficeEmail } from '../lib/loadForm'

interface Props {
  stream: Stream
  p: Project
  ps: ProjectState
  /** Owner-editable EXTRA utility companies (Settings → Utility companies
   *  setup) — contact-only fallbacks beyond the built-in SECO/Duke/Clay/MCU/
   *  Georges, used when a project's utility/water/sewer points at one. */
  utilities: UtilityCompany[]
}

/** "352-307-6000" → "tel:+13523076000" (strip everything but digits). */
function tel(phone: string): string {
  return 'tel:+1' + phone.replace(/\D/g, '')
}

/** Build a mailto: URL with pre-filled subject, body, and optional cc. */
function mailto(to: string, subject: string, body: string, cc?: string): string {
  const params = new URLSearchParams()
  if (cc) params.set('cc', cc)
  params.set('subject', subject)
  params.set('body', body)
  // URLSearchParams encodes spaces as "+", but mail apps want "%20":
  return `mailto:${to}?${params.toString().replace(/\+/g, '%20')}`
}

function ContactLinks({ stream, p, ps, utilities }: Props) {
  const addrFull = `${p.address}, ${p.city}, FL ${p.zip}`
  const links: { href: string; label: string }[] = []

  if (stream === 'electric') {
    const u = utilityOf(p, ps)
    const phone = u ? UTILITY_PHONES[u] : undefined
    if (phone) links.push({ href: tel(phone), label: `📞 Call ${u} — ${phone}` })

    // Not one of the built-ins (SECO/Duke/Clay all have a phone above) — see
    // if `u` is a custom roster id from Settings → Utility companies setup,
    // and if so, give it the same call/email buttons Clay would've gotten.
    if (!phone && u) {
      const extra = utilities.find((x) => x.kind === 'electric' && x.id === u)
      if (extra) {
        if (extra.phone) links.push({ href: tel(extra.phone), label: `📞 Call ${extra.name} — ${extra.phone}` })
        if (extra.email) {
          links.push({
            href: mailto(
              extra.email,
              `New Construction Application – ${addrFull}`,
              `Hello${extra.contact ? ` ${extra.contact.split(' ')[0]}` : ''},\n\nWe'd like to apply for new construction electric service at ${addrFull} (parcel ${p.parcel}).\n\nAccount holder: Iron Shield Construction LLC`,
            ),
            label: `✉️ Email ${extra.name}`,
          })
        }
      }
    }

    if (u === 'SECO') {
      links.push({
        href: mailto(
          SECO_EMAIL,
          `New Construction Application – ${addrFull}`,
          `Hello,\n\nWe'd like to apply for new construction electric service at ${addrFull} (parcel ${p.parcel}). The completed load form and site plan are attached.\n\nAccount holder: Iron Shield Construction LLC`,
        ),
        label: '✉️ Email SECO',
      })
    }
    if (u === 'DUKE') {
      // Route to the project's EDA office (Ocala/Inverness, per ps.dukeOffice)
      // via the same shared helper Batch Apply uses — never a hardcoded office.
      links.push({
        href: mailto(
          dukeOfficeEmail(ps),
          (p.workOrder ? `WO#${p.workOrder} - ` : 'New Service - ') + addrFull,
          `Hi,\n\nAttached is the completed Residential Service Information Form and site plan for ${addrFull}${p.workOrder ? ` (WO#${p.workOrder})` : ''}.`,
        ),
        label: '✉️ Email Duke',
      })
    }
  }

  if (stream === 'water') {
    const s = waterSourceOf(p, ps)
    if (s === 'City' || s === 'CityWM') {
      // ps.waterCompanyId (set in ⚙️ Settings) overrides the default MCU
      // contact with a custom roster entry — but only if it actually
      // resolves to one; otherwise fall through to MCU exactly as before.
      const extra = ps.waterCompanyId
        ? utilities.find((u) => u.kind === 'water' && u.id === ps.waterCompanyId)
        : undefined
      if (extra) {
        if (extra.phone) links.push({ href: tel(extra.phone), label: `📞 Call ${extra.name} — ${extra.phone}` })
        if (extra.email) {
          links.push({
            href: mailto(
              extra.email,
              `Start Water Service - ${p.address}, ${p.city}${p.permit ? `  ${p.permit}` : ''}`,
              `Hi${extra.contact ? ` ${extra.contact.split(' ')[0]}` : ''},\n\nWe'd like to start water service for the new-construction home below. Account holder: Iron Shield Construction LLC.\n\nService address: ${addrFull}\nParcel ID: ${p.parcel}${p.permit ? `\nPermit #: ${p.permit}` : ''}\n\nPlease let me know what paperwork and capacity/meter charges are needed to proceed.`,
              OFFICE_CC,
            ),
            label: `✉️ Email ${extra.name}${extra.contact ? ` (${extra.contact})` : ''}`,
          })
        }
      } else {
        links.push({ href: tel(MCU.phone), label: `📞 Call MCU — ${MCU.phone}` })
        links.push({
          href: mailto(
            MCU.email,
            `Start Water Service - ${p.address}, ${p.city}${p.permit ? `  ${p.permit}` : ''}`,
            `Hi ${MCU.contact.split(' ')[0]},\n\nWe'd like to start water service for the new-construction home below. Account holder: Iron Shield Construction LLC.\n\nService address: ${addrFull}\nParcel ID: ${p.parcel}${p.permit ? `\nPermit #: ${p.permit}` : ''}\n\nPlease let me know what paperwork and capacity/meter charges are needed to proceed.`,
            OFFICE_CC,
          ),
          label: `✉️ Email MCU (${MCU.contact})`,
        })
      }
    }
  }

  if (stream === 'septic') {
    // ps.sewerCompanyId (set in ⚙️ Settings) overrides the default
    // Georges/MCU contact with a custom roster entry — only if it resolves;
    // otherwise fall through to today's exact Georges/MCU behavior.
    const extra = ps.sewerCompanyId
      ? utilities.find((u) => u.kind === 'sewer' && u.id === ps.sewerCompanyId)
      : undefined
    if (extra) {
      if (extra.phone) links.push({ href: tel(extra.phone), label: `📞 Call ${extra.name} — ${extra.phone}` })
      if (extra.email) {
        links.push({
          href: mailto(
            extra.email,
            `Septic - ${p.address}, ${p.city}${p.permit ? `  ${p.permit}` : ''}`,
            `Hi${extra.contact ? ` ${extra.contact.split(' ')[0]}` : ''},\n\nUpdate on ${addrFull} (parcel ${p.parcel}${p.permit ? `, permit ${p.permit}` : ''}).\n\n[ well installed / water line hooked up / SOD laid / recorded NRB notice attached ]`,
            OFFICE_CC,
          ),
          label: `✉️ Email ${extra.name}${extra.contact ? ` (${extra.contact})` : ''}`,
        })
      }
    } else if (septicSourceOf(ps) === 'Septic') {
      links.push({ href: tel(GEORGES.phone), label: `📞 Call Georges Plumbing — ${GEORGES.phone}` })
      links.push({
        href: mailto(
          GEORGES.email,
          `Septic - ${p.address}, ${p.city}${p.permit ? `  ${p.permit}` : ''}`,
          `Hi ${GEORGES.contact.split(' ')[0]},\n\nUpdate on ${addrFull} (parcel ${p.parcel}${p.permit ? `, permit ${p.permit}` : ''}).\n\n[ well installed / water line hooked up / SOD laid / recorded NRB notice attached ]`,
          OFFICE_CC,
        ),
        label: `✉️ Email ${GEORGES.contact} (Georges)`,
      })
    } else {
      links.push({ href: tel(MCU.phone), label: `📞 Call MCU — ${MCU.phone}` })
    }
  }

  if (stream === 'permit') {
    links.push({
      href: tel(MARION_PERMITTING.phone),
      label: `📞 Call ${MARION_PERMITTING.name} — ${MARION_PERMITTING.phone}`,
    })
  }

  if (links.length === 0) return null
  return (
    <div className="contact-row">
      {links.map((l) => (
        <a key={l.label} className="contact" href={l.href}>
          {l.label}
        </a>
      ))}
    </div>
  )
}

export default ContactLinks
