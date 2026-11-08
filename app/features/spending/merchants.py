"""
Telling merchants apart in statement descriptions, and suggesting a category for one never seen before.

A bank writes the same shop many ways ("WOOLWORTHS 1234 MITCHELTON", "SQ *MITCHELTON MARKETS", "PAYPAL *STEAMGAMES",
"Direct Debit Danger Close Mar - Ezypayid"), so a description is cut down to its merchant: upper case, without a card
processor's prefix or how it was paid ("Direct Debit", "Payment To"), without store numbers, card digits, dates or a
trailing "QLD AU".

A learned rule is a merchant's first words (`pattern`), and it applies to every description whose merchant starts
with them. `learn_pattern` picks how many: a known brand's name ("UBER EATS", "BIG W"), else the first word when it's
distinctive ("WOOLWORTHS" covers every store), else the first two. When a household sorts two merchants that share a
first word differently, the second is remembered by two words, and the longer pattern wins.

The suggestions are a short list of common Australian merchants. They're only ever suggestions: the household
confirms them, and that's what's remembered.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

PREFIXES = (
    "SQ *",
    "SP *",
    "SP ",
    "PAYPAL *",
    "ZLR*",
    "LSP*",
    "SMP*",
    "IZ *",
    "TST* ",
    "EFTPOS ",
    "VISA PURCHASE ",
    "DIRECT DEBIT ",
    "DIRECT CREDIT ",
    "PAYMENT TO ",
    "PAYMENT FROM ",
    "REFUND FROM ",
    "OSKO PAYMENT TO ",
    "OSKO PAYMENT FROM ",
)
_HAS_DIGIT = re.compile(r"\d")
_PUNCT = re.compile(r"[^A-Z0-9&' -]+")
# Where it was, at the end of a card's description: "QLD AU", "AUS".
_PLACE = {"AU", "AUS", "QLD", "NSW", "VIC", "ACT", "TAS", "WA", "SA", "NT"}
WORDS = 2  # a learned rule's most words
# First words that say nothing about who it was: a rule needs the next word too.
GENERIC = {
    "THE",
    "MY",
    "MR",
    "MRS",
    "MS",
    "DR",
    "ST",
    "MT",
    "MOUNT",
    "NEW",
    "BIG",
    "INTERNET",
    "ONLINE",
    "PAYMENT",
    "TRANSFER",
    "INTERNAL",
    "SCHEDULE",
    "DIRECT",
    "REFUND",
    "BPAY",
    "CASH",
    "ATM",
    "FEE",
    "INTEREST",
    "CAFE",
    "SHOP",
    "STORE",
    "HOTEL",
    "BAR",
    "SUSHI",
    "PIZZA",
    "BAKERY",
    "BUTCHER",
    "PHARMACY",
    "CHEMIST",
    "MEDICAL",
    "DENTAL",
    "PET",
    "AUSTRALIA",
    "AUSTRALIAN",
    "NATIONAL",
    "CITY",
}

# The businesses the app knows (businesses.json, shared with the web app's marks): each one's key and the other ways
# it shows up on statements, its name and its usual category. A merchant starting with any of them is that business.
CATALOGUE: list[dict[str, Any]] = json.loads((Path(__file__).with_name("businesses.json")).read_text())["businesses"]
# Every way a business shows up, to the business's own key ("WOOLIES" and "WOOLWORTHS" are both Woolworths).
CANONICAL: dict[str, str] = {k: b["key"] for b in CATALOGUE for k in [b["key"], *b["aliases"]]}
NAMES: dict[str, str] = {b["key"]: b["name"] for b in CATALOGUE}
# A suggested category for a merchant never seen before, by how it starts: every business, and a few words that
# aren't businesses but say what something is ("PATHOLOGY", "CITY COUNCIL").
SUGGESTIONS: dict[str, str] = {
    **json.loads((Path(__file__).with_name("businesses.json")).read_text())["generic"],
    **{k: b["category"] for b in CATALOGUE for k in [b["key"], *b["aliases"]]},
}

# Words that suggest a category wherever they are in the merchant ("MITCHELTON MARKETS", "KIDS SWIM SCHOOL").
ANYWHERE = {
    "CAKES": "Celebrations",
    "PARTY": "Celebrations",
    "BALLOONS": "Celebrations",
    "MARKETS": "Groceries",
    "BUTCHER": "Groceries",
    "BAKERY": "Groceries",
    "SWIM": "Kids",
    "CHILDCARE": "Childcare",
    "KINDY": "Childcare",
    "PHARMACY": "Pharmacy",
    "CHEMIST": "Pharmacy",
    "DENTAL": "Health",
    "MEDICAL": "Health",
    "PHYSIO": "Health",
    "CAFE": "Eating out",
    "COFFEE": "Coffee",
    "ESPRESSO": "Coffee",
    "RESTAURANT": "Eating out",
    "SUSHI": "Eating out",
    "PIZZA": "Takeaway",
    "INSURANCE": "Insurance",
    "ENERGY": "Utilities",
    "WATER": "Utilities",
    "COUNCIL": "Rates",
    "PARKING": "Car",
    "TOLL": "Car",
    "VET": "Pets",
    "VETERINARY": "Pets",
    "SCHOOL": "Education",
    "TUITION": "Education",
    "DONATION": "Gifts & donations",
    "GYM": "Sport & fitness",
    "FITNESS": "Sport & fitness",
    "YOGA": "Sport & fitness",
    "PILATES": "Sport & fitness",
    "NURSERY": "Garden",
    "LANDSCAPING": "Garden",
    "BREWERY": "Alcohol",
    "LIQUOR": "Alcohol",
    "BOTTLESHOP": "Alcohol",
    "TAVERN": "Alcohol",
    "REGISTRATION": "Rego",
    "RENT": "Rent",
    "DIVIDEND": "Dividends",
    "CHARITY": "Gifts & donations",
}


def merchant(description: str) -> str:
    """A description cut down to the merchant: "SQ *Mitchelton Markets 0412" → "MITCHELTON MARKETS"."""
    text = " ".join(description.upper().split())
    for prefix in PREFIXES:
        if text.startswith(prefix) and len(text) > len(prefix):
            text = text[len(prefix) :]
            break
    text = text.replace("*", " ").replace("/", " ").replace("\\", " ").replace(".", " ")
    text = _PUNCT.sub(" ", text)
    words = [w.strip("-") for w in text.split()]
    words = [w for w in words if w and (not _HAS_DIGIT.search(w) or w in ("7-ELEVEN", "13CABS"))]
    while len(words) > 1 and words[-1] in _PLACE:
        words.pop()
    return " ".join(words)


def pattern(description: str) -> str:
    """The part of a merchant a learned rule keeps, at most: its first words."""
    return " ".join(merchant(description).split()[:WORDS])


def brand(merchant_text: str) -> str | None:
    """The known brand a merchant starts with ("WOOLWORTHS REDBANK PLAI" → "WOOLWORTHS"), longest first."""
    for key in sorted(SUGGESTIONS, key=len, reverse=True):
        if matches(merchant_text, key):
            return key
    return None


PERSON = ("PAYMENT TO ", "PAYMENT FROM ", "OSKO PAYMENT TO ", "OSKO PAYMENT FROM ")
_PERSON = PERSON


def learn_pattern(
    merchant_text: str, taken: dict[str, int] | None = None, category_id: int | None = None, description: str = ""
) -> str:
    """What to remember a merchant by: its brand, its first word when that's distinctive, else two words. Money to
    or from a person is remembered by their whole name. `taken` (pattern → category) is what's remembered already: a
    first word remembered for another category means this one needs two words to be told apart."""
    words = merchant_text.split()
    if not words:
        return ""
    if " ".join(description.upper().split()).startswith(_PERSON):
        return " ".join(words[:3])
    two = " ".join(words[:WORDS])
    known = brand(merchant_text)
    if known:
        one = known
    elif len(words[0]) >= 4 and words[0] not in GENERIC:
        one = words[0]
    else:
        return two
    if taken and one in taken and category_id is not None and taken[one] != category_id:
        # One word more than what's taken, so this one is told apart (and, being longer, wins).
        return " ".join(words[: max(WORDS, len(one.split()) + 1)])
    return one


def matches(merchant_text: str, rule_pattern: str) -> bool:
    return merchant_text == rule_pattern or merchant_text.startswith(rule_pattern + " ")


def suggest(merchant_text: str) -> str | None:
    """A suggested category name for a merchant never seen before, or None."""
    known = brand(merchant_text)
    if known:
        return SUGGESTIONS[known]
    words = set(merchant_text.split())
    for word, category in ANYWHERE.items():
        if word in words:
            return category
    return None
