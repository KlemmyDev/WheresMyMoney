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
    assert again["track"][-1]["expected"] == saved["saved"]["path"][0]["total"]
    assert again["vs_plan"]["actual"] == again["track"][-1]["actual"]
    now = client.app.state.services.fire.freedom_now()  # type: ignore[attr-defined]
    assert now["age"] == now["saved_age"] == f["plan"]["retire_age"]
    ok(client.delete("/api/fire/plan"))
    assert ok(client.get("/api/fire"))["saved"] is None


def test_coast_is_when_saving_could_stop() -> None:
    from app.features.fire.model import coast

    h = sample()
    assert coast(h, THE_PLAN, 60) == 54


def test_what_ifs_match_the_canvas_and_say_what_it_would_take() -> None:
    from app.features.fire import whatif

    h = sample()
    lv = whatif.levers_of({"retire_age": 57, "keep": True}, h)
    r = whatif.run(h, lv)
    assert r["result"]["ok"] and r["result"]["lasts"] == 94 and r["soonest"] == 57
    # The canvas's "Retire at 52": $3,000 a month spare, $70,000 a year once stopped, keep investing.
    r52 = whatif.run(h, whatif.levers_of({"retire_age": 52, "spare": 3000, "spend": 70000, "keep": True}, h))
    assert r52["soonest"] is not None and r52["soonest"] <= 52
    ideas = whatif.seek(h, lv, 52)
    kinds = {i["kind"] for i in ideas}
    assert {"save", "spend"} <= kinds
    save = next(i for i in ideas if i["kind"] == "save")
    assert save["spare"] and project(h, whatif.plan_of(save["levers"], h), 52)["ok"]
    assert whatif.seek(h, lv, 60)[0]["kind"] == "already"
    with pytest.raises(ValueError):
        whatif.levers_of({"where": "moon"}, h)


def test_scenarios_are_kept_and_compared(client: TestClient, household: dict) -> None:
    body = {"person": "Alex", "born": 1988, "balance": dollars(112600), "salary": dollars(120000), "rate": 0.12}
    ok(client.post("/api/retirement/people", json=body))
    lv = {"retire_age": 57, "spend": dollars(80000), "spare": dollars(1000), "where": "off", "keep": True}
    w = ok(client.post("/api/fire/whatif", json={"levers": lv, "target": 55}))
    assert w["levers"]["spend"] == dollars(80000) and w["result"]["retire_age"] == 57 and w["seek"]["target"] == 55
    saved = ok(client.post("/api/fire/scenarios", json={"name": "Keep investing", "levers": lv}))
    assert [s["name"] for s in saved] == ["Keep investing"] and saved[0]["result"]["retire_age"] == 57
    assert ok(client.delete(f"/api/fire/scenarios/{saved[0]['id']}")) == []
    assert client.post("/api/fire/scenarios", json={"name": "", "levers": lv}).status_code == 422


def test_each_retired_year_says_which_pot_paid_and_the_ladder_ranks_the_offset_first() -> None:
    from app.features.fire.service import ladder

    h = sample()
    rows = project(h, THE_PLAN, 57)["rows"]
    at57 = next(r for r in rows if r["age"] == 57)
    assert "paid" not in next(r for r in rows if r["age"] == 50)
    assert at57["paid"]["etfs"] > 0 and at57["paid"]["super"] == 0  # super's still locked at 57
    at62 = next(r for r in rows if r["age"] == 62)
    assert at62["paid"]["super"] > 0 and at62["paid"]["short"] == 0
    rungs = ladder(h)
    assert [r["key"] for r in rungs] == ["offset", "super", "etfs", "repay"]
    assert rungs[0]["in"] == 68.0 and rungs[1]["in"] == 85.0 and round(rungs[1]["rate"], 3) == 0.063


def test_loan_or_invest_matches_the_canvas() -> None:
    h = sample()
    off = debt.race(h, 500, "off")
    assert off["months"] == 143 and round(off["interest_saved"], -2) == 40_700 and off["retire_age"] == 56
    inv = debt.race(h, 500, "inv")
    assert inv["months"] == 170 and inv["interest_saved"] == 0 and inv["retire_age"] == 56 and inv["etf_extra"] > 0
    higher = debt.race(h, 500, "off", 0.005)
    assert higher["months"] == 149  # the canvas's +0.5%: 149 months


