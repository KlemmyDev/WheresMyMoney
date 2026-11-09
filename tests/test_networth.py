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


def test_more_kinds_and_what_is_owed_against_them(client: TestClient, household: dict) -> None:
    car = ok(
        client.post(
            "/api/networth/assets",
            json={
                "kind": "car",
                "name": "Corolla",
                "value": dollars(34500),
                "date": "2025-03-01",
                "note": "What we paid",
                "owed_name": "Car loan",
                "owed_rate_bp": 749,
                "owed": dollars(25000),
            },
        )
    )
    assert car["group"] == "vehicles" and car["as_of"] == "2025-03-01" and car["values"][0]["note"] == "What we paid"
    assert car["owed"]["amount"] == dollars(25000) and car["equity"] == dollars(9500)
    car = ok(client.post(f"/api/networth/assets/{car['id']}/values", json={"value": dollars(28000)}))
    car = ok(
        client.post(f"/api/networth/assets/{car['id']}/owed", json={"amount": dollars(15000), "date": "2026-06-01"})
    )
    assert (
        car["value"] == dollars(28000) and car["owed"]["amount"] == dollars(15000) and car["equity"] == dollars(13000)
    )
    ok(client.post("/api/networth/assets", json={"kind": "property", "name": "Unit", "value": dollars(500000)}))
    n = ok(client.get("/api/networth?range=1y"))
    assert n["now"]["vehicles"] == dollars(28000) and n["now"]["property"] == dollars(500000)
    assert n["now"]["other"] == dollars(528000) and n["now"]["owed"] == dollars(15000)
    assert n["history"][0]["owed"] == dollars(25000)  # a year ago: the first amount owed still stood
    # Its own page: month by month from the first figure.
    page = ok(client.get(f"/api/networth/assets/{car['id']}?range=all"))
    assert page["history"][0]["date"] == "2025-03-12" and page["history"][-1]["owed"] == dollars(15000)
    # A future date, an unknown kind, a negative amount: no.
    assert (
        client.post(f"/api/networth/assets/{car['id']}/values", json={"value": 1, "date": "2027-01-01"}).status_code
        == 422
    )
    assert client.post("/api/networth/assets", json={"kind": "spaceship", "value": 1}).status_code == 422
    assert client.post(f"/api/networth/assets/{car['id']}/owed", json={"amount": -5}).status_code == 422


def test_values_can_change_and_the_thing_comes_back(client: TestClient, household: dict) -> None:
    home = ok(
        client.post("/api/networth/assets", json={"kind": "home", "value": dollars(700000), "date": "2024-01-01"})
    )
    home = ok(client.post(f"/api/networth/assets/{home['id']}/values", json={"value": dollars(760000)}))
    first, latest = home["values"]
    home = ok(client.put(f"/api/networth/assets/{home['id']}/values/{first['id']}", json={"value": dollars(690000)}))
    assert home["values"][0]["value"] == dollars(690000)
    home = ok(client.delete(f"/api/networth/assets/{home['id']}/values/{first['id']}"))
    assert [v["value"] for v in home["values"]] == [dollars(760000)]
    # The last value stays.
    assert client.delete(f"/api/networth/assets/{home['id']}/values/{latest['id']}").status_code == 422
    # Removed, then back with everything.
    assert ok(client.delete(f"/api/networth/assets/{home['id']}"))["removed"] is True
    assert ok(client.get("/api/networth"))["assets"] == []
    assert client.get(f"/api/networth/assets/{home['id']}").status_code == 404
    assert ok(client.post(f"/api/networth/assets/{home['id']}/restore"))["value"] == dollars(760000)
    # Owed against the home goes with the home.
    ok(client.post(f"/api/networth/assets/{home['id']}/owed", json={"amount": dollars(100000)}))
    now = ok(client.get("/api/networth"))["now"]
    assert now["home_owed"] == dollars(100000) and now["owed"] == 0
