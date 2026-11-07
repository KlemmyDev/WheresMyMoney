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


def test_reading_a_pdf(client: TestClient) -> None:
    p = ok(client.post("/api/retirement/people", json={"person": "Alex", "born": 1988, "balance": dollars(1)}))
    r = ok(client.post(f"/api/retirement/people/{p['id']}/statement", content=pdf(STATEMENT)))
    assert r["balance"] == dollars(112600) and len(r["options"]) == 2
    assert client.post(f"/api/retirement/people/{p['id']}/statement", content=b"hello").status_code == 422
    blank = client.post(f"/api/retirement/people/{p['id']}/statement", content=pdf(" "))
    assert blank.status_code == 422 and "pictures" in blank.text
    assert client.post("/api/retirement/people/999/statement", content=pdf(STATEMENT)).status_code == 404
