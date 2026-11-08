"""The spending forecast: habits found and expected on their days, weekdays learned, and how far it's trusted."""

from __future__ import annotations

import datetime as dt
import random

from fastapi.testclient import TestClient

from app.features.spending.forecast import Spend, accuracy, find_habits, forecast
from tests.conftest import ok

TODAY = dt.date(2026, 11, 12)  # a Thursday


def days_back(n: int) -> list[dt.date]:
    return [TODAY - dt.timedelta(days=i) for i in range(n, 0, -1)]


def test_too_little_history_is_no_forecast_yet() -> None:
    history = [Spend(d, 5000, "Groceries", "WOOLWORTHS") for d in days_back(5)]
    f = forecast(history, TODAY, TODAY + dt.timedelta(days=10), 0)
    assert not f["ready"] and f["history_days"] == 5 and f["days"] == []


def test_a_weekly_habit_is_expected_on_its_day() -> None:
    history = [Spend(d, 1995, "Sport & fitness", "ANYTIME FITNESS") for d in days_back(90) if d.weekday() == 0]
    history += [Spend(d, 3000, "Groceries", "WOOLWORTHS") for d in days_back(90)]
    habits = find_habits(history, TODAY)
    assert [(h.merchant, h.every, h.amount) for h in habits] == [("ANYTIME FITNESS", 7, 1995)]
    f = forecast(history, TODAY, TODAY + dt.timedelta(days=6), 0)
    monday = next(d for d in f["days"] if dt.date.fromisoformat(d["date"]).weekday() == 0)
    assert any(x["kind"] == "habit" and x["amount"] == 1995 for x in monday["items"])
    # Not counted twice: the gym isn't in the everyday spending as well.
    assert {x["name"] for x in f["days"][1]["items"]} == {"Groceries"}


def test_a_habit_that_stopped_isnt_expected() -> None:
    history = [Spend(d, 1995, "Sport & fitness", "GYM") for d in days_back(120)[:40] if d.weekday() == 0]
    history += [Spend(d, 3000, "Groceries", "WOOLWORTHS") for d in days_back(120)]
    assert find_habits(history, TODAY) == []


def test_the_weekend_shop_is_learned() -> None:
    history = [Spend(d, 20000 if d.weekday() == 5 else 1000, "Groceries", "SHOP") for d in days_back(120)]
    f = forecast(history, TODAY, TODAY + dt.timedelta(days=6), 0)
    by_day = {dt.date.fromisoformat(d["date"]).weekday(): d["expected"] for d in f["days"]}
    assert by_day[5] > 5 * by_day[2]
    # And a steady household is forecast closely.
    assert (accuracy(history, TODAY) or 0) > 0.9


def test_more_history_makes_it_more_sure() -> None:
    rng = random.Random(4)
    history = [
        Spend(d, round(rng.uniform(2000, 9000) * (2.5 if d.weekday() >= 5 else 1)), "Groceries", "SHOP")
        for d in days_back(365)
    ]
    short = [s for s in history if (TODAY - s.date).days <= 45]
    assert (accuracy(history, TODAY) or 0) >= (accuracy(short, TODAY) or 0)


def test_whats_already_gone_today_comes_off_today() -> None:
    history = [Spend(d, 5000, "Groceries", "SHOP") for d in days_back(60)]
    f = forecast(history, TODAY, TODAY + dt.timedelta(days=2), 3000)
    assert f["days"][0]["expected"] == 2000 and f["days"][1]["expected"] == 5000


def test_the_spending_month_carries_what_was_expected(client: TestClient, household: dict) -> None:
    e = ok(client.get("/api/spending"))["month"]["expected"]
    # A new household: nothing to learn from yet, so no expected line and no likely finish.
    assert e["ready"] is False and e["daily"] == [] and e["rest"] is None and e["needs_days"] == 14