def test_each_shock_has_its_cheapest_fixes() -> None:
    h = sample()
    rough = shocks.fixes(h, THE_PLAN, 57, "rough")
    assert [(f["age"], f["lasts"]) for f in rough] == [(60, 93), (59, 87)]
    spend = shocks.fixes(h, THE_PLAN, 57, "spend")
    assert spend[0]["age"] == 58 and spend[0]["lasts"] == 92
    fan = shocks.fan(h, THE_PLAN, 57)
    assert fan["bad"]["lasts"] < fan["typical"]["lasts"] == 94 < fan["good"]["lasts"]


def test_a_cash_buffer_pays_in_bad_years_and_barely_helps_a_rough_start() -> None:
    from dataclasses import replace

    h = sample()
    two = replace(THE_PLAN, buffer_years=2)
    assert project(h, two, 57)["lasts"] == 92  # cash doesn't grow, so typical years end a little sooner
    rough = shocks.shocked(h, two, 57, "rough")
    assert rough["lasts"] == 79  # 78 without it: most of the money is in super and takes the fall anyway
    hit = next(r for r in rough["rows"] if r["age"] == 57)
    assert hit["paid"]["cash"] > 0 and hit["paid"]["etfs"] == 0


def test_drawdown_and_assumptions_answer_for_the_household(client: TestClient, household: dict) -> None:
    for name, born, balance, salary in (("Alex", 1988, 112600, 120000), ("Sam", 1990, 73800, 85000)):
        body = {"person": name, "born": born, "balance": dollars(balance), "salary": dollars(salary), "rate": 0.12}
        ok(client.post("/api/retirement/people", json=body))
    d = ok(client.post("/api/fire/drawdown", json={"buffer_years": 1, "pension": False}))
    assert [s["name"] for s in d["at_stop"]["supers"]] == ["Alex", "Sam"] and d["rows"][0]["age"] == d["retire_age"]
    assert client.post("/api/fire/drawdown", json={"buffer_years": 9}).status_code == 422
    a = ok(client.post("/api/fire/assume", json={"super_fee": 0.0073}))
    b = ok(client.post("/api/fire/assume", json={"super_fee": 0.006}))
    assert a["real_growth"] < b["real_growth"]
    ok(client.put("/api/retirement/settings", json={"super_fee": 0.0073}))
    assert ok(client.get("/api/fire"))["assumptions"]["fee_from"] == "set"
    assert client.put("/api/retirement/settings", json={"super_fee": 0.2}).status_code == 422


def test_the_plan_path_runs_a_year_a_step_from_the_day_it_was_saved() -> None:
    import datetime as dt

    from app.features.fire.service import _expected

    saved = {"date": "2026-07-01", "path": [{"year": 2026, "total": 100}, {"year": 2027, "total": 200}]}
    assert _expected(saved, dt.date(2026, 6, 30)) is None
    assert _expected(saved, dt.date(2026, 7, 1)) == 100
    assert _expected(saved, dt.date(2026, 12, 30)) == 150
    assert _expected(saved, dt.date(2030, 1, 1)) == 200


def test_set_your_goal_moves_the_dates_with_spending_and_fixed_balances(client: TestClient, household: dict) -> None:
    for name, born, balance, salary in (("Alex", 1988, 112600, 120000), ("Sam", 1990, 73800, 85000)):
        body = {"person": name, "born": born, "balance": dollars(balance), "salary": dollars(salary), "rate": 0.12}
        ok(client.post("/api/retirement/people", json=body))
    base = ok(client.post("/api/fire/goal", json={"spend": dollars(80000)}))
    more = ok(client.post("/api/fire/goal", json={"spend": dollars(100000)}))
    richer = ok(client.post("/api/fire/goal", json={"spend": dollars(80000), "supers": {"Alex": dollars(400000)}}))
    assert base["essentials"] == dollars(55200) and base["lean"]["retire_age"] <= base["plan"]["retire_age"]
    assert more["plan"]["retire_age"] >= base["plan"]["retire_age"]
    assert richer["plan"]["retire_age"] <= base["plan"]["retire_age"]
    assert client.post("/api/fire/goal", json={"spend": dollars(5000)}).status_code == 422


