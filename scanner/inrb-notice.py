#!/usr/bin/env python3
"""
Iron Shield Construction LLC — INRB Notice generator

Fills the Marion County DOH "In-ground Nitrogen-Reducing Biofilter" written
notice (the one that must be signed by the property owner + two witnesses,
notarized, and RECORDED at the courthouse before DOH grants final approval).

It types onto the OFFICIAL blank form (scanner/templates/INRB_NOTICE_BLANK.pdf)
at the exact spots of the hand-filled example that already went through the
county (INRB_NOTICE_42-S1-5167182.pdf), so the output looks identical to what
worked before. Only the six data fields are filled — the owner / witness /
notary lines stay blank for wet-ink signing.

Where the data comes from:
  - parcel, subdivision, owner  -> the LIVE app roster (Supabase blob, READ-ONLY)
  - septic (DOH) permit number  -> you, via --permit (the app doesn't store it)
  - lot / block                 -> derived from the parcel number when it looks
                                   like SECTION-BLOCK-LOT (e.g. 1801-015-006 ->
                                   block 15, lot 6), or given via --lot/--block.
                                   ALWAYS double-check these two on the confirm
                                   screen — a wrong lot/block gets RECORDED.

Usage (run from anywhere):
  python3 scanner/inrb-notice.py --list
      Show every house whose septic system is marked INRB in the app, and
      whether its "recorded notice" checklist step is done yet.

  python3 scanner/inrb-notice.py <address fragment> --permit 42-S1-XXXXXXX
      e.g.  python3 scanner/inrb-notice.py "121st" --permit 42-S1-5167182
      Optional: --lot 6 --block 15   (override the parcel-derived guess)
                --owner "Somebody Else LLC"   (default: the app's ownerName,
                                               else Iron Shield Construction LLC)
                --yes                (skip the confirm prompt)

  python3 scanner/inrb-notice.py --demo
      Regenerate the known-good Rainbow Lakes example (no Supabase needed) —
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
TEMPLATE = os.path.join(HERE, "templates", "INRB_NOTICE_BLANK.pdf")
DEFAULT_OWNER = "Iron Shield Construction LLC"

# Where each value gets typed on the page (PDF points, origin = bottom-left).
# Extracted from the flattened text of the county-accepted example, so the
# output matches it exactly. Page is US Letter, 612 x 792.
#           (x,     y,     font size, max width before we shrink the font)
FIELD_POS = {
    "property_id": (142.1, 638.5, 10, 135),  # PROPERTY ID: ____ (stops at LOT:)
    "lot":         (311.8, 638.2, 11, 38),   # LOT: __
    "block":       (400.8, 638.2, 11, 55),   # BLOCK: __
    "subdivision": (140.2, 623.8, 10, 405),  # SUBDIVISION: ____
    "permit":      (160.7, 607.2, 10, 385),  # PERMIT NUMBER: ____
    "owner":       (155.6, 348.4, 12, 390),  # Property Owner: ____ (printed name)
}

DEMO = {  # the values from the known-good example
    "property_id": "1801-015-006",
    "lot": "6",
    "block": "15",
    "subdivision": "Rainbow Lakes Estates, Sec A",
    "permit": "42-S1-5167182",
    "owner": DEFAULT_OWNER,
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


def lot_block_from_parcel(parcel):
    """Marion platted-subdivision parcels read SECTION-BLOCK-LOT
    (1801-015-006 -> block 15, lot 6). A guess to confirm, never gospel."""
    m = re.fullmatch(r"\d{4,5}-(\d{3,4})-(\d{2,4})", (parcel or "").strip())
    if not m:
        return None, None
    return str(int(m.group(2))), str(int(m.group(1)))  # (lot, block)


# ------------------------------------------------------------------- PDF -----
def build_pdf(values, out_path):
    """Overlay the six values onto the official blank and save."""
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

    fragment = next((a for a in args if not a.startswith("--") and a != flag("--permit")
                     and a not in (flag("--lot"), flag("--block"), flag("--owner"))), None)
    if not fragment:
        sys.exit("Give me part of the address, e.g.:  inrb-notice.py \"121st\" --permit 42-S1-...")

    permit = flag("--permit")
    if not permit:
        sys.exit("--permit is required (the DOH septic construction permit, e.g. 42-S1-5167182).\n"
                 "It's on the DOH construction permit / soil test paperwork — the app doesn't store it.")

    p = find_project(blob, fragment)
    projects = blob.get("projects") or {}
    ps = projects.get(str(p["id"])) or projects.get(p["id"]) or {}

    if ps.get("septicSystem") != "INRB":
        print(f"⚠️  {p['address']} is NOT marked INRB in the app "
              f"(septic system = {ps.get('septicSystem') or 'not set'}).")
        print("   Check the soil test — this notice is only for INRB systems.")

    guess_lot, guess_block = lot_block_from_parcel(p.get("parcel"))
    values = {
        "property_id": (p.get("parcel") or "").strip(),
        "lot": flag("--lot") or guess_lot or "",
        "block": flag("--block") or guess_block or "",
        "subdivision": flag("--subdivision") or (p.get("subdivision") or "").strip(),
        "permit": permit.strip(),
        "owner": flag("--owner") or (ps.get("ownerName") or "").strip() or DEFAULT_OWNER,
    }

    derived = not flag("--lot") and not flag("--block") and guess_lot
    print(f"\nINRB notice for {p['address']}:")
    print(f"   PERMIT NUMBER: {values['permit']}")
    print(f"   PROPERTY ID:   {values['property_id']}")
    print(f"   LOT: {values['lot'] or '(blank)'}    BLOCK: {values['block'] or '(blank)'}"
          + ("   <- derived from the parcel #, DOUBLE-CHECK against the plat/deed" if derived else ""))
    print(f"   SUBDIVISION:   {values['subdivision']}")
    print(f"   OWNER:         {values['owner']}")
    if not values["lot"] or not values["block"]:
        print("   (no lot/block — pass --lot and --block if the property has them)")

    if "--yes" not in args:
        if input("\nGenerate the PDF? [y/N] ").strip().lower() not in ("y", "yes"):
            print("Cancelled — nothing written.")
            return

    safe = re.sub(r"[^A-Za-z0-9._-]", "_", values["permit"])
    out = os.path.expanduser(f"~/Desktop/INRB_NOTICE_{safe}.pdf")
    build_pdf(values, out)
    print(f"\nWrote {out}")
    print("Next: owner signs + 2 witnesses + notary, then record it at the courthouse")
    print("and check off the 'Recorded INRB notice' step on the Septic tab.")
    subprocess.run(["open", out], check=False)


if __name__ == "__main__":
    main()
