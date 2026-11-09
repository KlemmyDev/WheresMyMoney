/** The early-retirement engine's answer (GET /api/fire). Money in cents. */
import { queryOptions } from "@tanstack/react-query";
import { apiGet } from "~/features/common/api";

export type FireSummary = {
  retire_age: number;
  retire_year: number;
  ok: boolean;
  lasts: number;
  loan_age: number | null;
  loan_year: number | null;
};

export type FireRow = {
  age: number;
  year: number;
  super: number;
  etfs: number;
  offset: number;
  /** Once stopped: what each pot paid that year, and what fell short. */
  paid?: { etfs: number; offset: number; super: number; short: number };
};

export type Bridge = { years: number; opens_year: number; outside: number; need: number; covered: boolean };

export type Rung = {
  key: "offset" | "super" | "etfs" | "repay";
  in: number;
  rate: number;
  out: number;
  reach: string;
  risk: boolean;
};

export type Milestone = { age: number; year: number; spend?: number } | null;

export type Fire =
  | { ready: false; needs: string }
  | {
      ready: true;
      today: FireSummary | null;
      plan: FireSummary | null;
      people: { name: string; age: number; opens: number }[];
      put_away: { super: number; etfs: number; age: number };
      progress: { now: number; target: number; share: number };
      loan: { gone: string; freed: number } | null;
      milestones: { coast: Milestone; lean: Milestone; full: Milestone };
      scenarios: ({ key: string; name: string } & Partial<FireSummary>)[];
      saved: {
        kind: string;
        date: string;
        retire_age: number;
        retire_year: number;
        lasts: number;
        loan_year: number | null;
        path: { year: number; total: number }[];
      } | null;
      vs_plan: { year: number; expected: number; actual: number; ahead: number } | null;
      rows: FireRow[];
      bridge: Bridge;
      ladder: Rung[];
      spare: number;
      room: number;
      next_dollar: { person: string; rate: number; in_hand: number; into_super: number; room: number }[];
      debt: {
        extra: number;
        months: number;
        gone: string;
        base_months: number;
        base_gone: string;
        interest_saved: number;
      }[];
      shocks: { key: string; label: string; what: string; lasts: number; ok: boolean; gap: number | null }[];
      assumptions: {
        real_growth: number;
        super_return: number;
        fee: number;
        fee_from: "funds" | "guess";
        inflation: number;
        plan_to: number;
        count_crypto: boolean;
        rules_year: number;
      };
    };

export type FireReady = Extract<Fire, { ready: true }>;

export const fireQuery = queryOptions({
  queryKey: ["fire"],
  queryFn: ({ signal }) => apiGet<Fire>("fire", undefined, { signal }),
});

export type Levers = {
  retire_age: number;
  spend: number;
  spare: number;
  where: "off" | "etf" | "sup" | "mix";
  keep: boolean;
  part_time: boolean;
  one_off: "none" | "car" | "inheritance";
  pension: boolean;
};

export type WhatIf = {
  levers: Levers;
  result: FireSummary & { gap: number | null };
  soonest: number | null;
  rows: FireRow[];
  bridge: Bridge;
};
