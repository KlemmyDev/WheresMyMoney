"""Savings goals (made with an icon and a date, topped up) and telling the app the loan's rate changed."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import dollars, ok


def test_a_goal_keeps_its_icon_and_date_and_tops_up(client: TestClient, household: dict) -> None:
    goal = ok(
        client.post(
            "/api/goals",
            json={
                "account_id": household["Savings"],
                "name": "Kitchen",
                "target": dollars(12000),
                "icon": "home",
                "by_date": "2028-05-01",
            },
        )
    )
    assert goal["icon"] == "home" and goal["by_date"] == "2028-05-01" and goal["saved"] == 0
    goal = ok(client.post(f"/api/goals/{goal['id']}/top_up", json={"amount": dollars(250)}))
    assert goal["saved"] == dollars(250)
    # Changing one thing keeps the rest.
    goal = ok(client.put(f"/api/goals/{goal['id']}", json={"name": "New kitchen"}))
    assert goal["name"] == "New kitchen" and goal["icon"] == "home" and goal["saved"] == dollars(250)
    assert ok(client.post(f"/api/goals/{goal['id']}/top_up", json={"amount": -dollars(1000)}))["saved"] == 0


def test_a_goal_icon_must_be_one_of_ours(client: TestClient, household: dict) -> None:
    r = client.post(
        "/api/goals", json={"account_id": household["Savings"], "name": "X", "target": 100, "icon": "rocket"}
    )
    assert r.status_code == 422


def test_a_rate_change_updates_the_loan_and_its_history(client: TestClient, household: dict) -> None:
    before = ok(client.get("/api/loan"))["loan"]
    loan = ok(client.post("/api/loan/rate", json={"rate_bp": 637, "repayment": dollars(3240), "since": "2026-11-01"}))
    assert loan["rate_bp"] == 637 and loan["repayment"] == dollars(3240)
    changes = ok(client.get("/api/loan"))["changes"]
    rate = next(c for c in changes if c["field"] == "rate")
    assert rate == {
        "date": "2026-11-01",
        "field": "rate",
        "value": 637,
        "was": before["rate_bp"],
        "description": "Changed in the app",
    }
    # Keeping the repayment changes only the rate.
    loan = ok(client.post("/api/loan/rate", json={"rate_bp": 612, "since": "2026-11-12"}))
    assert loan["rate_bp"] == 612 and loan["repayment"] == dollars(3240)
    assert client.post("/api/loan/rate", json={"rate_bp": 0, "since": "2026-11-12"}).status_code == 422
