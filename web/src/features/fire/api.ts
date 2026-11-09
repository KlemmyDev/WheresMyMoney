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
  paid?: { etfs: number; cash: number; offset: number; super: number; short: number };
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
      /** Each check-in since a year before the plan was saved, and today, against where the plan has it. */
      track: { date: string; actual: number; expected: number | null }[] | null;
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

/** Are we on track (GET/POST /api/fire/track): the goal against today's pace, part by part. Money in cents. */
export type TrackYear = {
  age: number;
  year: number;
  super: number;
  etfs: number;
  /** Owed past the offset, dollars of the day. */
  owed: number;
  super_need: number;
  outside_need: number;
  /** The most that can be owed and still be clear by the goal; null after it. */
  owe_max: number | null;
  short: number;
  paid?: { etfs: number; cash: number; offset: number; super: number; short: number };
  /** Money going in that year (today's dollars): work and sacrifice into super, saving into ETFs, the offset's
   * leftovers joining the ETFs when the loan goes, top-ups to the offset. */
  put_in: { super: number; etfs: number; lump: number; offset: number };
};

export type Part = { need: number; have: number; ahead: number };

export type Closer =
  | { key: "super" | "etfs"; amount: number; plan: { extra_super?: number; extra_etfs?: number } }
  | { key: "spend"; amount: number; plan: { spend: number } }
  | { key: "keep"; amount: 0; plan: { keep: true } }
  | { key: "later"; amount: number; plan: { goal: number } };

export type TrackLevers = {
  goal: number;
  spend: number;
  keep: boolean;
  extra_super: number;
  extra_etfs: number;
  extra_loan: number;
};

export type Track =
  | { ready: false; needs: string }
  | {
      ready: true;
      goal: { age: number; year: number; set: boolean; set_at: number | null; spend: number; plan_to: number };
      people: {
        id: number | null;
        name: string;
        age: number;
        opens: number;
        super: number;
        salary: number;
        employer: number;
        sacrifice: number;
      }[];
      opens: number;
      pace: FireSummary | null;
      at_goal: FireSummary & { gap: number | null };
      parts: { loan: Part; outside: Part; super: Part };
      years: TrackYear[];
      closers: Closer[];
      /** Extra a month already made part of the plan (Close the gap). */
      extras: { extra_super: number; extra_etfs: number; extra_loan: number };
      levers: TrackLevers;
      loan: { repayment: number; rate: number; offset: number; gone_year: number | null } | null;
      saving: { etfs: number; spare: number; room: number };
      take_home: number;
      cap: number;
      assumptions: {
        real_growth: number;
        super_return: number;
        fee: number;
        fee_from: string;
        inflation: number;
        plan_to: number;
      };
    };

export type TrackReady = Extract<Track, { ready: true }>;

export const trackQuery = queryOptions({
  queryKey: ["fire", "track"],
  queryFn: ({ signal }) => apiGet<Track>("fire/track", undefined, { signal }),
});
