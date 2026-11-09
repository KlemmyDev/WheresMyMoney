/** Every query the app makes, and the one rule for after a change: refetch what's on screen. */
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { apiGet } from "~/features/common/api";
import type {
  BudgetSuggestions,
  CategoryInsights,
  BillDetail,
  Account,
  AccountsOverview,
  BillUpdate,
  BillsOverview,
  Category,
  BillCandidate,
  Business,
  MergeSuggestion,
  MerchantDetail,
  MerchantGroup,
  MerchantSummary,
  Dashboard,
  RulesOverview,
  SpendingMonth,
  SpottedBill,
  Transaction,
} from "~/features/common/types";

export const dashboardQuery = (period: string) =>
  queryOptions({
    queryKey: ["dashboard", period],
    queryFn: ({ signal }) => apiGet<Dashboard>("dashboard", { period }, { signal }),
    staleTime: 30_000,
  });

export const accountsQuery = queryOptions({
  queryKey: ["accounts"],
  queryFn: ({ signal }) => apiGet<AccountsOverview>("accounts", undefined, { signal }),
});

/** Accounts that were removed, to bring back. */
export const archivedAccountsQuery = queryOptions({
  queryKey: ["accounts", "archived"],
  queryFn: ({ signal }) =>
    apiGet<Pick<Account, "id" | "name" | "kind" | "role" | "last4" | "colour" | "balance" | "transactions">[]>(
      "accounts/archived",
      undefined,
      { signal },
    ),
});

export const accountQuery = (id: number) =>
  queryOptions({
    queryKey: ["accounts", id],
    queryFn: ({ signal }) =>
      apiGet<
        AccountsOverview["accounts"][number] & {
          history: [string, number][];
          /** The loan's rate and repayment over time, newest first (the loan only). */
          changes?: { date: string; field: "rate" | "repayment"; value: number; was: number | null }[];
        }
      >(`accounts/${id}`, undefined, {
        signal,
      }),
  });

/** Up to a year of an account a day at a time: the balance and the money in and out (the loan: added and repaid). */
export const accountActivityQuery = (id: number) =>
  queryOptions({
    queryKey: ["accounts", id, "activity"],
    queryFn: ({ signal }) =>
      apiGet<{
        start: string;
        end: string;
        /** The loan with no statement imported: interest and repayments worked out, not read. */
        estimated: boolean;
        days: { date: string; balance: number; in: number; out: number }[];
      }>(`accounts/${id}/activity`, { days: 365 }, { signal }),
  });

export const transactionsQuery = (params: {
  account_id?: number;
  start?: string;
  end?: string;
  q?: string;
  limit?: number;
}) =>
  queryOptions({
    queryKey: ["transactions", params],
    queryFn: ({ signal }) => apiGet<Transaction[]>("transactions", params, { signal }),
  });

export const billsQuery = queryOptions({
  queryKey: ["bills"],
  queryFn: ({ signal }) => apiGet<BillsOverview>("bills", undefined, { signal }),
});

export const billQuery = (id: number) =>
  queryOptions({
    queryKey: ["bills", id],
    queryFn: ({ signal }) => apiGet<BillDetail>(`bills/${id}`, undefined, { signal }),
  });

export const billCandidatesQuery = (id: number) =>
  queryOptions({
    queryKey: ["bills", id, "candidates"],
    queryFn: ({ signal }) => apiGet<BillCandidate[]>(`bills/${id}/candidates`, undefined, { signal }),
  });

export const budgetSuggestionsQuery = queryOptions({
  queryKey: ["categories", "suggestions"],
  queryFn: ({ signal }) => apiGet<BudgetSuggestions>("categories/suggestions", undefined, { signal }),
});

export const rulesQuery = queryOptions({
  queryKey: ["rules"],
  queryFn: ({ signal }) => apiGet<RulesOverview>("rules", undefined, { signal }),
});

export const spendingQuery = queryOptions({
  queryKey: ["spending"],
  queryFn: ({ signal }) =>
    apiGet<{ month: SpendingMonth | null; recent: Transaction[]; categories: Category[] }>("spending", undefined, {
      signal,
    }),
});

export const spottedBillsQuery = queryOptions({
  queryKey: ["bills", "spotted"],
  queryFn: ({ signal }) =>
    apiGet<{
      suggestions: SpottedBill[];
      updates: BillUpdate[];
      /** Names of suggestions put off until the next import. */
      later: string[];
      /** The latest import (its files within the hour), for "From the latest import". */
      from_import: { files: number; rows: number; at: number } | null;
    }>("bills/spotted", undefined, { signal }),
});

export const merchantsQuery = (all: boolean) =>
  queryOptions({
    queryKey: ["merchants", all],
    queryFn: ({ signal }) => apiGet<MerchantGroup[]>("merchants", all ? { all: true } : undefined, { signal }),
  });

