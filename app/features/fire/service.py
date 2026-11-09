"""
Early retirement for the household's own numbers: builds the freedom model's household from the accounts, the
loan, super, the investments and the retirement settings, and answers every early-retirement question from it.

The plan's super fees are each fund's own (from its statement or the known fund's published fees), weighted by
balance, falling back to the 0.6% guess where none are known (decided 2026-11-09).
"""

from __future__ import annotations

import json
import time
from dataclasses import replace
from typing import Any

from app.core import dates
from app.core.database import Database
from app.features.accounts.service import AccountsService
from app.features.dashboard.service import DashboardService
from app.features.fire import debt, shocks, tax
from app.features.fire.model import FEE_GUESS, THE_PLAN, Household, Person, Plan, coast, freedom, project
from app.features.fire.rules.load import rules_for
from app.features.investments.service import InvestmentsService
from app.features.retirement.service import RetirementService

EXTRAS = (250, 500, 1000)  # dollars a month, for loan or invest
SAVED = "fire:plan"  # kv: the plan the household made theirs, with its path then (to check in against)
LEAN = 0.69  # essentials as a share of the spending planned (the canvas's $55,000 of $80,000)


def fund_fee(people: list[dict[str, Any]]) -> tuple[float, str]:
    """Super fees a year as a share of the balance, weighted by balance: each fund's own where known, else the guess.
    Returns the rate and where it came from ("funds" or "guess")."""
    total = 0.0
    weighted = 0.0
    for p in people:
        fees = p.get("fees") or []
        options = p.get("options") or []
        if not fees and not options:
            continue
        balance = max(p["balance"], 1) / 100
        pct = sum(f["amount"] for f in fees if f["kind"] == "pct")
        pct += sum(o["share"] * (o.get("fee_pct") or 0) for o in options)
        pct += sum(f["amount"] for f in fees if f["kind"] == "fixed") / 100 / balance
        weighted += pct * balance
        total += balance
    return (weighted / total, "funds") if total else (FEE_GUESS, "guess")


