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


def _goal(client: TestClient, household: dict) -> dict:
    return ok(
        client.post(
            "/api/goals",
            json={"account_id": household["Savings"], "name": "Japan trip", "target": dollars(8000), "saved": 0},
        )
    )


def test_a_removed_goal_leaves_the_list_and_comes_back_with_undo(client: TestClient, household: dict) -> None:
    goal = _goal(client, household)
    ok(client.post(f"/api/goals/{goal['id']}/top_up", json={"amount": dollars(500)}))
    ok(client.delete(f"/api/goals/{goal['id']}"))
    assert goal["id"] not in [g["id"] for g in ok(client.get("/api/accounts"))["goals"]]
    assert client.post(f"/api/goals/{goal['id']}/top_up", json={"amount": 100}).status_code == 404
    back = ok(client.post(f"/api/goals/{goal['id']}/restore"))
    assert back["saved"] == dollars(500)
    assert goal["id"] in [g["id"] for g in ok(client.get("/api/accounts"))["goals"]]
    assert client.post(f"/api/goals/{goal['id']}/restore").status_code == 404


def test_a_reached_goal_says_what_happened_to_the_money(client: TestClient, household: dict) -> None:
    goal = _goal(client, household)
    assert goal["reached_at"] is None
    reached = ok(client.post(f"/api/goals/{goal['id']}/reached", json={"outcome": "offset"}))
    assert reached["reached_at"] == "2026-11-12" and reached["outcome"] == "offset"
    assert client.post(f"/api/goals/{goal['id']}/reached", json={"outcome": "lottery"}).status_code == 422
    undone = ok(client.post(f"/api/goals/{goal['id']}/reached", json={"outcome": None}))
    assert undone["reached_at"] is None and undone["outcome"] is None


def test_a_lump_sum_from_the_offset_lowers_both_and_undo_puts_them_back(client: TestClient, household: dict) -> None:
    before = ok(client.get("/api/loan"))
    offset = next(a for a in ok(client.get("/api/accounts"))["accounts"] if a["name"] == "Offset")
    done = ok(
        client.post(
            "/api/loan/change", json={"kind": "lump", "amount": dollars(20000), "from_account": household["Offset"]}
        )
    )
    assert done["loan"]["balance"] == before["loan"]["balance"] - dollars(20000)
    after = next(a for a in ok(client.get("/api/accounts"))["accounts"] if a["name"] == "Offset")
    assert after["balance"] == offset["balance"] - dollars(20000)
    lump = next(c for c in ok(client.get("/api/loan"))["changes"] if c["field"] == "lump")
    assert lump["value"] == dollars(20000) and lump["description"] == "Lump sum from Offset"

    ok(client.post("/api/loan/change/undo", json={"undo": done["undo"]}))
    assert ok(client.get("/api/loan"))["loan"]["balance"] == before["loan"]["balance"]
    back = next(a for a in ok(client.get("/api/accounts"))["accounts"] if a["name"] == "Offset")
    assert back["balance"] == offset["balance"]
    assert all(c["field"] != "lump" for c in ok(client.get("/api/loan"))["changes"])


def test_refinancing_sets_the_lender_and_rate_and_undo_restores_them(client: TestClient, household: dict) -> None:
    before = ok(client.get("/api/loan"))["loan"]
    done = ok(
        client.post(
            "/api/loan/change",
            json={"kind": "refinance", "lender": "Bank Two", "rate_bp": 599, "rate_type": "fixed", "costs": 35000},
        )
    )
    loan = done["loan"]
    assert loan["rate_bp"] == 599 and loan["lender"] == "Bank Two" and loan["rate_type"] == "fixed"
    fields = {c["field"] for c in ok(client.get("/api/loan"))["changes"]}
    assert {"refinance", "rate"} <= fields
    ok(client.post("/api/loan/change/undo", json={"undo": done["undo"]}))
    loan = ok(client.get("/api/loan"))["loan"]
    assert loan["rate_bp"] == before["rate_bp"] and loan["lender"] is None
    assert client.post("/api/loan/change", json={"kind": "refinance", "rate_bp": 0}).status_code == 422


def test_a_new_repayment_is_kept_in_the_loans_history(client: TestClient, household: dict) -> None:
    done = ok(client.post("/api/loan/change", json={"kind": "repayment", "repayment": dollars(4000)}))
    assert done["loan"]["repayment"] == dollars(4000)
    change = next(c for c in ok(client.get("/api/loan"))["changes"] if c["field"] == "repayment")
    assert change["value"] == dollars(4000) and change["was"] == dollars(3770)