export const merchantDirectoryQuery = queryOptions({
  queryKey: ["merchants", "directory"],
  queryFn: ({ signal }) => apiGet<MerchantSummary[]>("merchants/directory", undefined, { signal }),
});

export const businessesQuery = queryOptions({
  queryKey: ["businesses"],
  queryFn: ({ signal }) => apiGet<Business[]>("businesses", undefined, { signal }),
  staleTime: Infinity,
});

export const merchantSuggestionsQuery = queryOptions({
  queryKey: ["merchants", "suggestions"],
  queryFn: ({ signal }) => apiGet<MergeSuggestion[]>("merchants/suggestions", undefined, { signal }),
});

export const categoryInsightsQuery = (id: number, months: number) =>
  queryOptions({
    queryKey: ["categories", "insights", id, months],
    queryFn: ({ signal }) => apiGet<CategoryInsights>(`categories/${id}/insights`, { months }, { signal }),
    placeholderData: (prev) => prev,
  });

export const merchantQuery = (key: string) =>
  queryOptions({
    queryKey: ["merchants", "directory", key],
    queryFn: ({ signal }) =>
      apiGet<MerchantDetail>(`merchants/directory/${encodeURIComponent(key)}`, undefined, { signal }),
  });

export const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: ({ signal }) =>
    apiGet<{ categories: Category[]; merchant_rules: { id: number; pattern: string; category: string }[] }>(
      "categories",
      undefined,
      { signal },
    ),
  staleTime: 60_000,
});

export type LoanView = {
  loan: AccountsOverview["accounts"][number];
  offsetting: number;
  offset_only: number;
  coverage: number;
  coverage_offset_only: number;
  interest_per_day: number;
  charged_per_month: number;
  /** What the imported loan statements actually charged; null until one is imported. */
  interest_charged: {
    months: { month: string; amount: number }[];
    last: { date: string; amount: number } | null;
    year: number;
    per_month: number;
  } | null;
  principal_per_month: number;
  monthly_growth: number;
  planned_growth: number;
  recent: { date: string | null; months: number | null; points: [string, number, number][] };
  planned: { date: string | null; months: number | null; points: [string, number, number][] };
  scenarios: {
    extra: number;
    date: string | null;
    months: number | null;
    sooner: number | null;
    interest_saved: number;
  }[];
  by_account: { id: number; name: string; colour: string; balance: number; share: number }[];
  changes: {
    date: string;
    field: "rate" | "repayment" | "lump" | "refinance";
    value: number;
    was: number | null;
    description: string;
  }[];
};

export const loanQuery = queryOptions({
  queryKey: ["loan"],
  queryFn: ({ signal }) => apiGet<LoanView | null>("loan", undefined, { signal }),
});

export type Settings = {
  settings: {
    household: string;
    reminder: string;
    detail: string;
    setup_done: boolean;
    update_check: boolean;
    tolerance: number;
  };
  about: { version: string; release: string | null; commit: string | null };
  today: string;
};

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: ({ signal }) => apiGet<Settings>("settings", undefined, { signal }),
  staleTime: 60_000,
});

export type SetupState = {
  done: boolean;
  show: boolean;
  steps: {
    accounts: boolean;
    loan: boolean;
    bills: boolean;
    pay: boolean;
    current: boolean;
    checkin: boolean;
    import: boolean;
    reminders: boolean;
  };
};

export const setupQuery = queryOptions({
  queryKey: ["setup"],
  queryFn: ({ signal }) => apiGet<SetupState>("setup", undefined, { signal }),
});

/** After anything that changes the household's money: refetch every view of it (not the session). */
export function refresh(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
}

export type Fund = {
  id: number;
  ticker: string;
  name: string;
  group: string;
  group_name: string;
  target: number | null;
  fee_pct: number | null;
  platform: string;
  kind: "etf" | "share" | "crypto";
  units: number;
  price: number | null;
  price_date: string | null;
  value: number;
  cost: number;
  gain: number;
  realised: number;
  day: number;
  first: string | null;
  share: number;
};

export type Trade = {
  id: number;
  fund_id: number;
  ticker: string;
  date: string;
  side: "buy" | "sell";
  units: number;
  price: number;
  fee: number;
  amount: number;
};

export type Portfolio = {
  funds: Fund[];
  total: number;
  cost: number;
  gain: number;
  realised: number;
  day: number;
  price_date: string | null;
  checked: string | null;
  failed: string[];
  first: string | null;
  annual: number | null;
  loan_rate_bp: number | null;
  targets_set: boolean;
  trades: Trade[];
  distributions: {
    year_total: number;
    quarters: { quarter: string; start: string; amount: number; likely: boolean }[];
  };
  groups: Record<string, string>;
};

export const investmentsQuery = queryOptions({
  queryKey: ["investments"],
  queryFn: ({ signal }) => apiGet<Portfolio>("investments", undefined, { signal }),
});

