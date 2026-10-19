#!/usr/bin/env python3
"""
cabinet-check.py — compare an FGT Cabinetry estimate against what we ordered.

"What we ordered" is either a model cabinet takeoff (the .docx we attach to the
order email — Operations/Takeoffs/Cabinets/<Model>/Cabinet Takeoff - Model X.docx)
or, for misc orders, the item list typed in the order email (same "qty) SKU" format).

  python3 scanner/cabinet-check.py ESTIMATE TAKEOFF [--finish MW] [--quiet]

ESTIMATE  = FGT estimate PDF (needs pypdf) OR a .txt dump of its text
            (the Outlook connector's read_resource on the attachment returns
            exactly that text — paste it into a .txt file).
TAKEOFF   = takeoff .docx OR a .txt with lines like "2) B24 - DBL" / "6 – B24".
            Since Oct 19 2026 the takeoffs are Word TABLES (Qty | Cabinet | Hinge,
            hinge = LH / RH / Double / Reversible / —); a table row comes out of
            docx_text() as "1 | W2136 | LH". Both formats parse, because older
            estimates must be checked against the takeoff version sent with them.
            Pass "-" to only parse + price-check the estimate.

What it checks
  1. SKU + quantity, both directions (missing / extra / wrong qty).
  2. Hinge notes (RH/LH/DBL) — the takeoff hinge must appear on the estimate line.
  3. Finish code on every line matches --finish (MW = Mercury White, VI = Venus Ivory).
  4. Unit prices vs the FGT list (2021.04 price list, MW column) — reports the
     multiplier FGT applied (26% of list in Oct 2026, 30% through 2025) and any
     line that doesn't follow it.
  5. Fees: assembly % of items, delivery, tax rate, arithmetic of the totals.

Exit code 0 = clean, 1 = findings. Pure stdlib except pypdf for PDFs.
"""
import re
import sys
import zipfile
from collections import Counter, OrderedDict
from xml.etree import ElementTree as ET

FINISHES = ('MW', 'MG', 'MC', 'ME', 'JI', 'JS', 'VI', 'VT', 'AC', 'AD')
HINGES = ('RH', 'LH', 'DBL', 'REV')

