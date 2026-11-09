"""
Early retirement for the household's own numbers: builds the freedom model's household from the accounts, the
loan, super, the investments and the retirement settings, and answers every early-retirement question from it.

The plan's super fees are each fund's own (from its statement or the known fund's published fees), weighted by
balance, falling back to the 0.6% guess where none are known (decided 2026-11-09).
"""

from __future__ import annotations

import datetime as dt
import json
import time
from dataclasses import replace
from typing import Any

from app.core import dates
from app.core.database import Database
from app.features.accounts import ledger
from app.features.accounts.service import AccountsService
from app.features.dashboard.service import DashboardService
from app.features.fire import debt, need, shocks, tax, whatif
from app.features.fire.model import FEE_GUESS, THE_PLAN, Household, Person, Plan, coast, freedom, project
from app.features.fire.rules.load import rules_for
from app.features.investments.service import InvestmentsService
from app.features.retirement.service import RetirementService

EXTRAS = (250, 500, 1000)  # dollars a month, for loan or invest
SAVED = "fire:plan"  # kv: the plan the household made theirs, with its path then (to check in against)
GOAL = "fire:goal"  # kv: the age the household wants to stop work at ({"age": 55, "set_at": ...})
EXTRA_KV = "fire:extras"  # kv: extra a month the household has made part of the plan ({"extra_super": cents, ...})
CHECKS = "fire:checkpoints"  # kv: each checkpoint check-in, oldest first ({"date", "super", "etfs", "owed", ...})
EXTRA_KEYS = ("extra_super", "extra_etfs", "extra_loan")
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
        if settings.get("super_fee") is not None:
            fee, fee_from = float(settings["super_fee"]), "set"
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
        track = self.track(saved) if saved else None
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
            "vs_plan": _vs_plan(track[-1]) if track else None,
            "track": track,
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
            "ladder": ladder(h),
            "spare": round(h.spare * 100),
            "room": round(h.room * 100),
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

    def what_if(self, body: dict[str, Any]) -> dict[str, Any]:
        """The scenario page's levers: the result at their age to stop, the earliest they'd work from, and (with
        "target") what it would take to stop then."""
        built = self.household()
        if built is None:
            raise ValueError("Add each person's super first, on Retirement.")
        h, _ = built
        lv = whatif.levers_of(body.get("levers") or {}, h)
        r = whatif.run(h, lv)
        out: dict[str, Any] = {
            "levers": _lv_out(lv),
            "result": {**(_summary(r["result"]) or {}), "gap": r["result"]["gap"]},
            "soonest": r["soonest"],
            "rows": [_row(x) for x in r["result"]["rows"] if x["age"] <= max(h.plan_to, 92)],
            "bridge": bridge(h, r["result"]),
        }
        if body.get("target") is not None:
            target = int(body["target"])
            out["seek"] = {"target": target, "ideas": [_idea(i) for i in whatif.seek(h, lv, target)]}
        return out

    def scenarios_saved(self) -> list[dict[str, Any]]:
        built = self.household()
        with self.db.reading() as conn:
            rows = conn.execute("SELECT id, name, levers FROM fire_scenarios ORDER BY id").fetchall()
        out = []
        for scenario_id, name, levers in rows:
            item: dict[str, Any] = {"id": scenario_id, "name": name, "levers": json.loads(levers)}
            if built:
                h, _ = built
                lv = whatif.levers_of(_lv_in(item["levers"]), h)
                r = whatif.run(h, lv)
                item["result"] = _summary(r["result"])
                item["rows"] = [_row(x) for x in r["result"]["rows"] if x["age"] <= max(h.plan_to, 92)]
            out.append(item)
        return out

    def save_scenario(self, body: dict[str, Any]) -> list[dict[str, Any]]:
        name = " ".join(str(body.get("name") or "").split())[:40]
        if not name:
            raise ValueError("Give the scenario a name.")
        built = self.household()
        if built is None:
            raise ValueError("Add each person's super first, on Retirement.")
        h, _ = built
        lv = _lv_out(whatif.levers_of(body.get("levers") or {}, h))
        with self.db.writing() as conn:
            conn.execute(
                "INSERT INTO fire_scenarios (name, levers, created_at) VALUES (?, ?, ?)",
                (name, json.dumps(lv), int(time.time())),
            )
        return self.scenarios_saved()

    def remove_scenario(self, scenario_id: int) -> list[dict[str, Any]]:
        with self.db.writing() as conn:
            if not conn.execute("DELETE FROM fire_scenarios WHERE id = ?", (scenario_id,)).rowcount:
                raise LookupError("That scenario has gone.")
        return self.scenarios_saved()

    def debt_race(self, extra: float, into: str, rate_change: float) -> dict[str, Any]:
        built = self.household()
        if built is None:
            raise ValueError("Add each person's super first, on Retirement.")
        h, _ = built
        if into not in ("off", "inv"):
            raise ValueError("Put the extra into the offset or ETFs.")
        if not 0 <= extra <= 20_000 or not -0.05 <= rate_change <= 0.05:
            raise ValueError("Those aren't amounts we can use.")
        r = debt.race(h, extra, into, rate_change)
        start = dates.today().replace(day=1)
        return {
            **r,
            "extra": round(extra * 100),
            "interest_saved": round(r["interest_saved"] * 100),
            "etf_extra": round(r["etf_extra"] * 100),
            "gone": dates.add_months(start, int(r["months"])).isoformat()[:7],
            "base_gone": dates.add_months(start, int(r["base_months"])).isoformat()[:7],
            "start": start.isoformat()[:7],
        }

    def stress(self, shock: str | None) -> dict[str, Any]:
        built = self.household()
        if built is None:
            raise ValueError("Add each person's super first, on Retirement.")
        h, _ = built
        plan = freedom(h, THE_PLAN) or freedom(h, Plan())
        age = plan["retire_age"] if plan else 60
        base_plan = THE_PLAN if freedom(h, THE_PLAN) else Plan()
        out: dict[str, Any] = {
            "retire_age": age,
            "typical": project(h, base_plan, age)["lasts"],
            "shocks": shocks.all_shocks(h, base_plan, age),
            "fan": shocks.fan(h, base_plan, age),
        }
        if shock:
            hit = shocks.shocked(h, base_plan, age, shock)
            out["shock"] = {
                "key": shock,
                **shocks.SHOCKS[shock],
                "lasts": hit["lasts"],
                "ok": hit["ok"],
                "gap": hit["gap"],
                "path": [round((x["super"] + x["etfs"] + x["offset"]) * 100) for x in hit["rows"]],
                "fixes": shocks.fixes(h, base_plan, age, shock),
            }
        return out

    def drawdown(self, buffer_years: float, pension: bool) -> dict[str, Any]:
        """Once stopped at the plan's age: which pot pays each year, how long it lasts in typical years and after a
        rough start, with a cash buffer and the age pension as asked, and what's in each pot when stopping."""
        built = self.household()
        if built is None:
            raise ValueError("Add each person's super first, on Retirement.")
        h, _ = built
        if not 0 <= buffer_years <= 3:
            raise ValueError("A cash buffer of up to three years.")
        base = freedom(h, THE_PLAN) or freedom(h, Plan())
        age = base["retire_age"] if base else 60
        plan = replace(THE_PLAN if freedom(h, THE_PLAN) else Plan(), buffer_years=buffer_years, pension=pension)
        typical = project(h, plan, age)
        rough = shocks.shocked(h, plan, age, "rough")
        at = next(r for r in typical["rows"] if r["age"] == age)
        total_super = sum(p.super_balance for p in h.people) or 1
        return {
            "retire_age": age,
            "retire_year": h.year_at(age),
            "lasts": typical["lasts"],
            "rough": rough["lasts"],
            "spend": round(h.spend * 100),
            "at_stop": {
                "etfs": round((at["etfs"] + at["cash"]) * 100),
                "supers": [
                    {
                        "name": p.name,
                        "balance": round(at["super"] * p.super_balance / total_super * 100),
                        "opens": h.year + max(h.rules.PRESERVATION_AGE - p.age, 0),
                    }
                    for p in h.people
                ],
            },
            "rows": [_row(x) for x in typical["rows"] if age <= x["age"] <= max(h.plan_to, 92)],
        }

    def assume(self, body: dict[str, Any]) -> dict[str, Any]:
        """The dates with other guesses (super return, fee, inflation, plan-to age), before saving them."""
        built = self.household()
        if built is None:
            raise ValueError("Add each person's super first, on Retirement.")
        h, notes = built
        try:
            h = replace(
                h,
                super_return=float(body.get("super_return", h.super_return)),
                super_fee=float(body["super_fee"]) if body.get("super_fee") is not None else h.super_fee,
                inflation=float(body.get("inflation", h.inflation)),
                plan_to=int(body.get("plan_to", h.plan_to)),
            )
        except (TypeError, ValueError):
            raise ValueError("Those guesses aren't numbers we can use.") from None
        return {
            "real_growth": h.real_growth,
            "today": _summary(freedom(h, Plan())),
            "plan": _summary(freedom(h, THE_PLAN)),
            "fee_from": notes["fee_from"],
            "funds_fee": fund_fee(self.retirement.people())[0],
        }

    def goal(self, body: dict[str, Any]) -> dict[str, Any]:
        """Set your goal, as you answer: the dates with this spending a year and any super balances corrected
        ({"spend": cents, "supers": {name: cents}}), as things are, with the plan, and on essentials only."""
        built = self.household()
        if built is None:
            raise ValueError("Add each person's super first, on Retirement.")
        h, _ = built
        try:
            spend = float(body["spend"]) / 100 if body.get("spend") is not None else h.spend
            fixes = {str(k): float(v) / 100 for k, v in (body.get("supers") or {}).items()}
        except (TypeError, ValueError, AttributeError):
            raise ValueError("Those amounts aren't numbers we can use.") from None
        if not 20_000 <= spend <= 300_000:
            raise ValueError("Spending once stopped should be between $20,000 and $300,000 a year.")
        if any(v < 0 for v in fixes.values()):
            raise ValueError("A super balance can't be below $0.")
        people = [replace(p, super_balance=fixes.get(p.name, p.super_balance)) for p in h.people]
        h = replace(h, people=people, spend=spend)
        if fixes and self.retirement.settings().get("super_fee") is None:
            # Each fund's fees are weighted by balance, so a corrected balance moves the fee too.
            rows = [
                {**p, "balance": round(fixes[p["person"]] * 100)} if p["person"] in fixes else p
                for p in self.retirement.people()
            ]
            h = replace(h, super_fee=fund_fee(rows)[0])
        today_plan = freedom(h, Plan())
        with_plan = freedom(h, THE_PLAN)
        return {
            "spend": round(spend * 100),
            "essentials": round(spend * LEAN * 100),
            "today": _summary(today_plan),
            "plan": _summary(with_plan),
            "lean": _summary(freedom(h, replace(THE_PLAN, spend=spend * LEAN))),
            "lasts": with_plan["lasts"] if with_plan else None,
        }

    def track(self, saved: dict[str, Any]) -> list[dict[str, Any]]:
        """Each check-in (from a year before the plan was saved) and today: what was put away then (super, ETFs and
        the offset, as the plan counts it) against where the saved plan has it by then. In cents."""
        start = dt.date.fromisoformat(saved["date"])
        today = dates.today()
        with self.db.reading() as conn:
            days = [
                dt.date.fromisoformat(r[0])
                for r in conn.execute(
                    "SELECT DISTINCT date FROM checkins WHERE date >= ? AND date < ? ORDER BY date",
                    ((start - dt.timedelta(days=365)).isoformat(), today.isoformat()),
                )
            ]
        days.append(today)
        people = self.retirement.people()
        history = self.retirement.history()
        settings = self.retirement.settings()
        crypto = None if settings.get("count_crypto") else False
        etfs = self.investments.values_on(days, crypto=crypto)
        offsets = [a for a in self.accounts.overview()["accounts"] if a.get("offsets_loan")]
        out = []
        with self.db.reading() as conn:
            for day, etf in zip(days, etfs, strict=True):
                iso = day.isoformat()
                sup = 0
                for p in people:
                    values = history.get(p["id"]) or [(p["as_of"] or iso, p["balance"])]
                    then = [b for d, b in values if d <= iso]
                    sup += then[-1] if then else values[0][1]
                if day == today:
                    sup = sum(p["balance"] for p in people)
                off = (
                    sum(ledger.balance(conn, a["id"], iso) for a in offsets)
                    if day < today
                    else sum(a["balance"] for a in offsets)
                )
                out.append({"date": iso, "actual": sup + etf + off, "expected": _expected(saved, day)})
        return out

    def freedom_now(self) -> dict[str, Any] | None:
        """The plan's freedom date now against the saved plan's, for the notification; None with no saved plan."""
        saved = self.saved()
        if not saved:
            return None
        built = self.household()
        if built is None:
            return None
        h, _ = built
        now = freedom(h, THE_PLAN)
        return {
            "age": now["retire_age"] if now else None,
            "year": now["retire_year"] if now else None,
            "saved_age": saved["retire_age"],
            "saved_year": saved["retire_year"],
            "saved_at": saved.get("saved_at"),
        }

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

    def goal_saved(self) -> dict[str, Any] | None:
        with self.db.reading() as conn:
            row = conn.execute("SELECT value FROM kv WHERE key = ?", (GOAL,)).fetchone()
        return json.loads(row[0]) if row else None

    def current_plan(self) -> Plan:
        """Today's pace: the plan the household made theirs (keep the loan money working), else as things are, with
        any extra a month made part of the plan (from Close the gap)."""
        base = THE_PLAN if self.saved() else Plan()
        extras = self._kv(EXTRA_KV) or {}
        cents = {k: float(extras.get(k) or 0) / 100 for k in EXTRA_KEYS}
        return replace(
            base, extra_super=cents["extra_super"], extra_etfs=cents["extra_etfs"], extra_loan=cents["extra_loan"]
        )

    def _kv(self, key: str) -> Any:
        with self.db.reading() as conn:
            row = conn.execute("SELECT value FROM kv WHERE key = ?", (key,)).fetchone()
        return json.loads(row[0]) if row else None

    def _put_kv(self, key: str, value: Any) -> None:
        with self.db.writing() as conn:
            if value is None:
                conn.execute("DELETE FROM kv WHERE key = ?", (key,))
            else:
                conn.execute("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", (key, json.dumps(value)))

    def save_extras(self, body: dict[str, Any]) -> dict[str, Any]:
        """Make extra a month part of the plan: {"extra_super": cents, "extra_etfs": cents, "extra_loan": cents}
        (totals; a key left out keeps what's there). Never moves money. Returns what was there before (to undo)
        and the on-track answer now."""
        was = self._kv(EXTRA_KV) or {}
        now = dict(was)
        try:
            for k in EXTRA_KEYS:
                if k in body:
                    now[k] = int(body[k] or 0)
        except (TypeError, ValueError):
            raise ValueError("Those amounts aren't numbers we can use.") from None
        if any(v < 0 or v > 2_000_000 for v in now.values()):
            raise ValueError("Extra a month should be between $0 and $20,000.")
        self._put_kv(EXTRA_KV, {k: v for k, v in now.items() if v} or None)
        return {"was": was, "track": self.on_track()}

    def checkpoint(self, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """A checkpoint check-in: today's super, outside super and loan (as they are now in the app, after any
        balances were updated) against today's needs, and against the last check-in. With {"save": true} it's
        recorded for next time. In cents."""
        t = self.on_track()
        if not t["ready"]:
            raise ValueError(t["needs"])
        now = t["years"][0]
        snap = {
            "date": dates.today().isoformat(),
            "super": now["super"],
            "etfs": now["etfs"],
            "owed": now["owed"],
            "super_need": now["super_need"],
            "outside_need": now["outside_need"],
            "owe_max": now["owe_max"],
            "goal": t["goal"]["age"],
            "pace": (t["pace"] or {}).get("retire_age"),
        }
        history: list[dict[str, Any]] = self._kv(CHECKS) or []
        last = next((h for h in reversed(history) if h["date"] < snap["date"]), None)
        if (body or {}).get("save"):
            history = [h for h in history if h["date"] != snap["date"]] + [snap]
            self._put_kv(CHECKS, history[-40:])
        return {"now": snap, "last": last, "track": t}

    def on_track(self, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Are we on track: the goal (the age to stop, spending once stopped, plan-to age), the earliest today's
        pace gets to, each year's need for super, outside super and the loan against where the pace has them,
        today's three parts, and the smallest change that would close the gap. `body` tries other levers without
        saving: {"goal": 55, "spend": cents a year, "extra_super" / "extra_etfs" / "extra_loan": cents a month,
        "keep": bool, "plan_to": 92, "super_return": 0.07, "inflation": 0.03, "supers": {name: cents},
        "etfs": cents, "loan": cents owed}. Money out in cents."""
        built = self.household()
        if built is None:
            return {"ready": False, "needs": "Add each person's super first, on Retirement."}
        h, notes = built
        b = body or {}
        try:
            h = _with_overrides(h, b)
            base = self.current_plan()
            spend = float(b["spend"]) / 100 if b.get("spend") is not None else h.spend
            plan = replace(
                base,
                spend=spend,
                keep=bool(b["keep"]) if b.get("keep") is not None else base.keep,
                extra_super=_lever(b, "extra_super", base.extra_super),
                extra_etfs=_lever(b, "extra_etfs", base.extra_etfs),
                extra_loan=_lever(b, "extra_loan", base.extra_loan),
            )
        except (TypeError, ValueError, KeyError):
            raise ValueError("Those levers aren't numbers we can use.") from None
        if not 20_000 <= spend <= 300_000:
            raise ValueError("Spending once stopped should be between $20,000 and $300,000 a year.")
        if min(plan.extra_super, plan.extra_etfs, plan.extra_loan) < 0:
            raise ValueError("Extra money can't be below nothing.")
        saved_goal = self.goal_saved()
        pace = freedom(h, plan)
        goal = b.get("goal") or (saved_goal or {}).get("age") or (pace["retire_age"] if pace else 60)
        try:
            goal = int(goal)
        except (TypeError, ValueError):
            raise ValueError("Choose an age to stop work.") from None
        if not max(h.lead.age + 1, 40) <= goal <= 75:
            raise ValueError("Choose an age to stop between now and 75.")
        cp = need.checkpoints(h, plan, goal)
        r = cp["result"]
        ids = {p["person"]: p["id"] for p in self.retirement.people()}
        c = lambda v: round(v * 100) if v is not None else None  # noqa: E731
        return {
            "ready": True,
            "goal": {
                "age": goal,
                "year": h.year_at(goal),
                "set": bool(saved_goal),
                "set_at": (saved_goal or {}).get("set_at"),
                "spend": c(spend),
                "plan_to": h.plan_to,
            },
            "people": [
                {
                    "id": ids.get(p.name),
                    "name": p.name,
                    "age": p.age,
                    "opens": h.year + max(h.rules.PRESERVATION_AGE - p.age, 0),
                    "super": c(p.super_balance),
                    "salary": c(p.salary),
                    "employer": c(p.salary * p.employer_rate),
                    "sacrifice": c(p.sacrifice),
                }
                for p in h.people
            ],
            "opens": h.rules.PRESERVATION_AGE,
            "pace": _summary(pace),
            "at_goal": {**(_summary(r) or {}), "gap": r["gap"]},
            "parts": {k: {kk: c(vv) for kk, vv in v.items()} for k, v in cp["parts"].items()},
            "years": [
                {
                    "age": y["age"],
                    "year": y["year"],
                    **{k: c(y[k]) for k in ("super", "etfs", "owed", "super_need", "outside_need", "owe_max", "short")},
                    "put_in": {k: c(v) for k, v in y["put_in"].items()},
                    **({"paid": {k: c(v) for k, v in y["paid"].items()}} if y["paid"] else {}),
                }
                for y in cp["years"]
            ],
            "closers": [
                {**x, "amount": x["amount"] if x["key"] in ("keep", "later") else c(x["amount"])}
                for x in need.closers(h, plan, goal)
            ],
            "extras": {k: c(getattr(base, k)) for k in EXTRA_KEYS},
            "levers": {
                "goal": goal,
                "spend": c(spend),
                "keep": plan.keep,
                "extra_super": c(plan.extra_super),
                "extra_etfs": c(plan.extra_etfs),
                "extra_loan": c(plan.extra_loan),
            },
            "loan": {
                "repayment": c(h.repayment),
                "rate": h.loan_rate,
                "offset": c(h.offset),
                "gone_year": r["loan_year"],
            }
            if h.loan > 0
            else None,
            "saving": {"etfs": c(h.etf_saving / 12), "spare": c(h.spare), "room": c(h.room)},
            "take_home": 1 - h.marginal_rate,
            "cap": c(h.rules.CONCESSIONAL_CAP),
            "assumptions": {
                "real_growth": h.real_growth,
                "super_return": h.super_return,
                "fee": h.super_fee,
                "fee_from": notes["fee_from"],
                "inflation": h.inflation,
                "plan_to": h.plan_to,
            },
        }

    def sensitivity(self) -> dict[str, Any]:
        """How sure is the date: the earliest age to stop on today's pace, and the same with one guess changed at a
        time (returns, spending, super fees, the plan-to age), better and worse. Ages; None is "not by 70"."""
        built = self.household()
        if built is None:
            raise ValueError("Add each person's super first, on Retirement.")
        h, _ = built
        plan = self.current_plan()

        def earliest(hh: Household, p: Plan = plan) -> int | None:
            r = freedom(hh, p)
            return r["retire_age"] if r else None

        rows = [
            (
                "returns",
                "Returns",
                "1% a year higher / lower",
                replace(h, super_return=h.super_return + 0.01),
                replace(h, super_return=h.super_return - 0.01),
            ),
            ("spend", "Spending once stopped", "10% less / more", None, None),
            (
                "fees",
                "Super fees",
                "0.25% lower / 0.5% higher",
                replace(h, super_fee=max(h.super_fee - 0.0025, 0)),
                replace(h, super_fee=h.super_fee + 0.005),
            ),
            (
                "plan_to",
                "Plan to age",
                f"{h.plan_to - 2} / {h.plan_to + 3}",
                replace(h, plan_to=h.plan_to - 2),
                replace(h, plan_to=h.plan_to + 3),
            ),
            (
                "inflation",
                "Inflation",
                "0.5% lower / higher",
                replace(h, inflation=h.inflation - 0.005),
                replace(h, inflation=h.inflation + 0.005),
            ),
        ]
        spend = plan.spend if plan.spend is not None else h.spend
        out = []
        for key, name, what, better, worse in rows:
            if key == "spend":
                good, bad = earliest(h, replace(plan, spend=spend * 0.9)), earliest(h, replace(plan, spend=spend * 1.1))
            else:
                assert better is not None and worse is not None
                good, bad = earliest(better), earliest(worse)
            out.append({"key": key, "name": name, "what": what, "better": good, "worse": bad})
        return {"earliest": earliest(h), "rows": out}

    def save_goal(self, body: dict[str, Any]) -> dict[str, Any]:
        """Set the goal: {"age": 55, "spend": cents a year, "plan_to": 92} (the age can be left out to keep it). The age is kept for early retirement;
        spending and the plan-to age are the retirement settings every estimate uses."""
        try:
            age = int(body["age"] if body.get("age") is not None else (self.goal_saved() or {})["age"])
        except (KeyError, TypeError, ValueError):
            raise ValueError("Choose an age to stop work.") from None
        if not 40 <= age <= 75:
            raise ValueError("Choose an age to stop between 40 and 75.")
        change: dict[str, Any] = {"retire_age": age}
        if body.get("spend") is not None:
            change["spending"] = int(body["spend"])
        if body.get("plan_to") is not None:
            change["plan_to"] = int(body["plan_to"])
        self.retirement.save_settings(change)
        value = {"age": age, "set_at": int(time.time())}
        with self.db.writing() as conn:
            conn.execute("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", (GOAL, json.dumps(value)))
        return self.on_track()

    def unsave_plan(self) -> None:
        with self.db.writing() as conn:
            conn.execute("DELETE FROM kv WHERE key = ?", (SAVED,))


def _lever(b: dict[str, Any], key: str, saved: float) -> float:
    """A lever tried (cents a month, a total), else what the plan already has (dollars)."""
    return float(b[key]) / 100 if b.get(key) is not None else saved


def _with_overrides(h: Household, b: dict[str, Any]) -> Household:
    """The household with balances or guesses tried in place of its own (a check-in, the assumptions page)."""
    supers = {str(k): float(v) / 100 for k, v in (b.get("supers") or {}).items()}
    if any(v < 0 for v in supers.values()):
        raise ValueError("A super balance can't be below $0.")
    people = [replace(p, super_balance=supers.get(p.name, p.super_balance)) for p in h.people]
    h = replace(
        h,
        people=people,
        etfs=float(b["etfs"]) / 100 if b.get("etfs") is not None else h.etfs,
        loan=float(b["loan"]) / 100 + h.offset if b.get("loan") is not None else h.loan,
        super_return=float(b.get("super_return", h.super_return)),
        inflation=float(b.get("inflation", h.inflation)),
        plan_to=int(b.get("plan_to", h.plan_to)),
    )
    if b.get("super_fee") is not None:
        h = replace(h, super_fee=float(b["super_fee"]))
    return h


def _lv_out(lv: dict[str, Any]) -> dict[str, Any]:
    """Levers for the page: money in cents."""
    return {**lv, "spend": round(lv["spend"] * 100), "spare": round(lv["spare"] * 100)}


def _lv_in(lv: dict[str, Any]) -> dict[str, Any]:
    return {**lv, "spend": lv["spend"] / 100, "spare": lv["spare"] / 100}


def _idea(i: dict[str, Any]) -> dict[str, Any]:
    out = dict(i)
    for key in ("spare", "more", "spend", "less"):
        if out.get(key) is not None:
            out[key] = round(out[key] * 100)
    if out.get("levers"):
        out["levers"] = _lv_out(out["levers"])
    return out


def _mile(h: Household, age: int | None, spend: int | None = None) -> dict[str, Any] | None:
    if age is None:
        return None
    return {"age": age, "year": h.year_at(age), **({"spend": spend} if spend is not None else {})}


def _expected(saved: dict[str, Any], day: dt.date) -> int | None:
    """Where the saved plan has super, ETFs and the offset on this day: its yearly path, a year on from the day it
    was saved for each step, in between in a straight line. None before it was saved."""
    path = [p["total"] for p in saved.get("path", [])]
    start = dt.date.fromisoformat(saved["date"])
    if not path or day < start:
        return None
    t = (day - start).days / 365.25
    i = int(t)
    if i >= len(path) - 1:
        return path[-1]
    return round(path[i] + (path[i + 1] - path[i]) * (t - i))


def _vs_plan(now: dict[str, Any]) -> dict[str, Any] | None:
    """Today against the saved plan's path: ahead or behind, in cents."""
    if now["expected"] is None:
        return None
    return {
        "year": int(now["date"][:4]),
        "expected": now["expected"],
        "actual": now["actual"],
        "ahead": now["actual"] - now["expected"],
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
    out = {"age": r["age"], "year": r["year"], **{k: round(r[k] * 100) for k in ("super", "etfs", "offset")}}
    if r.get("cash"):
        out["cash"] = round(r["cash"] * 100)
    if "paid" in r:
        out["paid"] = {k: round(v * 100) for k, v in r["paid"].items()}
    return out


def ladder(h: Household) -> list[dict[str, Any]]:
    """What $100 more pay becomes in 10 years each way, for retiring early: after the tax going in, at a likely
    return (nominal), and whether it can be reached before super opens. Ranked as the canvas does: the offset
    while the loan's on, then salary sacrifice up to the room, then ETFs; extra repayments last (stuck)."""
    mtr = h.marginal_rate
    in_hand = 100 * (1 - mtr)
    into_super = 100 * (1 - h.rules.CONTRIBUTIONS_TAX)
    super_rate = (h.super_return - h.super_fee) * (1 - 0.115)  # earnings taxed 15%, less with franking: ~11.5%
    etf_rate = (h.super_return - 0.002) * (1 - mtr * 0.45)  # distributions taxed at your rate, growth half-taxed later
    rungs: list[dict[str, Any]] = []
    if h.loan > h.offset:
        rungs.append({"key": "offset", "in": in_hand, "rate": h.loan_rate, "reach": "any time", "risk": False})
    rungs += [
        {"key": "super", "in": into_super, "rate": super_rate, "reach": "locked until 60", "risk": True},
        {"key": "etfs", "in": in_hand, "rate": etf_rate, "reach": "any time", "risk": True},
    ]
    if h.loan > h.offset:
        rungs.append({"key": "repay", "in": in_hand, "rate": h.loan_rate, "reach": "stuck in the loan", "risk": False})
    return [
        {**r, "out": round(float(r["in"]) * (1 + float(r["rate"])) ** 10, 2), "in": round(float(r["in"]), 2)}
        for r in rungs
    ]


def _debt(d: dict[str, Any]) -> dict[str, Any]:
    return {**d, "extra": round(d["extra"] * 100), "interest_saved": round(d["interest_saved"] * 100)}
