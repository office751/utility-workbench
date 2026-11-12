#!/usr/bin/env python3
"""
READ-ONLY QuickBooks helper for construction-days.mjs (Nov 12 2026).

Prints, as JSON, every bill / expense LINE from the last ~200 days that looks like
drywall or flooring work, so the Construction Days sync can fill a house's blank
"Drywall Finished" / "Flooring Installed" date from the bill date.

Why bills: those two milestones are not county inspections, so the portal can't
confirm them, but a drywall or flooring-install bill means the work was done.
Adam's rules (Nov 12 2026): the bill date is the stand-in date, and a bill counts
as soon as it is ENTERED, paid or not.

Safety: this only ever runs SELECT queries. It never posts to QuickBooks.
The QBO_ENV setting stays "sandbox" on purpose (that is the safety catch for the
posting tools); we switch to the live books for this one process only.

Mac only: needs the QuickBooks keys in the macOS Keychain and the
"Invoice Red Flags" folder next to the Projects folder.
"""
import datetime
import json
import os
import sys

RED_FLAGS = os.path.expanduser("~/Documents/Claude/Invoice Red Flags")
sys.path.insert(0, RED_FLAGS)

import ironshield_local  # noqa: E402

_real_setting = ironshield_local.setting


def _setting(name, *args, **kwargs):
    """Answer "production" for QBO_ENV in this process only; everything else is untouched."""
    if name == "QBO_ENV":
        return "production"
    return _real_setting(name, *args, **kwargs)


ironshield_local.setting = _setting

import qbo_api  # noqa: E402  (must come after the patch above)

since = (datetime.date.today() - datetime.timedelta(days=200)).isoformat()
lines = []
for entity in ("Bill", "Purchase"):
    for txn in qbo_api.query(f"select * from {entity} where TxnDate >= '{since}'"):
        vendor = (txn.get("VendorRef") or txn.get("EntityRef") or {}).get("name", "")
        memo = txn.get("PrivateNote") or ""
        for line in txn.get("Line", []):
            detail = line.get("AccountBasedExpenseLineDetail") or line.get("ItemBasedExpenseLineDetail") or {}
            # The house is the line's CUSTOMER, never the WIP account (two-house parcels share one account).
            customer = (detail.get("CustomerRef") or {}).get("name", "")
            text = f"{vendor} {line.get('Description') or ''} {memo}"
            if not customer or not any(word in text.lower() for word in ("drywall", "floor", "carpet", "lvp")):
                continue
            lines.append({
                "vendor": vendor,
                "date": txn.get("TxnDate"),
                "amount": line.get("Amount") or 0,
                "text": f"{line.get('Description') or ''} {memo}".strip(),
                "customer": customer,
            })
print(json.dumps(lines))
