"""
The freedom model: when the household could stop work and still have money to its plan-to age (92), year by year
in today's dollars. Every early-retirement page reads it, so no page works out its own date.

A year at a time, from the lead person's age now:

- While working: super gets work's contributions (and any salary sacrifice) after the 15% going in; the ETFs get
  what's being invested; what's spare each month goes to the plan's split (the offset, ETFs, salary sacrifice).
- The loan runs month by month against the offset; once the offset matches it, it's gone and what's left of the
  offset joins the ETFs. From then on the repayment is free money too ("keep" sends it half to ETFs, half to super).
- Once stopped: spending (and the loan's repayments while it's still there) comes from the ETFs first, then the
  offset, then super once it opens. Before super opens, falling short is a gap in the bridge; after, running out
  sets how long it lasts.

Growth is one real rate (after fees and inflation) for super and the ETFs: (1 + return - fee) / (1 + inflation) - 1.
The canvas's sample household uses a 7.72% return, a 0.6% fee guess and 3% inflation: 4% real.

Money here is dollars (floats); the service converts from the app's cents.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from types import ModuleType
from typing import Any

from app.features.fire import tax
from app.features.fire.rules import fy2027

FEE_GUESS = 0.006  # a year, on the balance, when a fund's own fees aren't known
YOUNGEST, OLDEST = 45, 70  # the ages a freedom date is looked for between
LAST = 100


@dataclass(frozen=True)
class Person:
    name: str
    age: int
    super_balance: float
    salary: float
    employer_rate: float = 0.12
    sacrifice: float = 0.0  # salary sacrificed into super, a year before tax


@dataclass(frozen=True)
class Household:
    people: list[Person]
    etfs: float
    offset: float
    loan: float
    loan_rate: float  # a year
    repayment: float  # a month
    etf_saving: float  # put into the ETFs a year while working
    spare: float  # spare a month while working, sent by the plan's split
    spend: float  # a year once stopped, today's dollars
    year: int  # this calendar year, for turning ages into years
    super_return: float = 0.0772  # a year, before fees
    super_fee: float = FEE_GUESS
    inflation: float = 0.03
    plan_to: int = 92
    rules: ModuleType = fy2027

    @property
    def lead(self) -> Person:
        return self.people[0]

    @property
    def real_growth(self) -> float:
        return (1 + self.super_return - self.super_fee) / (1 + self.inflation) - 1

    @property
    def super_in(self) -> float:
        """What goes into super a year from work and salary sacrifice, after the tax going in."""
        return sum((p.salary * p.employer_rate + p.sacrifice) * (1 - self.rules.CONTRIBUTIONS_TAX) for p in self.people)

    @property
    def room(self) -> float:
        """What's left of the concessional caps this year, together (for more salary sacrifice)."""
        cap = self.rules.CONCESSIONAL_CAP
        return sum(max(cap - p.salary * p.employer_rate - p.sacrifice, 0) for p in self.people)

    @property
    def marginal_rate(self) -> float:
        return tax.marginal_rate(self.lead.salary, self.rules)

    def year_at(self, age: int) -> int:
        return self.year + (age - self.lead.age)


@dataclass(frozen=True)
class Plan:
    """What the household does: the split of what's spare while the loan's on (offset, ETFs, super), whether the
    freed-up money keeps working once it's gone, and the what-ifs."""

    split: tuple[float, float, float] = (1.0, 0.0, 0.0)
    keep: bool = False  # once the loan's gone, its repayment and the spare go half to ETFs, half to super
    spare: float | None = None  # a month; the household's own unless set
    spend: float | None = None  # a year once stopped; the household's own unless set
    part_time: tuple[int, int, float] | None = None  # (from age, to age, income a year)
    pension: bool = False  # a simple full-rate age pension from 67
    one_off: tuple[int, float] | None = None  # (age, amount into or out of the ETFs)
    returns: dict[int, float] = field(default_factory=dict)  # real growth by age, where it differs
    growth_change: float = 0.0  # added to the real growth every year (a high-inflation shock is -0.01)