export const investmentHistoryQuery = (range: string) =>
  queryOptions({
    queryKey: ["investments", "history", range],
    queryFn: ({ signal }) =>
      apiGet<{ date: string; value: number; cost: number }[]>("investments/history", { range }, { signal }),
  });

export type SuperAccount = {
  id: number;
  person: string;
  born: number;
  age: number;
  fund: string;
  /** The key of the known fund this is (see KnownFund), if any. */
  known_fund: string | null;
  balance: number;
  as_of: string | null;
  salary: number;
  rate: number;
  opens: number;
  fees: { name: string; kind: "pct" | "fixed"; amount: number; cap?: number | null }[];
  options: { name: string; share: number; return_pct: number | null; fee_pct: number }[];
  /** Salary sacrificed into super, cents a year, and how often they're paid. */
  sacrifice: number;
  pay_every: "weekly" | "fortnightly" | "monthly";
  /** This financial year: work's super and salary sacrifice together, the cap, and what's left of it. */
  concessional: number;
  cap: number;
  room: number;
};

/** A super fund whose fees are known: picking it fills them in. */
export type KnownFund = {
  key: string;
  name: string;
  source: string;
  checked: string;
  fees: { name: string; kind: "pct" | "fixed"; amount: number; cap?: number | null }[];
  /** Each investment option's fees and costs (with transaction costs), a year. */
  options: Record<string, number>;
};

export type RetirementSettings = {
  retire_age: number;
  spending: number;
  extra: number;
  count_etfs: boolean;
  /** Crypto in the plan (it's always in net worth), and the household's cap on it. */
  count_crypto: boolean;
  crypto_cap: number;
  crypto_cap_of: "investments" | "networth";
  plan_to: number;
  super_return: number;
  etf_return: number;
  etf_fee: number;
  inflation: number;
  contrib_tax: number;
  super_fee: number | null;
};

export type RetirementData = {
  people: SuperAccount[];
  settings: RetirementSettings;
  funds: KnownFund[];
  spending_now: number;
  preservation: number;
  year: number;
};

export const retirementQuery = queryOptions({
  queryKey: ["retirement"],
  queryFn: ({ signal }) => apiGet<RetirementData>("retirement", undefined, { signal }),
});

export type Asset = {
  id: number;
  name: string;
  kind: "home" | "car" | "other";
  value: number;
  as_of: string | null;
  values: { date: string; value: number }[];
};

export type NetWorthPoint = {
  date: string;
  accounts: number;
  shares: number;
  /** Crypto, apart from shares. */
  crypto: number;
  super: number;
  home: number;
  other: number;
  loan: number;
};

/** Net worth at a point: everything owned less the home loan (or, without the home, leaving out both). The one sum
 * every page uses, so Overview, Net worth and Future agree. */
export function netWorthOf(p: NetWorthPoint, home = true): number {
  return p.accounts + p.shares + (p.crypto ?? 0) + p.super + p.other + (home ? p.home - p.loan : 0);
}

export type NetWorth = {
  range: string;
  accounts: {
    id: number;
    name: string;
    role: string;
    balance: number;
    known: { date: string; source: string } | null;
  }[];
  loan: { id: number; name: string; balance: number; rate_bp: number | null; offsetting: number } | null;
  shares: { value: number; funds: number };
  crypto: { value: number; funds: number };
  /** In a year: what's put away (super after tax going in, the offsetting accounts, the funds) and the loan paid down. */
  likely: {
    month: string;
    put_away: number;
    super: number;
    accounts: number;
    shares: number;
    loan_down: number;
    gain: number;
  };
  super: { person: string; balance: number; as_of: string | null }[];
  assets: Asset[];
  now: NetWorthPoint;
  history: NetWorthPoint[];
  kinds: Record<string, string>;
};

export const netWorthQuery = (range: string) =>
  queryOptions({
    queryKey: ["networth", range],
    queryFn: ({ signal }) => apiGet<NetWorth>("networth", { range }, { signal }),
  });

export type CapitalGains = {
  year: number;
  years: number[];
  sales: {
    fund_id: number;
    ticker: string;
    date: string;
    bought: string;
    units: number;
    proceeds: number;
    cost: number;
    gain: number;
    long: boolean;
  }[];
  short: number;
  long: number;
  losses: number;
  discount: number;
  net: number;
  carried: number;
  parcels: {
    fund_id: number;
    ticker: string;
    bought: string;
    units: number;
    cost: number;
    value: number | null;
    gain: number | null;
    discount_from: string;
    long: boolean;
  }[];
};

export const capitalGainsQuery = (year: number | null) =>
  queryOptions({
    queryKey: ["investments", "tax", year],
    queryFn: ({ signal }) => apiGet<CapitalGains>("investments/tax", year ? { year } : undefined, { signal }),
  });
