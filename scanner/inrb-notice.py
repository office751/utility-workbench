#!/usr/bin/env python3
"""
Iron Shield Construction LLC — INRB Notice generator

Fills the DEP "Notice" for an In-ground Nitrogen-Reducing Biofilter (INRB)
septic system — signed by the property owner, notarized, RECORDED at the
courthouse, then the stamped copy goes to DEP (via Georges Plumbing) for final
approval.

FORM VERSION: DEP form dated 9-15-26 (sent by Vicki at Georges Plumbing,
Oct 29 2026), blank at scanner/templates/INRB_NOTICE_DEP_BLANK.pdf. It replaced
the old DOH form: no lot / block / subdivision, no witnesses. We fill only
address, parcel, DEP permit # and the notary's county — owner signatures,
dates, print names and the rest of the notary block stay blank for wet ink.

Where the data comes from:
  - address, parcel             -> the LIVE app roster (Supabase blob, READ-ONLY)
  - septic (DEP) permit number  -> the app's saved septicPermit, or --permit
  - notary county               -> "Marion", or --county

Usage (run from anywhere):
  python3 scanner/inrb-notice.py --list
      Show every house whose septic system is marked INRB in the app, and
      whether its "recorded notice" checklist step is done yet.

  python3 scanner/inrb-notice.py <address fragment> --permit 42-S1-XXXXXXX
      e.g.  python3 scanner/inrb-notice.py "Rainbow Lakes" --permit 42-SW-5167236
      Optional: --county Sumter      (only if notarized outside Marion)
                --yes                (skip the confirm prompt)
      --permit can be left off when the app already has the house's permit #.

  python3 scanner/inrb-notice.py --demo
      Fill a sample (20073 SW Rainbow Lakes Blvd, no Supabase needed) —
      useful to eyeball that the field positions still line up.

Output: ~/Desktop/INRB_NOTICE_<permit>.pdf  (matches the archive's naming)
"""

import json
import os
import re
import subprocess
import sys
import urllib.request

# ------------------------------------------------------------------ config ---
HERE = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(HERE, ".env")
TEMPLATE = os.path.join(HERE, "templates", "INRB_NOTICE_DEP_BLANK.pdf")

# Where each value gets typed on the page (PDF points, origin = bottom-left).
# Measured from the label positions on the DEP 9-15-26 blank (no county-accepted
# filled example of this version yet). Page is US Letter, 612 x 792.
# SAME TABLE as src/lib/inrbNotice.ts — keep them in sync.
#           (x,   y,     font size, max width before we shrink the font)
FIELD_POS = {
    "address": (122, 685,   11, 380),  # Address ____
    "parcel":  (130, 660,   11, 375),  # Parcel ID#____
    "permit":  (126, 498.5, 11, 140),  # "...permit number for the system is ____."
    "county":  (324, 217.5, 10, 46),   # notary venue: COUNTY OF ____
    # No owner name on purpose: owners print + sign by hand (Adam, Oct 21 2026).
}

DEMO = {  # a real recorded INRB house (Oct 29 2026), for eyeballing positions
    "address": "20073 SW Rainbow Lakes Blvd, Dunnellon, FL 34431",
    "parcel": "1801-015-076",
    "permit": "42-SW-5167236",
    "county": "Marion",
}


# ------------------------------------------------------------- data access ---
def read_env():
    """SUPABASE_URL + SUPABASE_SERVICE_KEY from scanner/.env (gitignored)."""
    vals = {}
    try:
        with open(ENV_PATH) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    vals[k.strip()] = v.strip()
    except FileNotFoundError:
        sys.exit(f"scanner/.env not found ({ENV_PATH}) — can't reach the app's data.")
    url, key = vals.get("SUPABASE_URL"), vals.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_KEY missing from scanner/.env")
    return url.rstrip("/"), key