def project(h: Household, plan: Plan, retire_age: int) -> dict[str, Any]:
    """Year by year from now to 100: each year's super, ETFs and offset (today's dollars), whether the plan works
    (no gap before super opens, lasting to the plan-to age), when it runs out and when the loan's gone."""
    rules = h.rules
    inf = h.inflation
    mtr = h.marginal_rate
    spare = (plan.spare if plan.spare is not None else h.spare) * 12
    spend = plan.spend if plan.spend is not None else h.spend
    after = (0.0, 0.5, 0.5) if plan.keep else (0.0, 0.0, 0.0)
    loan_year = h.repayment * 12
    monthly = h.loan_rate / 12
    opens = rules.PRESERVATION_AGE
    pension = rules.AGE_PENSION_COUPLE * (1 if len(h.people) > 1 else 0.66)
    sup = sum(p.super_balance for p in h.people)
    etf = h.etfs
    owed, offset = float(h.loan), float(h.offset)
    loan = owed > offset
    gap: int | None = None
    out: int | None = None
    loan_age: int | None = None if loan else h.lead.age
    rows: list[dict[str, Any]] = []
    for k, age in enumerate(range(h.lead.age, LAST + 1)):
        growth = plan.returns.get(age, h.real_growth) + plan.growth_change
        rows.append(
            {
                "age": age,
                "year": h.year_at(age),
                "super": max(sup, 0.0),
                "etfs": max(etf, 0.0),
                "offset": offset / (1 + inf) ** k if loan else 0.0,
            }
        )
        working = age < retire_age
        surplus = spare if loan else spare + loan_year
        share = plan.split if loan else after
        # Salary sacrifice: before-tax dollars, up to the room under the caps; what doesn't fit goes to the ETFs.
        sacrifice = min(surplus * share[2] / (1 - mtr), h.room)
        to_etfs = surplus * share[1] + (surplus * share[2] - sacrifice * (1 - mtr))
        to_offset = surplus * share[0]
        if loan:
            for _ in range(12):
                interest = max(owed - offset, 0) * monthly
                owed -= h.repayment - interest
                if working:
                    offset += to_offset * (1 + inf) ** k / 12
                if owed <= offset:
                    break
            if owed <= offset:
                loan = False
                loan_age = age + 1
                etf += (offset - owed) / (1 + inf) ** (k + 1)
                offset = owed = 0.0
        sup *= 1 + growth
        etf *= 1 + growth
        if plan.one_off and plan.one_off[0] == age:
            etf = max(0.0, etf + plan.one_off[1])
        if working:
            sup += h.super_in + sacrifice * (1 - rules.CONTRIBUTIONS_TAX)
            etf += h.etf_saving + to_etfs
            continue
        part = plan.part_time
        in_part = part is not None and part[0] <= age < part[1]
        need = spend + (loan_year if loan else 0) - (part[2] if in_part and part else 0)
        need -= pension if plan.pension and age >= rules.AGE_PENSION_AGE else 0
        if in_part and part:
            sup += part[2] * rules.SUPER_GUARANTEE
        need = max(0.0, need)
        take = min(etf, need)
        etf -= take
        need -= take
        if loan and need > 1:
            reachable = offset / (1 + inf) ** k
            take = min(reachable, need)
            offset -= take * (1 + inf) ** k
            need -= take
        if age < opens:
            if need > 1 and gap is None:
                gap = age
        else:
            take = min(sup, need)
            sup -= take
            need -= take
            if need > 1 and out is None:
                out = age
    lasts = out if out is not None else LAST + 1
    return {
        "retire_age": retire_age,
        "retire_year": h.year_at(retire_age),
        "ok": gap is None and lasts >= h.plan_to,
        "gap": gap,
        "lasts": lasts,
        "loan_age": loan_age,
        "loan_year": h.year_at(loan_age) if loan_age is not None else None,
        "rows": rows,
    }


def freedom(h: Household, plan: Plan) -> dict[str, Any] | None:
    """The earliest age the plan works (from 45 to 70), with its projection; None if it doesn't by 70."""
    for age in range(YOUNGEST, OLDEST + 1):
        result = project(h, plan, age)
        if result["ok"]:
            return result
    return None


THE_PLAN = Plan(keep=True)  # the canvas's suggested plan: keep the loan money working once it's gone


def sample() -> Household:
    """The canvas's sample household (Sunday 8 November 2026): Alex 38 and Sam, $186,400 in super, $42,980 of ETFs,
    $69,019.75 offsetting a $542,300 loan at 6.12% with $3,180 a month repayments, $1,000 a month spare and $6,000
    a year into ETFs, spending $80,000 a year once stopped."""
    return Household(
        people=[
            Person("Alex", 38, 112_600, 120_000),
            Person("Sam", 36, 73_800, 85_000),
        ],
        etfs=42_980,
        offset=69_019.75,
        loan=542_300,
        loan_rate=0.0612,
        repayment=3_180,
        etf_saving=6_000,
        spare=1_000,
        spend=80_000,
        year=2026,
    )


def with_fee(h: Household, fee: float) -> Household:
    return replace(h, super_fee=fee)
