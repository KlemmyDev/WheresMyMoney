"""Statement imports, uBank's format first: the account and month from the file's name, duplicates skipped, the
running balance checked, rough check-ins replaced, hand entries merged or kept as cash, categories from learned rules,
and "Transfer" rows matched to the rules by amount and date."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.features.imports.statement import StatementError, cents, parse, read_name
from app.features.spending.merchants import learn_pattern, merchant, pattern, suggest
from tests.conftest import dollars, ok

HEADER = '"Date","Description","Debit","Credit","Balance"\n'


def ubank(rows: list[tuple[str, str, str, str, str]]) -> bytes:
    return (HEADER + "".join(",".join(f'"{c}"' for c in r) + "\n" for r in rows)).encode()


# The Spending account from 24 October: a top-up on the 25th, then spending.
OCTOBER = [
    ("24 Oct 2026", "BUNNINGS 552 KEPERRA", "$38.20", "", "+$254.55"),
    ("25 Oct 2026", "Transfer", "", "$3,000.00", "+$3,254.55"),
    ("27 Oct 2026", "GUZMAN Y GOMEZ BRISBANE", "$46.50", "", "+$3,208.05"),
    ("27 Oct 2026", "BP MITCHELTON", "$72.10", "", "+$3,135.95"),
    ("30 Oct 2026", "WOOLWORTHS 1234 MITCHELTON", "$64.80", "", "+$3,071.15"),
    ("31 Oct 2026", "SQ *MITCHELTON MARKETS", "$36.00", "", "+$3,035.15"),
]
NAME = "Spending-2241_2026-10.csv"


def upload(client: TestClient, raw: bytes, name: str = NAME) -> dict[str, Any]:
    return ok(client.post(f"/api/imports?filename={name}", content=raw))


# -- reading the file ----------------------------------------------------------------------


def test_the_account_and_month_come_from_the_name() -> None:
    assert read_name("CashReservesShared-7703_2026-10.csv") == ("CashReservesShared", "7703", "2026-10")
    assert read_name("statement.csv") == (None, None, None)


def test_amounts_and_balances_are_read_as_cents() -> None:
    assert cents("$5,000.00") == 500000
    assert cents("+$3,000.00") == 300000
    assert cents("-$12.50") == -1250
    assert cents("") is None


def test_a_ubank_file_is_read_oldest_first_and_its_balance_checked() -> None:
    st = parse(NAME, ubank(OCTOBER))
    assert st.last4 == "2241" and st.month == "2026-10"
    assert [r.amount for r in st.rows[:2]] == [-3820, 300000]
    assert st.balance_ok is True and st.opening == dollars(292.75) and st.closing == dollars(3035.15)


def test_a_balance_that_doesnt_follow_is_caught() -> None:
    rows = list(OCTOBER)
    rows[3] = ("27 Oct 2026", "BP MITCHELTON", "$72.10", "", "+$3,100.00")
    st = parse(NAME, ubank(rows))
    assert st.balance_ok is False and 3 in st.balance_problems


def test_a_newest_first_file_is_turned_around() -> None:
    st = parse(NAME, ubank(list(reversed(OCTOBER))))
    assert st.reversed and st.rows[0].description == "BUNNINGS 552 KEPERRA" and st.balance_ok


def test_a_file_that_isnt_a_statement_says_so() -> None:
    with pytest.raises(StatementError):
        parse(NAME, ubank([("someday", "X", "$1.00", "", "+$1.00")]))


def test_merchants_are_cut_down_for_matching() -> None:
    assert merchant("WOOLWORTHS 1234 MITCHELTON") == "WOOLWORTHS MITCHELTON"
    assert merchant("SQ *MITCHELTON MARKETS") == "MITCHELTON MARKETS"
    assert merchant("PAYPAL *STEAMGAMES") == "STEAMGAMES"
    assert pattern("WOOLWORTHS 1234 MITCHELTON") == "WOOLWORTHS MITCHELTON"
    assert suggest("STEAMGAMES") == "Fun"
    assert suggest("MITCHELTON MARKETS") == "Groceries"
    assert suggest("AMAZON AU MARKETPLACE") == "Shopping"
    assert suggest("ZZ UNHEARD OF") is None
    # How it was paid, and where, aren't the merchant.
    assert merchant("Direct Debit Danger Close Mar - Ezypayid") == "DANGER CLOSE MAR EZYPAYID"
    assert merchant("Payment To MEGAN SMITH") == "MEGAN SMITH"
    assert merchant("Woolworths 2867\\redbank Plai QLD AU") == "WOOLWORTHS REDBANK PLAI"
    assert merchant("Refund From Apple.com/bill Sydney AU") == "APPLE COM BILL SYDNEY"
    assert merchant("Internet BPay") == "INTERNET BPAY"


def test_a_merchant_is_remembered_by_its_brand_or_first_distinctive_word() -> None:
    assert learn_pattern("WOOLWORTHS REDBANK PLAI") == "WOOLWORTHS"
    assert learn_pattern("BEST & LESS SPRINGFIEL") == "BEST & LESS"
    assert learn_pattern("SUSHIRIA REDBANK PLAINAU") == "SUSHIRIA"
    assert learn_pattern("THE ACORN PANTRY") == "THE ACORN"
    assert learn_pattern("MEGAN SMITH", description="Payment To MEGAN SMITH") == "MEGAN SMITH"
    # A first word already remembered for another category: told apart by one word more.
    assert learn_pattern("SUSHIRIA TAKEAWAY", {"SUSHIRIA": 1}, 2) == "SUSHIRIA TAKEAWAY"
    assert learn_pattern("SUSHIRIA TAKEAWAY", {"SUSHIRIA": 1}, 1) == "SUSHIRIA"


# -- what it does to the account ----------------------------------------------------------------


def test_the_file_finds_its_account_by_its_last_four(client: TestClient, household: dict) -> None:
    opened = upload(client, ubank(OCTOBER))
    assert opened["account_id"] == household["Spending"] and opened["rows"] == 6 and opened["balance_ok"]


def test_import_merges_hand_entries_replaces_check_ins_and_matches_the_top_up(
    client: TestClient, household: dict
) -> None:
    ids = household
    # Typed in on the phone: Woolworths the day before the bank had it (with a note), and cash at the markets.
    typed = ok(
        client.post(
            "/api/transactions",
            json={
                "account_id": ids["Spending"],
                "amount": -6480,
                "description": "Woolies",
                "date": "2026-10-29",
                "note": "Birthday cake",
                "category_id": None,
            },
        )
    )
    ok(
        client.post(
            "/api/transactions",
            json={
                "account_id": ids["Spending"],
                "amount": -2000,
                "description": "Cash at the markets",
                "date": "2026-10-28",
            },
        )
    )
    groceries = next(c["id"] for c in ok(client.get("/api/categories"))["categories"] if c["name"] == "Groceries")
    # A learned rule for Guzman y Gomez.
    eating = next(c["id"] for c in ok(client.get("/api/categories"))["categories"] if c["name"] == "Eating out")
    client.post(
        "/api/transactions",
        json={
            "account_id": ids["Spending"],
            "amount": -100,
            "description": "GUZMAN Y GOMEZ",
            "date": "2026-10-01",
            "category_id": eating,
        },
    )
    tx = ok(client.get(f"/api/transactions?account_id={ids['Spending']}&q=GUZMAN"))[0]
    ok(client.put(f"/api/transactions/{tx['id']}", json={"category_id": eating, "always": True}))

    opened = upload(client, ubank(OCTOBER))
    a = ok(client.post(f"/api/imports/{opened['token']}/analyse", json={"account_id": ids["Spending"]}))
    rows = {r["description"]: r for r in a["rows"]}
    assert rows["WOOLWORTHS 1234 MITCHELTON"]["status"] == "merge"
    assert rows["WOOLWORTHS 1234 MITCHELTON"]["merge_id"] == typed["id"]
    assert rows["GUZMAN Y GOMEZ BRISBANE"]["why"] == "rule" and rows["GUZMAN Y GOMEZ BRISBANE"]["category_id"] == eating
    assert (
        rows["SQ *MITCHELTON MARKETS"]["why"] == "suggest" and rows["SQ *MITCHELTON MARKETS"]["suggest"] == "Groceries"
    )
    top_up = rows["Transfer"]
    assert top_up["why"] == "transfer" and top_up["rule_kind"] == "top_up"
    # The rule called for $3,200 less the $254.55 there: $2,945.45, not $3,000.
    assert top_up["called_for"] == dollars(2945.45) and top_up["differed"] is True
    # The rough check-in on 29 Oct (~$1,960) becomes the statement's figure that day.
    assert {(r["date"], r["rough"], r["exact"]) for r in a["replaced"]} == {
        ("2026-10-29", dollars(1960), dollars(3135.95))
    }
    assert [c["description"] for c in a["kept_cash"]] == ["Cash at the markets"]

    done = ok(
        client.post(
            f"/api/imports/{opened['token']}/commit",
            json={
                "account_id": ids["Spending"],
                "categories": {str(rows["SQ *MITCHELTON MARKETS"]["index"]): groceries},
                "always": [rows["SQ *MITCHELTON MARKETS"]["index"]],
            },
        )
    )
    assert done["added"] == 5 and done["merged"] == 1 and done["kept_cash"] == 1 and done["replaced"] >= 1
    merged = ok(client.get(f"/api/transactions?account_id={ids['Spending']}&q=WOOLWORTHS"))[0]
    assert merged["kind"] == "statement" and merged["note"] == "Birthday cake" and merged["merged"]
    cash = ok(client.get(f"/api/transactions?account_id={ids['Spending']}&q=Cash at"))[0]
    assert cash["kind"] == "cash"
    rules = {r["label"]: r for r in ok(client.get("/api/rules"))["rules"]}
    assert rules["Monthly top-up"]["last_status"] == "differed"
    names = [r["pattern"] for r in ok(client.get("/api/categories"))["merchant_rules"]]
    assert "MITCHELTON" in names


def test_importing_the_same_file_again_skips_every_row(client: TestClient, household: dict) -> None:
    ids = household
    first = upload(client, ubank(OCTOBER))
    ok(client.post(f"/api/imports/{first['token']}/commit", json={"account_id": ids["Spending"]}))
    again = upload(client, ubank([*OCTOBER, ("01 Nov 2026", "COLES 0882 KEPERRA", "$20.00", "", "+$3,015.15")]))
    a = ok(client.post(f"/api/imports/{again['token']}/analyse", json={"account_id": ids["Spending"]}))
    assert a["counts"]["duplicates"] == 6 and a["counts"]["new"] == 1


def test_two_identical_rows_in_a_day_are_both_kept(client: TestClient, household: dict) -> None:
    rows = [
        ("01 Nov 2026", "COFFEE CLUB", "$5.00", "", "+$95.00"),
        ("01 Nov 2026", "COFFEE CLUB", "$5.00", "", "+$90.00"),
    ]
    opened = upload(client, ubank(rows))
    a = ok(client.post(f"/api/imports/{opened['token']}/analyse", json={"account_id": household["Spending"]}))
    assert a["counts"]["new"] == 2


def test_an_opening_balance_makes_the_ledger_match_the_statement(client: TestClient, household: dict) -> None:
    ids = household
    opened = upload(client, ubank(OCTOBER))
    done = ok(
        client.post(f"/api/imports/{opened['token']}/commit", json={"account_id": ids["Spending"], "opening": True})
    )
    assert done["opening"]["amount"] == dollars(292.75) and done["opening"]["date"] == "2026-10-23"
    assert done["gap"] == 0


def test_a_payday_transfer_is_matched_by_amount_and_date(client: TestClient, household: dict) -> None:
    rows = [("12 Nov 2026", "Transfer", "", "$300.00", "+$23,150.00")]
    opened = upload(client, ubank(rows), "Savings-2256_2026-11.csv")
    a = ok(client.post(f"/api/imports/{opened['token']}/analyse", json={"account_id": household["Savings"]}))
    [row] = a["rows"]
    assert row["rule_kind"] == "transfer" and row["why"] == "transfer"


def test_another_banks_columns_are_matched_once_and_remembered(client: TestClient, household: dict) -> None:
    raw = b"When,What,Amount,Balance\n01/11/2026,COLES 0882,-20.00,980.00\n02/11/2026,BP,-50.00,930.00\n"
    first = ok(client.post("/api/imports?filename=other.csv", content=raw))
    assert first["needs_columns"] and first["header"] == ["When", "What", "Amount", "Balance"]
    cols = '{"date": 0, "description": 1, "amount": 2, "balance": 3}'
    read = ok(client.post(f"/api/imports?filename=other.csv&columns={cols}", content=raw))
    assert read["rows"] == 2 and read["balance_ok"]
    again = ok(client.post("/api/imports?filename=other-2.csv", content=raw))
    assert again["rows"] == 2


def test_after_an_import_an_opening_balance_closes_the_gap(client: TestClient, household: dict) -> None:
    ids = household
    opened = upload(client, ubank(OCTOBER))
    done = ok(client.post(f"/api/imports/{opened['token']}/commit", json={"account_id": ids["Spending"]}))
    assert done["gap"] == dollars(292.75)
    opening = ok(client.post(f"/api/accounts/{ids['Spending']}/opening", json={"amount": done["gap"]}))
    assert opening["date"] == "2026-10-23" and opening["amount"] == dollars(292.75)


def test_statements_reviewed_together_dont_import_their_overlap_twice(client: TestClient, household: dict) -> None:
    ids = household
    # Both looked at before either is imported, as one review of several files does.
    october = upload(client, ubank(OCTOBER))
    overlap = upload(client, ubank([*OCTOBER[-2:], ("01 Nov 2026", "COLES 0882 KEPERRA", "$20.00", "", "+$3,015.15")]))
    for f in (october, overlap):
        ok(client.post(f"/api/imports/{f['token']}/analyse", json={"account_id": ids["Spending"]}))
    ok(client.post(f"/api/imports/{october['token']}/commit", json={"account_id": ids["Spending"]}))
    done = ok(client.post(f"/api/imports/{overlap['token']}/commit", json={"account_id": ids["Spending"]}))
    assert done["added"] == 1 and done["skipped"] == 2


# -- uBank's longer export (a date range of one account) ------------------------------------------------

EXPORT_HEADER = (
    '"Date and time","Description","Debit","Credit","From account","To account","Payment type","Category",'
    '"Receipt number","Transaction ID","Tags"\n'
)
EXPORT_NAME = "Ubank transactions 07-11-2025 - 07-11-2026.csv"
# Newest first, as uBank writes it.
EXPORT = [
    (
        "13:04 30-10-26",
        "Domino's Estore Edens Crosredbank Plainau",
        "$120.00",
        "",
        "Pay Account",
        "",
        "Visa",
        "Food delivery & takeaway",
    ),
    ("20:08 29-10-26", "Visa Provisioning Service AU", "", "$0.00", "Pay Account", "", "Visa", "Uncategorised"),
    (
        "19:32 28-10-26",
        "Internal transfer",
        "$2,000.00",
        "",
        "Pay Account",
        "Savings account - shared",
        "Internal Transfer",
        "Internal transfer",
    ),
    (
        "09:33 28-10-26",
        "Transfer Deposit",
        "",
        "$2,600.00",
        "Save Account",
        "Spend account - shared",
        "Internal Transfer",
        "Internal transfer",
    ),
    ("08:17 27-10-26", "Kmart 1283 Yamanto AU", "$48.00", "", "Pay Account", "", "eftpos", "General shopping"),
]


def export(rows: list[tuple[str, ...]] = EXPORT) -> bytes:
    lines = [",".join(f'"{c}"' for c in (*r, "", str(n), "")) for n, r in enumerate(rows)]
    return (EXPORT_HEADER + "\n".join(lines) + "\n").encode()


def test_ubanks_longer_export_is_read_oldest_first_without_its_zero_rows() -> None:
    st = parse(EXPORT_NAME, export())
    assert st.columns.bank == "ubank-export" and st.reversed and st.zero_rows == 1
    assert [(r.date, r.amount) for r in st.rows] == [
        ("2026-10-27", -4800),
        ("2026-10-28", 260000),
        ("2026-10-28", -200000),
        ("2026-10-30", -12000),
    ]
    assert st.rows[0].kind == "eftpos" and st.rows[0].bank_category == "General shopping"
    assert st.balance_ok is None and st.closing is None and st.last4 is None
    assert st.account_names == ["Pay Account", "Spend account - shared"]


def test_the_export_marks_transfers_suggests_ubanks_category_and_remembers_its_account(
    client: TestClient, household: dict
) -> None:
    opened = upload(client, export(), EXPORT_NAME)
    assert opened["bank"] == "ubank-export" and opened["rows"] == 4 and opened["account_id"] is None
    a = ok(client.post(f"/api/imports/{opened['token']}/analyse", json={"account_id": household["Spending"]}))
    by = {r["description"]: r for r in a["rows"]}
    assert by["Transfer Deposit"]["why"] == "transfer" and by["Internal transfer"]["why"] == "transfer"
    assert by["Domino's Estore Edens Crosredbank Plainau"]["suggest"] == "Takeaway"
    ok(client.post(f"/api/imports/{opened['token']}/commit", json={"account_id": household["Spending"]}))
    again = upload(client, export(), EXPORT_NAME)
    assert again["account_id"] == household["Spending"]
    b = ok(client.post(f"/api/imports/{again['token']}/analyse", json={"account_id": household["Spending"]}))
    assert b["counts"]["duplicates"] == 4 and b["counts"]["new"] == 0
