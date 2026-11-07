# Build plan

WheresMyMoney is built in phases, so a usable version comes early and each phase lands with its tests. The designs are
the Cockpit page of the design canvas (dark, IBM Plex, tiles) and the motion spec on its Prototype page. The platform
(install, updates, backups, sign-in, notifications, API keys) follows WattsMyPower.

There's no bank connection. Money comes in through **balance check-ins** (rough by default) and **statement CSV
imports** (uBank's format first), and the app keeps a ledger per account that the two reconcile.

## Phase 1: the first version

What a household needs to run their money from it day to day.

- **Platform:** FastAPI + SQLite backend (`app/`, one folder per feature), React 19 + Vite + Tailwind 4 + TanStack
  Router/Query frontend (`web/`), Docker Compose, `install.sh` with Nightly, Beta and Stable channels, `updater.sh` for
  updates from the app, a backup of the database before every update, household sign-in (a set-up code for the first
  account, then more members), Settings.
- **Accounts with roles:** offset goal (100% of the loan), bills buffer (N months of bills, default 3), spending
  allowance (topped up *to* an amount each month), savings goals, just track it. Which accounts offset the loan.
- **The home loan:** balance, rate, repayment, coverage (offsetting accounts ÷ loan), interest avoided, when it's fully
  offset at the current pace.
- **Ledger and adjustments:** each account's ledger is the sum of its transactions. Setting an exact balance adds a
  "Balance adjustment" for the difference, dated today or as an opening balance before the history starts.
- **Check-in:** every account's balance, pre-filled with what the rules expected; rough unless "these are exact" is
  ticked; flags a transfer that didn't add up (check again tomorrow, skipped this time, edit the rule).
- **CSV import:** uBank files (account and month from the name), duplicates skipped by date, amount and description,
  the running balance checked row by row, rough check-ins replaced with the statement's figures, hand entries merged
  (keeping the note) or kept as cash, categories from learned merchant rules, "Transfer" rows matched to rules by
  amount and date.
- **Rules:** payday transfers, the monthly top-up and the bills sweep, as plans; checked at each check-in.
- **Bills:** recurring, with how often and when next; the bills buffer's target comes from them.
- **Spending:** the month from top-up to top-up, daily pace, safe to spend, categories with budgets, adding spending by
  hand (or cash).
- **Dashboard:** loan coverage gauge, interest avoided, bills and spending gauges, savings goals, cash flow, accounts,
  payday rules, bills due. A phone layout with a bottom tab bar.
- **Setup:** the five-step guide (accounts, loan, bills, pay and spending, keeping it current).
- **Motion:** the motion spec's tokens and patterns (page rise and stagger, gauges sweep, numbers count, sheets and
  dialogs, toasts, the success tick, tabs), with reduced motion as fades only.
- **API keys:** `wmm_` keys, shown once, SHA-256 hashed; read scopes `accounts:read`, `bills:read`, `spending:read`,
  `loan:read`, `retirement:read` (off by default) and `checkin:write` (off by default).
- **Notifications:** web push, ntfy and a webhook, for check-in reminders, a flagged transfer, bills under target and
  safe-to-spend running low.

## Phase 2: net worth and the monthly review

- Snapshots from check-ins, imports and prices; a manual home value; a car with depreciation.
- The net worth page (trend, assets and debts) and the monthly review (October: what came in, went out, moved).

## Phase 3: investments

- Holdings by platform from a seeded catalogue (brokers, robo and micro-investing, crypto exchanges, wallets, super
  funds) shown as monogram tiles; real logos fetched or uploaded at run time, never bundled.
- Units, cost base and dates kept per parcel for CGT.
- Prices from public market data (only tickers leave the server). Which service is a decision for the household: no
  paid service is chosen without asking.

## Phase 4: retirement

- A two-pot plan: a bridge pot outside super from the retirement age to 60 (preservation age), and super from 60.
- The household's own assumptions only (returns, inflation, a 4% withdrawal rate, crypto counted at 50%), concessional
  cap $30,000 and SG 12% as defaults.
- A "general information, not advice" notice; no products are ever recommended.

## Phase 5: polish

- The icon library and catalogue page, every phone screen from the designs, and anything the first phases left rough.

## Decisions to ask about

- Creating the GitHub repository and pushing (nothing is pushed until then).
- Which market-data service prices holdings (phase 3), if a free public one isn't enough.
