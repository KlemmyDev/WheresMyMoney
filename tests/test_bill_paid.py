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
