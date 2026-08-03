#!/usr/bin/env python3
"""
Iron Shield Construction LLC — Selections Sheet generator

Pulls a completed "Home Build Selections Form" response from Typeform and
turns it into a one-page, signature-ready PDF on Iron Shield letterhead.
Print it for wet-ink signing, or upload the PDF to DocuSign.

Usage (run from anywhere):
  python3 scanner/selections-sheet.py            # newest response -> PDF on Desktop
  python3 scanner/selections-sheet.py --list     # show recent responses + their ids
  python3 scanner/selections-sheet.py --response <id>   # a specific response
  python3 scanner/selections-sheet.py --demo     # sample data (no API token needed)

Setup (one time): add a line to scanner/.env
  TYPEFORM_TOKEN=tfp_xxx...        (Typeform: Account -> Personal tokens,
                                    scopes: Forms read + Responses read)
"""

import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime

# ------------------------------------------------------------------ config ---
FORM_ID = "YgjykVI0"  # "Home Build Selections Form"
ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
LOGO_PATH = "/Users/Construction/Documents/Claude/iron_shield_logo.png"
LOGO_AR = 512 / 446  # logo width / height

# Client-facing docs use the Belleview office address (NOT the PO box).
COMPANY = "Iron Shield Construction LLC"
ADDRESS = "4709 SE 102nd Pl, Unit 7, Belleview, FL 34420"
PHONE = "(352) 809-3235"
EMAIL = "office@ironshieldconstruction.com"

# Short row labels for the sheet, keyed by each question's stable "ref" id.
# If a question isn't listed here, its full title from the form is used, so
# adding new questions to the Typeform still works without touching this file.
LABELS = {
    "c20f5f44-3073-4a9a-b753-ba4e1c4268e4": None,  # Full Name  (header, not a row)
    "78b9e4c1-e83d-4f08-a2a6-1f1ba199d067": None,  # Email      (header, not a row)
    "f9d09e6e-5dcd-4c81-9b48-500670c4651c": None,  # Property   (header, not a row)
    "dfec8d57-f2b9-47c1-a879-ead897726cc3": "LVP Flooring Color",
    "1e3331ea-5da9-4dc4-ab39-d3bc03bda5d4": "Shower Wall Tile",
    "78e85e5b-7430-438f-b0ab-3118068364b3": "Shower Floor Tile",
    "3ebfed67-a981-4ea7-9283-031fbe8c2989": "Granite Countertop",
    "2baa230e-95fb-400f-bc45-bfc8920b9290": "Granite Name (client's pick)",
    "5d437c2e-64c3-42b6-87cb-52e4c5c5c272": "Cabinet Color",
    "62381ccc-b693-43f2-a510-54dab1d63e1f": "Hardware Finish",
    "0e24b336-83ab-43b9-9cf7-b81d63dd6241": "Interior Wall & Trim Paint",
    "1c394b1f-048e-4a26-9014-aa75b2f0459b": "Exterior Wall & Trim Paint",
    "b38399b9-da38-48bd-91d5-ba43746b8d71": "Notes / Custom Requests",
}
REF_NAME = "c20f5f44-3073-4a9a-b753-ba4e1c4268e4"
REF_EMAIL = "78b9e4c1-e83d-4f08-a2a6-1f1ba199d067"
REF_PROPERTY = "f9d09e6e-5dcd-4c81-9b48-500670c4651c"

POLICY = (
    "Selections beyond Iron Shield's standard options that cost more in materials or "
    "installation labor are paid by the homeowner as an upgrade. By signing below, the "
    "homeowner approves the selections listed above; changes after signing may incur "
    "additional cost and/or schedule impact."
)

DEMO = {
    "submitted_at": "2026-08-03T12:00:00Z",
    "name": "Jane Sample",
    "email": "jane@example.com",
    "property": "123 Example St, Ocala, FL",
    "rows": [
        ("LVP Flooring Color", "Tigertail"),
        ("Shower Wall Tile", "Satori Statuario (Matte)"),
        ("Shower Floor Tile", "Galvano Charcoal Mosaic"),
        ("Granite Countertop", "I have a different granite in mind"),
        ("Granite Name (client's pick)", "Baltoro Italiano (Floor & Decor) — pricing TBD"),
        ("Cabinet Color", "Mercury White"),
        ("Hardware Finish", "Matte Black"),
        ("Interior Wall & Trim Paint", "Agreeable Gray SW 7029"),
        ("Exterior Wall & Trim Paint", "Walls: Alabaster SW 7008, Trim: Iron Ore SW 7069"),
        ("Notes / Custom Requests", "Would like to discuss the master shower tile in person."),
    ],
}


