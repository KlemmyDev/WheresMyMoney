"""
Net worth: what the household owns less what it owes, today and over time.

- Accounts: each bank account's balance (from check-ins, statements and the ledger).
- The loan: what's owed on it, over the last year as the Accounts page has it (estimated from repayments and
  interest until a statement's imported); before that, the earliest figure.
- Shares: the ETFs at each day's close (app.features.investments).
- Super: each person's balance as given over time (app.features.retirement keeps every one with its date); between
  them, the one given last, and before the first, the first.
- Things owned: the home, an investment property, land, a car, a boat, jewellery, cash, anything else, valued by
  hand with each value kept (dated, so what was paid can go in too), so the past uses the value given then (and the
  first one before that). Anything owed against one (a car loan) is kept the same way and taken off.

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

# Each kind of thing owned: what it's called and the group it counts in. The home goes with "Count the home" (and
# the home loan); everything else always counts.
KINDS = {
    "home": "Home",
    "property": "Investment property",
    "land": "Land",
    "car": "Car",
    "vehicle": "Boat, caravan or bike",
    "valuables": "Jewellery or collectibles",
    "cash": "Cash",
    "other": "Something else",
}
GROUPS = {
    "home": "home",
    "property": "property",
    "land": "property",
    "car": "vehicles",
    "vehicle": "vehicles",
    "valuables": "things",
    "cash": "things",
    "other": "things",
}
RANGES = {"1y": 12, "3y": 36, "5y": 60}


def on(entries: list[dict[str, Any]], iso: str, field: str) -> int:
    """The figure given last on or before `iso`; before the first, the first; with none, nothing."""
    then = [e[field] for e in entries if e["date"] <= iso]
    return then[-1] if then else (entries[0][field] if entries else 0)


def _day(text: Any) -> str:
    """A date given for a value: ISO, not in the future; none is today."""
    if text in (None, ""):
        return dates.today().isoformat()
    try:
        day = dates.parse(str(text))
    except ValueError:
        raise ValueError("Enter the date as a date.") from None
    if day > dates.today():
        raise ValueError("That date hasn't come yet.")
    return day.isoformat()


def _cents(value: Any, missing: str) -> int:
    try:
        cents = int(value)
    except (TypeError, ValueError):
        raise ValueError(missing) from None
    if cents < 0:
        raise ValueError("It can't be below nothing.")
    return cents


def _note(text: Any) -> str:
    return " ".join(str(text or "").split())[:60]


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
        """Everything owned (not removed), each with every value given and everything owed against it."""
        with self.db.reading() as conn:
            rows = conn.execute(
                "SELECT id, name, kind, owed_name, owed_rate_bp FROM assets WHERE removed_at IS NULL ORDER BY sort, id"
            ).fetchall()
            out = []
            for asset_id, name, kind, owed_name, owed_rate_bp in rows:
                values = [
                    {"id": i, "date": d, "value": v, "note": note}
                    for i, d, v, note in conn.execute(
                        "SELECT id, date, value, note FROM asset_values WHERE asset_id = ? ORDER BY date, id",
                        (asset_id,),
                    )
                ]
                owed = [
                    {"id": i, "date": d, "amount": v, "note": note}
                    for i, d, v, note in conn.execute(
                        "SELECT id, date, amount, note FROM asset_owed WHERE asset_id = ? ORDER BY date, id",
                        (asset_id,),
                    )
                ]
                value = values[-1]["value"] if values else 0
                owing = owed[-1]["amount"] if owed else 0
                out.append(
                    {
                        "id": asset_id,
                        "name": name,
                        "kind": kind if kind in KINDS else "other",
                        "group": GROUPS.get(kind, "things"),
                        "value": value,
                        "as_of": values[-1]["date"] if values else None,
                        "values": values,
                        "owed": {
                            "name": owed_name,
                            "rate_bp": owed_rate_bp,
                            "amount": owing,
                            "as_of": owed[-1]["date"] if owed else None,
                            "entries": owed,
                        },
                        "equity": value - owing,
                    }
                )
        return out

    def asset(self, asset_id: int, span: str = "all") -> dict[str, Any]:
        """One thing owned, with its value and what's owed a month at a time: over 1y, 3y or 5y, or (all) from the
        first figure given."""
        a = next((x for x in self.assets() if x["id"] == asset_id), None)
        if a is None:
            raise LookupError("That has gone.")
        today = dates.today()
        if span in RANGES:
            months = RANGES[span]
        else:
            first = min([e["date"] for e in a["values"] + a["owed"]["entries"]] or [today.isoformat()])
            start = dates.parse(first)
            months = max((today.year - start.year) * 12 + today.month - start.month, 1)
        days = [dates.add_months(today, -n) for n in range(months, 0, -1)] + [today]
        history = []
        for day in days:
            iso = day.isoformat()
            value = on(a["values"], iso, "value")
            owed = on(a["owed"]["entries"], iso, "amount")
            history.append({"date": iso, "value": value, "owed": owed})
        return {**a, "range": span, "history": history, "kinds": KINDS}

    def _check(self, conn: Any, asset_id: int) -> tuple[str, str]:
        row = conn.execute("SELECT name, kind FROM assets WHERE id = ? AND removed_at IS NULL", (asset_id,)).fetchone()
        if row is None:
            raise LookupError("That has gone.")
        return row[0], row[1]

    def save_asset(self, body: dict[str, Any], asset_id: int | None = None) -> dict[str, Any]:
        """{"name": "Home", "kind": "home", "value": 76000000, "date": "2024-03-01", "note": "What we paid",
        "owed_name": "Car loan", "owed_rate_bp": 599, "owed": 1800000}. A new one needs a value. On an existing one,
        a value (or owed) given here is kept alongside the old ones, for today unless dated."""
        with self.db.writing() as conn:
            was: dict[str, Any] = {}
            if asset_id is not None:
                name, kind = self._check(conn, asset_id)
                row = conn.execute("SELECT owed_name, owed_rate_bp FROM assets WHERE id = ?", (asset_id,)).fetchone()
                was = {"name": name, "kind": kind, "owed_name": row[0], "owed_rate_bp": row[1]}
            b = {**was, **body}
            kind = str(b.get("kind") or "other")
            if kind not in KINDS:
                raise ValueError("Choose what it is.")
            name = " ".join(str(b.get("name") or KINDS[kind]).split())[:40]
            owed_name = " ".join(str(b.get("owed_name") or "").split())[:40]
            rate = b.get("owed_rate_bp")
            if rate in (None, ""):
                rate = None
            else:
                try:
                    rate = int(rate)
                except (TypeError, ValueError):
                    raise ValueError("Enter the rate as a number.") from None
                if not 0 <= rate <= 5000:
                    raise ValueError("That rate doesn't look right.")
            value = body.get("value")
            value = None if value in (None, "") else _cents(value, "Enter what it's worth.")
            if asset_id is None and value is None:
                raise ValueError("Enter what it's worth.")
            owed = body.get("owed")
            owed = None if owed in (None, "") else _cents(owed, "Enter what's owed.")
            day = _day(body.get("date"))
            now = int(time.time())
            if asset_id is None:
                cur = conn.execute(
                    "INSERT INTO assets (name, kind, sort, created_at, owed_name, owed_rate_bp) VALUES (?, ?,"
                    " (SELECT COALESCE(MAX(sort), 0) + 1 FROM assets), ?, ?, ?)",
                    (name, kind, now, owed_name, rate),
                )
                asset_id = int(cur.lastrowid or 0)
            else:
                conn.execute(
                    "UPDATE assets SET name = ?, kind = ?, owed_name = ?, owed_rate_bp = ? WHERE id = ?",
                    (name, kind, owed_name, rate, asset_id),
                )
            if value is not None:
                self._put(conn, "asset_values", "value", asset_id, day, value, _note(body.get("note")))
            if owed is not None:
                self._put(conn, "asset_owed", "amount", asset_id, day, owed, "")
        return next(a for a in self.assets() if a["id"] == asset_id)

    @staticmethod
    def _put(conn: Any, table: str, field: str, asset_id: int, day: str, cents: int, note: str) -> None:
        # A second figure on the same day replaces the first.
        conn.execute(f"DELETE FROM {table} WHERE asset_id = ? AND date = ?", (asset_id, day))
        conn.execute(
            f"INSERT INTO {table} (asset_id, date, {field}, note) VALUES (?, ?, ?, ?)", (asset_id, day, cents, note)
        )

    def save_entry(self, what: str, asset_id: int, body: dict[str, Any], entry_id: int | None = None) -> dict[str, Any]:
        """A value (`what` "values": {"date", "value", "note"}) or an amount owed ("owed": {"date", "amount",
        "note"}), new or changed. A date that already has one replaces it."""
        table, field, missing = (
            ("asset_values", "value", "Enter what it's worth.")
            if what == "values"
            else ("asset_owed", "amount", "Enter what's owed.")
        )
        with self.db.writing() as conn:
            self._check(conn, asset_id)
            was: dict[str, Any] = {}
            if entry_id is not None:
                row = conn.execute(
                    f"SELECT date, {field}, note FROM {table} WHERE id = ? AND asset_id = ?", (entry_id, asset_id)
                ).fetchone()
                if row is None:
                    raise LookupError("That has gone.")
                was = {"date": row[0], field: row[1], "note": row[2]}
            b = {**was, **body}
            cents = _cents(b.get(field), missing)
            day = _day(b.get("date"))
            note = _note(b.get("note"))
            if entry_id is not None:
                conn.execute(
                    f"DELETE FROM {table} WHERE asset_id = ? AND date = ? AND id != ?", (asset_id, day, entry_id)
                )
                conn.execute(
                    f"UPDATE {table} SET date = ?, {field} = ?, note = ? WHERE id = ?", (day, cents, note, entry_id)
                )
            else:
                self._put(conn, table, field, asset_id, day, cents, note)
        return next(a for a in self.assets() if a["id"] == asset_id)

    def remove_entry(self, what: str, asset_id: int, entry_id: int) -> dict[str, Any]:
        """Take a value or an amount owed away. The last value stays: something owned is worth something."""
        table = "asset_values" if what == "values" else "asset_owed"
        with self.db.writing() as conn:
            self._check(conn, asset_id)
            if what == "values":
                left = conn.execute("SELECT COUNT(*) FROM asset_values WHERE asset_id = ?", (asset_id,)).fetchone()[0]
                if left <= 1:
                    raise ValueError("Keep at least one value. Remove the whole thing instead.")
            if conn.execute(f"DELETE FROM {table} WHERE id = ? AND asset_id = ?", (entry_id, asset_id)).rowcount == 0:
                raise LookupError("That has gone.")
        return next(a for a in self.assets() if a["id"] == asset_id)

    def remove_asset(self, asset_id: int) -> bool:
        """Put it aside, with its values, so it can come back (the undo)."""
        with self.db.writing() as conn:
            return (
                conn.execute(
                    "UPDATE assets SET removed_at = ? WHERE id = ? AND removed_at IS NULL", (int(time.time()), asset_id)
                ).rowcount
                > 0
            )

    def restore_asset(self, asset_id: int) -> dict[str, Any]:
        with self.db.writing() as conn:
            if conn.execute("UPDATE assets SET removed_at = NULL WHERE id = ?", (asset_id,)).rowcount == 0:
                raise LookupError("That has gone.")
        return next(a for a in self.assets() if a["id"] == asset_id)

    # -- the picture ----------------------------------------------------------------------------

    def likely(self, people: list[dict[str, Any]], lo: dict[str, Any] | None, offsetting: int) -> dict[str, Any]:
        """Where net worth is likely to be in a year, from what's being put away: super (work's and salary
        sacrifice, after the 15% tax going in), the offsetting accounts at their recent pace, the funds at the last
        year's buying, and the loan paid down at its repayment. The home and crypto are held flat: no guessing."""
        super_in = round(sum((p["salary"] * p["rate"] + p.get("sacrifice", 0)) * 0.85 for p in people))
        accounts_in = max(self.accounts.offsetting_growth(), 0) * 12
        shares_in = max(self.investments.bought_lately(), 0)
        loan_down = 0
        if lo and lo.get("repayment") and lo.get("rate_bp") is not None:
            owed = float(lo["balance"])
            for _ in range(12):
                interest = max(owed - offsetting, 0) * lo["rate_bp"] / 10000 / 12
                paid = max(lo["repayment"] - interest, 0)
                owed -= paid
                loan_down += paid
        put_away = super_in + accounts_in + shares_in
        return {
            "month": dates.add_months(dates.today(), 12).isoformat()[:7],
            "put_away": put_away,
            "super": super_in,
            "accounts": accounts_in,
            "shares": shares_in,
            "loan_down": round(loan_down),
            "gain": put_away + round(loan_down),
        }

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
        shares_now = self.investments.values_on([today], crypto=False)[0]
        shares = self.investments.values_on(days, crypto=False)
        crypto_now = self.investments.values_on([today], crypto=True)[0]
        crypto = self.investments.values_on(days, crypto=True)

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
                by_group = {"home": 0, "property": 0, "vehicles": 0, "things": 0}
                owed_on = {"home": 0, "other": 0}
                for a in assets:
                    by_group[a["group"]] += on(a["values"], iso, "value")
                    owed_on["home" if a["group"] == "home" else "other"] += on(a["owed"]["entries"], iso, "amount")
                history.append(
                    {
                        "date": iso,
                        "accounts": accts,
                        "shares": shares[n] if day < today else shares_now,
                        "crypto": crypto[n] if day < today else crypto_now,
                        "super": super_on(iso) if day < today else sum(p["balance"] for p in people),
                        "home": by_group["home"],
                        # Everything owned besides the home, and the groups it's made of.
                        "other": by_group["property"] + by_group["vehicles"] + by_group["things"],
                        "property": by_group["property"],
                        "vehicles": by_group["vehicles"],
                        "things": by_group["things"],
                        # Owed against things owned: against the home (goes with it) and against the rest.
                        "home_owed": owed_on["home"],
                        "owed": owed_on["other"],
                        "loan": owed,
                    }
                )
        now = history[-1]
        return {
            "likely": self.likely(people, lo, ov["offsetting"]),
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
            "shares": {
                "value": shares_now,
                "funds": len([f for f in self.investments.overview()["funds"] if f.get("kind") != "crypto"]),
            },
            "crypto": {
                "value": crypto_now,
                "funds": len([f for f in self.investments.overview()["funds"] if f.get("kind") == "crypto"]),
            },
            "super": [{"person": p["person"], "balance": p["balance"], "as_of": p["as_of"]} for p in people],
            "assets": assets,
            "now": now,
            "history": history,
            "kinds": KINDS,
            "groups": GROUPS,
        }