# FGT list prices (price list dated 2021.04, MW column — MW/MG/MC/ME/JI share a column).
# FGT bills a fraction of list (see the multiplier the script reports). Two SKUs
# (W361824, 3DB30) priced off a newer list in Oct 2026 — the script will flag them.
LIST_MW = {
    'W0930': 236, 'W1230': 264, 'W1530': 304, 'W1830': 344, 'W2130': 372,
    'W0936': 264, 'W1236': 304, 'W1536': 344, 'W1836': 372, 'W2136': 412,
    'W0942': 304, 'W1242': 344, 'W1542': 384, 'W1842': 436, 'W2142': 480,
    'W2430': 424, 'W2730': 452, 'W3030': 492, 'W3330': 532, 'W3630': 556,
    'W2436': 476, 'W2736': 516, 'W3036': 556, 'W3336': 584, 'W3636': 624,
    'W2442': 556, 'W2742': 596, 'W3042': 652, 'W3342': 704, 'W3642': 744,
    'W2418': 292, 'W2424': 356, 'W3012': 276, 'W3015': 304, 'W3018': 332,
    'W3021': 365, 'W3024': 384, 'W3312': 315, 'W3315': 332, 'W3321': 398,
    'W3324': 412, 'W3612': 332, 'W3615': 344, 'W3618': 372, 'W3624': 452,
    'WDC2430': 504, 'WDC2436': 572, 'WDC2442': 652, 'WDC2736': 652,
    'WES0930': 264, 'WES0936': 332, 'WES0942': 384, 'WES1230': 316, 'WES1236': 424, 'WES1242': 476,
    'W301224': 316, 'W361224': 356, 'W361824': 424, 'W362124': 464, 'W362424': 516,
    'BSR09': 492, 'B09': 264, 'B12': 384, 'B15': 424, 'B18': 464, 'B18-TR': 292,
    'B21': 492, 'B21-TR': 304, 'B24': 556, 'B27': 596, 'B30': 664, 'B33': 756, 'B36': 796,
    'SB24': 440, 'SB27': 475, 'SB30': 492, 'SB33': 515, 'SB36': 544,
    'WR3015': 356, 'WR3018': 384, 'MC3018': 240, 'SGH30': 204,
    'FSB36': 545, 'DSB36': 700, 'BMC30': 624, 'BBC36': 592, 'BBC42': 704,
    '2DB30': 892, '2DB36': 1013, '3DB12': 612, '3DB15': 636, '3DB18': 676,
    '3DB21': 732, '3DB24': 784, '3DB30': 892, '3DB36': 996,
    'LS33': 732, 'LS33KIT': 264, 'LS36': 812, 'LS36KIT': 292,
    'V2121': 404, 'V2421': 426, 'V2721': 470, 'V3021': 476, 'V3621': 516,
    'VDB1221': 556, 'VDB1521': 584, 'VDB1821': 636,
    'VSDL3021': 692, 'VSDR3021': 692, 'VSDL3621': 772, 'VSDR3621': 772,
    'VSDL4221': 904, 'VSDR4221': 904, 'VSD4821': 1196, 'VSD6021S': 1304, 'VSD6021D': 1236, 'VSD7221D': 1664,
    'VUP1884': 1050, 'VUP1890': 1105, 'VUP2484': 1295, 'VUP2490': 1355,
    'UP1884': 1184, 'UP1890': 1236, 'UP1896': 1292, 'UP2484': 1424, 'UP2490': 1476, 'UP2496': 1544,
    'UP3084': 1732, 'UP3090': 1784, 'UP3096': 1876,
    'OC3384D': 1852, 'OC3390D': 1916, 'OC3396D': 1984,
    'WF330': 36, 'WF336': 42, 'WF342': 46, 'F396': 104, 'F696': 196, 'BF3': 52, 'BF6': 92,
    'A30WF': 52, 'A36WF': 64, 'A42WF': 76, 'A3BF': 64, 'BSK': 52, 'TSK2496': 132,
    'BP4896': 212, 'DBP4896': 224, 'ACM8': 144, 'CM8-A': 196, 'CM8 2-7/8"': 144, 'CM8 4"': 196,
    'OC8': 52, 'SM8': 24, 'QR8': 52, 'ICM8': 52, 'FBM8': 252, 'LRM8-SH': 212,
    'CBL-T3': 316, 'TP3': 252, 'V37D': 104, 'V43D': 212, 'RP96': 276, 'DWP': 132, 'TK8': 36,
    'WEP1230': 156, 'WEP1236': 172, 'WEP1242': 196, 'BEP2430': 252, 'ROT30': 132,
}


# ----------------------------------------------------------------- helpers
def norm_sku(raw):
    """Collapse the many spellings of one SKU to a single key.
    'TK8 ¼”' / 'TK8 1/4"' / 'TK 8 ½' -> TK8 ; 'CM8 4”' -> CM8 4" ; 'LS33 KIT' -> LS33KIT ;
    'Touch Up Kit' / 'Touch-up Kit' -> TOUCH-UP KIT ; 'VSDR 3621' -> VSDR3621."""
    s = raw.strip().upper().replace('–', '-').replace('”', '"').replace('“', '"').replace("''", '"')
    s = re.sub(r'\s+', '', s)
    if s.startswith('TK8') or s.startswith('TK-8'):
        return 'TK8'
    if s.startswith('CM8'):
        if '2-7/8' in s:
            return 'CM8 2-7/8"'
        if '4' in s[3:]:
            return 'CM8 4"'
        if s.endswith('-A'):
            return 'CM8-A'
        return 'CM8'
    if 'TOUCH' in s and 'KIT' in s:
        return 'TOUCH-UP KIT'
    return s


def read_text(path):
    if path.lower().endswith('.pdf'):
        try:
            from pypdf import PdfReader
        except ImportError:
            sys.exit('pypdf not installed: pip3 install --user pypdf  (or pass a .txt dump of the estimate)')
        return '\n'.join(p.extract_text() or '' for p in PdfReader(path).pages)
    if path.lower().endswith('.docx'):
        return docx_text(path)
    with open(path, encoding='utf-8', errors='replace') as f:
        return f.read()


def docx_text(path):
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    W = '{%s}' % ns['w']
    root = ET.fromstring(zipfile.ZipFile(path).read('word/document.xml'))
    out = []
    for el in root.find('w:body', ns):
        tag = el.tag.split('}')[1]
        if tag == 'p':
            out.append(''.join(n.text or '' for n in el.iter(W + 't')))
        elif tag == 'tbl':
            # one line per table ROW, cells joined by " | " (e.g. "1 | W2136 | LH")
            for tr in el.iter(W + 'tr'):
                cells = [' '.join(''.join(n.text or '' for n in p.iter(W + 't')) for p in tc.findall('w:p', ns)).strip()
                         for tc in tr.findall('w:tc', ns)]
                out.append(' | '.join(cells))
    return '\n'.join(out)


