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
  /** Won't happen again (a birthday party): still counted, but the spending forecast doesn't learn from it. */
  one_off: boolean;
  /** The merchant it belongs to: by itself, or the one its statement name was mapped to (see the Merchants page). */
  merchant_key: string;
  merchant_name: string;
  /** The household's note about the merchant ("car insurance for the Mazda"). */
  merchant_note: string;
  /** Its statement line doesn't say who was paid (BPAY): its merchant is chosen payment by payment. */
  merchant_unnamed: boolean;
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
/** A merchant on the Merchants page: money out there, and the last 12 months, oldest first. */
export type MerchantSummary = {
  key: string;
  name: string;
  count: number;
  spent: number;
  spent_year: number;
  months: number[];
  first: string;
  last: string;
  category: string | null;
  /** How many statement names belong to it. */
  names: number;
  note: string;
  /** Its own sorting: the default category's name, if one is set, and how many amount rules it has. */
  default_category: string | null;
  rules: number;
};

export type MerchantDetail = {
  key: string;
  name: string;
  /** The household chose its name. */
  named: boolean;
  /** Its note, default category, and categories by amount (cents), tried in order before the default. */
  settings: {
    note: string;
    category_id: number | null;
    rules: { over: boolean; amount: number; category_id: number }[];
  };
  count: number;
  spent: number;
  spent_year: number;
  per_month: number;
  per_visit: number;
  first: string;
  last: string;
  category: string | null;
  months: { month: string; spent: number }[];
  /** Statement names that belong to it; `mapped` when the household put it here. */
  /** `unnamed`: a BPAY line, which is placed payment by payment rather than moved as a whole. */
  names: { text: string; count: number; last: string; transaction_id: number; mapped: boolean; unnamed: boolean }[];
  /** BPAY payments put here by their amount (cents). */
  amounts: { text: string; amount: number }[];
  /** The catch-all for BPAY payments nobody has named yet. */
  unnamed: boolean;
  transactions: Transaction[];
};

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

/** One bill's page: its payments (oldest first), what they add up to, price changes, and the dates ahead. */
export type BillDetail = {
  bill: Bill;
  payments: { id: number; date: string; amount: number }[];
  total: number;
  count: number;
  average: number | null;
  last_year: number;
  first: string | null;
  changes: { date: string; was: number; now: number }[];
  upcoming: { date: string; amount: number }[];
  next_year: number;
  share: number;
  /** The payments as transactions, newest first. */
  transactions: Transaction[];
};

/** A budget for each spending category from what was actually spent in the last few whole months. */
export type BudgetSuggestions = {
  months: number;
  from: string | null;
  categories: {
    id: number;
    name: string;
    budget: number | null;
    months: number[];
    average: number;
    highest: number;
    suggested: number | null;
    /** How many of the months went over the budget. */
    over: number;
    /** Gone over in most months, or well under in every one. */
    note: "over" | "under" | null;
  }[];
};

export type Due = { bill_id: number; name: string; date: string; amount: number; how: string };

export type BillsOverview = {
  bills: Bill[];
  per_year: number;
  per_month: number;
  next30: { total: number; count: number; by_hand: number; items: Due[] };
  by_month: { month: string; total: number; count: number }[];
  account: Account | null;
  /** The bills that come a few times a year or less, and setting money aside for them. */
  set_aside: {
    items: {
      bill_id: number;
      name: string;
      amount: number;
      every: Every;
      how: Bill["how"];
      account_id: number | null;
      next_due: string;
      days: number;
      per_month: number;
      /** How much should be put aside for it by now. */
      built: number;
    }[];
    per_year: number;
    per_month: number;
    built: number;
  };
  /** What the rules move into the bills account in a usual month. */
  into_account?: number;
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
  /**
   * What the forecast expected each day of the month (cents, learned from the spending before it began; empty until
   * there's enough history), how right it's been lately (0 to 1), and the likely spending still to come with a range.
   */
  expected: {
    ready: boolean;
    history_days: number;
    needs_days: number;
    daily: number[];
    accuracy: number | null;
    rest: number | null;
    low: number | null;
    high: number | null;
  };
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
