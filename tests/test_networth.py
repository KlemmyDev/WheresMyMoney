"""Net worth: things owned valued by hand (with each value kept), and the picture over time."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import dollars, ok


def test_a_home_keeps_each_value(client: TestClient, household: dict) -> None:
    home = ok(client.post("/api/networth/assets", json={"kind": "home", "value": dollars(760000)}))
    assert home["name"] == "Home" and home["value"] == dollars(760000) and home["as_of"] == "2026-11-12"
    home = ok(client.put(f"/api/networth/assets/{home['id']}", json={"value": dollars(780000)}))
    assert home["value"] == dollars(780000) and len(home["values"]) == 1  # same day: replaced
    assert client.post("/api/networth/assets", json={"kind": "boat"}).status_code == 422
    assert client.post("/api/networth/assets", json={"kind": "car"}).status_code == 422  # needs a value


def test_the_picture_adds_it_all_up(client: TestClient, household: dict) -> None:
    ok(client.post("/api/networth/assets", json={"kind": "home", "value": dollars(760000)}))
    ok(client.post("/api/retirement/people", json={"person": "Alex", "born": 1988, "balance": dollars(112600)}))
    n = ok(client.get("/api/networth?range=1y"))
    now = n["now"]
    accounts = ok(client.get("/api/accounts"))
    assert now["accounts"] == accounts["total"]
    assert now["loan"] == accounts["loan"]["balance"]
    assert now["home"] == dollars(760000) and now["super"] == dollars(112600) and now["shares"] == 0
    assert len(n["history"]) == 13 and n["history"][-1]["date"] == "2026-11-12"
    # The home's value before it was given: the first one.
    assert n["history"][0]["home"] == dollars(760000)


def test_super_over_time(client: TestClient, household: dict) -> None:
    p = ok(
        client.post(
            "/api/retirement/people",
            json={"person": "Alex", "born": 1988, "balance": dollars(90000), "as_of": "2026-01-31"},
        )
    )
    ok(client.put(f"/api/retirement/people/{p['id']}", json={"balance": dollars(112600), "as_of": "2026-09-30"}))
    h = {x["date"]: x["super"] for x in ok(client.get("/api/networth?range=1y"))["history"]}
    assert h["2025-11-12"] == dollars(90000)  # before the first: the first
    assert h["2026-03-12"] == dollars(90000) and h["2026-10-12"] == dollars(112600)


def test_crypto_is_its_own_part_and_a_year_ahead_is_likely(client: TestClient, household: dict) -> None:
    def fund(ticker: str, kind: str) -> int:
        body = {"ticker": ticker, "name": ticker, "group": "intl", "kind": kind}
        return int(ok(client.post("/api/investments/funds", json=body))["id"])

    trade = {"side": "buy", "date": "2026-06-01"}
    ok(
        client.post(
            "/api/investments/trades", json={**trade, "fund_id": fund("VGS", "etf"), "units": 10, "price": dollars(100)}
        )
    )
    ok(
        client.post(
            "/api/investments/trades",
            json={**trade, "fund_id": fund("BTC", "crypto"), "units": 0.01, "price": dollars(150000)},
        )
    )
    ok(
        client.post(
            "/api/retirement/people", json={"person": "Alex", "born": 1988, "salary": dollars(100000), "rate": 0.12}
        )
    )
    n = ok(client.get("/api/networth?range=1y"))
    assert n["now"]["shares"] == dollars(1000) and n["now"]["crypto"] == dollars(1500)
    assert n["crypto"]["value"] == dollars(1500) and n["shares"]["value"] == dollars(1000)
    lk = n["likely"]
    assert lk["month"] == "2027-11" and lk["super"] == round(dollars(12000) * 0.85)
    assert lk["shares"] == dollars(1000)  # the last year's buying, crypto left out
    assert lk["loan_down"] > 0 and lk["gain"] == lk["put_away"] + lk["loan_down"]
