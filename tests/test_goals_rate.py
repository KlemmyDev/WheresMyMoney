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


def statement_row(client: TestClient, account_id: int, day: str, amount: int, description: str) -> None:
    db = client.app.state.services.db  # type: ignore[attr-defined]
    with db.writing() as conn:
        conn.execute(
            "INSERT INTO transactions (account_id, date, amount, description, kind, created_at)"
            " VALUES (?, ?, ?, ?, 'statement', 0)",
            (account_id, day, amount, description),
        )


def test_goal_transfers_are_matched_once(client: TestClient, household: dict) -> None:
    savings = household["Savings"]
    goal = ok(client.post("/api/goals", json={"account_id": savings, "name": "Kitchen!", "target": dollars(12000)}))
    assert goal["ref"] == "GOAL KITCHEN"
    ok(client.post(f"/api/goals/{goal['id']}/top_up", json={"amount": dollars(100)}))  # said it moved
    planned = ok(client.post(f"/api/goals/{goal['id']}/top_up", json={"amount": dollars(30), "moved": False}))
    assert planned["saved"] == dollars(100) and [p["amount"] for p in planned["planned"]] == [dollars(30)]

    statement_row(client, savings, "2026-11-10", dollars(100), "Transfer from Offset GOAL KITCHEN")  # the one said
    statement_row(client, savings, "2026-11-11", dollars(30), "GOAL-KITCHEN")  # the planned one
    statement_row(client, savings, "2026-11-11", dollars(50), "goal kitchen")  # a new one
    statement_row(client, savings, "2026-11-11", dollars(70), "GOAL KITCHENETTE")  # another goal's name
    statement_row(client, household["Offset"], "2026-11-11", dollars(20), "GOAL KITCHEN")  # not its account
    svc = client.app.state.services.accounts  # type: ignore[attr-defined]
    assert svc.match_goal_transfers() == 3
    assert svc.match_goal_transfers() == 0  # each counts once
    g = next(x for x in ok(client.get("/api/accounts"))["goals"] if x["id"] == goal["id"])
    assert g["saved"] == dollars(180) and g["planned"] == []


def test_a_planned_top_up_is_done_or_dropped(client: TestClient, household: dict) -> None:
    goal = ok(client.post("/api/goals", json={"account_id": household["Savings"], "name": "Trip", "target": 100000}))
    g = ok(client.post(f"/api/goals/{goal['id']}/top_up", json={"amount": 5000, "moved": False}))
    g = ok(client.post(f"/api/goals/moves/{g['planned'][0]['id']}", json={"moved": True}))
    assert g["saved"] == 5000 and g["planned"] == []
    g = ok(client.post(f"/api/goals/{goal['id']}/top_up", json={"amount": 2000, "moved": False}))
    g = ok(client.post(f"/api/goals/moves/{g['planned'][0]['id']}", json={"moved": False}))
    assert g["saved"] == 5000 and g["planned"] == []
