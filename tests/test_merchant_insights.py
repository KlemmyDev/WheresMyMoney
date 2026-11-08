"""Regular payments found per merchant, a change in their price (and the reminder for it), and merchants that look
like one place suggested for merging."""

from __future__ import annotations

import datetime as dt

from fastapi.testclient import TestClient

from app.features.notifications.rules import BY_ID
from app.features.spending.directory import price_change, regular
from tests.conftest import ok
from tests.test_notifications import facts

TODAY = dt.date(2026, 11, 8)


def monthly(n: int, amount: int, start: dt.date = dt.date(2026, 1, 15)) -> list[tuple[str, int]]:
    out = []
    for i in range(n):
        m = start.month - 1 + i
        out.append((dt.date(start.year + m // 12, m % 12 + 1, start.day).isoformat(), amount))
    return out


def test_a_monthly_subscription_is_regular() -> None:
    r = regular(monthly(10, 1899), TODAY)
    assert r and r["label"] == "Every month" and r["fixed"] and r["typical"] == 1899
    assert r["next"] == "2026-11-15" and r["stopped"] is False


def test_groceries_on_no_schedule_arent_regular() -> None:
    visits = [(d, 8000) for d in ["2026-10-01", "2026-10-03", "2026-10-09", "2026-10-10", "2026-10-21", "2026-10-22"]]
    assert regular(visits, TODAY) is None


def test_a_stopped_subscription_is_noticed() -> None:
    r = regular(monthly(6, 1299), TODAY)  # last paid in June
    assert r and r["stopped"] is True


def test_a_price_rise_is_found() -> None:
    visits = monthly(7, 1899) + monthly(3, 2299, dt.date(2026, 8, 15))
    change = price_change(visits)
    assert change == {"was": 1899, "now": 2299, "date": "2026-08-15", "pct": 21.1, "up": True}
    reg = regular(visits, TODAY)
    assert reg and reg["typical"] == 2299 and reg["fixed"]  # what it costs now
    # A power bill that's different every time has no "price".
    assert (
        price_change(
            [(d, a) for (d, _), a in zip(monthly(6, 0), [15000, 18200, 13900, 16400, 21000, 17100], strict=True)]
        )
        is None
    )


def test_the_reminder_says_a_fresh_rise_once() -> None:
    change = {
        "key": "NETFLIX",
        "name": "Netflix",
        "label": "Every month",
        "was": 1899,
        "now": 2299,
        "date": "2026-11-05",
        "pct": 21.1,
        "up": True,
    }
    r = BY_ID["prices"]
    said = r.check(facts(today="2026-11-08", price_changes=[change]), r.values({}))
    assert said and said.title == "Netflix went up" and "$18.99 to $22.99" in said.body
    old = r.check(facts(today="2026-12-20", price_changes=[change]), r.values({}))
    assert old is None


def test_merchants_and_suggestions_over_the_api(client: TestClient, household: dict) -> None:
    acc = household["Spending"]

    def pay(amount: int, description: str, date: str) -> None:
        ok(
            client.post(
                "/api/transactions",
                json={"account_id": acc, "amount": -amount, "description": description, "date": date},
            )
        )

    for d, a in [*monthly(9, 1899, dt.date(2026, 1, 20)), ("2026-10-20", 2299)]:
        pay(a, "NETFLIX.COM", d)
    pay(4000, "LAVIDA POOLS", "2026-09-01")
    pay(150000, "LA VIDA POOLS", "2026-09-20")
    pay(2000, "PADDOCK BAKERY", "2026-10-01")
    pay(2500, "PADDOCK CAFE", "2026-10-05")

    listed = {m["key"]: m for m in ok(client.get("/api/merchants/directory"))}
    nf = next(m for k, m in listed.items() if k.startswith("NETFLIX"))
    assert nf["regular"]["label"] == "Every month" and nf["price_change"]["now"] == 2299
    d = ok(client.get(f"/api/merchants/directory/{nf['key']}"))
    assert d["regular"]["label"] == "Every month" and len(d["history"]) == 10

    sugg = ok(client.get("/api/merchants/suggestions"))
    keysets = [s["keys"] for s in sugg]
    # "LA VIDA POOLS" is grouped by its first two words, "LA VIDA".
    assert ["LA VIDA", "LAVIDA POOLS"] in keysets
    bakery = next(s for s in sugg if any("PADDOCK" in k for k in s["keys"]))
    assert bakery["keys"] == ["PADDOCK BAKERY", "PADDOCK CAFE"] and bakery["reason"] == "Both start with Paddock"
    ok(client.post("/api/merchants/suggestions/dismiss", json={"keys": bakery["keys"]}))
    assert bakery["keys"] not in [s["keys"] for s in ok(client.get("/api/merchants/suggestions"))]


def test_pay_from_a_rule_shows_under_money_in(client: TestClient, household: dict) -> None:
    from tests.test_imports import ubank, upload

    rows = [("29 Oct 2026", "SALARY ACME PTY LTD", "", "$6,950.00", "+$101,550.00")]
    opened = upload(client, ubank(rows), "Offset-2210_2026-10.csv")
    a = ok(client.post(f"/api/imports/{opened['token']}/analyse", json={"account_id": household["Offset"]}))
    assert a["rows"][0]["rule_kind"] == "pay"
    ok(client.post(f"/api/imports/{opened['token']}/commit", json={"account_id": household["Offset"]}))
    listed = {m["key"]: m for m in ok(client.get("/api/merchants/directory"))}
    acme = next(m for k, m in listed.items() if k.startswith("SALARY"))
    assert acme["direction"] == "in" and acme["received"] == 695000
    # Transfers between our own accounts still aren't merchants.
    assert not any(k.startswith("TRANSFER") for k in listed)


def test_catalogue_search_names_unmerge(client: TestClient, household: dict) -> None:
    acc = household["Spending"]
    shops = {b["key"]: b for b in ok(client.get("/api/businesses"))}
    assert shops["CHEESECAKE SHOP"]["name"] == "The Cheesecake Shop" and "THE CHEESECAKE SHOP" not in shops
    assert shops["WOOLWORTHS"]["category"] == "Groceries"

    # A cake shop under a name the app doesn't know, linked to the known business by merging into its key.
    tx = ok(
        client.post(
            "/api/transactions",
            json={"account_id": acc, "amount": -4995, "description": "THE CHEESECAKE KEPERRA", "date": "2026-10-11"},
        )
    )
    ok(client.post("/api/merchants/merge", json={"from": [tx["merchant_key"]], "into": "CHEESECAKE SHOP"}))
    again = next(t for t in ok(client.get("/api/transactions")) if t["id"] == tx["id"])
    assert again["merchant_key"] == "CHEESECAKE SHOP" and again["merchant_name"] == "The Cheesecake Shop"
    row = next(m for m in ok(client.get("/api/merchants/directory")) if m["key"] == "CHEESECAKE SHOP")
    assert "THE CHEESECAKE KEPERRA" in row["aliases"]
    d = ok(client.get("/api/merchants/directory/CHEESECAKE SHOP"))
    assert d["mapped"] == 1

    # Unmerge puts it back where it was.
    assert ok(client.post("/api/merchants/unmerge", json={"key": "CHEESECAKE SHOP"}))["moved"] == 1
    back = next(t for t in ok(client.get("/api/transactions")) if t["id"] == tx["id"])
    assert back["merchant_key"] == tx["merchant_key"]
