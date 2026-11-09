/**
 * One merchant, on the entity template: its mark and name (rename it), what's gone there in a sentence, month by month
 * with the timeframe brightened, the statement
 * names that belong to it (mapped by hand, or found by themselves; move or unmap one), and every transaction.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card, CardHead } from "~/features/common/ds";
import {
  EntityHeader,
  EntityHero,
  Legend,
  MONTH_RANGES,
  MonthBars,
  Timeframe,
  rangeName,
  useTimeframe,
  type MonthRange,
} from "~/features/common/entity";
import { dayDate, longDate, money, monthYear } from "~/features/common/format";
import { businessesQuery, merchantDirectoryQuery, merchantQuery, refresh } from "~/features/common/queries";
import { useToast } from "~/features/common/overlay";
import { sameName } from "~/features/merchants/names";
import type { MerchantDetail } from "~/features/common/types";
import { Button, Empty, ErrorText, Input, Pill } from "~/features/common/ui";
import { MerchantPicker } from "~/features/merchants/MerchantPicker";
import { MerchantSettings } from "~/features/merchants/MerchantSettings";
import { RegularCard } from "~/features/merchants/RegularCard";
import { MerchantMark } from "~/features/spending/MerchantIcon";
import { TransactionSheet, TxRow } from "~/features/spending/TransactionSheet";

/** How many transactions show before "Show all". */
const FIRST = 12;

