/**
 * The bills that come a few times a year or less (rego, insurance, rates, school fees, and costs like Christmas
 * added here): what to put aside each month so they're covered when they land, how much should be built up by now,
 * and whether the regular transfer into the bills account and its balance keep up. Each opens its bill.
 */
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { BillDialog } from "~/features/bills/BillsPage";
import { Card, CardHead, Details } from "~/features/common/ds";
import { longDate, money } from "~/features/common/format";
import type { BillsOverview } from "~/features/common/types";
import { Button, cn } from "~/features/common/ui";

/** "in 12 days", "in 3 months", "today". */
function inWords(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 45) return `in ${days} days`;
  const months = Math.round(days / 30.4);
  return `in ${months} months`;
}

/** Two amounts side by side on one scale, with what it means. */
function Versus({
  label,
  rows,
  verdict,
}: {
  label: string;
  rows: { name: string; value: number; colour: string }[];
  verdict: { good: boolean; text: string };
}) {
  const hi = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div
      role="img"
      aria-label={`${label}: ${rows.map((r) => `${r.name} ${money(r.value)}`).join(", ")}; ${verdict.text}`}
      className="flex flex-col gap-1"
    >
      <div className="flex justify-between text-[12px]">
        <span className="text-ink-3">{label}</span>
        <span className={verdict.good ? "text-good" : "text-warn"}>{verdict.text}</span>
      </div>
      {rows.map((r) => (
        <div key={r.name} className="grid grid-cols-[minmax(0,128px)_1fr_72px] items-center gap-2 text-[12.5px]">
          <span className="truncate text-ink-2">{r.name}</span>
          <span className="h-2 overflow-hidden rounded-full bg-raised">
            <i
              className="grow-x block h-full rounded-full"
              style={{ width: `${(r.value / hi) * 100}%`, background: r.colour }}
            />
          </span>
          <span className="num text-right text-ink">{money(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** How many show before "Show all". */
const FIRST = 5;

export function YearlyCosts({ b }: { b: BillsOverview }) {
  const [adding, setAdding] = useState(false);
  const [all, setAll] = useState(false);
  const s = b.set_aside;
  const acct = b.account;
  // What the bills paid from the bills account come to in a usual month, these included.
  const fromAcct = acct
    ? Math.round(b.bills.filter((x) => x.account_id === acct.id).reduce((t, x) => t + x.per_year, 0) / 12)
    : 0;
  const into = b.into_account;
  const shown = all ? s.items : s.items.slice(0, FIRST);
  return (
    <Card aria-labelledby="bl-year" className="flex flex-col gap-3">
      <CardHead
        id="bl-year"
        title="Big bills through the year"
        right={
          <Button small onClick={() => setAdding(true)}>
            Add a yearly cost
          </Button>
        }
      />
      {s.items.length ? (
        <>
          <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-6">
            <div>
              <div className="text-[12px] text-ink-3">Put aside each month</div>
              <div className="mono text-[34px] leading-10 font-semibold tracking-[-0.04em]">{money(s.per_month)}</div>
              <div className="text-[12.5px] text-ink-3">
                for {s.items.length} {s.items.length === 1 ? "bill" : "bills"} · {money(s.per_year)} a year
              </div>
            </div>
            {acct && (
              <div className="flex flex-col gap-2.5">
                {into != null && into > 0 && (
                  <Versus
                    label={`${acct.name} each month`}
                    rows={[
                      { name: "Comes in", value: into, colour: "var(--color-teal)" },
                      { name: "Bills take", value: fromAcct, colour: "var(--color-bills-fill)" },
                    ]}
                    verdict={
                      into >= fromAcct
                        ? { good: true, text: "keeps up" }
                        : { good: false, text: `${money(fromAcct - into)} a month short` }
                    }
                  />
                )}
                <Versus
                  label="Built up for them"
                  rows={[
                    { name: `In ${acct.name}`, value: Math.max(acct.balance, 0), colour: "var(--color-teal)" },
                    { name: "Should be by now", value: s.built, colour: "var(--color-bills-fill)" },
                  ]}
                  verdict={
                    acct.balance >= s.built
                      ? { good: true, text: "ahead" }
                      : { good: false, text: `${money(s.built - acct.balance)} behind` }
                  }
                />
              </div>
            )}
          </div>
          <ul className="m-0 flex list-none flex-col p-0">
            {shown.map((x) => {
              const share = x.amount ? Math.min(x.built / x.amount, 1) : 0;
              return (
                <li key={x.bill_id} className="border-t border-line first:border-t-0">
                  <Link
                    to="/bills/$billId"
                    params={{ billId: String(x.bill_id) }}
                    className="press flex flex-col gap-1.5 rounded-xl px-1.5 py-3 text-ink no-underline hover:bg-tile-2"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate font-semibold">{x.name}</span>
                      <span className="flex-none">
                        {x.varies && <span className="text-[13px] text-ink-3">about </span>}
                        <span className="num">{money(x.amount)}</span>
                      </span>
                    </span>
                    <span
                      className={cn(
                        "relative block h-2 rounded-full bg-raised",
                        x.days <= 31 && share < 0.999 && "ring-1 ring-warn/40",
                      )}
                      role="img"
                      aria-label={`${money(x.built)} of ${money(x.amount)} should be put aside by now`}
                    >
                      <i
                        className="striped absolute inset-y-0 left-0 rounded-full bg-bills-fill"
                        style={{ width: `${Math.max(share * 100, 2)}%` }}
                      />
                    </span>
                    <span className="flex flex-wrap justify-between gap-x-3 text-[13px] text-ink-3">
                      <span>
                        Due {longDate(x.next_due)}, {inWords(x.days)}
                      </span>
                      <span>
                        {money(x.built)} by now · {money(x.per_month)} a month
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {s.items.length > FIRST && (
            <button
              type="button"
              className="cursor-pointer self-start border-0 bg-transparent p-1.5 text-[14px] font-semibold text-teal"
              onClick={() => setAll((v) => !v)}
            >
              {all ? "Fewer" : `All ${s.items.length}`}
            </button>
          )}
          <Details label="How this is worked out">
            <p className="m-0 text-[14px] text-ink-2">
              Each bill&apos;s yearly cost is spread evenly over the months. &quot;By now&quot; is its share of the time
              since it was last due: halfway to a yearly bill, half of it should be put aside. Bills that come monthly
              or more often aren&apos;t here, since each one is paid from that month&apos;s money.
            </p>
          </Details>
        </>
      ) : (
        <p className="m-0 text-[15px] text-ink-2">
          No bills come only a few times a year yet. Add the big ones, like rego, insurance or rates, or a yearly cost
          like Christmas or the holidays, and this shows what to put aside each month so they&apos;re covered.
        </p>
      )}
      <BillDialog bill={adding ? "new" : null} yearly onClose={() => setAdding(false)} />
    </Card>
  );
}
