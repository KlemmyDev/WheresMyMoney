"""
Early retirement for the household's own numbers: builds the freedom model's household from the accounts, the
loan, super, the investments and the retirement settings, and answers every early-retirement question from it.

The plan's super fees are each fund's own (from its statement or the known fund's published fees), weighted by
balance, falling back to the 0.6% guess where none are known (decided 2026-11-09).
"""

from __future__ import annotations

from typing import Any

from app.core import dates
from app.features.accounts.service import AccountsService
from app.features.dashboard.service import DashboardService
from app.features.fire import debt, shocks, tax
from app.features.fire.model import FEE_GUESS, THE_PLAN, Household, Person, Plan, freedom, project
from app.features.fire.rules.load import rules_for
from app.features.investments.service import InvestmentsService
from app.features.retirement.service import RetirementService

EXTRAS = (250, 500, 1000)  # dollars a month, for loan or invest


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
        accounts: AccountsService,
        investments: InvestmentsService,
        retirement: RetirementService,
        dashboard: DashboardService,
    ):
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
        return {
            "ready": True,
            "today": _summary(today_plan),
            "plan": _summary(with_plan),
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