class FireService:
    def __init__(
        self,
        db: Database,
        accounts: AccountsService,
        investments: InvestmentsService,
        retirement: RetirementService,
        dashboard: DashboardService,
    ):
        self.db = db
        self.accounts = accounts
        self.investments = investments
        self.retirement = retirement
        self.dashboard = dashboard

    def household(self) -> tuple[Household, dict[str, Any]] | None:
        """The household for the model, and notes on where its numbers came from; None until there's super."""
        people = self.retirement.people()
        if not people:
            return None
        settings = self.retirement.settings()
        ov = self.accounts.overview()
        lo = ov["loan"]
        funds = self.investments.overview()["funds"]
        etfs = sum(f["value"] for f in funds if f.get("kind") != "crypto" or settings.get("count_crypto"))
        _, planned = self.dashboard.growth(ov)
        fee, fee_from = fund_fee(people)
        today = dates.today()
        h = Household(
            people=[
                Person(
                    p["person"],
                    p["age"],
                    p["balance"] / 100,
                    p["salary"] / 100,
                    p["rate"],
                    p.get("sacrifice", 0) / 100,
                )
                for p in people
            ],
            etfs=etfs / 100,
            offset=ov["offsetting"] / 100,
            loan=(lo["balance"] if lo else 0) / 100,
            loan_rate=((lo or {}).get("rate_bp") or 0) / 10000,
            repayment=((lo or {}).get("repayment") or 0) / 100,
            etf_saving=max(self.investments.bought_lately(), 0) / 100,
            spare=max(planned, 0) / 100,
            spend=settings["spending"] / 100,
            year=today.year,
            super_return=settings["super_return"],
            super_fee=fee,
            inflation=settings["inflation"],
            plan_to=settings.get("plan_to", 92),
            rules=rules_for(today),
        )
        return h, {"fee": fee, "fee_from": fee_from, "count_crypto": bool(settings.get("count_crypto"))}

    def overview(self) -> dict[str, Any]:
        """Freedom on today's plan and with the plan (keep the loan money working once it's gone), where the next
        $100 of pay lands for each person, loan or invest, the bridge before super opens, and what could go wrong."""
        built = self.household()
        if built is None:
            return {"ready": False, "needs": "Add each person's super first, on Retirement."}
        h, notes = built
        today_plan = freedom(h, Plan())
        with_plan = freedom(h, THE_PLAN)
        chosen = with_plan or today_plan
        age = chosen["retire_age"] if chosen else 70
        path = chosen or project(h, THE_PLAN, age)
        at = next((r for r in path["rows"] if r["age"] == age), path["rows"][-1])
        lean = freedom(h, replace(THE_PLAN, spend=h.spend * LEAN))
        coast_age = coast(h, THE_PLAN, h.rules.PRESERVATION_AGE)
        loan = debt.compare(h, 0) if h.loan > h.offset else None
        now_put_away = sum(p.super_balance for p in h.people) + h.etfs
        target = at["super"] + at["etfs"]
        saved = self.saved()
        return {
            "ready": True,
            "today": _summary(today_plan),
            "plan": _summary(with_plan),
            "people": [
                {"name": p.name, "age": p.age, "opens": h.year + max(h.rules.PRESERVATION_AGE - p.age, 0)}
                for p in h.people
            ],
            "put_away": {"super": round(at["super"] * 100), "etfs": round(at["etfs"] * 100), "age": age},
            "progress": {
                "now": round(now_put_away * 100),
                "target": round(target * 100),
                "share": now_put_away / target if target else 0,
            },
            "loan": ({"gone": loan["base_gone"], "freed": round((h.repayment + h.spare) * 100)} if loan else None),
            "milestones": {
                "coast": _mile(h, coast_age),
                "lean": _mile(h, lean["retire_age"] if lean else None, round(h.spend * LEAN * 100)),
                "full": _mile(h, age, round(h.spend * 100)),
            },
            "scenarios": self.scenarios(h, today_plan, with_plan),
            "saved": saved,
            "vs_plan": _vs_plan(saved, now_put_away + h.offset) if saved else None,
            "rows": [_row(r) for r in (chosen or project(h, THE_PLAN, age))["rows"] if r["age"] <= max(h.plan_to, 92)],
            "bridge": bridge(h, chosen or project(h, THE_PLAN, age)),
            "next_dollar": [
                {
                    "person": p.name,
                    **tax.next_dollar(p.salary, h.rules),
                    "room": round(max(h.rules.CONCESSIONAL_CAP - p.salary * p.employer_rate - p.sacrifice, 0) * 100),
                }
                for p in h.people
            ],
            "debt": [_debt(debt.compare(h, x)) for x in EXTRAS] if h.loan > h.offset else [],
            "shocks": shocks.all_shocks(h, THE_PLAN, age),
            "assumptions": {
                "real_growth": h.real_growth,
                "super_return": h.super_return,
                "fee": notes["fee"],
                "fee_from": notes["fee_from"],
                "inflation": h.inflation,
                "plan_to": h.plan_to,
                "count_crypto": notes["count_crypto"],
                "rules_year": h.rules.YEAR,
            },
        }

    def scenarios(
        self, h: Household, today_plan: dict[str, Any] | None, with_plan: dict[str, Any] | None
    ) -> list[dict[str, Any]]:
        """The what-ifs the hub lists: each with the age it works from and how long the money lasts."""
        out = []
        for key, name, plan in (
            ("today", "Today's plan", Plan()),
            ("keep", "Keep investing the loan money", THE_PLAN),
            ("kill", "Kill the loan first", replace(THE_PLAN, spare=h.spare * 1.5)),
        ):
            r = today_plan if key == "today" else with_plan if key == "keep" else freedom(h, plan)
            out.append({"key": key, "name": name, **(_summary(r) or {"retire_age": None, "ok": False, "lasts": None})})
        base = (with_plan or today_plan or {}).get("retire_age") or 60
        part_from = max(base - 3, h.lead.age + 1)
        part = project(h, replace(THE_PLAN, part_time=(part_from, h.rules.PRESERVATION_AGE, 40_000)), part_from)
        out.append({"key": "part", "name": f"Part-time from {part_from}", **(_summary(part) or {})})
        return out

    def saved(self) -> dict[str, Any] | None:
        with self.db.reading() as conn:
            row = conn.execute("SELECT value FROM kv WHERE key = ?", (SAVED,)).fetchone()
        return json.loads(row[0]) if row else None

    def save_plan(self) -> dict[str, Any]:
        """Make the suggested plan the household's: its date and path now, to check in against. It never moves
        money: the rule changes it implies come back to offer."""
        built = self.household()
        if built is None:
            raise ValueError("Add each person's super first, on Retirement.")
        h, _ = built
        result = freedom(h, THE_PLAN)
        if result is None:
            raise ValueError("The plan doesn't work by 70 yet, so there's nothing to make the plan.")
        snapshot = {
            "kind": "keep",
            "saved_at": int(time.time()),
            "date": dates.today().isoformat(),
            "retire_age": result["retire_age"],
            "retire_year": result["retire_year"],
            "lasts": result["lasts"],
            "loan_year": result["loan_year"],
            "path": [
                {"year": r["year"], "total": round((r["super"] + r["etfs"] + r["offset"]) * 100)}
                for r in result["rows"]
                if r["age"] <= result["retire_age"]
            ],
        }
        with self.db.writing() as conn:
            conn.execute("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", (SAVED, json.dumps(snapshot)))
        return {
            "saved": snapshot,
            # Nothing to change today: while the loan's on, what's spare keeps going to the offset. Once it's gone,
            # its repayment and the spare go half to ETFs, half to salary sacrifice.
            "rules": {
                "now": [],
                "later": {
                    "year": result["loan_year"],
                    "monthly": round((h.repayment + h.spare) * 100),
                    "split": {"etfs": 0.5, "super": 0.5},
                },
            },
        }

    def unsave_plan(self) -> None:
        with self.db.writing() as conn:
            conn.execute("DELETE FROM kv WHERE key = ?", (SAVED,))


