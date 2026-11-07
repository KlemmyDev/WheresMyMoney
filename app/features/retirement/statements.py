"""
Reading a super statement (a PDF from the fund) for what the retirement estimate needs: the closing balance and its
date, the fees taken over the statement's period (made a yearly figure), and how the balance is invested.

Every fund lays its statement out differently, so this is a best effort from the PDF's text: what it finds is shown
for the household to check before anything is saved. A scanned statement (pictures of pages, no text) can't be read;
the figures are typed in instead. Everything happens here: the statement never leaves the house.
"""

from __future__ import annotations

import datetime as dt
import io
import re
from typing import Any

MAX_BYTES = 10 * 1024 * 1024
MONTHS = {
    m: i + 1 for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"))
}
MONEY = r"\$?\s?(-?\(?[\d,]+\.\d{2}\)?)"
DATE = r"(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4})"

# What a fee line is called on statements, and the name it's kept under (the order matters: first match wins).
FEES = [
    (r"insurance|premium|death|tpd|income protection|salary continuance", "Insurance"),
    (r"admin\w*\s+fee|member\s+fee|account\s+(keeping\s+)?fee|administration", "Admin fee"),
    (r"investment\s+(fee|cost|management)|indirect\s+cost|management\s+fee", "Investment fee"),
    (r"transaction\s+cost|buy.?sell|activity\s+fee|advice\s+fee|switch\w*\s+fee", "Other fees"),
]
# Words that mark an investment option's name.
OPTION_WORDS = (
    r"high growth|growth|balanced|conservative|moderate|indexed|diversified|defensive|sustainable|socially aware|"
    r"ethical|australian shares|international shares|global shares|property|infrastructure|fixed interest|bonds|"
    r"cash|lifecycle|mysuper|core pool|stable|aggressive|shares plus"
)


def read_text(raw: bytes) -> str:
    """The text of a PDF, page by page. Raises ValueError for something that isn't a PDF, or one with no text."""
    if len(raw) > MAX_BYTES:
        raise ValueError("That file is too big for a statement (10 MB at most).")
    if not raw.startswith(b"%PDF"):
        raise ValueError("That isn't a PDF. Choose the statement your fund sent as a PDF.")
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        reader = PdfReader(io.BytesIO(raw))
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception:
                raise ValueError("That PDF has a password. Save a copy without one and try again.") from None
        text = "\n".join(page.extract_text() or "" for page in reader.pages[:40])
    except PdfReadError:
        raise ValueError("That PDF couldn't be read. Try saving it again from the fund's website.") from None
    if len(text.strip()) < 40:
        raise ValueError("That statement is pictures of pages with no text to read. Type the figures in instead.")
    return text


def _money(s: str) -> int:
    neg = s.startswith("-") or s.startswith("(")
    return round(float(s.strip("-()").replace(",", "")) * 100) * (-1 if neg else 1)


def _date(s: str) -> dt.date | None:
    s = s.strip().rstrip(".")
    m = re.fullmatch(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})", s)
    try:
        if m:
            d, mo, y = (int(x) for x in m.groups())
            return dt.date(y + 2000 if y < 100 else y, mo, d)
        m = re.fullmatch(r"(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})", s)
        if m and m.group(2)[:3].lower() in MONTHS:
            return dt.date(int(m.group(3)), MONTHS[m.group(2)[:3].lower()], int(m.group(1)))
    except ValueError:
        return None
    return None


def _period(text: str) -> tuple[dt.date, dt.date] | None:
    """The statement's period: "1 July 2025 to 30 June 2026", "01/07/2025 - 30/06/2026"."""
    for m in re.finditer(DATE + r"\s*(?:to|-|–|until)\s*" + DATE, text):
        a, b = _date(m.group(1)), _date(m.group(2))
        if a and b and 20 <= (b - a).days <= 400:
            return a, b
    return None


