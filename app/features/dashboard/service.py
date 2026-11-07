"""
The dashboard: loan coverage, interest avoided, the bills buffer and spending month, savings goals, cash flow,
the accounts, the payday rules and the bills due, in one answer.

Cash flow counts money coming into and going out of the household: transfers between its own accounts (a rule's
transfer, the Transfer category or uBank's "Transfer" rows) are neither.

Everything here blocks on SQLite, so call it through asyncio.to_thread from async code.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from app.core import dates
from app.core.database import Database
from app.features.accounts import ledger, loan
from app.features.accounts.service import AccountsService
from app.features.bills.service import BillsService
from app.features.checkins.service import CheckinService
from app.features.rules.service import RulesService
from app.features.spending.service import SpendingService

PERIODS = {"30d": 30, "6m": 182, "1y": 365, "all": 730}


class DashboardService:
    def __init__(
        self,
        db: Database,
        accounts: AccountsService,
        bills: BillsService,
        rules: RulesService,
        spending: SpendingService,
        checkins: CheckinService,
    ):
        self.db = db
        self.accounts = accounts
        self.bills = bills
        self.rules = rules
        self.spending = spending
        self.checkins = checkins

    def spending_month(self, ov: dict[str, Any] | None = None) -> dict[str, Any] | None:
        ov = ov or self.accounts.overview()
        spend = [a for a in ov["accounts"] if a["role"] == "spending"]
        if not spend:
            return None
        top_up = next(
            (r for r in self.rules.all(enabled_only=True) if r.kind == "top_up" and r.to_account == spend[0]["id"]),
            None,
        )
        allowance = spend[0]["allowance"] or (top_up.amount if top_up else 0)
        return {
            "account_id": spend[0]["id"],
            **self.spending.month([a["id"] for a in spend], sum(a["balance"] for a in spend), allowance, top_up),
            "top_up": top_up.view() if top_up else None,
        }

    def growth(self, ov: dict[str, Any]) -> tuple[int, int]:
        """The offsets' monthly growth: recently (from the balances) and as planned (from the rules)."""
        lo = ov["loan"]
        spend = next((a for a in ov["accounts"] if a["role"] == "spending"), None)
        allowance = (spend or {}).get("allowance") or 0
        planned = self.rules.month(self.bills.per_month(), allowance, (lo or {}).get("repayment") or 0)
        recent = self.accounts.offsetting_growth()
        return recent or planned["surplus"], planned["surplus"]

    def build(self, period: str = "6m") -> dict[str, Any]:
        span = PERIODS.get(period, PERIODS["6m"])
        today = dates.today()
        ov = self.accounts.overview()
        lo = ov["loan"]
        owed = lo["balance"] if lo else 0
        rate = (lo or {}).get("rate_bp") or 0
        offsetting = ov["offsetting"]
        offset_only = sum(a["balance"] for a in ov["accounts"] if a["role"] == "offset")
        recent, planned = self.growth(ov)
        eta = loan.project(owed, offsetting, rate, (lo or {}).get("repayment") or 0, recent) if lo else None

        month_start = today.replace(day=1)
        last_month_end = (month_start - dt.timedelta(days=1)).isoformat()
        with self.db.reading() as conn:
            offsetting_then = sum(
                ledger.balance(conn, a["id"], last_month_end) for a in ov["accounts"] if a["offsets_loan"]
            )
            owed_then = ledger.balance(conn, lo["id"], last_month_end) if lo else 0
            series = {
                a["id"]: ledger.series(conn, a["id"], today - dt.timedelta(days=span - 1), today)
                for a in ov["accounts"]
            }
        per_day = loan.daily_interest(offsetting, owed, rate)
        # Interest avoided each month, from each day's offsetting total.
        interest_months: list[dict[str, Any]] = []
        totals_by_day: dict[str, int] = {}
        for a in ov["accounts"]:
            if not a["offsets_loan"]:
                continue
            for day, value in series[a["id"]]:
                totals_by_day[day] = totals_by_day.get(day, 0) + value
        for day, value in sorted(totals_by_day.items()):
            month = day[:7]
            if not interest_months or interest_months[-1]["month"] != month:
                interest_months.append({"month": month, "total": 0.0, "days": 0})
            interest_months[-1]["total"] += loan.daily_interest(value, owed, rate)
            interest_months[-1]["days"] += 1
        for m in interest_months:
            m["per_day"] = m["total"] / m["days"] if m["days"] else 0
        this_month = next((m for m in interest_months if m["month"] == today.strftime("%Y-%m")), None)

        bills_acct = next((a for a in ov["accounts"] if a["role"] == "bills"), None)
        savings = [a for a in ov["accounts"] if a["role"] == "savings"]
        due = self.bills.due(today, today + dt.timedelta(days=30))
        return {
            "today": today.isoformat(),
            "period": period,
            "coverage": {
                "offsetting": offsetting,
                "offset_only": offset_only,
                "loan": owed,
                "ratio": offsetting / owed if owed else None,
                "offset_ratio": offset_only / owed if owed else None,
                "change_mtd": (offsetting / owed - offsetting_then / owed_then) if owed and owed_then else None,
                "eta": eta.date if eta else None,
                "goal": (lo or {}).get("goal_date"),
                "rate_bp": rate,
            },
            "interest": {
                "per_day": per_day,
                "this_month": this_month["total"] if this_month else 0,
                "per_year": per_day * 365,
                "months": [{"month": m["month"], "per_day": m["per_day"]} for m in interest_months],
            },
            "bills": bills_acct
            and {
                "account_id": bills_acct["id"],
                "balance": bills_acct["balance"],
                "target": bills_acct["target"],
            },
            "spending": self.spending_month(ov),
            "savings": {
                "balance": sum(a["balance"] for a in savings),
                "goals": [g for g in ov["goals"] if any(g["account_id"] == a["id"] for a in savings)],
            }
            if savings
            else None,
            "flow": self.flow(span),
            "accounts": [
                {
                    "id": a["id"],
                    "name": a["name"],
                    "role": a["role"],
                    "colour": a["colour"],
                    "balance": a["balance"],
                    "change_30d": a["change_30d"],
                    "target": a["target"],
                    "offsets_loan": a["offsets_loan"],
                    "spark": _sample([v for _, v in series[a["id"]]], 30),
                }
                for a in ov["accounts"]
            ],
            "loan": lo,
            "rules": [r.view() for r in self.rules.all()],
            "due": {"total": sum(int(x["amount"]) for x in due), "count": len(due), "items": due},
            "checkin": {
                "last": self.checkins.last(),
                "next": self.checkins.next_reminder().isoformat(),
                "flags": self.checkins.flags(),
            },
            "growth": {"recent": recent, "planned": planned},
        }

    def flow(self, span_days: int) -> list[dict[str, Any]]:
        """Money in and out of the household each month (transfers between its own accounts left out)."""
        today = dates.today()
        months = max(1, min(round(span_days / 30.4), 24))
        start = dates.add_months(today.replace(day=1), -(months - 1))
        with self.db.reading() as conn:
            rows = conn.execute(
                "SELECT substr(t.date, 1, 7), SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END),"
                " SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END) FROM transactions t"
                " JOIN accounts a ON a.id = t.account_id AND a.kind = 'bank'"
                " LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN rules r ON r.id = t.rule_id"
                " WHERE t.date >= ? AND t.kind IN ('statement', 'manual', 'cash')"
                " AND (t.rule_id IS NULL OR r.kind = 'pay')"
                " AND COALESCE(c.kind, '') != 'transfer' AND upper(t.description) != 'TRANSFER'"
                " GROUP BY 1 ORDER BY 1",
                (start.isoformat(),),
            ).fetchall()
        found = {m: (i or 0, o or 0) for m, i, o in rows}
        out = []
        for n in range(months):
            month = dates.add_months(start, n).strftime("%Y-%m")
            i, o = found.get(month, (0, 0))
            out.append({"month": month, "in": i, "out": o, "partial": month == today.strftime("%Y-%m")})
        return out


def _sample(values: list[int], n: int) -> list[int]:
    if len(values) <= n:
        return values
    step = (len(values) - 1) / (n - 1)
    return [values[round(i * step)] for i in range(n)]
