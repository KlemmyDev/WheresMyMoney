"""
Retirement: what the estimate needs that the rest of the app doesn't already know, and the levers it was left on.

- Each person's super: their fund, balance (and when it was), salary and the employer's rate, and the year they were
  born (super opens at 60, the preservation age for anyone born after June 1964).
- The levers ("Try it", on the Retirement page): the age to stop work, spending each year once stopped, extra into
  super each month, and whether the ETFs count.
- The assumptions (Settings → Retirement): super's return before fees, the ETFs' return and fees, inflation, the tax
  on money going into super, and the age it should last to. Each fund's own fees (a share of the balance and dollars
  a year) and, if given, its own return are kept with that person's super.
- What the household spends now, for comparison: the last year's spending and bills, less transfers, the loan (paid
  separately until it's gone) and anything someone's paying back.

The projection itself runs in the browser, so the levers answer straight away. Everything is in today's dollars.
"""

from __future__ import annotations

import datetime as dt
import json
import time
from typing import Any

from app.core import dates
from app.core.database import Database

DEFAULTS: dict[str, Any] = {
    "retire_age": 60,
    "spending": 8000000,  # cents a year
    "extra": 0,  # cents a month, shared between everyone
    "count_etfs": True,
    "plan_to": 92,
    # Assumptions, a year, as fractions (0.07 is 7%).
    "super_return": 0.07,  # before fees
    "etf_return": 0.07,  # before fees
    "etf_fee": 0.002,
    "inflation": 0.03,
    "contrib_tax": 0.15,
}
# Each assumption's sensible range, to catch a typed 70 meant as 7%.
RANGES: dict[str, tuple[float, float]] = {
    "super_return": (-0.05, 0.2),
    "etf_return": (-0.05, 0.2),
    "etf_fee": (0, 0.03),
    "inflation": (-0.02, 0.15),
    "contrib_tax": (0, 0.47),
}
KEY = "retirement:settings"
PRESERVATION = 60


# A new fund's fees until its statement's are put in: typical of a balanced option.
DEFAULT_FEES: list[dict[str, Any]] = [
    {"name": "Admin fee", "kind": "fixed", "amount": 5200},
    {"name": "Admin fee (on the balance)", "kind": "pct", "amount": 0.001},
    {"name": "Investment fee", "kind": "pct", "amount": 0.005},
]


def _fees(raw: Any) -> list[dict[str, Any]]:
    """A fund's fees, checked: each a name, pct (a share of the balance a year) or fixed (cents a year), an amount."""
    if not isinstance(raw, list) or len(raw) > 12:
        raise ValueError("Fees are a list, each with a name, a kind and an amount.")
    out = []
    for f in raw:
        try:
            name = " ".join(str(f.get("name") or "").split())[:40] or "Fee"
            kind = str(f.get("kind"))
            amount = float(f.get("amount"))
        except (AttributeError, TypeError, ValueError):
            raise ValueError("Each fee needs a name, a kind and an amount.") from None
        if kind == "pct":
            if not 0 <= amount <= 0.05:
                raise ValueError(f"{name}: a share of the balance up to 5% a year.")
        elif kind == "fixed":
            if amount < 0:
                raise ValueError(f"{name}: dollars a year can't be below nothing.")
            amount = round(amount)
        else:
            raise ValueError(f"{name}: is it a share of the balance or dollars a year?")
        out.append({"name": name, "kind": kind, "amount": amount})
    return out