# ----------------------------------------------------------------- estimate
ITEM_RE = re.compile(
    r'(?<!\S)(\d{1,3})\s+(Sale|Misc\. Sale)\s+(.+?)\s+\$\s?([\d,]+\.\d{2})\s+(\d+)\s+ea\s+\$\s?([\d,]+\.\d{2})',
    re.S)


def money(s):
    return float(s.replace(',', ''))


def parse_estimate(text):
    flat = re.sub(r'\s+', ' ', text)
    est = {
        'order': (re.search(r'Order #\s*Date\s*(S\d+)\s*(\d{2}/\d{2}/\d{4})', flat) or [None, '?', '?']),
        'po': None, 'lines': [], 'fees': [], 'sections': [],
        'subtotal': None, 'tax': None, 'total': None,
    }
    est['order'], est['date'] = est['order'][1], est['order'][2]
    m = re.search(r'PO Number:\s*(.+?)\s+(?:Ship To|Bill To|Customer)', flat)
    est['po'] = m.group(1).strip() if m else None
    m = re.search(r'Ship To:\s*(?:Bill To:\s*)?Iron Shield Construction\s+(.+?)\s+(?:Customer:|Contact:|Bill To:)', flat)
    est['ship_to'] = m.group(1).strip() if m else None
    m = re.search(r'Subtotal:\s*Sales Tax:\s*\$([\d,]+\.\d{2})\s*\$([\d,]+\.\d{2})\s*\$([\d,]+\.\d{2})', flat) \
        or re.search(r'Total:\s*Subtotal:\s*Sales Tax:\s*\$([\d,]+\.\d{2})\s*\$([\d,]+\.\d{2})\s*\$([\d,]+\.\d{2})', flat)
    if m:
        est['subtotal'], est['tax'], est['total'] = money(m.group(1)), money(m.group(2)), money(m.group(3))

    section = None
    for m in ITEM_RE.finditer(flat):
        n, kind, body, unit, qty, total = m.groups()
        unit, qty, total = money(unit), int(qty), money(total)
        up = body.upper()
        if up.startswith(('ASSEMBLY', 'DELIVERY', 'EXCHANGE', 'FREIGHT', 'SHIPPING')) or (kind == 'Misc. Sale' and unit and not re.match(r'^[A-Z0-9]', body)):
            est['fees'].append({'n': int(n), 'label': body, 'amount': total})
            continue
        if kind == 'Misc. Sale' and unit == 0:
            section = body.strip()           # "468 SEQUOIA DRIVE" style address headers
            est['sections'].append(section)
            continue
        fm = re.match(r'^(.*?)\s+(%s)\b\s*(.*)$' % '|'.join(FINISHES), body)
        if fm:
            sku_raw, finish, desc = fm.groups()
        else:
            finish = None
            km = re.match(r'^(LS3[36])\s+KIT\b\s*(.*)$', body, re.I)
            rm = re.match(r'^([A-Z]{1,4}\d{2,6}[A-Z\-]*)\s+(.*)$', body)
            if km:
                sku_raw, desc = km.group(1) + 'KIT', km.group(2)
            elif rm:
                sku_raw, desc = rm.groups()
            else:
                sku_raw, desc = body.split(' ', 1)[0], body
        hinge = tuple(re.findall(r'\b(%s)\b' % '|'.join(HINGES), desc))
        est['lines'].append({
            'n': int(n), 'sku': norm_sku(sku_raw), 'raw': sku_raw.strip(), 'finish': finish,
            'desc': desc.strip(), 'unit': unit, 'qty': qty, 'total': total, 'hinge': hinge, 'section': section,
        })
    return est


# ----------------------------------------------------------------- takeoff
TO_LINE = re.compile(r'^\s*(\d+)\s*[\)\-–]\s*(.+?)\s*$')
TO_ROW = re.compile(r'^\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(.*?)\s*$')   # table row "1 | W2136 | LH"
HINGE_WORD = {'LH': 'LH', 'RH': 'RH', 'DOUBLE': 'DBL', 'DBL': 'DBL', 'REVERSIBLE': 'REV', 'REV': 'REV'}