def test_set_your_goal_shows_the_dates_the_hub_will_once_saved(client: TestClient, household: dict) -> None:
    body = {"person": "Alex", "born": 1988, "balance": dollars(112600), "salary": dollars(120000), "rate": 0.12}
    alex = ok(client.post("/api/retirement/people", json=body))
    body = {"person": "Sam", "born": 1990, "balance": dollars(73800), "salary": dollars(85000), "rate": 0.12}
    body["fees"] = [{"name": "Admin", "kind": "pct", "amount": 0.012}]
    ok(client.post("/api/retirement/people", json=body))
    pre = ok(client.post("/api/fire/goal", json={"spend": dollars(100000), "supers": {"Alex": dollars(400000)}}))
    ok(client.put("/api/retirement/settings", json={"spending": dollars(100000)}))
    ok(client.put(f"/api/retirement/people/{alex['id']}", json={"balance": dollars(400000)}))
    hub = ok(client.get("/api/fire"))
    assert (pre["today"], pre["plan"]) == (hub["today"], hub["plan"])


def test_on_track_needs_agree_with_the_freedom_date() -> None:
    """Stopping at the freedom date works, so every part is on or ahead of its need; two years sooner doesn't, and
    the part that's short says why. Each need, with the plan's own contributions, gets exactly to its job."""
    from app.features.fire.need import checkpoints, closers

    h = sample()
    at = checkpoints(h, THE_PLAN, 57)
    assert at["result"]["ok"] and all(p["ahead"] >= 0 for p in at["parts"].values())
    soon = checkpoints(h, THE_PLAN, 55)
    assert not soon["result"]["ok"]
    assert soon["parts"]["outside"]["ahead"] < 0 and soon["parts"]["super"]["ahead"] < 0
    assert soon["parts"]["loan"]["ahead"] > 0  # the loan's gone in 2040, well before 2043
    years = {y["age"]: y for y in soon["years"]}
    assert years[60]["outside_need"] == 0 and years[92]["super_need"] == 0 and years[55]["owe_max"] == 0
    assert years[54]["owe_max"] > 0 and years[56]["owe_max"] is None
    # The super need rises while working (contributions take it there), then is spent down from 60.
    assert years[38]["super_need"] < years[60]["super_need"] > years[80]["super_need"]
    fixes = {c["key"]: c for c in closers(h, THE_PLAN, 55)}
    assert fixes["later"]["amount"] == 2 and fixes["etfs"]["amount"] == 1000 and fixes["spend"]["amount"] == 15_000
    assert "super" not in fixes  # super is locked until 60, so it can't pay for the years before
    assert closers(h, THE_PLAN, 57) == []


def test_extra_money_levers_bring_the_date_in() -> None:
    h = sample()
    base = freedom(h, Plan())
    assert base and base["retire_age"] == 60
    more = freedom(h, Plan(extra_etfs=1000))
    sac = freedom(h, Plan(extra_super=1000))
    loan = freedom(h, Plan(extra_loan=1000, keep=True))
    assert more and sac and loan
    assert more["retire_age"] < 60 and sac["retire_age"] <= 60 and loan["loan_age"] < base["loan_age"]


def test_the_goal_is_saved_and_tried(client: TestClient, household: dict) -> None:
    for name, born, balance, salary in (("Alex", 1988, 112600, 120000), ("Sam", 1990, 73800, 85000)):
        body = {"person": name, "born": born, "balance": dollars(balance), "salary": dollars(salary), "rate": 0.12}
        ok(client.post("/api/retirement/people", json=body))
    t = ok(client.get("/api/fire/track"))
    assert t["ready"] and t["goal"]["set"] is False and t["goal"]["age"] == t["pace"]["retire_age"]
    assert set(t["parts"]) == {"loan", "outside", "super"} and t["years"][0]["age"] == 38
    saved = ok(client.put("/api/fire/goal", json={"age": 52, "spend": dollars(70000), "plan_to": 95}))
    assert saved["goal"] == {**saved["goal"], "age": 52, "set": True, "spend": dollars(70000), "plan_to": 95}
    assert saved["at_goal"]["ok"] is False and saved["closers"]
    assert ok(client.get("/api/retirement"))["settings"]["spending"] == dollars(70000)
    tried = ok(client.post("/api/fire/track", json={"goal": 65, "extra_super": dollars(500)}))
    assert tried["at_goal"]["ok"] and tried["closers"] == [] and tried["levers"]["extra_super"] == dollars(500)
    assert ok(client.get("/api/fire/track"))["goal"]["age"] == 52  # trying saves nothing
    lower = ok(client.post("/api/fire/track", json={"supers": {"Alex": 0}}))
    assert lower["parts"]["super"]["have"] < t["parts"]["super"]["have"]
    assert client.put("/api/fire/goal", json={"age": 30}).status_code == 422
