/**
 * The next 30 days of bills as a picture: the bills account's balance day by day as bills come out and pay comes in
 * (to drag across), a strip of the due dates sized by amount, and the bills themselves, with Mark paid on the ones paid
 * by hand. Picking a day on the strip lists just that day.
 */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DueRow, stepDate } from "~/features/bills/BillsParts";
import { dayDate, money, parseDate, todayIso } from "~/features/common/format";
import { rulesQuery } from "~/features/common/queries";
import { ScrubChart } from "~/features/common/ScrubChart";
import type { BillsOverview, Due } from "~/features/common/types";
import { Pill, Tile, TileTitle, cn } from "~/features/common/ui";

const DAYS = 30;
/** How many bills show before "All". */
const FIRST = 6;

const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function BillsAhead({ b }: { b: BillsOverview }) {
  const rules = useQuery(rulesQuery);
  const [day, setDay] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const acct = b.account;
  const today = todayIso();
  const start = parseDate(today);
  const days = Array.from({ length: DAYS + 1 }, (_, k) => {
    const d = new Date(start);
    d.setDate(start.getDate() + k);
    return isoOf(d);
  });
  const end = days[DAYS];
  const late = (b.before_pay?.items ?? []).filter((d) => d.date < today);
  const items: Due[] = [...late, ...b.next30.items.filter((d) => d.date <= end)];
  const byDay = new Map<string, Due[]>();
  for (const d of items) {
    const k = d.date < today ? today : d.date;
    byDay.set(k, [...(byDay.get(k) ?? []), d]);
  }

  // Money moving into the bills account over the 30 days, from the rules that move it.
  const ins = new Map<string, number>();
  if (acct)
    for (const r of rules.data?.rules ?? []) {
      if (!r.enabled || r.kind !== "transfer" || r.to_account !== acct.id) continue;
      for (let k = 0, d = r.next_run; d <= end && k < 60; k++, d = stepDate(r.next_run, r.every, k))
        if (d > today) ins.set(d, (ins.get(d) ?? 0) + r.amount);
    }

  // The bills account each day: bills from it that aren't paid yet come out, transfers come in.
  const fromAcct = new Set(b.bills.filter((x) => acct && x.account_id === acct.id).map((x) => x.id));
  let bal = acct?.balance ?? 0;
  const line = days.map((d) => {
    for (const x of byDay.get(d) ?? []) if (!x.paid && fromAcct.has(x.bill_id)) bal -= x.amount;
    bal += ins.get(d) ?? 0;
    return bal;
  });
  const low = Math.min(...line);
  const lowAt = line.indexOf(low);
  const p = b.before_pay;
  const hi = Math.max(1, ...days.map((d) => (byDay.get(d) ?? []).reduce((s, x) => s + x.amount, 0)));
  const listed = day ? (byDay.get(day) ?? []) : items;
  const shown = all || day ? listed : listed.slice(0, FIRST);
  const toPay = items.filter((x) => !x.paid).reduce((s, x) => s + x.amount, 0);

  return (
    <Tile i={2} aria-labelledby="ba-30">
      <TileTitle
        id="ba-30"
        right={
          p ? (
            <Pill tone={p.covered ? "good" : "bad"}>
              {p.covered ? `Covered until ${dayDate(p.pay_day)}` : `${money(-p.leaves)} short before pay`}
            </Pill>
          ) : (
            <span className="num text-[13px] text-ink-3">{money(toPay)}</span>
          )
        }
      >
        The next 30 days
      </TileTitle>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <div>
          <span className="mono text-[34px] leading-10 font-semibold tracking-[-0.04em]">{money(toPay)}</span>
          <span className="ml-2 text-[13px] text-ink-3">to pay · {items.filter((x) => !x.paid).length} bills</span>
        </div>
        {acct && (
          <div className="text-[13px] text-ink-3">
            Lowest point <b className={cn("num", low < 0 ? "text-bad" : "text-ink")}>{money(low)}</b> on{" "}
            {dayDate(days[lowAt])}
          </div>
        )}
      </div>
      {acct && (
        <ScrubChart
          lines={[{ values: line, colour: "var(--color-bills)", name: acct.name, fill: true }]}
          label={`${acct.name} each day for the next 30 days, as bills come out and money comes in`}
          at={(i) => dayDate(days[i])}
          format={(v) => money(v)}
          floor={low < 0 ? low : undefined}
          height={140}
          marks={[...ins.keys()].map((d) => ({
            i: days.indexOf(d),
            label: `+${money(ins.get(d)!)}`,
            colour: "var(--color-teal)",
          }))}
          note={(i) => {
            const due = byDay.get(days[i]) ?? [];
            const inn = ins.get(days[i]);
            return (
              <>
                {due.map((x) => (
                  <span key={`${x.bill_id}${x.date}`} className="block text-[12px] text-ink-3">
                    {x.name} <span className="num text-ink-2">−{money(x.amount)}</span>
                    {x.paid ? " · paid" : ""}
                  </span>
                ))}
                {inn ? (
                  <span className="block text-[12px] text-teal">
                    Comes in <span className="num">+{money(inn)}</span>
                  </span>
                ) : null}
              </>
            );
          }}
        />
      )}
      <div>
        <div
          className="relative h-12 rounded-xl bg-tile-2"
          role="group"
          aria-label="Bills due over the next 30 days; pick a day to list it"
        >
          {days.map((d, i) => {
            const due = byDay.get(d);
            if (!due) return null;
            const total = due.reduce((s, x) => s + x.amount, 0);
            const size = 12 + Math.sqrt(total / hi) * 22;
            const paid = due.every((x) => x.paid);
            const varies = due.some((x) => x.varies);
            const isLate = due.some((x) => x.date < today && !x.paid);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={day === d}
                aria-label={`${dayDate(d)}: ${due.map((x) => x.name).join(", ")}, ${money(total)}${paid ? ", paid" : ""}`}
                onClick={() => setDay(day === d ? null : d)}
                className={cn(
                  "press absolute top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border-2 transition-transform hover:scale-110",
                  day === d ? "border-ink" : "border-tile-2",
                  varies && !paid && "hatched",
                )}
                style={{
                  left: `calc(14px + ${(i / DAYS) * 100}% - ${(i / DAYS) * 28}px)`,
                  width: size,
                  height: size,
                  background: paid ? "var(--color-raised)" : isLate ? "var(--color-bad)" : "var(--color-bills-fill)",
                  ["--c" as string]: "var(--color-bills-fill)",
                  zIndex: day === d ? 2 : 1,
                }}
              />
            );
          })}
        </div>
        <div className="mono mt-1.5 flex justify-between text-[11px] text-ink-3">
          <span>Today</span>
          <span>{dayDate(days[15])}</span>
          <span>{dayDate(end)}</span>
        </div>
      </div>
      <div aria-live="polite">
        <div className="flex items-center justify-between text-[13px] font-semibold text-ink-2">
          <span>{day ? dayDate(day) + (day === today ? " · today" : "") : "Coming up"}</span>
          {day && (
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-1 text-[13px] font-semibold text-teal"
              onClick={() => setDay(null)}
            >
              Show all
            </button>
          )}
        </div>
        {shown.length ? (
          <ul className="m-0 flex list-none flex-col p-0">
            {shown.map((d) => (
              <DueRow
                key={`${d.bill_id}-${d.date}`}
                d={d}
                sub={
                  d.paid
                    ? `Paid ${dayDate(d.paid.date)}`
                    : d.date < today
                      ? `Was due ${dayDate(d.date)}`
                      : `${d.date === today ? "Today" : dayDate(d.date)}${d.how === "auto" ? " · comes out by itself" : " · pay by hand"}`
                }
              />
            ))}
          </ul>
        ) : (
          <p className="m-0 mt-1 text-[13px] text-ink-3">Nothing due in the next 30 days.</p>
        )}
        {!day && listed.length > FIRST && (
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-1.5 text-[14px] font-semibold text-teal"
            onClick={() => setAll((v) => !v)}
          >
            {all ? "Fewer" : `All ${listed.length}`}
          </button>
        )}
      </div>
    </Tile>
  );
}
