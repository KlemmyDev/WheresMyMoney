# Changelog

## Unreleased

- Still more categories: Coffee, Alcohol, Electronics, Hobbies, Sport & fitness, Childcare, Garden, Pharmacy, Work
  expenses and Tax; Memberships, Rego and Rent as bills; Side income, Dividends and Refunds as money in; Savings and
  Loan repayment between accounts. Gyms, bottle shops, chemists and the like are suggested into them.
- A new category picker wherever a transaction is sorted (transactions, imports, sort by merchant, bills, adding
  spending): type to find, grouped by kind with the suggestion and recent choices on top, add a new category from
  it, and "always use it for" the merchant at its foot. It's a sheet on a phone.
- More categories to see where money goes: Takeaway, Car, Transport, Shopping, Clothing, Holidays, Pets, Personal care,
  Education, Gifts & donations, Buy now pay later, Fees & charges; bills split into Insurance, Utilities, Phone &
  internet, Subscriptions and Rates; Government benefits, Other income and Investments. A household that has its own
  categories already gets the ones it's missing, sorted in with them. uBank's own categories map onto them.
- Merchants are told apart better: "Direct Debit", "Payment To" and the like, and a trailing "QLD AU", are dropped, and
  a merchant is remembered by its brand or first distinctive word, so one choice covers every Woolworths store.
  Remembering a merchant re-sorts its transactions that only had a suggestion, never ones you chose yourself.
- Sort by merchant (from Spending): every merchant with something to sort, biggest first, sorted and remembered in
  one go. Choosing a category in an import gives it to the same merchant's other rows and remembers it.
- Bills spotted in the statements: regular payments to one merchant (weekly to yearly, with price rises followed)
  are suggested on the Bills page with their frequency, amount and next due date, to add, edit first or wave away. A
  bill whose payments changed price (an insurer's yearly rise, say) is flagged with the new amount to use.

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
