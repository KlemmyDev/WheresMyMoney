/**
 * One bill, opened from the Bills page or a bill in the Overview's "Coming up": what it costs and when it's next due
 * in a sentence, then each payment as a bar against what it is now, what's ahead, and every payment to open.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BillDialog } from "~/features/bills/BillsPage";
import { Loading } from "~/features/common/brand";
import { PaymentBars } from "~/features/common/charts";
import { Card, CardHead, Details, Stat } from "~/features/common/ds";
import { EVERY_LABEL, dayDate, longDate, money, monthYear, pct } from "~/features/common/format";
import { Chip, I } from "~/features/common/icons";
import { accountsQuery, billQuery } from "~/features/common/queries";
import type { BillDetail } from "~/features/common/types";
import { Button, Empty, Pill } from "~/features/common/ui";
import { TransactionSheet, TxRow } from "~/features/spending/TransactionSheet";

const HOW = {
  auto: ["Comes out automatically", "info"],
  manual: ["Paid by hand", "warn"],
  estimate: ["Amount varies", "good"],
} as const;

/** How many payments show before "Show all". */
const FIRST = 12;
/** How many payments the chart shows. */
const BARS = 24;

export function BillPage({ id }: { id: number }) {
  const q = useQuery(billQuery(id));
  const accounts = useQuery(accountsQuery);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const name = q.data?.bill.name;
  useEffect(() => {
    if (name) document.title = `${name} · WheresMyMoney`;
  }, [name]);

  if (q.isError)
    return (
      <Empty
        title="That bill isn't here any more"
        action={
          <Link to="/bills" className="text-teal">
            See all bills
          </Link>
        }
      >
        It may have been removed.
      </Empty>
    );
  if (!q.data) return <Loading />;
  const d = q.data;
  const b = d.bill;
  const names = Object.fromEntries((accounts.data?.accounts ?? []).map((a) => [a.id, a.name]));
  const from = b.account_id != null ? names[b.account_id] : undefined;
  const every = EVERY_LABEL[b.every].toLowerCase();
  const txs = all ? d.transactions : d.transactions.slice(0, FIRST);
  const openTx = d.transactions.find((t) => t.id === open) ?? null;
  const thisYear = new Date().getFullYear();
  const when = (iso: string) => (Number(iso.slice(0, 4)) === thisYear ? dayDate(iso) : longDate(iso));

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link to="/bills" className="self-start text-[14px] font-semibold text-teal no-underline">
          ← All bills
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Chip g={I.bills} tone="bills" size="lg" />
            <h1 className="m-0 min-w-0 truncate text-[28px] leading-9 font-semibold tracking-[-0.03em] sm:text-[40px] sm:leading-[46px]">
              {b.name}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone={HOW[b.how][1]}>{HOW[b.how][0]}</Pill>
            <Button onClick={() => setEditing(true)}>Edit</Button>
          </div>
        </div>
      </div>

      <Card lit tint="bills" className="flex flex-col gap-2" aria-label={`${b.name} in a sentence`}>
        <p className="m-0 text-[17px] leading-relaxed text-ink">
          {b.name} is <b>{money(b.amount, { cents: true })}</b> every {every}
          {b.how === "estimate" ? ", give or take" : ""}, about <b>{money(b.per_year)} a year</b>. That's{" "}
          {pct(d.share, 0)} of all our bills.
        </p>
        <p className="m-0 text-[15px] text-ink-2">
          Next due <b className="text-ink">{dayDate(b.next_due)}</b>
          {b.how === "manual" ? ", to pay by hand" : ", coming out automatically"}
          {from ? ` from ${from}` : ""}.{" "}
          {d.count && d.first
            ? `We've paid ${money(d.total)} for it since ${monthYear(d.first.slice(0, 7))}, over ${d.count} ${d.count === 1 ? "payment" : "payments"}.`
            : "No payments are linked to it yet. They're matched when a statement with it is imported."}
          {changeSentence(d)}
        </p>
        {d.count > 0 && (
          <Details label="See the numbers">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Stat label="Paid in total" value={money(d.total)} note={`${d.count} payments`} role="bills" />
              <Stat label="Last 12 months" value={money(d.last_year)} note="What actually came out" role="bills" />
              <Stat
                label="Average payment"
                value={money(d.average, { cents: true })}
                note={`Now ${money(b.amount, { cents: true })}`}
                role="bills"
              />
              <Stat label="Next 12 months" value={money(d.next_year)} note="At today's amount" role="bills" />
            </div>
          </Details>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        <Card aria-labelledby="bp-paid" className="flex flex-col gap-3 md:col-span-8">
          <CardHead
            id="bp-paid"
            title="What we've paid"
            right={
              <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-3">
                <i className="w-3.5 border-t-2 border-dashed border-ink-2" />
                Now {money(b.amount, { cents: true })}
              </span>
            }
          />
          {d.payments.length >= 2 ? (
            <PaymentBars
              payments={d.payments.slice(-BARS)}
              now={b.amount}
              label={`Each of the last ${Math.min(BARS, d.payments.length)} payments, oldest first`}
              describe={(p) => (
                <>
                  <b className="text-ink">{money(p.amount, { cents: true })}</b> on {longDate(p.date)}
                </>
              )}
            />
          ) : (
            <p className="m-0 text-[14px] text-ink-3">
              The chart fills in once there are a couple of payments to show.
            </p>
          )}
          {d.changes.length > 0 && (
            <Details label={`Price changes (${d.changes.length})`}>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px]">
                {[...d.changes].reverse().map((c) => (
                  <li key={c.date} className="flex justify-between gap-3">
                    <span className="text-ink-2">{longDate(c.date)}</span>
                    <span className="num">
                      {money(c.was, { cents: true })} → {money(c.now, { cents: true })}
                    </span>
                  </li>
                ))}
              </ul>
            </Details>
          )}
        </Card>

        <Card aria-labelledby="bp-next" className="flex flex-col gap-2 md:col-span-4">
          <CardHead id="bp-next" title="Coming up" />
          <ul className="m-0 flex list-none flex-col p-0">
            {d.upcoming.map((u) => (
              <li
                key={u.date}
                className="flex min-h-11 items-center justify-between gap-3 border-b border-line text-[14px] last:border-b-0"
              >
                <span>{when(u.date)}</span>
                <span className="num">{money(u.amount, { cents: true })}</span>
              </li>
            ))}
          </ul>
          <p className="m-0 text-[13px] text-ink-3">{money(d.next_year)} over the next 12 months.</p>
        </Card>
      </div>

      {d.transactions.length > 0 && (
        <Card aria-labelledby="bp-list" className="flex flex-col gap-1">
          <CardHead
            id="bp-list"
            title="Payments"
            right={<span className="text-[13px] text-ink-3">{d.transactions.length}</span>}
          />
          <div className="-mx-1.5 mt-1 flex flex-col">
            {txs.map((t) => (
              <TxRow key={t.id} tx={t} onOpen={(x) => setOpen(x.id)} sub={when(t.date)} />
            ))}
          </div>
          {d.transactions.length > FIRST && (
            <div className="mt-2 flex justify-center">
              <Button onClick={() => setAll((a) => !a)}>
                {all ? "Show fewer" : `Show all ${d.transactions.length}`}
              </Button>
            </div>
          )}
        </Card>
      )}

      <BillDialog bill={editing ? b : null} onClose={() => setEditing(false)} />
      <TransactionSheet tx={openTx} onClose={() => setOpen(null)} />
    </>
  );
}

/** The latest price change, in words: " It went up from $79.00 to $89.00 in Mar 2026." */
function changeSentence(d: BillDetail): string {
  const c = d.changes[d.changes.length - 1];
  if (!c) return "";
  return ` It went ${c.now > c.was ? "up" : "down"} from ${money(c.was, { cents: true })} to ${money(c.now, { cents: true })} in ${monthYear(c.date.slice(0, 7))}.`;
}