def parse(text: str) -> dict[str, Any]:
    """What a statement's text says: {"balance", "as_of", "period", "fees", "options", "notes"}. Anything not found
    is None (or empty), and `notes` says what was assumed."""
    lines = [" ".join(line.split()) for line in text.splitlines() if line.strip()]
    notes: list[str] = []
    period = _period(text)

    # The closing balance: a line naming it, with the last amount on the line.
    balance = as_of = None
    for pattern in (
        r"closing\s+balance|ending\s+balance|balance\s+at\s+the\s+end",
        r"account\s+balance|your\s+balance|balance\s+(?:at|as\s+at|on)",
    ):
        for line in lines:
            if re.search(pattern, line, re.I):
                amounts = re.findall(MONEY, line)
                if amounts and _money(amounts[-1]) > 0:
                    balance = _money(amounts[-1])
                    d = re.search(DATE, line)
                    as_of = _date(d.group(1)) if d else None
                    break
        if balance is not None:
            break
    if balance is not None and as_of is None and period:
        as_of = period[1]

    # Fees: each line naming a fee with an amount, totalled by kind. Percentages are kept as a share of the balance.
    dollars: dict[str, int] = {}
    shares: dict[str, float] = {}
    for line in lines:
        low = line.lower()
        if "fee" not in low and "cost" not in low and "premium" not in low and "insurance" not in low:
            continue
        if re.search(r"total|contribution|tax", low) and "fee" not in low:
            continue
        name = next((n for pat, n in FEES if re.search(pat, low)), None)
        if name is None:
            continue
        pct = re.search(r"(\d{1,2}(?:\.\d+)?)\s?%\s*(?:p\.?a\.?|a year|per annum)?", line)
        amounts = re.findall(MONEY, re.sub(r"\d{1,2}(?:\.\d+)?\s?%", " ", line))
        if pct and not amounts:
            v = float(pct.group(1)) / 100
            if 0 < v <= 0.05:
                shares[name] = shares.get(name, 0) + v
        elif amounts:
            v = abs(_money(amounts[-1]))
            if 0 < v < 2_000_000:  # under $20,000: a fee, not a balance
                dollars[name] = dollars.get(name, 0) + v
    scale = 1.0
    if dollars and period:
        days = (period[1] - period[0]).days + 1
        if days < 350:
            scale = 365 / days
            notes.append(f"Fees were for {days} days, so they're made a yearly figure.")
    elif dollars:
        notes.append("The statement's period wasn't found, so its fees are taken as a year's.")
    fees = [{"name": n, "kind": "fixed", "amount": round(v * scale)} for n, v in dollars.items()]
    fees += [{"name": f"{n} (on the balance)", "kind": "pct", "amount": round(v, 5)} for n, v in shares.items()]
    if dollars:
        notes.append("Fees in dollars include any charged as a share of the balance; check none are counted twice.")

    # Investment options: a line with an option's name and a share of the balance.
    found: dict[str, float] = {}
    for line in lines:
        m = re.search(
            rf"((?:[A-Z][\w&-]*\s+)*?(?:{OPTION_WORDS})(?:\s+[A-Z][\w&-]*)*)\D*?(\d{{1,3}}(?:\.\d+)?)\s?%", line, re.I
        )
        if not m:
            continue
        name = " ".join(m.group(1).split()).strip(" -:").title()
        share = float(m.group(2)) / 100
        if 0 < share <= 1 and name not in found and "fee" not in line.lower() and "return" not in line.lower():
            found[name] = share
    options = [{"name": n, "share": s, "return_pct": None, "fee_pct": 0} for n, s in found.items()]
    if options and abs(sum(o["share"] for o in options) - 1) > 0.01:
        notes.append("The investment options found don't add up to 100%, so they're left out.")
        options = []

    return {
        "balance": balance,
        "as_of": as_of.isoformat() if as_of else None,
        "period": [period[0].isoformat(), period[1].isoformat()] if period else None,
        "fees": fees,
        "options": options,
        "notes": notes,
    }