def parse_takeoff(text):
    items, section = [], None
    for line in text.splitlines():
        line = line.strip().replace(' ', ' ')
        if not line:
            continue
        r = TO_ROW.match(line)
        if r:                                    # new table format
            word = r.group(3).strip().upper()
            hinge = (HINGE_WORD[word],) if word in HINGE_WORD else ()   # "—" = no door
            items.append({'sku': norm_sku(r.group(2)), 'raw': r.group(2), 'qty': int(r.group(1)),
                          'hinge': hinge, 'section': section})
            continue
        if line.upper().startswith('QTY |') or 'please put it on the estimate' in line:
            continue                             # table header row / the note to FGT
        m = TO_LINE.match(line)
        if not m:
            if 'HINGE DESIGNATION' in line.upper() or '=' in line:
                continue
            section = line.rstrip(':')
            continue
        qty, rest = int(m.group(1)), m.group(2)
        parts = re.split(r'\s+[-–]\s+', rest, maxsplit=1)
        sku_raw = parts[0]
        tail = parts[1] if len(parts) > 1 else ''
        hinge = tuple(re.findall(r'\b(%s)\b' % '|'.join(HINGES), tail))
        if not hinge and re.search(r'\b(RH|LH|DBL|REV)\b', sku_raw):  # "W1836 LH" without a dash
            sku_raw, h = re.split(r'\s+(?=(?:RH|LH|DBL|REV)\b)', sku_raw, maxsplit=1)
            hinge = tuple(re.findall(r'\b(%s)\b' % '|'.join(HINGES), h))
        items.append({'sku': norm_sku(sku_raw), 'raw': sku_raw, 'qty': qty, 'hinge': hinge, 'section': section})
    return items


# ----------------------------------------------------------------- compare
def compare(est, takeoff, finish_expected):
    findings = []
    tq, eq = Counter(), Counter()
    th, eh = {}, {}
    for t in takeoff:
        tq[t['sku']] += t['qty']
        th.setdefault(t['sku'], []).extend(t['hinge'] * (t['qty'] if len(t['hinge']) == 1 else 1))
    for e in est['lines']:
        eq[e['sku']] += e['qty']
        eh.setdefault(e['sku'], []).extend(e['hinge'] * (e['qty'] if len(e['hinge']) == 1 else 1))
        if finish_expected and e['finish'] and e['finish'] != finish_expected:
            findings.append(f"FINISH   line {e['n']} {e['raw']} is {e['finish']}, expected {finish_expected}")
        if finish_expected and e['finish'] is None and e['sku'] not in ('LS33KIT', 'LS36KIT') and not e['sku'].startswith('ROT'):
            findings.append(f"FINISH   line {e['n']} {e['raw']} carries no finish code (expected {finish_expected})")

    rows = []
    for sku in sorted(set(tq) | set(eq), key=lambda s: (s not in tq, s)):
        t, e = tq.get(sku, 0), eq.get(sku, 0)
        if t == e:
            status = 'ok'
        elif t and not e:
            status = 'MISSING'
            findings.append(f"MISSING  {sku}: takeoff {t}, estimate 0")
        elif e and not t:
            status = 'EXTRA'
            findings.append(f"EXTRA    {sku}: estimate {e}, not on takeoff")
        else:
            status = 'QTY'
            findings.append(f"QTY      {sku}: takeoff {t}, estimate {e}")
        hinge_t = Counter(h for h in th.get(sku, []) if h in ('RH', 'LH'))
        hinge_e = Counter(h for h in eh.get(sku, []) if h in ('RH', 'LH'))
        hstat = ''
        if hinge_t and hinge_t != hinge_e:
            hstat = 'HINGE'
            findings.append(f"HINGE    {sku}: takeoff says {dict(hinge_t)}, estimate shows {dict(hinge_e) or 'nothing'}")
        rows.append((sku, t, e, ' '.join(sorted(th.get(sku, []))), ' '.join(sorted(eh.get(sku, []))), status, hstat))
    return rows, findings


