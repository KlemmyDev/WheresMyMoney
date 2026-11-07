"""
Net worth: what the household owns less what it owes, today and over time.

- Accounts: each bank account's balance (from check-ins, statements and the ledger).
- The loan: what's owed on it, over the last year as the Accounts page has it (estimated from repayments and
  interest until a statement's imported); before that, the earliest figure.
- Shares: the ETFs at each day's close (app.features.investments).
- Super: each person's balance as given over time (app.features.retirement keeps every one with its date); between
  them, the one given last, and before the first, the first.
- Things owned: the home, a car, anything else, valued by hand with each value kept, so the past uses the value
  given then (and the first one before that).

A picture, not a statement: super, shares and the home are values the household keeps up to date itself.
"""

from __future__ import annotations

import time
from typing import Any

from app.core import dates
from app.core.database import Database
from app.features.accounts import ledger
from app.features.accounts.service import AccountsService
from app.features.investments.service import InvestmentsService
from app.features.retirement.service import RetirementService

KINDS = {"home": "Home", "car": "Car", "other": "Something else"}
RANGES = {"1y": 12, "3y": 36, "5y": 60}


class NetWorthService:
    def __init__(
        self,
        db: Database,
        accounts: AccountsService,
        investments: InvestmentsService,
        retirement: RetirementService,
    ):
        self.db = db
        self.accounts = accounts
        self.investments = investments
        self.retirement = retirement

    # -- things owned ---------------------------------------------------------------------------

    def assets(self) -> list[dict[str, Any]]:
        with self.db.reading() as conn:
            rows = conn.execute("SELECT id, name, kind FROM assets ORDER BY sort, id").fetchall()
            out = []
            for asset_id, name, kind in rows:
                values = conn.execute(
                    "SELECT date, value FROM asset_values WHERE asset_id = ? ORDER BY date, id", (asset_id,)
                ).fetchall()
                out.append(
                    {
                        "id": asset_id,
                        "name": name,
                        "kind": kind,
                        "value": values[-1][1] if values else 0,
                        "as_of": values[-1][0] if values else None,
                        "values": [{"date": d, "value": v} for d, v in values],
                    }
                )
        return out

    def save_asset(self, body: dict[str, Any], asset_id: int | None = None) -> dict[str, Any]:
        """{"name": "Home", "kind": "home", "value": 76000000}. A new value is kept alongside the old ones."""
        with self.db.writing() as conn:
            was: dict[str, Any] = {}
            if asset_id is not None:
                row = conn.execute("SELECT name, kind FROM assets WHERE id = ?", (asset_id,)).fetchone()
                if row is None:
                    raise LookupError("That has gone.")
                was = {"name": row[0], "kind": row[1]}
            b = {**was, **body}
            kind = str(b.get("kind") or "other")
            if kind not in KINDS:
                raise ValueError("Choose what it is.")
            name = " ".join(str(b.get("name") or KINDS[kind]).split())[:40]
            value = b.get("value")
            try:
                value = int(value) if value not in (None, "") else None
            except (TypeError, ValueError):
                raise ValueError("Enter what it's worth.") from None
            if asset_id is None and value is None:
                raise ValueError("Enter what it's worth.")
            if value is not None and value < 0:
                raise ValueError("What it's worth can't be below nothing.")
            now = int(time.time())
            if asset_id is None:
                cur = conn.execute(
                    "INSERT INTO assets (name, kind, sort, created_at) VALUES (?, ?,"
                    " (SELECT COALESCE(MAX(sort), 0) + 1 FROM assets), ?)",
                    (name, kind, now),
                )
                asset_id = int(cur.lastrowid or 0)
            else:
                conn.execute("UPDATE assets SET name = ?, kind = ? WHERE id = ?", (name, kind, asset_id))
            if value is not None:
                today = dates.today().isoformat()
                # A second value on the same day replaces the first.
                conn.execute("DELETE FROM asset_values WHERE asset_id = ? AND date = ?", (asset_id, today))
                conn.execute(
                    "INSERT INTO asset_values (asset_id, date, value) VALUES (?, ?, ?)", (asset_id, today, value)
                )
        return next(a for a in self.assets() if a["id"] == asset_id)

    def remove_asset(self, asset_id: int) -> bool:
        with self.db.writing() as conn:
            conn.execute("DELETE FROM asset_values WHERE asset_id = ?", (asset_id,))
            return conn.execute("DELETE FROM assets WHERE id = ?", (asset_id,)).rowcount > 0

    # -- the picture ----------------------------------------------------------------------------

    def overview(self, span: str = "1y") -> dict[str, Any]:
        months = RANGES.get(span, 12)
        today = dates.today()
        days = [dates.add_months(today, -n) for n in range(months, 0, -1)] + [today]
        ov = self.accounts.overview()
        banks = [a for a in ov["accounts"] if a["kind"] == "bank"]
        lo = ov["loan"]
        people = self.retirement.people()
        super_history = self.retirement.history()

        def super_on(iso: str) -> int:
            total = 0
            for p in people:
                values = super_history.get(p["id"]) or [(p["as_of"] or iso, p["balance"])]
                then = [b for d, b in values if d <= iso]
                total += then[-1] if then else values[0][1]
            return total

        assets = self.assets()
        shares_now = self.investments.values_on([today])[0]
        shares = self.investments.values_on(days)

        loan_days = {d["date"]: d["balance"] for d in self.accounts.activity(lo["id"], 366)["days"]} if lo else {}
        earliest_owed = loan_days[min(loan_days)] if loan_days else (lo["balance"] if lo else 0)
        history = []
        with self.db.reading() as conn:
            for n, day in enumerate(days):
                iso = day.isoformat()
                accts = sum(ledger.balance(conn, a["id"], iso) for a in banks) if day < today else ov["total"]
                if lo is None:
                    owed = 0
                elif day >= today:
                    owed = lo["balance"]
                else:
                    owed = loan_days.get(iso, earliest_owed)
                by_kind: dict[str, int] = {}
                for a in assets:
                    then = [v["value"] for v in a["values"] if v["date"] <= iso] or [
                        a["values"][0]["value"] if a["values"] else 0
                    ]
                    by_kind[a["kind"]] = by_kind.get(a["kind"], 0) + then[-1]
                history.append(
                    {
                        "date": iso,
                        "accounts": accts,
                        "shares": shares[n] if day < today else shares_now,
                        "super": super_on(iso) if day < today else sum(p["balance"] for p in people),
                        "home": by_kind.get("home", 0),
                        "other": by_kind.get("car", 0) + by_kind.get("other", 0),
                        "loan": owed,
                    }
                )
        now = history[-1]
        return {
            "range": span,
            "accounts": [
                {"id": a["id"], "name": a["name"], "role": a["role"], "balance": a["balance"], "known": a["known"]}
                for a in banks
            ],
            "loan": (
                {
                    "id": lo["id"],
                    "name": lo["name"],
                    "balance": lo["balance"],
                    "rate_bp": lo["rate_bp"],
                    "offsetting": ov["offsetting"],
                }
                if lo
                else None
            ),
            "shares": {"value": shares_now, "funds": len(self.investments.overview()["funds"])},
            "super": [{"person": p["person"], "balance": p["balance"], "as_of": p["as_of"]} for p in people],
            "assets": assets,
            "now": now,
            "history": history,
            "kinds": KINDS,
        }
