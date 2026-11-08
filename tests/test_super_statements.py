"""Reading super statements (PDF) for the balance, fees and investment options."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.features.retirement.statements import parse
from tests.conftest import dollars, ok

STATEMENT = """Annual statement
Statement period 1 July 2025 to 30 June 2026
Opening balance $98,400.00
Contributions $14,400.00
Closing balance at 30 June 2026 $112,600.00
Fees and costs
Administration fees $156.80
Insurance premiums - Death and TPD $312.00
Investment fees $598.20
Your investment options
High Growth 70.00%
Balanced 30.00%
"""


def pdf(text: str) -> bytes:
    """A one-page PDF with these lines of text (enough for pypdf to read back)."""
    esc = [line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") for line in text.splitlines()]
    stream = "BT /F1 10 Tf 50 780 Td 14 TL " + " ".join(f"({line}) Tj T*" for line in esc) + " ET"
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = b"%PDF-1.4\n"
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{o}\nendobj\n".encode()
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets)
    out += f"trailer << /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    return out


def test_parse_an_annual_statement() -> None:
    r = parse(STATEMENT)
    assert r["balance"] == dollars(112600) and r["as_of"] == "2026-06-30"
    assert r["period"] == ["2025-07-01", "2026-06-30"]
    assert {f["name"]: f["amount"] for f in r["fees"]} == {
        "Admin fee": 15680,
        "Insurance": 31200,
        "Investment fee": 59820,
    }
    assert [(o["name"], o["share"]) for o in r["options"]] == [("High Growth", 0.7), ("Balanced", 0.3)]


def test_a_half_year_statement_makes_fees_yearly_and_reads_percentages() -> None:
    r = parse(
        "Period 1 Jan 2026 - 30 Jun 2026\nAccount balance as at 30/06/2026 $50,000.00\nMember fee $39.00\n"
        "Administration fee 0.10% p.a.\nGrowth 60%\nConservative 30%\n"
    )
    fees = {f["name"]: f for f in r["fees"]}
    assert fees["Admin fee"]["amount"] == round(3900 * 365 / 181)
    assert fees["Admin fee (on the balance)"] == {"name": "Admin fee (on the balance)", "kind": "pct", "amount": 0.001}
    assert r["options"] == []  # 90%: left out
    assert any("100%" in n for n in r["notes"])


# Australian Retirement Trust's statements as their text comes out of the PDF, in the three layouts the fund has used
# (figures made up). Each shows the opening balance before the closing one, puts the closing balance's heading on its
# own line, breaks fees down by month as well as in a summary, and has tables of returns with several percentages.
ART_2022 = """Your starting balance
$40,000.00
as at 1 July 2021
Your finishing balance
$45,000.00
as at 30 June 2022
Balance as at 1 July 2021 $40,000.00
Insurance premiums and fees -$900.00
Fees -$120.00
Balance as at 30 June 2022 $45,000.00
Investment option returns to 30 June 2022 10yrs % p.a. 5yrs % p.a. 1yr %
International Shares - Index (unhedged) 13.25% 9.17% -6.88%
Australian Shares - Index 9.63% 7.37% -4.33%
Annual statement
1 July 2021 - 30 June 2022
Investment option Opening
Balance
30 June 2022
International Shares - Index (unhedged) 2.83773 2.64248 10,218.7321 $27,000.00
Australian Shares - Index 2.94280 2.81551 6,393.0957 $18,000.00
How money paid to your account will be invested in the future
Investment option Allocation percentage
International Shares - Index (unhedged) 70%
Australian Shares - Index 30%
Net investment earnings
Investment fees and costs -$50.00
Transaction costs -$7.00
Insurance premiums and fees
Month Monthly premiums Monthly insurance fees Monthly premiums and
July 2021 -$75.00 -$1.00 -$76.00
Fees
Administration fees and costs
July 2021 -$10.00 -$0.00 -$10.00
Fees and costs summary
Fees deducted directly from your account
Description Amount
Insurance premiums and fees -$900.00
Administration fees and costs -$120.00
Fee cap refund $0.00
Total fees deducted directly from your account -$1,020.00
Fees and costs deducted from your investment
Investment fees and costs -$50.00
Transaction costs -$7.00
Costs met from reserves* -$40.00
Total fees and costs deducted from your investment -$97.00
Total fees and costs you paid
-$1,117.00
"""

# 2024: a new menu of options, so the holdings are shown twice; the second table is how the balance is invested now.
ART_2024 = """Your finishing balance
$130,000.00
as at 30 June 2024
Balance as at 1 July 2023 $92,000.00
Balance as at 30 June 2024 $130,000.00
Annual Statement
1 July 2023 - 30 June 2024
How your money was invested at 30 June 2024
International Shares - Index (unhedged) 3.18074 3.72172 18,000.0000 $66,990.96
Australian Shares - Index 3.21642 3.60539 13,900.0000 $50,114.92
Emerging Markets Shares 1.64416 1.86415 2,800.0000 $5,219.62
How your money was invested at 30 June 2024 - with new investment changes
International Shares Unhedged Index 3.18074 3.72172 20,000.0000 $78,000.00
Australian Shares Index 3.21642 3.60539 14,000.0000 $52,000.00
Your total balance and number of units held may not align between the two tables in this section.
Fees and costs summary
Insurance premiums and fees -$1,300.00
Administration fees and costs -$170.00
Other fees and costs $0.00
Total fees deducted directly from your account -$1,470.00
Investment fees and costs -$98.00
Transaction costs -$14.00
Administration fees and costs met from reserves* -$74.00
Total fees and costs deducted from your investment -$186.00
Total fees and costs you paid
-$1,656.00
"""

# 2026: "Balance on", the closing balance's heading after the summary, and the year's return on each holding.
ART_2026 = """Annual
Statement
1 July 2025 - 30 June 2026
Your opening balance
$170,000.00
on 1 July 2025
Balance on 1 July 2025 $170,000.00
Insurance premiums and fees -$1,450.00
Administration fees -$250.00
Balance on 30 June 2026 $200,000.00
Your closing balance
$200,000.00
on 30 June 2026
Investment option 1 year % 5 years %
Australian Shares Index 6.20% 8.09% 9.59%
How your money was invested on 30 June 2026
International Shares Unhedged Index 4.33598 5.02052 23,901.3549 $120,000.00 15.79%
Australian Shares Index 4.08992 4.34344 16,117.6920 $70,000.00 6.2%
Bonds Index 2.89458 2.94844 3,391.6105 $10,000.00 1.86%
Fees and costs summary
Insurance premiums and fees -$1,450.00
Administration fees and costs -$250.00
Other fees and costs $0.00
Total fees deducted directly from your account -$1,700.00
Investment fees and costs -$160.00
Transaction costs -$10.00
Administration costs met from reserves -$90.00
Total fees and costs deducted from your investment -$260.00
Total fees and costs you paid
-$1,960.00
"""


def test_art_statements_read_the_closing_balance_not_the_opening_one() -> None:
    assert (parse(ART_2022)["balance"], parse(ART_2022)["as_of"]) == (dollars(45000), "2022-06-30")
    assert (parse(ART_2024)["balance"], parse(ART_2024)["as_of"]) == (dollars(130000), "2024-06-30")
    assert (parse(ART_2026)["balance"], parse(ART_2026)["as_of"]) == (dollars(200000), "2026-06-30")


def test_art_statements_take_each_fee_once_from_the_summary() -> None:
    fees = {f["name"]: f["amount"] for f in parse(ART_2022)["fees"]}
    # Admin fees include the share met from the fund's reserves; nothing from the monthly tables or the totals.
    assert fees == {"Insurance": 90000, "Admin fee": 16000, "Investment fee": 5000, "Other fees": 700}
    for text, total in ((ART_2022, 111700), (ART_2024, 165600), (ART_2026, 196000)):
        r = parse(text)
        assert sum(f["amount"] for f in r["fees"]) == total and all(f["kind"] == "fixed" for f in r["fees"])
        assert r["notes"] == []


def test_art_statements_read_options_from_the_holdings() -> None:
    def options(text: str) -> list[tuple[str, float]]:
        return [(o["name"], o["share"]) for o in parse(text)["options"]]

    # The balance held now, not where future contributions go, and not the returns tables.
    assert options(ART_2022) == [("International Shares - Index (unhedged)", 0.6), ("Australian Shares - Index", 0.4)]
    assert options(ART_2024) == [("International Shares Unhedged Index", 0.6), ("Australian Shares Index", 0.4)]
    assert options(ART_2026) == [
        ("International Shares Unhedged Index", 0.6),
        ("Australian Shares Index", 0.35),
        ("Bonds Index", 0.05),
    ]


def test_fees_that_dont_add_up_to_the_summary_total_are_flagged() -> None:
    r = parse(ART_2026.replace("-$1,960.00", "-$2,960.00"))
    assert any("total fees" in n for n in r["notes"])


def test_reading_a_pdf(client: TestClient) -> None:
    p = ok(client.post("/api/retirement/people", json={"person": "Alex", "born": 1988, "balance": dollars(1)}))
    r = ok(client.post(f"/api/retirement/people/{p['id']}/statement", content=pdf(STATEMENT)))
    assert r["balance"] == dollars(112600) and len(r["options"]) == 2
    assert client.post(f"/api/retirement/people/{p['id']}/statement", content=b"hello").status_code == 422
    blank = client.post(f"/api/retirement/people/{p['id']}/statement", content=pdf(" "))
    assert blank.status_code == 422 and "pictures" in blank.text
    assert client.post("/api/retirement/people/999/statement", content=pdf(STATEMENT)).status_code == 404


def test_an_art_statement_gives_arts_published_fees(client: TestClient) -> None:
    from app.features.retirement import funds

    art = funds.in_statement("... Australian Retirement Trust Pty Ltd ABN 88 010 720 840 ...")
    assert art is not None and funds.find("ART") is art and funds.find("Hostplus") is None
    found = parse(ART_2026)
    r = funds.apply(art, found)
    assert r["fund"] == "Australian Retirement Trust"
    names = {f["name"]: f for f in r["fees"]}
    # The year's admin and investment dollars give way to the rates; insurance is the statement's.
    assert names["Admin fee (on the balance)"]["cap"] == dollars(500000)
    assert names["Insurance"] == {"name": "Insurance", "kind": "fixed", "amount": dollars(1450)}
    assert "Investment fee" not in names and "Other fees" not in names
    assert [o["fee_pct"] for o in r["options"]] == [0.001, 0.0008, 0.0009]
    assert "published rates" in r["notes"][0]

    # Through the API: the person's fund is ART, so the statement comes back with ART's fees.
    p = ok(client.post("/api/retirement/people", json={"person": "Sam", "born": 1992, "fund": "ART"}))
    r = ok(client.post(f"/api/retirement/people/{p['id']}/statement", content=pdf(STATEMENT)))
    assert r["fund"] == "Australian Retirement Trust" and any(f.get("cap") for f in r["fees"])
