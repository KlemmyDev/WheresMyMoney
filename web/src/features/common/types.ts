/** What the server sends. Money is whole cents; dates are ISO (2026-11-12). */

export type Role = "offset" | "bills" | "spending" | "savings" | "track";
export type Every = "weekly" | "fortnightly" | "monthly" | "quarterly" | "term" | "half-yearly" | "yearly";

export type Target =
  | { kind: "loan"; amount: number; progress: number }
  | { kind: "months"; months: number; per_month: number; amount: number; held: number | null; progress: number }
  | { kind: "allowance"; amount: number; progress: number }
  | { kind: "goals"; count: number; amount: number; progress: number };

export type Account = {
  id: number;
  name: string;
  kind: "bank" | "loan";
  role: Role;
  last4: string | null;
  colour: string;
  offsets_loan: boolean;
  target_months: number | null;
  allowance: number | null;
  alert_below: boolean;
  rate_bp: number | null;
  repayment: number | null;
  repay_from: number | null;
  goal_date: string | null;
  balance: number;
  ledger: number;
  gap: number;
  transactions: number;
  history_from: string | null;
  known: { date: string; source: string; exact: boolean } | null;
  change_30d: number;
  target?: Target | null;
};

export type Goal = {
  id: number;
  account_id: number;
  name: string;
  target: number;
  saved: number;
  icon: string | null;
  by_date: string | null;
  /** What to call its transfers in uBank so imports match them. */
  ref: string;
  /** Top-ups planned but not moved yet (not counted in saved). */
  planned: { id: number; amount: number; date: string }[];
};

export type AccountsOverview = {
  accounts: Account[];
  loan: Account | null;
  offsetting: number;
  total: number;
  goals: Goal[];
};

export type Transaction = {
  id: number;
  account_id: number;
  date: string;
  amount: number;
  description: string;
  kind: "statement" | "manual" | "cash" | "adjustment";
  category_id: number | null;
  category: string | null;
  category_kind: string | null;
  note: string;
  rule_id: number | null;
  bill_id: number | null;
  user_id: number | null;
  who: string | null;
  merged: boolean;
  /** The description cut down to the merchant, for remembering a category. */
  merchant: string;
  /** What choosing a category "always" remembers it by: "KMART" for "KMART YAMANTO". */
  remember_as: string;
  /** How its category was chosen: you, rule, suggest, bill, auto, or null. */
  category_by: string | null;
  excluded: boolean;
  splits: { category_id: number; category: string | null; amount: number }[];
};

export type Category = { id: number; name: string; kind: string; budget: number | null; icon: string | null };

export type Bill = {
  id: number;
  name: string;
  amount: number;
  every: Every;
  next_due: string;
  account_id: number | null;
  how: "auto" | "manual" | "estimate";
  match: string;
  category_id: number | null;
  per_year: number;
  share?: number;
};

/** A bill spotted in the imported statements: regular payments to one merchant. */
export type SpottedBill = {
  key: string;
  name: string;
  match: string;
  amount: number;
  every: Every;
  per_year: number;
  next_due: string;
  account_id: number;
  how: "auto" | "estimate";
  variable: boolean;
  category_id: number | null;
  category: string | null;
  seen: number;
  first: string;
  last: string;
  regular: number;
  min: number;
  max: number;
  changes: PriceChange[];
  rise: { was: number; now: number; pct: number } | null;
  history: { date: string; amount: number }[];
  example: string;
};

export type PriceChange = { date: string; was: number; now: number; pct: number };

/** A bill whose latest payment was a different amount from what the bill says. */
export type BillUpdate = {
  key: string;
  bill_id: number;
  name: string;
  was: number;
  now: number;
  pct: number;
  since: string;
  every: Every;
  per_year_change: number;
  history: { date: string; amount: number }[];
};

/** Transactions grouped by the merchant they'd be remembered by. */
export type MerchantGroup = {
  pattern: string;
  example: string;
  transaction_id: number;
  count: number;
  spent: number;
  received: number;
  first: string;
  last: string;
  unsorted: number;
  suggested: number;
  category_id: number | null;
  category: string | null;
  remembered: boolean;
  suggest_id: number | null;
  categories: { id: number; name: string; count: number }[];
};

export type Due = { bill_id: number; name: string; date: string; amount: number; how: string };

export type BillsOverview = {
  bills: Bill[];
  per_year: number;
  per_month: number;
  next30: { total: number; count: number; by_hand: number; items: Due[] };
  by_month: { month: string; total: number; count: number }[];
  account: Account | null;
};

export type Rule = {
  id: number;
  kind: "pay" | "transfer" | "top_up" | "sweep";
  from_account: number | null;
  to_account: number | null;
  amount: number;
  every: Every;
  anchor: string;
  label: string;
  enabled: boolean;
  next_run: string;
  last_run: string | null;
  last_status: string | null;
  last_checked: string | null;
};

export type SimEvent = {
  date: string;
  kind: string;
  rule_id?: number;
  from?: number | null;
  to?: number | null;
  account?: number;
  name?: string;
  amount: number;
};

export type RulesOverview = {
  rules: Rule[];
  month: { pay: number; transfers: number; spending: number; bills: number; repayment: number; surplus: number };
  payday: { date: string; events: SimEvent[]; after: Record<string, number> } | null;
  today: string;
};

export type SpendingMonth = {
  account_id: number;
  start: string;
  end: string;
  days: number;
  day: number;
  remaining: number;
  allowance: number;
  left: number;
  spent: number;
  safe_per_day: number;
  even_per_day: number;
  vs_pace: number;
  pace: number;
  projected: number;
  daily: number[];
  categories: { id: number; name: string; budget: number | null; spent: number }[];
  unsorted: number;
  unbudgeted: number;
  by_person: { user_id: number | null; spent: number }[];
  top_up: Rule | null;
  owed_back: number;
};

export type Flag = {
  id: number;
  checkin_id: number;
  account_id: number;
  account: string;
  rule: Rule | null;
  difference: number;
  status: string;
  date: string;
};

export type Dashboard = {
  today: string;
  period: string;
  coverage: {
    offsetting: number;
    offset_only: number;
    loan: number;
    ratio: number | null;
    offset_ratio: number | null;
    change_mtd: number | null;
    eta: string | null;
    goal: string | null;
    rate_bp: number;
  };
  interest: { per_day: number; this_month: number; per_year: number; months: { month: string; per_day: number }[] };
  bills: { account_id: number; balance: number; target: Target | null } | null;
  spending: SpendingMonth | null;
  savings: { balance: number; goals: Goal[] } | null;
  flow: { month: string; in: number; out: number; partial: boolean }[];
  accounts: (Pick<Account, "id" | "name" | "role" | "colour" | "balance" | "change_30d" | "offsets_loan"> & {
    target: Target | null;
    spark: number[];
  })[];
  loan: Account | null;
  rules: Rule[];
  due: { total: number; count: number; items: Due[] };
  checkin: { last: { id: number; date: string; exact: boolean } | null; next: string; flags: Flag[] };
  growth: { recent: number; planned: number };
};
