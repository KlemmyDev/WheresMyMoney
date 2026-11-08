"""The business catalogue (businesses.json): complete entries, one owner per spelling, and spellings grouping."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.features.spending import merchants
from app.features.spending.directory import auto_key
from app.features.spending.service import DEFAULT_CATEGORIES
from tests.conftest import ok


def test_every_business_is_complete() -> None:
    cats = {name for name, _, _ in DEFAULT_CATEGORIES}
    assert len(merchants.CATALOGUE) >= 600
    for b in merchants.CATALOGUE:
        assert b["key"] and b["name"], b
        assert b["category"] in cats, (b["key"], b["category"])
        assert b["mark"]["bg"] and b["mark"]["art"], b["key"]


def test_each_spelling_belongs_to_one_business() -> None:
    seen: dict[str, str] = {}
    for b in merchants.CATALOGUE:
        for k in [b["key"], *b["aliases"]]:
            assert k not in seen, (k, seen.get(k), b["key"])
            seen[k] = b["key"]


def test_other_spellings_group_under_the_business() -> None:
    assert auto_key(merchants.merchant("WOOLIES MITCHELTON")) == "WOOLWORTHS"
    assert auto_key(merchants.merchant("MCDONALD'S EVERTON PARK")) == "MCDONALDS"
    assert merchants.suggest("ANACONDA ASPLEY") == "Hobbies"


def test_the_catalogue_is_offered(client: TestClient) -> None:
    shops = {b["key"]: b for b in ok(client.get("/api/businesses"))}
    assert shops["ANACONDA"]["name"] == "Anaconda" and shops["SUPERLOOP"]["category"] == "Phone & internet"
    assert "WOOLIES" in shops["WOOLWORTHS"]["aliases"]


def test_assigning_a_known_business_sorts_what_isnt_sorted(client: TestClient, household: dict) -> None:
    acc = household["Spending"]
    eida = ok(
        client.post(
            "/api/transactions",
            json={"account_id": acc, "amount": -8900, "description": "EIDA 4410938271", "date": "2026-10-07"},
        )
    )
    assert eida["merchant_key"] == "EIDA" and eida["category"] is None
    ok(client.post("/api/merchants/assign", json={"text": eida["merchant"], "key": "SUPERLOOP"}))
    again = next(t for t in ok(client.get("/api/transactions")) if t["id"] == eida["id"])
    assert again["merchant_name"] == "Superloop" and again["category"] == "Phone & internet"
