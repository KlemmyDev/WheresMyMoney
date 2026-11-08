/**
 * One merchant: its mark and name (rename it), what's gone there in a sentence, month by month as bars, the statement
 * names that belong to it (mapped by hand, or found by themselves; move or unmap one), and every transaction.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { PaymentBars } from "~/features/common/charts";
import { Card, CardHead, Details, Stat } from "~/features/common/ds";
import { dayDate, longDate, money, monthYear } from "~/features/common/format";
import { merchantQuery, refresh } from "~/features/common/queries";
import type { MerchantDetail } from "~/features/common/types";
import { Button, Empty, ErrorText, Input, Pill } from "~/features/common/ui";
import { MerchantPicker } from "~/features/merchants/MerchantPicker";
import { MerchantSettings } from "~/features/merchants/MerchantSettings";
import { MerchantMark } from "~/features/spending/MerchantIcon";
import { TransactionSheet, TxRow } from "~/features/spending/TransactionSheet";

/** How many transactions show before "Show all". */
const FIRST = 12;

export function MerchantPage({ merchantKey }: { merchantKey: string }) {
  const q = useQuery(merchantQuery(merchantKey));
  const [open, setOpen] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const name = q.data?.name;
  useEffect(() => {
    if (name) document.title = `${name} · WheresMyMoney`;
  }, [name]);
  if (q.isError)
    return (
      <Empty
        title="No spending at that merchant"
        action={
          <Link to="/merchants" className="text-teal">
            See all merchants
          </Link>
        }
      >
        Its statement names may have been moved to another merchant.
      </Empty>
    );
  if (!q.data) return <Loading />;
  const d = q.data;
  const thisYear = String(new Date().getFullYear());
  const when = (iso: string) => (iso.startsWith(thisYear) ? dayDate(iso) : longDate(iso));
  const txs = all ? d.transactions : d.transactions.slice(0, FIRST);
  const openTx = d.transactions.find((t) => t.id === open) ?? null;
  const busiest = d.months.reduce((a, m) => (m.spent > a.spent ? m : a), d.months[0]);
  return (
    <>
      <div className="flex flex-col gap-2">
        <Link to="/merchants" className="self-start text-[14px] font-semibold text-teal no-underline">
          ← All merchants
        </Link>
        <Title d={d} />
      </div>

      {d.unnamed && (
        <Card className="flex flex-col gap-1.5" aria-label="About BPAY payments">
          <p className="m-0 text-[15px] text-ink">
            uBank's statements don't say who a BPAY payment went to, so these {d.count} are waiting for a name.
          </p>
          <p className="m-0 text-[14px] text-ink-2">
            Open one below and choose <b className="text-ink">Say who</b>. Pick "Every BPAY of $98.00" and future
            payments of that amount follow by themselves. A BPAY matched to one of your bills takes the bill's name
            automatically.
          </p>
        </Card>
      )}

      <Card lit tint="spending" className="flex flex-col gap-2" aria-label={`${d.name} in a sentence`}>
        <p className="m-0 text-[17px] leading-relaxed text-ink">
          We've spent <b>{money(d.spent_year)}</b> at {d.name} over the last 12 months, about{" "}
          <b>{money(d.per_month)} a month</b>.
        </p>
        <p className="m-0 text-[15px] text-ink-2">
          {d.count} {d.count === 1 ? "visit" : "visits"} since {longDate(d.first)},{" "}
          {money(d.per_visit, { cents: true })} each on average, last on {when(d.last)}.
          {busiest &&
            busiest.spent > 0 &&
            d.months.length > 2 &&
            ` The most in a month was ${money(busiest.spent)}, in ${monthYear(busiest.month)}.`}
        </p>
        <Details label="See the numbers">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Stat
              label="Last 12 months"
              value={money(d.spent_year)}
              note={`${money(d.per_month)} a month`}
              role="spending"
            />
            <Stat
              label="All time"
              value={money(d.spent)}
              note={`since ${monthYear(d.first.slice(0, 7))}`}
              role="spending"
            />
            <Stat label="Visits" value={String(d.count)} note={d.category ?? "Not sorted"} role="spending" />
            <Stat label="Average visit" value={money(d.per_visit, { cents: true })} note="money out" role="spending" />
          </div>
        </Details>
      </Card>

      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        <Card aria-labelledby="mp-months" className="flex flex-col gap-3 md:col-span-8">
          <CardHead
            id="mp-months"
            title="Month by month"
            right={
              <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-3">
                <i className="w-3.5 border-t-2 border-dashed border-ink-2" />
                {money(d.per_month)} a month
              </span>
            }
          />
          {d.months.length >= 2 ? (
            <PaymentBars
              payments={d.months.map((m) => ({ date: `${m.month}-01`, amount: m.spent }))}
              now={d.per_month}
              spending
              label={`What went at ${d.name} each month, oldest first`}
              describe={(p) => (
                <>
                  <b className="text-ink">{money(p.amount, { cents: true })}</b> in {monthYear(p.date.slice(0, 7))}
                </>
              )}
            />
          ) : (
            <p className="m-0 text-[14px] text-ink-3">The chart fills in after a second month.</p>
          )}
        </Card>
        <Names d={d} />
      </div>

      <MerchantSettings key={JSON.stringify(d.settings)} d={d} />

      <Card aria-labelledby="mp-list" className="flex flex-col gap-1">
        <CardHead
          id="mp-list"
          title="Transactions"
          right={
            <span className="text-[13px] text-ink-3">
              {d.transactions.length < d.count ? `Latest ${d.transactions.length} of ${d.count}` : d.count}
            </span>
          }
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
      <TransactionSheet tx={openTx} onClose={() => setOpen(null)} />
    </>
  );
}

