/**
 * The Bills page's everyday cards (the uplift canvas's MnBills): what's due before pay comes in and whether the bills
 * account covers it, and this month's calendar of due dates to tap through. Each bill still to pay can be marked paid
 * where it's listed.
 */
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { MarkPaid } from "~/features/bills/MarkPaid";
import { Card, CardHead } from "~/features/common/ds";
import { dayDate, money, parseDate, todayIso } from "~/features/common/format";
import type { BillsOverview, Due } from "~/features/common/types";
import { Pill, cn } from "~/features/common/ui";

/** Where a bill stands in the list, as a pill. */
export const STATUS = {
  late: ["Late", "bad"],
  soon: ["Due soon", "warn"],
  paid: ["Paid", "good"],
  later: ["Later", "mute"],
} as const;

/** One due date as a row: the bill (linked), when, the amount, and Mark paid (or Paid) unless it comes out by itself. */
function DueRow({ d, sub }: { d: Due; sub: string }) {
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
        <span className="block truncate text-[12px] text-ink-3">{sub}</span>
      </span>
      <span className={cn("num flex-none text-[14px]", d.how === "estimate" && "text-ink-2")}>
        {d.how === "estimate" ? "about " : ""}
        {money(d.amount, { cents: true })}
      </span>
      <span className="flex w-[92px] flex-none justify-end">
        {(d.paid || d.how !== "auto") && <MarkPaid due={d} />}
      </span>
    </li>
  );
}

/**
 * Before pay: the bills still to pay until money next comes into the bills account (late ones included), what they
 * come to against its balance, and what pay day moves back in.
 */
export function BeforePay({ b, className }: { b: BillsOverview; className?: string }) {
  const p = b.before_pay;
  if (!p || !b.account) return null;
  const today = todayIso();
  return (
    <Card aria-labelledby="bl-before" className={cn("flex flex-col gap-2", className)}>
      <CardHead
        id="bl-before"
        title={`Before pay on ${dayDate(p.pay_day)}`}
        right={<Pill tone={p.covered ? "good" : "bad"}>{p.covered ? "Covered" : "Short"}</Pill>}
      />
      <p className="m-0 text-[14px] text-ink-2">
        {p.items.length ? (
          <>
            <b className="num text-ink">{money(p.total)}</b> due of {money(b.account.balance)}
            {p.covered ? (
              <> · leaves {money(p.leaves)}</>
            ) : (
              <> · {money(-p.leaves)} short, so move some in before then</>
            )}
          </>
        ) : (
          "Nothing left to pay before then."
        )}
      </p>
      {p.items.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {p.items.map((d) => (
            <DueRow
              key={`${d.bill_id}-${d.date}`}
              d={d}
              sub={
                d.date < today
                  ? `Was due ${dayDate(d.date)}`
                  : d.date === today
                    ? "Due today"
                    : `${dayDate(d.date)}${d.how === "auto" ? " · comes out by itself" : " · by hand"}`
              }
            />
          ))}
        </ul>
      )}
      <p className="m-0 text-[13px] text-ink-3">Pay day moves {money(p.moves_in)} back in.</p>
    </Card>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * This month's calendar: each day with its bills' total (hatched when an amount varies, ticked once all paid). Tap or
 * arrow to a day to list its bills; it opens on the next day with something due.
 */
export function BillCalendar({ b, className }: { b: BillsOverview; className?: string }) {
  const { month, items } = b.calendar;
  const today = todayIso();
  const first = parseDate(`${month}-01`);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const iso = (n: number) => `${month}-${String(n).padStart(2, "0")}`;
  const byDay = new Map<string, Due[]>();
  for (const d of items) byDay.set(d.date, [...(byDay.get(d.date) ?? []), d]);
  const start = items.find((d) => d.date >= today && !d.paid)?.date ?? items[0]?.date ?? today;
  const [picked, setPicked] = useState(start);
  const list = byDay.get(picked) ?? [];
  const name = first.toLocaleDateString("en-AU", { month: "long" });

  const move = (by: number) => {
    const n = Math.min(days, Math.max(1, Number(picked.slice(8)) + by));
    setPicked(iso(n));
    document.getElementById(`cal-${iso(n)}`)?.focus();
  };

  return (
    <Card aria-labelledby="bl-cal" className={cn("flex flex-col gap-3", className)}>
      <CardHead
        id="bl-cal"
        title={name}
        right={<span className="text-[13px] text-ink-3">{money(items.reduce((s, d) => s + d.amount, 0))}</span>}
      />
      <p className="m-0 -mt-1 text-[13px] text-ink-3">Tap a day. Hatched amounts vary and are estimates.</p>
      <div
        role="grid"
        aria-label={`Bills in ${name}`}
        className="grid grid-cols-7 gap-1"
        onKeyDown={(e) => {
          const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
          if (step) {
            e.preventDefault();
            move(step);
          }
        }}
      >
        {WEEKDAYS.map((w) => (
          <div key={w} role="columnheader" className="pb-1 text-center text-[11px] font-semibold text-ink-3">
            {w}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`x${i}`} aria-hidden />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const day = iso(i + 1);
          const due = byDay.get(day) ?? [];
          const total = due.reduce((s, d) => s + d.amount, 0);
          const allPaid = due.length > 0 && due.every((d) => d.paid);
          const varies = due.some((d) => d.how === "estimate");
          const on = day === picked;
          return (
            <button
              key={day}
              id={`cal-${day}`}
              type="button"
              role="gridcell"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              aria-label={`${dayDate(day)}${due.length ? `: ${due.map((d) => d.name).join(", ")}, ${money(total)}${allPaid ? ", paid" : ""}` : ", nothing due"}`}
              onClick={() => setPicked(day)}
              className={cn(
                "press relative flex min-h-11 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border text-[12px] sm:min-h-14",
                on ? "border-bills bg-bills/15" : "border-transparent bg-tile-2 hover:border-line-2",
                day === today && !on && "border-line-2",
                due.length === 0 && "text-ink-3",
              )}
            >
              <span className={cn("font-semibold", day === today && "text-teal")}>{i + 1}</span>
              {due.length > 0 && (
                <span
                  className={cn(
                    "num rounded px-1 text-[10px] leading-4 sm:text-[11px]",
                    allPaid ? "text-ink-3 line-through" : "text-ink",
                    varies && !allPaid && "hatched",
                  )}
                  style={varies && !allPaid ? { ["--c" as string]: "var(--color-bills)" } : undefined}
                >
                  {total >= 100000 ? `${Math.round(total / 100000)}k` : money(total)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div aria-live="polite">
        <div className="text-[13px] font-semibold text-ink-2">
          {dayDate(picked)}
          {picked === today ? " · today" : ""}
        </div>
        {list.length ? (
          <ul className="m-0 flex list-none flex-col p-0">
            {list.map((d) => (
              <DueRow
                key={d.bill_id}
                d={d}
                sub={d.paid ? `Paid ${dayDate(d.paid.date)}` : d.how === "auto" ? "Comes out by itself" : "By hand"}
              />
            ))}
          </ul>
        ) : (
          <p className="m-0 mt-1 text-[13px] text-ink-3">Nothing due. Pick a day with an amount.</p>
        )}
      </div>
    </Card>
  );
}
