/** Every query the app makes, and the one rule for after a change: refetch what's on screen. */
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { apiGet } from "~/features/common/api";
import type {
  Account,
  AccountsOverview,
  BillUpdate,
  BillsOverview,
  Category,
  MerchantGroup,
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

export const transactionsQuery = (params: { account_id?: number; start?: string; q?: string; limit?: number }) =>
  queryOptions({
    queryKey: ["transactions", params],
    queryFn: ({ signal }) => apiGet<Transaction[]>("transactions", params, { signal }),
  });

export const billsQuery = queryOptions({
  queryKey: ["bills"],
  queryFn: ({ signal }) => apiGet<BillsOverview>("bills", undefined, { signal }),
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
    apiGet<{ suggestions: SpottedBill[]; updates: BillUpdate[] }>("bills/spotted", undefined, { signal }),
});

export const merchantsQuery = (all: boolean) =>
  queryOptions({
    queryKey: ["merchants", all],
    queryFn: ({ signal }) => apiGet<MerchantGroup[]>("merchants", all ? { all: true } : undefined, { signal }),
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
  changes: { date: string; field: "rate" | "repayment"; value: number; was: number | null; description: string }[];
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
  steps: { accounts: boolean; loan: boolean; bills: boolean; pay: boolean; current: boolean };
};

export const setupQuery = queryOptions({
  queryKey: ["setup"],
  queryFn: ({ signal }) => apiGet<SetupState>("setup", undefined, { signal }),
});

/** After anything that changes the household's money: refetch every view of it (not the session). */
export function refresh(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
}
