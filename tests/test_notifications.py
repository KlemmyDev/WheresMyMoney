"""What the household is told: each rule's occasion, said once, and only ever by web push."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from app.features.notifications.rules import BY_ID, Facts
from tests.conftest import ok


def facts(**over: Any) -> Facts:
    base: dict[str, Any] = {
        "today": "2026-11-12",
        "hour": 18,
        "checkin_due": None,
        "last_checkin": None,
        "flags": [],
        "bills": None,
        "spending": None,
        "bills_ahead": [],
        "last_statement": "2026-11-10",
    }
    return Facts(**{**base, **over})


def say(rule: str, f: Facts, **values: float) -> Any:
    r = BY_ID[rule]
    return r.check(f, r.values(values))


def month(groceries: int, fun: int, vs_pace: int = 0) -> dict[str, Any]:
    return {
        "start": "2026-10-25",
        "remaining": 12,
        "left": 90000,
        "allowance": 320000,
        "vs_pace": vs_pace,
        "categories": [
            {"id": 1, "name": "Groceries", "budget": 120000, "spent": groceries},
            {"id": 2, "name": "Fun", "budget": 25000, "spent": fun},
            {"id": 3, "name": "Coffee", "budget": None, "spent": 5000},
        ],
    }


def test_a_budget_is_told_when_nearly_used_and_again_only_when_it_goes_over() -> None:
    assert say("budgets", facts(spending=month(100000, 10000))) is None
    close = say("budgets", facts(spending=month(110000, 10000)))
    assert close.title == "A budget is nearly used up"
    assert close.body == "Groceries has $100 left of $1,200. 12 days until the top-up."
    # Spending more but still close: the same occasion, so it isn't said again.
    assert say("budgets", facts(spending=month(115000, 10000))).key == close.key
    over = say("budgets", facts(spending=month(125000, 10000)))
    assert over.key != close.key and over.title == "A budget has gone over"
    assert over.body.startswith("Groceries is $50 over its $1,200")
    assert say("budgets", facts(spending=month(110000, 10000)), percent=95) is None


def test_spending_is_told_against_the_plan_not_per_day() -> None:
    assert say("plan", facts(spending=month(0, 0, vs_pace=10000))) is None
    s = say("plan", facts(spending=month(0, 0, vs_pace=20000)))
    assert s.title == "Spending is ahead of the plan" and "a day" not in s.body
    assert s.body.startswith("$200 more has gone than the plan has by now")


def test_a_bill_paid_by_hand_is_told_days_before() -> None:
    bills = [
        {"name": "Water", "amount": 18600, "date": "2026-11-14", "how": "manual"},
        {"name": "Internet", "amount": 8900, "date": "2026-11-14", "how": "auto"},
    ]
    s = say("by_hand", facts(bills_ahead=bills))
    assert s.title == "A bill to pay by hand in 2 days" and s.body == "Water ($186)"
    assert say("by_hand", facts(bills_ahead=bills), days=1) is None
    assert say("by_hand", facts(bills_ahead=bills, today="2026-11-13"), days=1).title.endswith("tomorrow")


def test_statements_to_import_are_told_once_a_week() -> None:
    assert say("import", facts(last_statement="2026-11-01")) is None
    first = say("import", facts(last_statement="2026-10-29"))
    assert first.title == "Time to import the statements" and "14 days ago" in first.body
    assert say("import", facts(last_statement="2026-10-29", today="2026-11-15")).key == first.key
    assert say("import", facts(last_statement="2026-10-29", today="2026-11-19")).key != first.key
    assert say("import", facts(last_statement="2026-10-29", hour=7)) is None
    assert say("import", facts(last_statement=None)) is None


def test_notifications_go_only_by_web_push(client: TestClient) -> None:
    v = ok(client.get("/api/notifications"))
    assert "channels" not in v and {r["id"] for r in v["rules"]} == set(BY_ID)
    assert "safe_low" not in BY_ID and next(r for r in v["rules"] if r["id"] == "by_hand")["units"] == {
        "days": "days before"
    }
    v = ok(client.put("/api/notifications/rules/by_hand", json={"values": {"days": 3}}))
    assert next(r for r in v["rules"] if r["id"] == "by_hand")["values"] == {"days": 3}
    assert client.put("/api/notifications/channels/ntfy", json={"url": "https://ntfy.sh/x"}).status_code in (404, 405)
    r = client.post("/api/notifications/test", json={"target": "push"})
    assert r.status_code == 422 and "No device" in r.json()["detail"]
    with client.app.state.services.db.reading() as conn:  # type: ignore[attr-defined]
        tables = {t[0] for t in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert "notify_channels" not in tables


def test_new_bills_spotted_are_told_once_per_set() -> None:
    rule = BY_ID["spotted"]
    assert rule.check(facts(), rule.defaults) is None
    one = rule.check(facts(spotted=[{"key": "NETFLIX|monthly", "name": "Netflix"}]), rule.defaults)
    assert one and one.title == "Netflix looks like a bill" and one.url == "/bills/spotted"
    two = rule.check(
        facts(spotted=[{"key": "NETFLIX|monthly", "name": "Netflix"}, {"key": "GYM|weekly", "name": "Gym"}]),
        rule.defaults,
    )
    assert two and two.title == "We spotted 2 bills" and two.key != one.key
