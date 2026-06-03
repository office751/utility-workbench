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
import { septicSourceOf, utilityOf, waterSourceOf } from '../lib/nextAction'
import { DUKE_EMAIL, GEORGES, MCU, OFFICE_CC, SECO_EMAIL, SIGNATURE, UTILITY_PHONES } from '../data/contacts'

interface Props {
  stream: Stream
  p: Project
  ps: ProjectState
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

function ContactLinks({ stream, p, ps }: Props) {
  const addrFull = `${p.address}, ${p.city}, FL ${p.zip}`
  const links: { href: string; label: string }[] = []

  if (stream === 'electric') {
    const u = utilityOf(p, ps)
    const phone = u ? UTILITY_PHONES[u] : undefined
    if (phone) links.push({ href: tel(phone), label: `📞 Call ${u} — ${phone}` })

    if (u === 'SECO') {
      links.push({
        href: mailto(
          SECO_EMAIL,
          `New Construction Application – ${addrFull}`,
          `Hello,\n\nWe'd like to apply for new construction electric service at ${addrFull} (parcel ${p.parcel}). The completed load form and site plan are attached.\n\nAccount holder: Iron Shield Construction LLC\n\n${SIGNATURE}`,
        ),
        label: '✉ Email SECO',
      })
    }
    if (u === 'DUKE') {
      links.push({
        href: mailto(
          DUKE_EMAIL,
          (p.workOrder ? `WO#${p.workOrder} - ` : 'New Service - ') + addrFull,
          `Hi,\n\nAttached is the completed Residential Service Information Form and site plan for ${addrFull}${p.workOrder ? ` (WO#${p.workOrder})` : ''}.\n\n${SIGNATURE}`,
        ),
        label: '✉ Email Duke',
      })
    }
  }

  if (stream === 'water') {
    const s = waterSourceOf(p, ps)
    if (s === 'City' || s === 'CityWM') {
      links.push({ href: tel(MCU.phone), label: `📞 Call MCU — ${MCU.phone}` })
      links.push({
        href: mailto(
          MCU.email,
          `Start Water Service - ${p.address}, ${p.city}${p.permit ? `  ${p.permit}` : ''}`,
          `Hi ${MCU.contact.split(' ')[0]},\n\nWe'd like to start water service for the new-construction home below. Account holder: Iron Shield Construction LLC.\n\nService address: ${addrFull}\nParcel ID: ${p.parcel}${p.permit ? `\nPermit #: ${p.permit}` : ''}\n\nPlease let me know what paperwork and capacity/meter charges are needed to proceed.\n\n${SIGNATURE}`,
          OFFICE_CC,
        ),
        label: `✉ Email MCU (${MCU.contact})`,
      })
    }
  }

  if (stream === 'septic') {
    if (septicSourceOf(ps) === 'Septic') {
      links.push({ href: tel(GEORGES.phone), label: `📞 Call Georges Plumbing — ${GEORGES.phone}` })
      links.push({
        href: mailto(
          GEORGES.email,
          `Septic - ${p.address}, ${p.city}${p.permit ? `  ${p.permit}` : ''}`,
          `Hi ${GEORGES.contact.split(' ')[0]},\n\nUpdate on ${addrFull} (parcel ${p.parcel}${p.permit ? `, permit ${p.permit}` : ''}).\n\n[ well installed / water line hooked up / SOD laid / recorded NRB notice attached ]\n\n${SIGNATURE}`,
          OFFICE_CC,
        ),
        label: `✉ Email ${GEORGES.contact} (Georges)`,
      })
    } else {
      links.push({ href: tel(MCU.phone), label: `📞 Call MCU — ${MCU.phone}` })
    }
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
