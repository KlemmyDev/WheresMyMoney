"""2026-27: 1 July 2026 to 30 June 2027. Amounts in dollars a year.

Resident income tax rates after the 2026 cut to the lowest rate (16% to 15%), the 2% Medicare levy on top, the
12% super guarantee, the $30,000 concessional cap (work's super and salary sacrifice together), 15% tax on
contributions going in, and super opening at 60 for anyone born after June 1964.
"""

YEAR = 2027
BRACKETS = [  # (from, rate): each rate applies to the dollars above `from`
    (0, 0.0),
    (18_200, 0.15),
    (45_000, 0.30),
    (135_000, 0.37),
    (190_000, 0.45),
]
MEDICARE = 0.02
SUPER_GUARANTEE = 0.12
CONCESSIONAL_CAP = 30_000
CONTRIBUTIONS_TAX = 0.15
PRESERVATION_AGE = 60
CARRY_FORWARD_UNDER = 500_000  # total super balance below which unused cap from the last five years can be used
AGE_PENSION_AGE = 67
# A simple full-rate age pension for a couple, a year in today's dollars (the plan's toggle, off by default).
AGE_PENSION_COUPLE = 25_000
