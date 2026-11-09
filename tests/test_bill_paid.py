"""Marking a bill paid by hand: a typed-in payment of it, shown as paid on the due date it covers, undone by removing
that payment."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import dollars, ok


def first_due(client: TestClient) -> dict:
    return ok(client.get("/api/dashboard"))["due"]["items"][0]


def test_paying_a_bill_marks_its_due_date_paid_and_undo_takes_it_back(client: TestClient, household: dict) -> None:
    due = first_due(client)
    assert due["paid"] is None
    paid = ok(client.post(f"/api/bills/{due['bill_id']}/pay", json={}))
    assert paid["amount"] == due["amount"]
    again = next(d for d in ok(client.get("/api/dashboard"))["due"]["items"] if d["bill_id"] == due["bill_id"])
    assert again["paid"] and again["paid"]["transaction_id"] == paid["transaction_id"]
    [tx] = [t for t in ok(client.get("/api/transactions")) if t["id"] == paid["transaction_id"]]
    assert tx["amount"] == -due["amount"] and tx["kind"] == "manual"

    ok(client.delete(f"/api/transactions/{paid['transaction_id']}"))
    assert first_due(client)["paid"] is None


def test_a_bill_can_be_paid_a_different_amount(client: TestClient, household: dict) -> None:
    due = first_due(client)
    paid = ok(client.post(f"/api/bills/{due['bill_id']}/pay", json={"amount": dollars(215)}))
    assert paid["amount"] == dollars(215)


def test_a_bill_cant_be_paid_on_a_day_still_to_come(client: TestClient, household: dict) -> None:
    due = first_due(client)
    assert client.post(f"/api/bills/{due['bill_id']}/pay", json={"date": "2099-01-01"}).status_code == 422


def test_a_bills_page_knows_the_due_date_to_mark_paid(client: TestClient, household: dict) -> None:
    due = first_due(client)
    page = ok(client.get(f"/api/bills/{due['bill_id']}"))
    assert page["due"]["date"] == due["date"] and page["due"]["paid"] is None
    ok(client.post(f"/api/bills/{due['bill_id']}/pay", json={}))
    assert ok(client.get(f"/api/bills/{due['bill_id']}"))["due"]["paid"]


def test_a_removed_bill_comes_back_with_undo(client: TestClient, household: dict) -> None:
    bill_id = first_due(client)["bill_id"]
    ok(client.delete(f"/api/bills/{bill_id}"))
    assert bill_id not in [b["id"] for b in ok(client.get("/api/bills"))["bills"]]
    back = ok(client.post(f"/api/bills/{bill_id}/restore"))
    assert bill_id in [b["id"] for b in back["bills"]]
    assert client.post(f"/api/bills/{bill_id}/restore").status_code == 404


def test_the_bills_page_says_whats_due_before_pay_and_where_each_bill_stands(
    client: TestClient, household: dict
) -> None:
    page = ok(client.get("/api/bills"))
    before = page["before_pay"]
    # Today is 12 November and pay moves $1,200 in on the 26th. Rates were due on the 10th and are late; internet
    # (12th) and water (15th) come before pay.
    assert before["pay_day"] == "2026-11-26" and before["moves_in"] == dollars(1200)
    assert [d["name"] for d in before["items"]] == ["Council rates", "Internet", "Water"]
    assert before["total"] == dollars(787) and before["covered"] and before["leaves"] == dollars(8120 - 787)
    assert page["calendar"]["month"] == "2026-11"
    assert {b["name"]: b["status"] for b in page["bills"]} == {
        "Council rates": "late",
        "Internet": "soon",
        "Water": "soon",
    }

    due = first_due(client)
    ok(client.post(f"/api/bills/{due['bill_id']}/pay", json={}))
    page = ok(client.get("/api/bills"))
    [bill] = [b for b in page["bills"] if b["id"] == due["bill_id"]]
    assert bill["status"] == "paid"
    assert due["name"] not in [d["name"] for d in page["before_pay"]["items"]]


def test_a_paused_bill_skips_its_due_dates_until_it_comes_back(client: TestClient, household: dict) -> None:
    bill = next(b for b in ok(client.get("/api/bills"))["bills"] if b["name"] == "Internet")
    assert bill["next_due"] == "2026-11-12" and bill["paused_until"] is None
    ok(client.put(f"/api/bills/{bill['id']}", json={"paused_until": "2027-01-01"}))
    page = ok(client.get("/api/bills"))
    paused = next(b for b in page["bills"] if b["id"] == bill["id"])
    assert paused["paused_until"] == "2027-01-01" and paused["next_due"] == "2027-01-12"
    assert all(d["bill_id"] != bill["id"] for d in page["calendar"]["items"])
    # Ending the pause brings its dates back; other changes keep a pause.
    ok(client.put(f"/api/bills/{bill['id']}", json={"paused_until": "2027-01-01"}))
    ok(client.put(f"/api/bills/{bill['id']}", json={"amount": 9900}))
    assert next(b for b in ok(client.get("/api/bills"))["bills"] if b["id"] == bill["id"])["paused_until"]
    ok(client.put(f"/api/bills/{bill['id']}", json={"paused_until": None}))
    back = next(b for b in ok(client.get("/api/bills"))["bills"] if b["id"] == bill["id"])
    assert back["paused_until"] is None and back["next_due"] == "2026-11-12"


def test_an_amount_that_varies_is_apart_from_how_its_paid(client: TestClient, household: dict) -> None:
    bill = next(b for b in ok(client.get("/api/bills"))["bills"] if b["name"] == "Water")
    ok(client.put(f"/api/bills/{bill['id']}", json={"varies": True, "how": "manual"}))
    water = next(b for b in ok(client.get("/api/bills"))["bills"] if b["id"] == bill["id"])
    assert water["varies"] is True and water["how"] == "manual"
    # The old way of saying it still works: an estimate that comes out by itself.
    ok(client.put(f"/api/bills/{bill['id']}", json={"how": "estimate"}))
    water = next(b for b in ok(client.get("/api/bills"))["bills"] if b["id"] == bill["id"])
    assert water["varies"] is True and water["how"] == "auto"


def test_an_older_estimate_bill_becomes_one_that_varies(tmp_path) -> None:
    import sqlite3

    from app.core.schema import MIGRATIONS, _bill_pause_and_varies

    conn = sqlite3.connect(tmp_path / "old.db")
    at = MIGRATIONS.index(_bill_pause_and_varies)
    for step in MIGRATIONS[:at]:
        step(conn)
    conn.execute(
        "INSERT INTO bills (name, amount, every, next_due, how, match, created_at)"
        " VALUES ('Power', 20000, 'quarterly', '2026-12-01', 'estimate', '', 0)"
    )
    MIGRATIONS[at](conn)
    assert conn.execute("SELECT how, varies, paused_until FROM bills").fetchone() == ("auto", 1, None)
