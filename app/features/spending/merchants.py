"""
Telling merchants apart in statement descriptions, and suggesting a category for one never seen before.

A bank writes the same shop many ways ("WOOLWORTHS 1234 MITCHELTON", "SQ *MITCHELTON MARKETS", "PAYPAL *STEAMGAMES"),
so a description is cut down to its merchant: upper case, without a card processor's prefix, without store numbers,
card digits or dates. A learned rule is a merchant's first words (`pattern`), and it applies to every description
whose merchant starts with them.

The suggestions are a short list of common Australian merchants. They're only ever suggestions: the household
confirms them, and that's what's remembered.
"""

from __future__ import annotations

import re

PREFIXES = ("SQ *", "SP *", "SP ", "PAYPAL *", "ZLR*", "LSP*", "SMP*", "IZ *", "TST* ", "EFTPOS ", "VISA PURCHASE ")
_HAS_DIGIT = re.compile(r"\d")
_PUNCT = re.compile(r"[^A-Z0-9&' ]+")
WORDS = 2  # a learned rule's length, in words

# Merchant (start of) -> suggested category name.
SUGGESTIONS: dict[str, str] = {
    "WOOLWORTHS": "Groceries",
    "COLES": "Groceries",
    "ALDI": "Groceries",
    "IGA": "Groceries",
    "HARRIS FARM": "Groceries",
    "FOODWORKS": "Groceries",
    "COSTCO": "Groceries",
    "BP": "Fuel",
    "SHELL": "Fuel",
    "AMPOL": "Fuel",
    "CALTEX": "Fuel",
    "7-ELEVEN": "Fuel",
    "UNITED PETROLEUM": "Fuel",
    "PUMA ENERGY": "Fuel",
    "MCDONALDS": "Eating out",
    "MCDONALD'S": "Eating out",
    "HUNGRY JACKS": "Eating out",
    "GUZMAN Y GOMEZ": "Eating out",
    "KFC": "Eating out",
    "DOMINOS": "Eating out",
    "SUBWAY": "Eating out",
    "UBER EATS": "Eating out",
    "MENULOG": "Eating out",
    "DOORDASH": "Eating out",
    "STARBUCKS": "Eating out",
    "BUNNINGS": "Home",
    "IKEA": "Home",
    "KMART": "Home",
    "TARGET": "Home",
    "BIG W": "Home",
    "OFFICEWORKS": "Home",
    "CHEMIST WAREHOUSE": "Health",
    "PRICELINE": "Health",
    "TERRYWHITE": "Health",
    "STEAM": "Fun",
    "STEAMGAMES": "Fun",
    "NETFLIX": "Fun",
    "SPOTIFY": "Fun",
    "EVENT CINEMAS": "Fun",
    "HOYTS": "Fun",
    "JB HI": "Fun",
    "EB GAMES": "Fun",
    "SMIGGLE": "Kids",
}


def merchant(description: str) -> str:
    """A description cut down to the merchant: "SQ *Mitchelton Markets 0412" → "MITCHELTON MARKETS"."""
    text = " ".join(description.upper().split())
    for prefix in PREFIXES:
        if text.startswith(prefix):
            text = text[len(prefix) :]
            break
    text = text.replace("*", " ")
    text = _PUNCT.sub(" ", text)
    words = [w for w in text.split() if not _HAS_DIGIT.search(w) or w == "7-ELEVEN"]
    return " ".join(words)


def pattern(description: str) -> str:
    """The part of a merchant a learned rule keeps: its first words."""
    return " ".join(merchant(description).split()[:WORDS])


def matches(merchant_text: str, rule_pattern: str) -> bool:
    return merchant_text == rule_pattern or merchant_text.startswith(rule_pattern + " ")


def suggest(merchant_text: str) -> str | None:
    """A suggested category name for a merchant never seen before, or None."""
    for key in sorted(SUGGESTIONS, key=len, reverse=True):
        if matches(merchant_text, key):
            return SUGGESTIONS[key]
    words = set(merchant_text.split())
    for word, category in ANYWHERE.items():
        if word in words:
            return category
    return None


# Words that suggest a category wherever they are in the merchant ("MITCHELTON MARKETS", "KIDS SWIM SCHOOL").
ANYWHERE = {"MARKETS": "Groceries", "SWIM": "Kids", "PHARMACY": "Health", "CHEMIST": "Health", "CAFE": "Eating out"}
