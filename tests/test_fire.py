"""The early-retirement engine. Golden tests: the canvas's sample household reproduces the canvas's figures with the
0.6% fee guess (60 on today's plan, 57 with the plan), and the dates with ART's own 0.73% fees are pinned (61 and
58); $100 of pay lands as $68 in hand or $85 in super; $500 a month more clears the loan in October 2038 and saves
about $40,700 of interest; the named shocks last as the canvas says."""

from __future__ import annotations

import datetime as dt

import pytest
from fastapi.testclient import TestClient

from app.features.fire import debt, shocks, tax
from app.features.fire.model import THE_PLAN, Plan, freedom, project, sample, with_fee
from app.features.fire.rules import fy2027
from app.features.fire.rules.load import financial_year, rules_for
from tests.conftest import dollars, ok


def test_the_sample_household_matches_the_canvas() -> None:
    h = sample()
    assert round(h.real_growth, 6) == 0.04 and h.super_in == 20_910 and h.room == 35_400
    today = freedom(h, Plan())
    plan = freedom(h, THE_PLAN)
    assert today and today["retire_age"] == 60 and today["retire_year"] == 2048 and today["lasts"] == 93
    assert plan and plan["retire_age"] == 57 and plan["retire_year"] == 2045 and plan["lasts"] == 94
    assert today["loan_age"] == 52  # the loan's gone in 2040, early 2041 on the canvas's month count


def test_with_arts_own_fees_the_dates_move_a_year() -> None:
    art = with_fee(sample(), 0.0073)
    today, plan = freedom(art, Plan()), freedom(art, THE_PLAN)
    assert today and today["retire_age"] == 61
    assert plan and plan["retire_age"] == 58


def test_a_hundred_dollars_of_pay_lands_as_68_or_85() -> None:
    nd = tax.next_dollar(120_000, fy2027)
    assert nd == {"rate": pytest.approx(0.32), "in_hand": 68.0, "into_super": 85.0}
    assert tax.marginal_rate(40_000, fy2027) == pytest.approx(0.17)
    assert tax.marginal_rate(200_000, fy2027) == pytest.approx(0.47)
    # $120,000: 15% of 26,800 + 30% of 75,000 + 2% Medicare on all of it.
    assert tax.income_tax(120_000, fy2027) == pytest.approx(26_800 * 0.15 + 75_000 * 0.30 + 2_400)


def test_500_a_month_more_clears_the_loan_in_october_2038() -> None:
    d = debt.compare(sample(), 500, dt.date(2026, 11, 8))
    assert d["months"] == 143 and d["gone"] == "2038-10"
    assert d["base_months"] == 170 and d["base_gone"] == "2041-01"
    assert round(d["interest_saved"], -2) == 40_700


def test_the_named_shocks_last_as_the_canvas_says() -> None:
    h = sample()
    lasts = {s["key"]: s["lasts"] for s in shocks.all_shocks(h, THE_PLAN, 57)}
    assert lasts["rough"] == 78 and lasts["inflation"] == 81 and lasts["spend"] == 86
    # Working two more years after a rough start brings it back to 87.
    assert shocks.shocked(h, THE_PLAN, 59, "rough")["lasts"] == 87
    with pytest.raises(LookupError):
        shocks.shocked(h, THE_PLAN, 57, "meteor")


def test_part_time_and_the_age_pension_help() -> None:
    h = sample()
    base = project(h, THE_PLAN, 54)
    part = project(h, Plan(keep=True, part_time=(54, 60, 40_000)), 54)
    assert part["lasts"] >= base["lasts"]
    assert project(h, Plan(keep=True, pension=True), 57)["lasts"] >= project(h, THE_PLAN, 57)["lasts"]


def test_this_financial_year_has_a_rules_file() -> None:
    today = dt.date.today()
    assert financial_year(today) == rules_for(today).YEAR
    assert financial_year(dt.date(2026, 11, 9)) == 2027 and financial_year(dt.date(2027, 6, 30)) == 2027
    with pytest.raises(LookupError):
        rules_for(dt.date(2040, 1, 1))


def test_the_api_answers_for_the_households_own_numbers(client: TestClient, household: dict) -> None:
    assert ok(client.get("/api/fire"))["ready"] is False
    ok(
        client.post(
            "/api/retirement/people",
            json={"person": "Alex", "born": 1988, "balance": dollars(112600), "salary": dollars(120000), "rate": 0.12},
        )
    )
    f = ok(client.get("/api/fire"))
    assert f["ready"] is True and f["assumptions"]["fee_from"] in ("funds", "guess")
    assert f["next_dollar"][0]["in_hand"] == 68.0 and f["next_dollar"][0]["room"] == dollars(15600)
    assert f["rows"][0]["age"] == 38 and f["debt"] and f["debt"][0]["extra"] == dollars(250)
    assert {s["key"] for s in f["shocks"]} == {"rough", "inflation", "spend", "income"}
    assert f["bridge"]["years"] >= 0


def test_the_hub_has_milestones_scenarios_and_a_plan_to_make_yours(client: TestClient, household: dict) -> None:
    for name, born, balance, salary in (("Alex", 1988, 112600, 120000), ("Sam", 1990, 73800, 85000)):
        body = {"person": name, "born": born, "balance": dollars(balance), "salary": dollars(salary), "rate": 0.12}
        ok(client.post("/api/retirement/people", json=body))
    f = ok(client.get("/api/fire"))
    assert {s["key"] for s in f["scenarios"]} == {"today", "keep", "kill", "part"}
    assert f["milestones"]["full"]["age"] == f["plan"]["retire_age"]
    assert [p["opens"] for p in f["people"]] == [2048, 2050]
    assert 0 < f["progress"]["share"] < 1 and f["saved"] is None
    saved = ok(client.post("/api/fire/plan"))
    assert saved["saved"]["retire_age"] == f["plan"]["retire_age"] and saved["rules"]["now"] == []
    again = ok(client.get("/api/fire"))
    assert again["saved"]["retire_age"] == f["plan"]["retire_age"] and again["vs_plan"]["year"] == 2026
    ok(client.delete("/api/fire/plan"))
    assert ok(client.get("/api/fire"))["saved"] is None


def test_coast_is_when_saving_could_stop() -> None:
    from app.features.fire.model import coast

    h = sample()
    assert coast(h, THE_PLAN, 60) == 54