def fetch_blob():
    """The whole workbench blob. READ-ONLY — this script never writes it."""
    url, key = read_env()
    req = urllib.request.Request(
        f"{url}/rest/v1/workbench?id=eq.main&select=data",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        rows = json.load(r)
    blob = rows and rows[0].get("data")
    if not blob or not isinstance(blob.get("roster"), list) or not blob["roster"]:
        sys.exit("Could not read a healthy workbench blob — aborting.")
    return blob


def find_project(blob, fragment):
    """Case-insensitive substring match on roster addresses. One hit or bust."""
    frag = fragment.lower()
    hits = [p for p in blob["roster"] if frag in p.get("address", "").lower()]
    if not hits:
        sys.exit(f'No roster address contains "{fragment}".')
    if len(hits) > 1:
        print(f'"{fragment}" matches {len(hits)} houses — be more specific:')
        for p in hits:
            print(f"   #{p['id']}  {p['address']}")
        sys.exit(1)
    return hits[0]


def address_line(p):
    """"20073 SW Rainbow Lakes Blvd, Dunnellon, FL 34431" — blanks dropped.
    Same rule as inrbAddressLine() in src/lib/inrbNotice.ts."""
    state_zip = " ".join(x for x in ("FL", (p.get("zip") or "").strip()) if x)
    parts = ((p.get("address") or "").strip(), (p.get("city") or "").strip(), state_zip)
    return ", ".join(x for x in parts if x)


# ------------------------------------------------------------------- PDF -----
def build_pdf(values, out_path):
    """Overlay the values onto the official DEP blank and save."""
    import io

    from pypdf import PdfReader, PdfWriter
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfbase.pdfmetrics import stringWidth
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    for key, (x, y, size, max_w) in FIELD_POS.items():
        text = (values.get(key) or "").strip()
        if not text:
            continue
        # Shrink long text down to 7pt rather than run past the blank line.
        while size > 7 and stringWidth(text, "Helvetica", size) > max_w:
            size -= 0.5
        c.setFont("Helvetica", size)
        c.drawString(x, y, text)
    c.save()
    buf.seek(0)

    base = PdfReader(TEMPLATE)
    page = base.pages[0]
    page.merge_page(PdfReader(buf).pages[0])
    writer = PdfWriter()
    writer.add_page(page)
    with open(out_path, "wb") as f:
        writer.write(f)


# ------------------------------------------------------------------- main ----
def list_inrb(blob):
    projects = blob.get("projects") or {}
    rows = []
    for p in blob["roster"]:
        ps = projects.get(str(p["id"])) or projects.get(p["id"]) or {}
        if ps.get("septicSystem") == "INRB":
            done = bool(((ps.get("steps") or {}).get("septic") or {})
                        .get("snrb", {}).get("done"))
            rows.append((p, done))
    if not rows:
        print("No houses are marked INRB in the app (⚙️ Settings → septic system).")
        return
    print(f"{len(rows)} INRB house(s):")
    for p, done in rows:
        mark = "✅ notice step done" if done else "◻️ notice NOT done"
        print(f"   #{p['id']:>3}  {p['address']:<38} {mark}")


def main():
    args = sys.argv[1:]
    if not args or "--help" in args or "-h" in args:
        print(__doc__)
        return

    def flag(name):
        return args[args.index(name) + 1] if name in args else None

    if "--demo" in args:
        out = os.path.expanduser(f"~/Desktop/INRB_NOTICE_{DEMO['permit']}_DEMO.pdf")
        build_pdf(DEMO, out)
        print(f"Wrote {out}")
        subprocess.run(["open", out], check=False)
        return

    blob = fetch_blob()
    if "--list" in args:
        list_inrb(blob)
        return

    fragment = next((a for a in args if not a.startswith("--")
                     and a not in (flag("--permit"), flag("--county"))), None)
    if not fragment:
        sys.exit("Give me part of the address, e.g.:  inrb-notice.py \"Rainbow Lakes\" --permit 42-S1-...")

    p = find_project(blob, fragment)
    projects = blob.get("projects") or {}
    ps = projects.get(str(p["id"])) or projects.get(p["id"]) or {}

    permit = flag("--permit") or (ps.get("septicPermit") or "").strip()
    if not permit:
        sys.exit("No permit # saved in the app for this house — pass --permit (the DEP septic\n"
                 "construction permit, e.g. 42-S1-5167182, from the septic permit paperwork).")

    if ps.get("septicSystem") != "INRB":
        print(f"⚠️  {p['address']} is NOT marked INRB in the app "
              f"(septic system = {ps.get('septicSystem') or 'not set'}).")
        print("   Check the soil test — this notice is only for INRB systems.")

    values = {
        "address": address_line(p),
        "parcel": (p.get("parcel") or "").strip(),
        "permit": permit.strip(),
        "county": flag("--county") or "Marion",
    }

    print(f"\nINRB notice (DEP form 9-15-26) for {p['address']}:")
    print(f"   ADDRESS:       {values['address']}")
    print(f"   PARCEL ID#:    {values['parcel']}")
    print(f"   DEP PERMIT:    {values['permit']}")
    print(f"   NOTARY COUNTY: {values['county']}")
    print("   OWNER:         (left blank — owner prints, signs + dates by hand)")

    if "--yes" not in args:
        if input("\nGenerate the PDF? [y/N] ").strip().lower() not in ("y", "yes"):
            print("Cancelled — nothing written.")
            return

    safe = re.sub(r"[^A-Za-z0-9._-]", "_", values["permit"])
    out = os.path.expanduser(f"~/Desktop/INRB_NOTICE_{safe}.pdf")
    build_pdf(values, out)
    print(f"\nWrote {out}")
    print("Next: owner signs + dates in front of a notary, record it at the courthouse,")
    print("send the stamped copy to Georges Plumbing, and check off the step on the Septic tab.")
    subprocess.run(["open", out], check=False)


if __name__ == "__main__":
    main()
