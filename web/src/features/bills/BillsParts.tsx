/**
 * Shared bits for the Bills pages: schedule maths, where a bill stands, how often in words, and a due date as a row
 * (with Mark paid on the ones paid by hand).
 */
import { Link } from "@tanstack/react-router";
import { MarkPaid } from "~/features/bills/MarkPaid";
import { money, parseDate } from "~/features/common/format";
import type { Due, Every } from "~/features/common/types";
import { cn } from "~/features/common/ui";

const DAYS_APART: Partial<Record<Every, number>> = { weekly: 7, fortnightly: 14 };
const MONTHS_APART: Partial<Record<Every, number>> = {
  monthly: 1,
  quarterly: 3,
  term: 3,
  "half-yearly": 6,
  yearly: 12,
};

/** How many times a year each schedule comes (as the server counts it). */
export const PER_YEAR: Record<Every, number> = {
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
  quarterly: 4,
  term: 4,
  "half-yearly": 2,
  yearly: 1,
};

/** How often, as a word for a bill's card. */
export const EVERY_WORD: Record<Every, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  term: "Each school term",
  "half-yearly": "Twice a year",
  yearly: "Yearly",
};

/** "a month", after an amount. */
export const EVERY_PER: Record<Every, string> = {
  weekly: "a week",
  fortnightly: "a fortnight",
  monthly: "a month",
  quarterly: "a quarter",
  term: "a term",
  "half-yearly": "every six months",
  yearly: "a year",
};

/** "2026-11-12" plus a number of steps of a bill's schedule. */
export function stepDate(from: string, every: Every, steps: number): string {
  const d = parseDate(from);
  if (DAYS_APART[every]) d.setDate(d.getDate() + DAYS_APART[every]! * steps);
  else {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + (MONTHS_APART[every] ?? 1) * steps);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A date some months on (the end of that month if it's shorter): when a pause of that long ends. */
export function monthsOn(from: string, months: number): string {
  return stepDate(from, "monthly", months);
}

/** Where a bill stands in the list, as a pill. */
export const STATUS = {
  late: ["Late", "bad"],
  soon: ["Due soon", "warn"],
  paid: ["Paid", "good"],
  later: ["Later", "mute"],
  paused: ["Paused", "info"],
} as const;

/** One due date as a row: the bill (linked), when, the amount, and Mark paid (or Paid) unless it comes out by itself. */
export function DueRow({ d, sub }: { d: Due; sub: string }) {
  return (
    <li className="flex min-h-12 items-center gap-3 border-b border-line last:border-b-0">
      <span className="min-w-0 flex-1">
        <Link
          to="/bills/$billId"
          params={{ billId: String(d.bill_id) }}
          className="block truncate text-[14px] font-semibold text-ink no-underline hover:underline"
        >
          {d.name}
        </Link>
        <span className="block text-[12px] text-ink-3">{sub}</span>
      </span>
      <span className={cn("num flex-none text-[14px]", d.varies && "text-ink-2")}>
        {d.varies ? "about " : ""}
        {money(d.amount, { cents: true })}
      </span>
      <span className="flex w-[92px] flex-none justify-end">
        {(d.paid || d.how !== "auto") && <MarkPaid due={d} />}
      </span>
    </li>
  );
}
