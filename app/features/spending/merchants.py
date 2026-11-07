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

import re

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

# Merchant (start of) -> suggested category name.
SUGGESTIONS: dict[str, str] = {
    # Groceries
    "WOOLWORTHS": "Groceries",
    "COLES": "Groceries",
    "ALDI": "Groceries",
    "IGA": "Groceries",
    "HARRIS FARM": "Groceries",
    "FOODWORKS": "Groceries",
    "COSTCO": "Groceries",
    "DRAKES": "Groceries",
    "FOODLAND": "Groceries",
    # Fuel
    "BP": "Fuel",
    "SHELL": "Fuel",
    "AMPOL": "Fuel",
    "CALTEX": "Fuel",
    "7-ELEVEN": "Fuel",
    "UNITED PETROLEUM": "Fuel",
    "PUMA ENERGY": "Fuel",
    "LIBERTY": "Fuel",
    "METRO PETROLEUM": "Fuel",
    # Car
    "LINKT": "Car",
    "TRANSURBAN": "Car",
    "TESLA": "Car",
    "CHARGEFOX": "Car",
    "EVIE": "Car",
    "SUPERCHEAP": "Car",
    "REPCO": "Car",
    "AUTOBARN": "Car",
    "ULTRATUNE": "Car",
    "MIDAS": "Car",
    "SECURE PARKING": "Car",
    "WILSON PARKING": "Car",
    "QLD TRANSPORT": "Car",
    "SERVICE NSW": "Car",
    # Transport
    "TRANSLINK": "Transport",
    "GO CARD": "Transport",
    "OPAL": "Transport",
    "MYKI": "Transport",
    "UBER TRIP": "Transport",
    "DIDI": "Transport",
    "13CABS": "Transport",
    # Eating out and takeaway
    "MCDONALDS": "Takeaway",
    "MCDONALD'S": "Takeaway",
    "HUNGRY JACKS": "Takeaway",
    "GUZMAN Y GOMEZ": "Takeaway",
    "KFC": "Takeaway",
    "DOMINOS": "Takeaway",
    "DOMINO'S": "Takeaway",
    "PIZZA HUT": "Takeaway",
    "RED ROOSTER": "Takeaway",
    "OPORTO": "Takeaway",
    "SUBWAY": "Takeaway",
    "UBER EATS": "Takeaway",
    "UBER EATS HELP": "Takeaway",
    "MENULOG": "Takeaway",
    "DOORDASH": "Takeaway",
    "NANDOS": "Takeaway",
    "GRILL'D": "Eating out",
    "STARBUCKS": "Eating out",
    "ZARRAFFAS": "Eating out",
    "GLORIA JEANS": "Eating out",
    "BWS": "Eating out",
    "DAN MURPHY'S": "Eating out",
    "DAN MURPHYS": "Eating out",
    "LIQUORLAND": "Eating out",
    # Shopping and clothing
    "KMART": "Shopping",
    "TARGET": "Shopping",
    "BIG W": "Shopping",
    "AMAZON": "Shopping",
    "EBAY": "Shopping",
    "THE REJECT SHOP": "Shopping",
    "JB HI": "Shopping",
    "HARVEY NORMAN": "Shopping",
    "THE GOOD GUYS": "Shopping",
    "OFFICEWORKS": "Shopping",
    "MYER": "Clothing",
    "DAVID JONES": "Clothing",
    "BEST & LESS": "Clothing",
    "REBEL": "Clothing",
    "SHEIN": "Clothing",
    "UNIQLO": "Clothing",
    "COTTON ON": "Clothing",
    "H&M": "Clothing",
    "BIG W PHOTO": "Shopping",
    # Home
    "BUNNINGS": "Home",
    "IKEA": "Home",
    "SPOTLIGHT": "Home",
    "ADAIRS": "Home",
    "FANTASTIC FURNITURE": "Home",
    "MITRE": "Home",
    # Health and personal care
    "CHEMIST WAREHOUSE": "Health",
    "PRICELINE": "Health",
    "TERRYWHITE": "Health",
    "AMCAL": "Health",
    "PLINEPH": "Health",
    "SPECSAVERS": "Health",
    "PATHOLOGY": "Health",
    "SULLIVAN NICOLAIDES": "Health",
    "MECCA": "Personal care",
    "SEPHORA": "Personal care",
    "JUST CUTS": "Personal care",
    # Fun
    "STEAM": "Fun",
    "STEAMGAMES": "Fun",
    "EVENT CINEMAS": "Fun",
    "HOYTS": "Fun",
    "EB GAMES": "Fun",
    "DREAMWORLD": "Fun",
    "MOVIE WORLD": "Fun",
    "SEA WORLD": "Fun",
    "TICKETEK": "Fun",
    "TICKETMASTER": "Fun",
    # Holidays
    "QANTAS AIRWAYS": "Holidays",
    "VIRGIN AUSTRALIA": "Holidays",
    "JETSTAR": "Holidays",
    "AIRBNB": "Holidays",
    "BOOKING COM": "Holidays",
    "EXPEDIA": "Holidays",
    # Kids and pets
    "SMIGGLE": "Kids",
    "TOYWORLD": "Kids",
    "BABY BUNTING": "Kids",
    "PETBARN": "Pets",
    "PET CIRCLE": "Pets",
    "PETSTOCK": "Pets",
    "GREENCROSS": "Pets",
    # Bills
    "NIB": "Insurance",
    "MEDIBANK": "Insurance",
    "BUPA": "Insurance",
    "HCF": "Insurance",
    "AHM": "Insurance",
    "RACQ": "Insurance",
    "NRMA": "Insurance",
    "RACV": "Insurance",
    "AAMI": "Insurance",
    "ALLIANZ": "Insurance",
    "SUNCORP INSURANCE": "Insurance",
    "BUDGET DIRECT": "Insurance",
    "YOUI": "Insurance",
    "HOLLARD": "Insurance",
    "BINGLE": "Insurance",
    "TAL": "Insurance",
    "ORIGIN": "Utilities",
    "AGL": "Utilities",
    "ENERGYAUSTRALIA": "Utilities",
    "ALINTA": "Utilities",
    "RED ENERGY": "Utilities",
    "SIMPLY ENERGY": "Utilities",
    "POWERSHOP": "Utilities",
    "AMBER": "Utilities",
    "URBAN UTILITIES": "Utilities",
    "QUEENSLAND URBAN": "Utilities",
    "TELSTRA": "Phone & internet",
    "OPTUS": "Phone & internet",
    "VODAFONE": "Phone & internet",
    "TPG": "Phone & internet",
    "AUSSIE BROADBAND": "Phone & internet",
    "BELONG": "Phone & internet",
    "BOOST": "Phone & internet",
    "AMAYSIM": "Phone & internet",
    "STARLINK": "Phone & internet",
    "SUPERLOOP": "Phone & internet",
    "NETFLIX": "Subscriptions",
    "SPOTIFY": "Subscriptions",
    "STAN": "Subscriptions",
    "BINGE": "Subscriptions",
    "KAYO": "Subscriptions",
    "FOXTEL": "Subscriptions",
    "DISNEY PLUS": "Subscriptions",
    "DISNEYPLUS": "Subscriptions",
    "PARAMOUNT": "Subscriptions",
    "AUDIBLE": "Subscriptions",
    "KINDLE": "Subscriptions",
    "AMAZON PRIME": "Subscriptions",
    "PRIME VIDEO": "Subscriptions",
    "GOOGLE YOUTUBE": "Subscriptions",
    "GOOGLE YOUTUBEPREMIUM": "Subscriptions",
    "YOUTUBE": "Subscriptions",
    "MICROSOFT XBOX": "Subscriptions",
    "PLAYSTATION": "Subscriptions",
    "APPLE COM BILL": "Subscriptions",
    "OPENAI": "Subscriptions",
    "CLAUDE AI": "Subscriptions",
    "ANTHROPIC": "Subscriptions",
    "ADOBE": "Subscriptions",
    "DROPBOX": "Subscriptions",
    "CITY COUNCIL": "Rates",
    # Money
    "AFTERPAY": "Buy now pay later",
    "ZIP PAY": "Buy now pay later",
    "ZIPPAY": "Buy now pay later",
    "KLARNA": "Buy now pay later",
    "HUMM": "Buy now pay later",
    "COINBASE": "Investments",
    "COINSPOT": "Investments",
    "SWYFTX": "Investments",
    "STAKE": "Investments",
    "COMMSEC": "Investments",
    "PEARLER": "Investments",
    "VANGUARD": "Investments",
    "RAIZ": "Investments",
    "SPACESHIP": "Investments",
    "ATO": "Fees & charges",
    "PARENTALLEAVEPAY": "Government benefits",
    "CENTRELINK": "Government benefits",
    "SERVICES AUSTRALIA": "Government benefits",
    "CONTAINER EXCHANGE": "Other income",
}

# Words that suggest a category wherever they are in the merchant ("MITCHELTON MARKETS", "KIDS SWIM SCHOOL").
ANYWHERE = {
    "MARKETS": "Groceries",
    "BUTCHER": "Groceries",
    "BAKERY": "Groceries",
    "SWIM": "Kids",
    "CHILDCARE": "Kids",
    "KINDY": "Kids",
    "PHARMACY": "Health",
    "CHEMIST": "Health",
    "DENTAL": "Health",
    "MEDICAL": "Health",
    "PHYSIO": "Health",
    "CAFE": "Eating out",
    "COFFEE": "Eating out",
    "ESPRESSO": "Eating out",
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


_PERSON = ("PAYMENT TO ", "PAYMENT FROM ", "OSKO PAYMENT TO ", "OSKO PAYMENT FROM ")


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
