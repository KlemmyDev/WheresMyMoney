"""
Super funds whose fees are known, so picking the fund fills them in the way the fund charges them rather than as a
statement's dollars for one year (which don't grow with the balance).

Each fund's fees are as its fees page publishes them, with the date they were checked; funds change them, so they're
a starting point to check against the next statement. A fee on the balance can stop at a cap ("0.10% on the first
$500,000"). Investment fees and costs (with transaction costs) are per investment option, matched by the option's
name.
"""

from __future__ import annotations

import re
from typing import Any

FUNDS: list[dict[str, Any]] = [
    {
        "key": "art",
        "name": "Australian Retirement Trust",
        # Names a person might have typed, or that a statement is headed with.
        "aliases": ("australian retirement trust", "art super", "art", "sunsuper"),
        "source": "https://www.australianretirementtrust.com.au/investments/fees",
        "checked": "2026-11-08",
        "fees": [
            {"name": "Admin fee", "kind": "fixed", "amount": 5720},  # $1.10 a week
            {"name": "Admin fee (on the balance)", "kind": "pct", "amount": 0.001, "cap": 50_000_000},
            {"name": "Costs met from reserves", "kind": "pct", "amount": 0.0005},
        ],
        # Investment fees and costs plus transaction costs, a year.
        "options": {
            "High Growth Pool": 0.0055,
            "Balanced Pool": 0.0053,
            "Cash Pool": 0.0007,
            "High Growth": 0.0055,
            "Balanced": 0.0053,
            "Conservative-Balanced": 0.0051,
            "Conservative": 0.0049,
            "Balanced Risk-Adjusted": 0.0043,
            "Socially Conscious Balanced": 0.0059,
            "High Growth Index": 0.0009,
            "Balanced Index": 0.0009,
            "Australian Shares Index": 0.0008,
            "International Shares Hedged Index": 0.0010,
            "International Shares Unhedged Index": 0.0010,
            "Listed Property Index": 0.0011,
            "Unlisted Assets": 0.0127,
            "Bonds Index": 0.0009,
            "Cash": 0.0007,
        },
    },
]


def _words(s: str) -> frozenset[str]:
    return frozenset(re.findall(r"[a-z]+", s.lower().replace("-", " ")))


def find(name: str | None) -> dict[str, Any] | None:
    """The known fund a name means ("Australian Retirement Trust · Balanced", "ART"), if any."""
    low = " ".join(re.findall(r"[a-z]+", (name or "").lower()))
    if not low:
        return None
    for f in FUNDS:
        for alias in f["aliases"]:
            if re.search(rf"(?:^|\s){re.escape(alias)}(?:\s|$)", low):
                return f
    return None


def in_statement(text: str) -> dict[str, Any] | None:
    """The known fund a statement is from, by the fund's full name in its text."""
    low = text.lower()
    return next((f for f in FUNDS if f["name"].lower() in low), None)


def option_fee(fund: dict[str, Any], option: str) -> float | None:
    """An option's investment fees and costs (with transaction costs) at this fund, matched by its name's words in any
    order ("International Shares - Index (unhedged)" is "International Shares Unhedged Index")."""
    want = _words(option)
    return next((fee for name, fee in fund["options"].items() if _words(name) == want), None)


def fees(fund: dict[str, Any], keep: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The fund's fees, with any insurance (or other fee it doesn't publish) kept from `keep`."""
    own = {f["name"] for f in fund["fees"]}
    published = re.compile(r"admin|investment|reserves|transaction|^other fees$", re.I)
    kept = [f for f in keep if f["name"] not in own and not published.search(f["name"])]
    return [dict(f) for f in fund["fees"]] + kept


def options(fund: dict[str, Any], opts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Investment options with the fund's fee for each it knows (the rest as they were)."""
    out = []
    for o in opts:
        fee = option_fee(fund, o["name"])
        out.append({**o, "fee_pct": fee} if fee is not None else dict(o))
    return out


def apply(fund: dict[str, Any], found: dict[str, Any]) -> dict[str, Any]:
    """What a statement found, with the fund's published fees in place of the year's dollars (insurance kept)."""
    out = {**found, "fund": fund["name"]}
    out["fees"] = fees(fund, found["fees"])
    out["options"] = options(fund, found["options"])
    unknown = [o["name"] for o in found["options"] if option_fee(fund, o["name"]) is None]
    note = (
        f"Fees are {fund['name']}'s published rates (checked {fund['checked']}), so they grow with the balance;"
        " insurance is the statement's."
    )
    notes = [n for n in found["notes"] if "total fees" not in n]
    out["notes"] = [note, *notes]
    if unknown:
        out["notes"].append(f"No published fee for {', '.join(unknown)}; add it below.")
    return out


def listing() -> list[dict[str, Any]]:
    """The known funds, for the app to offer."""
    return [{k: f[k] for k in ("key", "name", "source", "checked", "fees", "options")} for f in FUNDS]
