# Changelog

## 2026.11.7 (alpha)

The first version: everything a household needs to run their money from it day to day.

- Accounts with jobs (offset goal, bills buffer, spending allowance, savings goals, just track it), and the home loan
  with its coverage, interest avoided and when it's fully offset.
- Balance check-ins, pre-filled with what the rules expected, flagging a transfer that didn't add up.
- Statement imports (uBank's format, and any bank's once its columns are matched): duplicates skipped, the running
  balance checked, rough check-ins replaced, hand entries merged, categories learned, transfers matched to rules.
- Each account's ledger, with balance adjustments (today, or as an opening balance) when it doesn't add up.
- Rules (payday transfers, the monthly top-up, the bills sweep), bills, and the spending month with safe to spend.
- The dashboard, a phone layout, and the five-step set-up guide, all with the Cockpit design and its motion spec.
- Household sign-in, API keys (`wmm_`), web push, ntfy and webhook notifications, updates from the app on Nightly,
  Beta or Stable, and backups before every update and each night.