def _options(raw: Any) -> list[dict[str, Any]]:
    """How a fund's balance is invested, checked: the shares add up to the whole."""
    if not isinstance(raw, list) or len(raw) > 12:
        raise ValueError("Investment options are a list, each with a name and a share.")
    out = []
    for o in raw:
        try:
            name = " ".join(str(o.get("name") or "").split())[:40] or "Option"
            share = float(o.get("share"))
            ret = o.get("return_pct")
            ret = float(ret) if ret not in (None, "") else None
            fee = float(o.get("fee_pct") or 0)
        except (AttributeError, TypeError, ValueError):
            raise ValueError("Each investment option needs a name and a share.") from None
        if not 0 < share <= 1:
            raise ValueError(f"{name}: its share is more than nothing and at most all of it.")
        if ret is not None and not -0.05 <= ret <= 0.2:
            raise ValueError(f"{name}: a return between -5% and 20% a year.")
        if not 0 <= fee <= 0.05:
            raise ValueError(f"{name}: an investment fee up to 5% a year.")
        out.append({"name": name, "share": share, "return_pct": ret, "fee_pct": fee})
    if out and abs(sum(o["share"] for o in out) - 1) > 0.005:
        raise ValueError("The investment options' shares need to add up to 100%.")
    return out


class RetirementService:
    def __init__(self, db: Database):
        self.db = db

    def settings(self) -> dict[str, Any]:
        with self.db.reading() as conn:
            row = conn.execute("SELECT value FROM kv WHERE key = ?", (KEY,)).fetchone()
        saved = json.loads(row[0]) if row else {}
        return {**DEFAULTS, **{k: v for k, v in saved.items() if k in DEFAULTS}}

    def save_settings(self, body: dict[str, Any]) -> dict[str, Any]:
        now = self.settings()
        out = dict(now)
        try:
            if "retire_age" in body:
                out["retire_age"] = int(body["retire_age"])
            if "spending" in body:
                out["spending"] = int(body["spending"])
            if "extra" in body:
                out["extra"] = int(body["extra"])
            if "count_etfs" in body:
                out["count_etfs"] = bool(body["count_etfs"])
            for key in RANGES:
                if key in body:
                    out[key] = float(body[key])
            if "plan_to" in body:
                out["plan_to"] = int(body["plan_to"])
        except (TypeError, ValueError):
            raise ValueError("Those settings aren't numbers we can use.") from None
        if not 40 <= out["retire_age"] <= 75:
            raise ValueError("Choose an age to stop between 40 and 75.")
        if out["spending"] < 0 or out["extra"] < 0:
            raise ValueError("Spending and extra can't be below nothing.")
        for key, (lo, hi) in RANGES.items():
            if not lo <= out[key] <= hi:
                name = key.replace("_", " ").replace("etf", "ETF").replace("contrib", "contributions")
                raise ValueError(f"The {name} should be between {lo:.0%} and {hi:.0%} a year.")
        if not 70 <= out["plan_to"] <= 110:
            raise ValueError("Plan to an age between 70 and 110.")
        with self.db.writing() as conn:
            conn.execute("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", (KEY, json.dumps(out)))
        return out

    # -- super --------------------------------------------------------------------------------

    def people(self) -> list[dict[str, Any]]:
        with self.db.reading() as conn:
            rows = conn.execute(
                "SELECT id, person, born, fund, balance, as_of, salary, rate, fees, options"
                " FROM super_accounts ORDER BY sort, id"
            ).fetchall()
        return [
            {
                "id": r[0],
                "person": r[1],
                "born": r[2],
                "age": dates.today().year - r[2],
                "fund": r[3],
                "balance": r[4],
                "as_of": r[5],
                "salary": r[6],
                "rate": r[7],
                "opens": r[2] + PRESERVATION,
                "fees": json.loads(r[8] or "[]"),
                "options": json.loads(r[9] or "[]"),
            }
            for r in rows
        ]

    def save_person(self, body: dict[str, Any], person_id: int | None = None) -> dict[str, Any]:
        """{"person": "Alex", "born": 1988, "fund": "AustralianSuper", "balance": 11260000, "as_of": "2026-09-30",
        "salary": 12000000, "rate": 0.12, "fees": [{"name": "Admin fee", "kind": "fixed", "amount": 5200}, ...],
        "options": [{"name": "High Growth", "share": 0.7, "return_pct": 0.085, "fee_pct": 0.0055}, ...]}.
        Leaving something out keeps it."""
        keys = ("person", "born", "fund", "balance", "as_of", "salary", "rate", "fees", "options")
        with self.db.writing() as conn:
            was: dict[str, Any] = {}
            if person_id is not None:
                row = conn.execute(
                    f"SELECT {', '.join(keys)} FROM super_accounts WHERE id = ?", (person_id,)
                ).fetchone()
                if row is None:
                    raise LookupError("That person's super has gone.")
                was = dict(zip(keys, row, strict=True))
                was["fees"] = json.loads(was["fees"] or "[]")
                was["options"] = json.loads(was["options"] or "[]")
            b = {**was, **body}
            person = " ".join(str(b.get("person") or "").split())[:30]
            if not person:
                raise ValueError("Whose super is it?")
            try:
                born = int(b.get("born"))  # type: ignore[arg-type]
                balance = int(b.get("balance") or 0)
                salary = int(b.get("salary") or 0)
                rate = float(b.get("rate") if b.get("rate") not in (None, "") else 0.12)
            except (TypeError, ValueError):
                raise ValueError("Enter the year they were born, the balance and the salary.") from None
            year = dates.today().year
            if not year - 90 <= born <= year - 15:
                raise ValueError("Enter the year they were born, like 1988.")
            if balance < 0 or salary < 0 or not 0 <= rate <= 0.5:
                raise ValueError("The balance, salary and rate can't be below nothing.")
            fees = _fees(b.get("fees", DEFAULT_FEES if person_id is None else []))
            options = _options(b.get("options") or [])
            as_of = b.get("as_of") or dates.today().isoformat()
            try:
                as_of = dates.parse(str(as_of)).isoformat()
            except ValueError:
                raise ValueError("That date isn't one we can read.") from None
            fund = " ".join(str(b.get("fund") or "").split())[:60]
            values = (person, born, fund, balance, as_of, salary, rate, json.dumps(fees), json.dumps(options))
            if person_id is None:
                cur = conn.execute(
                    f"INSERT INTO super_accounts ({', '.join(keys)}, sort, created_at) VALUES"
                    f" ({', '.join('?' * len(keys))}, (SELECT COALESCE(MAX(sort), 0) + 1 FROM super_accounts), ?)",
                    (*values, int(time.time())),
                )
                person_id = int(cur.lastrowid or 0)
            else:
                conn.execute(
                    f"UPDATE super_accounts SET {', '.join(f'{k} = ?' for k in keys)} WHERE id = ?",
                    (*values, person_id),
                )
        return next(p for p in self.people() if p["id"] == person_id)

    def remove_person(self, person_id: int) -> bool:
        with self.db.writing() as conn:
            return conn.execute("DELETE FROM super_accounts WHERE id = ?", (person_id,)).rowcount > 0

    # -- what the household spends now ---------------------------------------------------------

    def spending_now(self) -> int:
        """The last year's spending and bills out of the bank accounts, in cents: not transfers, not the loan's
        repayments (the estimate adds those until the loan's gone), not what someone's paying back."""
        since = (dates.today() - dt.timedelta(days=365)).isoformat()
        with self.db.reading() as conn:
            row = conn.execute(
                "SELECT COALESCE(SUM(-t.amount), 0) FROM transactions t"
                " JOIN accounts a ON a.id = t.account_id AND a.kind = 'bank'"
                " LEFT JOIN categories c ON c.id = t.category_id"
                " WHERE t.date > ? AND t.amount < 0 AND t.kind IN ('statement', 'manual', 'cash')"
                " AND t.rule_id IS NULL AND t.excluded = 0 AND COALESCE(c.kind, 'spending') IN ('spending', 'bills')"
                " AND COALESCE(c.name, '') != 'Loan repayment' AND upper(t.description) NOT LIKE '%LOAN REPAYMENT%'",
                (since,),
            ).fetchone()
        return int(row[0] or 0)

    def overview(self) -> dict[str, Any]:
        return {
            "people": self.people(),
            "settings": self.settings(),
            "spending_now": self.spending_now(),
            "preservation": PRESERVATION,
            "year": dates.today().year,
        }