# ----------------------------------------------------------- Typeform API ----
def read_token():
    """TYPEFORM_TOKEN from scanner/.env (same file the other scanner jobs use)."""
    try:
        with open(ENV_PATH) as f:
            for line in f:
                line = line.strip()
                if line.startswith("TYPEFORM_TOKEN="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return None


def api_get(path, token):
    req = urllib.request.Request(
        "https://api.typeform.com" + path,
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def answer_text(ans):
    """Flatten one Typeform answer object into a display string."""
    t = ans.get("type")
    if t == "choice":
        c = ans["choice"]
        return c.get("label") or (("Other: " + c["other"]) if c.get("other") else "")
    if t == "choices":
        c = ans["choices"]
        parts = list(c.get("labels") or [])
        if c.get("other"):
            parts.append("Other: " + c["other"])
        return ", ".join(parts)
    if t in ("text", "email", "url", "phone_number"):
        return ans.get(t, "")
    if t == "number":
        return str(ans.get("number", ""))
    if t == "boolean":
        return "Yes" if ans.get("boolean") else "No"
    if t == "date":
        return ans.get("date", "")
    return json.dumps(ans.get(t, ""))  # fallback for anything unexpected


def fetch_sheet_data(token, response_id=None):
    """Fetch the form definition + one response; return the same shape as DEMO."""
    form = api_get(f"/forms/{FORM_ID}", token)

    # ref -> title, in form order (flattening any group sub-questions)
    order, titles = [], {}

    def walk(fields):
        for fld in fields:
            if fld["type"] == "group":
                walk(fld["properties"].get("fields", []))
            else:
                order.append(fld["ref"])
                titles[fld["ref"]] = fld["title"]

    walk(form["fields"])

    query = "&before=" if not response_id else f"&included_response_ids={response_id}"
    data = api_get(f"/forms/{FORM_ID}/responses?page_size=25&completed=true", token)
    items = data.get("items", [])
    if response_id:
        items = [i for i in items if i["response_id"] == response_id]
    if not items:
        return None, order, titles
    resp = items[0]  # newest first

    by_ref = {a["field"]["ref"]: answer_text(a) for a in resp.get("answers", [])}
    rows = []
    for ref in order:
        if ref in (REF_NAME, REF_EMAIL, REF_PROPERTY):
            continue
        val = by_ref.get(ref, "").strip()
        if not val:
            continue  # skipped questions (e.g. granite name) stay off the sheet
        rows.append((LABELS.get(ref) or titles[ref], val))

    return {
        "submitted_at": resp.get("submitted_at", ""),
        "name": by_ref.get(REF_NAME, ""),
        "email": by_ref.get(REF_EMAIL, ""),
        "property": by_ref.get(REF_PROPERTY, ""),
        "rows": rows,
    }, order, titles


def list_responses(token):
    data = api_get(f"/forms/{FORM_ID}/responses?page_size=25&completed=true", token)
    items = data.get("items", [])
    if not items:
        print("No completed responses yet.")
        return
    form = api_get(f"/forms/{FORM_ID}", token)
    refs = {}

    def walk(fields):
        for fld in fields:
            if fld["type"] == "group":
                walk(fld["properties"].get("fields", []))
            else:
                refs[fld["ref"]] = fld["title"]

    walk(form["fields"])
    print(f"{'submitted':<22} {'name':<24} {'property':<30} response_id")
    for it in items:
        by_ref = {a["field"]["ref"]: answer_text(a) for a in it.get("answers", [])}
        print(
            f"{it.get('submitted_at', '')[:19]:<22} "
            f"{by_ref.get(REF_NAME, '')[:23]:<24} "
            f"{by_ref.get(REF_PROPERTY, '')[:29]:<30} "
            f"{it['response_id']}"
        )


# ------------------------------------------------------------------- PDF -----
def build_pdf(sheet, out_path):
    from reportlab.lib.colors import HexColor, white
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas

    BRAND = HexColor("#1f2a37")   # steel charcoal (matches the June form + app)
    ACCENT = HexColor("#c2410c")  # rust accent
    MIDGRAY = HexColor("#64748b")
    LINE = HexColor("#cbd5e1")
    FILLBG = HexColor("#f8fafc")
    SOFT = HexColor("#475569")

    PAGE_W, PAGE_H = letter
    L, R = 48, PAGE_W - 48
    CW = R - L

    c = canvas.Canvas(out_path, pagesize=letter)
    c.setTitle(f"{COMPANY} — Home Selections Sheet")
    c.setAuthor(COMPANY)

    # ---- letterhead band ----
    band_h = 92
    c.setFillColor(BRAND)
    c.rect(0, PAGE_H - band_h, PAGE_W, band_h, fill=1, stroke=0)
    c.setFillColor(ACCENT)
    c.rect(0, PAGE_H - band_h - 4, PAGE_W, 4, fill=1, stroke=0)
    logo_h = 58
    logo_w = logo_h * LOGO_AR
    mid = PAGE_H - band_h / 2
    try:
        c.drawImage(LOGO_PATH, L, mid - logo_h / 2, width=logo_w, height=logo_h,
                    mask="auto", preserveAspectRatio=True, anchor="w")
    except Exception:
        logo_w = 0
    tx = L + (logo_w + 16 if logo_w else 0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 17)
    c.drawString(tx, mid + 12, COMPANY.upper())
    c.setFont("Helvetica", 10.5)
    c.drawString(tx, mid - 6, "Home Selections Sheet")
    c.setFont("Helvetica", 8)
    c.drawString(tx, mid - 24, f"{ADDRESS}   ·   {PHONE}   ·   {EMAIL}")

    y = PAGE_H - band_h - 30

    # ---- client / property header ----
    sub = sheet.get("submitted_at", "")
    try:
        sub_disp = datetime.fromisoformat(sub.replace("Z", "+00:00")).strftime("%B %-d, %Y")
    except ValueError:
        sub_disp = sub
    c.setFillColor(FILLBG)
    c.setStrokeColor(LINE)
    c.roundRect(L, y - 58, CW, 58, 6, fill=1, stroke=1)
    pairs = [
        ("HOMEOWNER", sheet.get("name", "")),
        ("PROPERTY", sheet.get("property", "")),
        ("EMAIL", sheet.get("email", "")),
        ("SUBMITTED", sub_disp),
    ]
    col_w = CW / 2
    for i, (lab, val) in enumerate(pairs):
        px = L + 14 + (i % 2) * col_w
        py = y - 22 - (i // 2) * 26
        c.setFont("Helvetica-Bold", 7.5)
        c.setFillColor(MIDGRAY)
        c.drawString(px, py, lab)
        c.setFont("Helvetica", 10.5)
        c.setFillColor(BRAND)
        c.drawString(px, py - 12, val[:60])
    y -= 78

    # ---- selections table ----
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(ACCENT)
    c.drawString(L, y, "SELECTIONS")
    c.setStrokeColor(LINE)
    c.line(L + 82, y + 3, R, y + 3)
    y -= 14

    label_w = 190
    for lab, val in sheet["rows"]:
        # wrap long values onto extra lines
        c.setFont("Helvetica", 10)
        max_w = CW - label_w - 24
        words, lines, cur = val.split(), [], ""
        for w in words:
            trial = (cur + " " + w).strip()
            if c.stringWidth(trial, "Helvetica", 10) <= max_w:
                cur = trial
            else:
                lines.append(cur)
                cur = w
        lines.append(cur)
        row_h = 14 + 12 * (len(lines) - 1) + 6

        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(SOFT)
        c.drawString(L, y - 10, lab)
        c.setFont("Helvetica", 10)
        c.setFillColor(BRAND)
        for i, ln in enumerate(lines):
            c.drawString(L + label_w, y - 10 - i * 12, ln)
        c.setStrokeColor(LINE)
        c.setLineWidth(0.5)
        c.line(L, y - row_h + 4, R, y - row_h + 4)
        y -= row_h

    # ---- policy ----
    y -= 10
    c.setFont("Helvetica-Oblique", 8.5)
    c.setFillColor(SOFT)
    words, lines, cur = POLICY.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if c.stringWidth(trial, "Helvetica-Oblique", 8.5) <= CW:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    for ln in lines:
        c.drawString(L, y, ln)
        y -= 11

    # ---- signature block ----
    y -= 34
    half = CW / 2 - 18
    for i, who in enumerate(["Homeowner", COMPANY]):
        sx = L + i * (half + 36)
        c.setStrokeColor(BRAND)
        c.setLineWidth(0.8)
        c.line(sx, y, sx + half - 70, y)          # signature line
        c.line(sx + half - 60, y, sx + half, y)    # date line
        c.setFont("Helvetica", 7.5)
        c.setFillColor(MIDGRAY)
        c.drawString(sx, y - 10, who)
        c.drawString(sx + half - 60, y - 10, "Date")

    # ---- footer ----
    c.setStrokeColor(LINE)
    c.setLineWidth(0.5)
    c.line(L, 52, R, 52)
    c.setFont("Helvetica", 7)
    c.setFillColor(MIDGRAY)
    c.drawString(L, 41, f"{COMPANY}  ·  Home Selections Sheet")
    c.drawRightString(R, 41, "Distribution:  Client  ·  Job File  ·  Subcontractors")

    c.showPage()
    c.save()


# ------------------------------------------------------------------ main -----
def main():
    args = sys.argv[1:]

    if "--demo" in args:
        sheet = DEMO
    else:
        token = read_token()
        if not token:
            sys.exit(
                "No TYPEFORM_TOKEN found.\n"
                f"Add this line to {ENV_PATH}:\n"
                "  TYPEFORM_TOKEN=tfp_your_token_here\n"
                "(Typeform: typeform.com -> your account -> Personal tokens -> "
                "Generate; scopes: Forms read + Responses read.)\n"
                "Or run with --demo to see a sample sheet."
            )
        if "--list" in args:
            list_responses(token)
            return
        rid = args[args.index("--response") + 1] if "--response" in args else None
        sheet, _, _ = fetch_sheet_data(token, rid)
        if sheet is None:
            sys.exit("No completed responses found (or that response id wasn't in the "
                     "latest 25). Run --list to see what's there.")

    safe = (sheet.get("property") or sheet.get("name") or "response").replace("/", "-")
    out = os.path.expanduser(f"~/Desktop/Selections Sheet - {safe}.pdf")
    build_pdf(sheet, out)
    print(f"Wrote {out}")
    subprocess.run(["open", out], check=False)


if __name__ == "__main__":
    main()