/** The mark and name; the name can be changed (empty goes back to the one it gets by itself). */
function Title({ d }: { d: MerchantDetail }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  const navigate = useNavigate();
  const [text, setText] = useState(d.name);
  const save = useMutation({
    mutationFn: (name: string) => apiSend("PUT", `merchants/directory/${encodeURIComponent(d.key)}`, { name }),
    onSuccess: () => {
      setEditing(false);
      refresh(qc);
    },
  });
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <MerchantMark name={d.key} size="xl" />
        {editing ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(text);
            }}
          >
            <Input
              autoFocus
              aria-label="Merchant name"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="max-w-sm"
            />
            <Button primary small type="submit" disabled={save.isPending}>
              Save
            </Button>
            <Button small type="button" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <div className="min-w-0">
            <h1 className="m-0 line-clamp-2 min-w-0 text-[28px] leading-9 font-semibold tracking-[-0.03em] break-words sm:text-[40px] sm:leading-[46px]">
              {d.name}
            </h1>
            {(d.settings.note || d.category) && (
              <span className="text-[14px] text-ink-3">
                {[d.settings.note, d.category && `Mostly ${d.category}`].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
        )}
      </div>
      {!editing && (
        <div className="flex gap-2">
          <Button onClick={() => setMerging((m) => !m)}>{merging ? "Cancel merge" : "Merge into…"}</Button>
          <Button
            onClick={() => {
              setText(d.name);
              setEditing(true);
            }}
          >
            Rename
          </Button>
        </div>
      )}
      {merging && (
        <div className="w-full">
          <MerchantPicker
            merge={[d.key]}
            onDone={(key) => {
              setMerging(false);
              if (key) navigate({ to: "/merchants/$key", params: { key } });
            }}
          />
        </div>
      )}
      {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
    </div>
  );
}

/** The statement names that belong here: move one to another merchant, or undo a mapping. */
function Names({ d }: { d: MerchantDetail }) {
  const qc = useQueryClient();
  const [moving, setMoving] = useState<string | null>(null);
  const forget = useMutation({
    mutationFn: (body: { text: string; amount?: number }) => apiSend("POST", "merchants/forget", body),
    onSuccess: () => refresh(qc),
  });
  return (
    <Card aria-labelledby="mp-names" className="flex flex-col gap-2 md:col-span-4">
      <CardHead
        id="mp-names"
        title="Statement names"
        right={<span className="text-[13px] text-ink-3">{d.names.length}</span>}
      />
      <p className="m-0 text-[13px] text-ink-3">
        How {d.name} shows up on statements. Move one if it belongs to another merchant.
      </p>
      {d.amounts.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {d.amounts.map((a) => (
            <li
              key={`${a.text}-${a.amount}`}
              className="flex flex-wrap items-center gap-2 border-b border-line py-2.5 last:border-b-0"
            >
              <span className="mono min-w-0 flex-1 truncate text-[13px]">
                BPAY of {money(a.amount, { cents: true })}
              </span>
              <Pill tone="teal">By amount</Pill>
              <Button
                small
                onClick={() => forget.mutate({ text: a.text, amount: a.amount })}
                disabled={forget.isPending}
              >
                Undo
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ul className="m-0 flex list-none flex-col p-0">
        {d.names.map((n) => (
          <li key={n.text} className="flex flex-col gap-1.5 border-b border-line py-2.5 last:border-b-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="mono min-w-0 flex-1 truncate text-[13px]" title={n.text}>
                {n.text}
              </span>
              <span className="flex-none text-[12px] text-ink-3">×{n.count}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {n.unnamed ? (
                <span className="text-[12px] text-ink-3">
                  {d.unnamed ? "Open a payment below to say who it was to" : "BPAY, placed payment by payment"}
                </span>
              ) : n.mapped ? (
                <Pill tone="teal">Mapped by you</Pill>
              ) : (
                <Pill tone="mute">Found by itself</Pill>
              )}
              <span className="flex-1" />
              {n.mapped && !n.unnamed && (
                <Button small onClick={() => forget.mutate({ text: n.text })} disabled={forget.isPending}>
                  Undo
                </Button>
              )}
              {!n.unnamed && (
                <Button small onClick={() => setMoving(moving === n.text ? null : n.text)}>
                  Move
                </Button>
              )}
            </div>
            {moving === n.text && <MerchantPicker text={n.text} current={d.key} onDone={() => setMoving(null)} />}
          </li>
        ))}
      </ul>
    </Card>
  );
}