def _mile(h: Household, age: int | None, spend: int | None = None) -> dict[str, Any] | None:
    if age is None:
        return None
    return {"age": age, "year": h.year_at(age), **({"spend": spend} if spend is not None else {})}


def _vs_plan(saved: dict[str, Any], now_total: float) -> dict[str, Any] | None:
    """This year against the saved plan's path: ahead or behind, in cents."""
    year = dates.today().year
    expected = next((p["total"] for p in saved.get("path", []) if p["year"] == year), None)
    if expected is None:
        return None
    return {
        "year": year,
        "expected": expected,
        "actual": round(now_total * 100),
        "ahead": round(now_total * 100) - expected,
    }


def bridge(h: Household, result: dict[str, Any]) -> dict[str, Any]:
    """The years between stopping and super opening, what they need (spending, and the loan while it's on) and
    what's outside super to pay for them when stopping (the ETFs and the offset)."""
    age = result["retire_age"]
    opens = h.rules.PRESERVATION_AGE
    years = max(opens - age, 0)
    at = next((r for r in result["rows"] if r["age"] == age), None)
    outside = (at["etfs"] + at["offset"]) if at else 0.0
    loan_years = max(min(opens, result["loan_age"] or opens) - age, 0) if result["loan_age"] else years
    need = h.spend * years + h.repayment * 12 * loan_years
    return {
        "years": years,
        "opens_year": h.year_at(opens),
        "outside": round(outside * 100),
        "need": round(need * 100),
        "covered": outside >= need,
    }


def _summary(r: dict[str, Any] | None) -> dict[str, Any] | None:
    if r is None:
        return None
    return {k: r[k] for k in ("retire_age", "retire_year", "ok", "lasts", "loan_age", "loan_year")}


def _row(r: dict[str, Any]) -> dict[str, Any]:
    return {"age": r["age"], "year": r["year"], **{k: round(r[k] * 100) for k in ("super", "etfs", "offset")}}


def _debt(d: dict[str, Any]) -> dict[str, Any]:
    return {**d, "extra": round(d["extra"] * 100), "interest_saved": round(d["interest_saved"] * 100)}