export function MerchantPage({ merchantKey }: { merchantKey: string }) {
  const q = useQuery(merchantQuery(merchantKey));
  const [range, setRange] = useTimeframe<MonthRange>("wmm:range:merchant", MONTH_RANGES, "12");
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
  // Someone who mostly pays us (the ATO, Medicare) is told as money in; anywhere else as money out.
  const inbound = d.direction === "in";
  const amountOf = (m: { spent: number; received: number }) => (inbound ? m.received : m.spent);
  const busiest = d.months.reduce((a, m) => (amountOf(m) > amountOf(a) ? m : a), d.months[0]);
  // The reference line: a month's spending, or for someone who pays us now and then (a tax refund), a usual payment.
  const perMonth = inbound ? d.per_payment : d.per_month;
  // The last year of months on the chart; the timeframe brightens its last few and totals them.
  const shown = d.months.slice(-12);
  const lit = shown.slice(-Number(range));
  const litFrom = lit[0]?.month;
  const litTotal = lit.reduce((t, m) => t + amountOf(m), 0);
  return (
    <>
      <Title d={d} timeframe={<Timeframe options={MONTH_RANGES} value={range} onChange={setRange} />} />

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

      <EntityHero
        tint={inbound ? "savings" : "spending"}
        label={`${d.name} in a sentence`}
        numbers={
          inbound
            ? [
                { label: "Last 12 months", value: money(d.received_year), note: "received" },
                { label: "All time", value: money(d.received), note: `since ${monthYear(d.first.slice(0, 7))}` },
                { label: "Payments", value: String(d.received_count), note: d.category ?? "Not sorted" },
                { label: "Average payment", value: money(d.per_payment, { cents: true }), note: "money in" },
              ]
            : [
                { label: "Last 12 months", value: money(d.spent_year), note: `${money(d.per_month)} a month` },
                { label: "All time", value: money(d.spent), note: `since ${monthYear(d.first.slice(0, 7))}` },
                { label: "Visits", value: String(d.count), note: d.category ?? "Not sorted" },
                { label: "Average visit", value: money(d.per_visit, { cents: true }), note: "money out" },
              ]
        }
      >
        {inbound ? (
          <>
            <p className="m-0 text-[17px] leading-relaxed text-ink">
              We've received <b>{money(d.received_year)}</b> from {d.name} over the last 12 months.
            </p>
            <p className="m-0 text-[15px] text-ink-2">
              {d.received_count} {d.received_count === 1 ? "payment" : "payments"} since {longDate(d.first)},{" "}
              {money(d.per_payment, { cents: true })} each on average, last on {when(d.last)}.
              {d.count > 0 && ` We've also paid them ${money(d.spent)}.`}
            </p>
          </>
        ) : (
          <>
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
              {d.received > 0 &&
                ` ${money(d.received, { cents: true })} came back in refunds over ${d.received_count} ${d.received_count === 1 ? "payment" : "payments"}.`}
            </p>
          </>
        )}
      </EntityHero>

      <RegularCard d={d} />

      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        <Card aria-labelledby="mp-months" className="flex flex-col gap-3 md:col-span-8">
          <CardHead
            id="mp-months"
            title="Month by month"
            right={
              <Legend
                items={[
                  { label: inbound ? "In" : "Spent", kind: "solid", role: inbound ? "savings" : "spending" },
                  { label: `${money(perMonth)} ${inbound ? "a payment" : "a usual month"}`, kind: "line", role: "ink" },
                ]}
              />
            }
          />
          {d.months.length >= 2 ? (
            <MonthBars
              name={inbound ? `What came in from ${d.name}` : `What went at ${d.name}`}
              months={shown.map((m) => ({ key: m.month, label: monthYear(m.month), value: amountOf(m) }))}
              line={{ value: perMonth, label: inbound ? "a usual payment" : "a usual month" }}
              role={inbound ? "savings" : "spending"}
              litFrom={litFrom}
              format={money}
              height={180}
              describe={(m, isNow) => (
                <>
                  <b className="text-ink">{m.label}</b>: {money(m.value, { cents: true })}
                  {isNow ? " so far" : ""}
                  {perMonth > 0 && !isNow
                    ? m.value > perMonth * 1.15
                      ? `, more than ${inbound ? "usual" : "a usual month"}`
                      : m.value < perMonth * 0.85
                        ? `, less than ${inbound ? "usual" : "a usual month"}`
                        : ", about usual"
                    : ""}
                  .
                </>
              )}
            />
          ) : (
            <p className="m-0 text-[14px] text-ink-3">The chart fills in after a second month.</p>
          )}
          {d.months.length >= 2 && (
            <p className="m-0 text-[13px] text-ink-3">
              Brighter bars are inside the timeframe: {money(litTotal)} {inbound ? "came in" : "went"} over{" "}
              {rangeName(Number(range))}.
            </p>
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

/** The header: mark, name and timeframe; the name can be changed (empty goes back to the one it gets by itself). */
function Title({ d, timeframe }: { d: MerchantDetail; timeframe: ReactNode }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [unmerging, setUnmerging] = useState(false);
  const navigate = useNavigate();
  const unmerge = useMutation({
    mutationFn: () => apiSend<{ moved: number }>("POST", "merchants/unmerge", { key: d.key }),
    onSuccess: (r) => {
      setUnmerging(false);
      refresh(qc);
      toast(`Unmerged: ${r.moved} ${r.moved === 1 ? "thing" : "things"} went back where they were`);
    },
  });
  return (
    <div className="flex flex-col gap-3">
      <EntityHeader
        back={{ to: "/merchants", label: "Merchants" }}
        mark={<MerchantMark name={d.key} size="xl" />}
        title={d.name}
        sub={[d.settings.note, d.category && `Mostly ${d.category}`].filter(Boolean).join(" · ") || undefined}
        timeframe={timeframe}
        actions={
          <div className="flex flex-wrap gap-2">
            {d.mapped > 0 &&
              (unmerging ? (
                <>
                  <Button primary onClick={() => unmerge.mutate()} disabled={unmerge.isPending}>
                    Unmerge {d.mapped}
                  </Button>
                  <Button onClick={() => setUnmerging(false)}>Keep</Button>
                </>
              ) : (
                <Button onClick={() => setUnmerging(true)}>Unmerge…</Button>
              ))}
            <Button
              onClick={() => {
                setMerging((m) => !m);
                setEditing(false);
              }}
            >
              {merging ? "Cancel merge" : "Merge into…"}
            </Button>
            <Button
              onClick={() => {
                setEditing((e) => !e);
                setMerging(false);
              }}
            >
              {editing ? "Cancel" : "Rename"}
            </Button>
          </div>
        }
      />
      {unmerging && (
        <p className="m-0 w-full text-[13px] text-ink-3">
          Unmerge puts the {d.mapped} statement {d.mapped === 1 ? "name or payment" : "names and payments"} moved here
          by hand back where they'd be by themselves.
        </p>
      )}
      {editing && (
        <div className="w-full">
          <NamePicker
            d={d}
            onDone={(key) => {
              setEditing(false);
              if (key && key !== d.key) navigate({ to: "/merchants/$key", params: { key } });
            }}
          />
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
    </div>
  );
}

/**
 * Naming a merchant: pick the business it really is (its mark, name and usual category follow, and every statement
 * name here moves to it), or the merchant it's the same as, or just give it a new name. A name that's already
 * another merchant's is pointed out rather than made twice.
 */
function NamePicker({ d, onDone }: { d: MerchantDetail; onDone: (key?: string) => void }) {
  const qc = useQueryClient();
  const all = useQuery(merchantDirectoryQuery);
  const known = useQuery(businessesQuery);
  const [text, setText] = useState(d.name);
  const merge = useMutation({
    mutationFn: (into: string) => apiSend<{ key: string }>("POST", "merchants/merge", { from: [d.key], into }),
    onSuccess: (r) => {
      refresh(qc);
      onDone(r.key);
    },
  });
  const rename = useMutation({
    mutationFn: (name: string) => apiSend("PUT", `merchants/directory/${encodeURIComponent(d.key)}`, { name }),
    onSuccess: () => {
      refresh(qc);
      onDone();
    },
  });
  const needle = text.trim().toLowerCase();
  const typed = needle && needle !== d.name.toLowerCase();
  const merchants = typed
    ? (all.data ?? [])
        .filter((m) => m.key !== d.key)
        .filter((m) => m.name.toLowerCase().includes(needle) || m.key.toLowerCase().includes(needle))
        .slice(0, 4)
    : [];
  const have = new Set((all.data ?? []).map((m) => m.key));
  const businesses = typed
    ? (known.data ?? [])
        .filter((b) => b.key !== d.key && !have.has(b.key))
        .filter((b) => b.name.toLowerCase().includes(needle) || b.key.toLowerCase().includes(needle))
        .slice(0, 6)
    : [];
  const clash = (all.data ?? []).find((m) => m.key !== d.key && sameName(text, m));
  const row =
    "press flex min-h-11 min-w-0 cursor-pointer items-center gap-2.5 rounded-xl border-0 bg-transparent px-1.5 text-left text-ink hover:bg-tile";
  return (
    <form
      className="flex flex-col gap-2 rounded-2xl border border-line bg-tile-2 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!clash && text.trim()) rename.mutate(text.trim());
      }}
    >
      <Input
        autoFocus
        aria-label="Merchant name"
        placeholder="Type the business's name"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {businesses.length > 0 && (
        <div className="flex flex-col">
          <span className="px-1.5 pt-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
            Known businesses
          </span>
          {businesses.map((b) => (
            <button
              key={b.key}
              type="button"
              className={row}
              disabled={merge.isPending}
              onClick={() => merge.mutate(b.key)}
            >
              <MerchantMark name={b.key} size="md" />
              <span className="min-w-0 flex-1 truncate">{b.name}</span>
              <span className="flex-none text-[12px] text-ink-3">{b.category}</span>
            </button>
          ))}
        </div>
      )}
      {merchants.length > 0 && (
        <div className="flex flex-col">
          <span className="px-1.5 pt-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
            Your merchants: merge into
          </span>
          {merchants.map((m) => (
            <button
              key={m.key}
              type="button"
              className={row}
              disabled={merge.isPending}
              onClick={() => merge.mutate(m.key)}
            >
              <MerchantMark name={m.key} size="md" />
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              <span className="flex-none text-[12px] text-ink-3">{m.count} visits</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button primary small type="submit" disabled={rename.isPending || !!clash || !text.trim()}>
          Just rename it
        </Button>
        <span className="min-w-0 flex-1 text-[12px] text-ink-3">
          {clash
            ? `There's already a merchant called ${clash.name}. Merge into it above instead.`
            : "Picking a known business gives it that business's mark, name and usual category."}
        </span>
      </div>
      {(merge.isError || rename.isError) && <ErrorText>{errorMessage(merge.error ?? rename.error)}</ErrorText>}
    </form>
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