def price_check(est):
    notes, ratios = [], []
    for e in est['lines']:
        lp = LIST_MW.get(e['sku'])
        if lp:
            ratios.append((round(e['unit'] / lp, 4), e))
    mult = Counter(r for r, _ in ratios).most_common(1)[0][0] if ratios else None
    for r, e in ratios:
        if mult and abs(r - mult) > 0.002:
            implied = round(e['unit'] / mult)
            notes.append(f"PRICE    line {e['n']} {e['raw']} ${e['unit']:.2f} = {r*100:.1f}% of list ${LIST_MW[e['sku']]} "
                         f"(others {mult*100:.0f}%) — implies list ${implied}; our price list is dated 2021.04")
    for e in est['lines']:
        if e['sku'] not in LIST_MW:
            notes.append(f"NOLIST   line {e['n']} {e['raw']} ${e['unit']:.2f} x{e['qty']} — not on our price list, eyeball it")
    return mult, notes


def fee_check(est):
    notes = []
    items = sum(e['total'] for e in est['lines'])
    for f in est['fees']:
        lab = f['label'].upper()
        if 'ASSEMBL' in lab:
            pct = f['amount'] / items * 100 if items else 0
            straight = items * 0.12
            notes.append(f"ASSEMBLY ${f['amount']:.2f} = {pct:.2f}% of items (${items:.2f}); a straight 12% would be ${straight:.2f}"
                         + (f" — ${f['amount'] - straight:.2f} more" if f['amount'] - straight > 1 else ''))
            if abs(f['amount'] - items * 1.065 * 0.12) < 0.05:
                notes[-1] += " [matches 12% of (items + 6.5% tax)]"
        elif 'DELIVER' in lab:
            notes.append(f"DELIVERY ${f['amount']:.2f}")
        else:
            notes.append(f"FEE      {f['label']} ${f['amount']:.2f}")
    if est['subtotal'] is not None:
        calc = items + sum(f['amount'] for f in est['fees'])
        if abs(calc - est['subtotal']) > 0.05:
            notes.append(f"MATH     lines + fees = ${calc:.2f} but subtotal printed ${est['subtotal']:.2f}")
        rate = est['tax'] / est['subtotal'] * 100 if est['subtotal'] else 0
        notes.append(f"TAX      ${est['tax']:.2f} = {rate:.2f}% of subtotal; total ${est['total']:,.2f}")
    return items, notes


# ----------------------------------------------------------------- main
def main(argv):
    if len(argv) < 3:
        sys.exit(__doc__)
    est_path, to_path = argv[1], argv[2]
    finish = 'MW'
    quiet = '--quiet' in argv
    if '--finish' in argv:
        finish = argv[argv.index('--finish') + 1].upper()
    est = parse_estimate(read_text(est_path))
    takeoff = parse_takeoff(read_text(to_path)) if to_path != '-' else []

    print(f"Estimate {est['order']}  dated {est['date']}  PO: {est['po'] or '—'}  ship-to: {est['ship_to'] or '—'}")
    print(f"  {len(est['lines'])} item lines, {len(est['fees'])} fee lines" + (f", address sections: {est['sections']}" if est['sections'] else ''))
    findings = []
    if takeoff:
        rows, findings = compare(est, takeoff, finish)
        if not quiet:
            print(f"\n  {'SKU':<14}{'takeoff':>8}{'estimate':>9}  {'hinge(takeoff)':<16}{'hinge(est)':<14}status")
            for sku, t, e, ht, he, st, hs in rows:
                flag = '' if st == 'ok' and not hs else '  <-- ' + ' '.join(x for x in (st if st != 'ok' else '', hs) if x)
                print(f"  {sku:<14}{t:>8}{e:>9}  {ht:<16}{he:<14}{flag}")
    else:
        # estimate-only mode: no takeoff to diff against, so only finish/price/fee checks apply
        _, findings = compare(est, [], finish)
        findings = [f for f in findings if not f.startswith('EXTRA')]
        if not quiet:
            for e in est['lines']:
                print(f"  {e['n']:>3} {e['sku']:<14}x{e['qty']:<3} ${e['unit']:>8.2f}  {e['finish'] or ''} {' '.join(e['hinge'])}")

    mult, pnotes = price_check(est)
    items, fnotes = fee_check(est)
    print(f"\n  Pricing: FGT multiplier = {mult*100:.0f}% of list" if mult else "\n  Pricing: no list-priced SKUs found")
    for n in pnotes + fnotes:
        print('  ' + n)

    print('\nFINDINGS' if findings else '\nCLEAN — every takeoff line is on the estimate with the right qty, hinge and finish.')
    for f in findings:
        print('  ' + f)
    return 1 if findings else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
