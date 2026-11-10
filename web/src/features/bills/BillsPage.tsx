/**
 * Bills, as pictures: what's set aside and how far ahead it reaches, what a usual month is made of, the next 30 days
 * (the bills account day by day, the due dates, Mark paid), the year ahead month by month, the big bills to put money
 * aside for, and every bill as a card with when it's next due.
 */
import { Loading } from "~/features/common/brand";
import { ChoiceChip, EmptyState } from "~/features/common/ds";
import { EVERY_WORD, STATUS } from "~/features/bills/BillsParts";
import { BillsAhead } from "~/features/bills/BillsAhead";
import { BillsHero, monthName } from "~/features/bills/BillsHero";
import { MonthBars } from "~/features/common/entity";
import { MerchantMark } from "~/features/spending/MerchantIcon";
import { I } from "~/features/common/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState, type CSSProperties } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import {
  EVERY_LABEL,
  editable,
  money,
  monthCaps,
  parseDate,
  parseMoney,
  shortDate,
  todayIso,
} from "~/features/common/format";
import { Dialog, useToast } from "~/features/common/overlay";
import { accountsQuery, billsQuery, categoriesQuery, refresh } from "~/features/common/queries";
import type { Account, Bill, Every, SpottedBill, Transaction } from "~/features/common/types";
import { SpottedBills } from "~/features/bills/Spotted";
import { YearlyCosts } from "~/features/bills/YearlyCosts";
import { CategoryPicker } from "~/features/common/CategoryPicker";
import { Button, ErrorText, Input, Label, PageHead, Pill, Select, Tile, TileTitle, cn } from "~/features/common/ui";

export function BillsPage() {
  const q = useQuery(billsQuery);
  const [editing, setEditing] = useState<Bill | "new" | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const b = q.data;
  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!b) return <Loading />;
  const acct = b.account;
  const t = acct?.target?.kind === "months" ? acct.target : null;
  const count = (k: Filter) => b.bills.filter(FILTERS[k].test).length;
  const shown = b.bills.filter(FILTERS[filter].test);
  return (
    <>
      <PageHead
        over={acct && t ? `Money · keeping ${t.months} months of bills` : "Money"}
        title="Bills"
        actions={
          <Button primary onClick={() => setEditing("new")}>
            Add bill
          </Button>
        }
      />
      <BillsHero b={b} onAdd={() => setEditing("new")} />
      {b.bills.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.1fr_1fr] [&>*]:min-w-0">
          <BillsAhead b={b} />
          <Tile i={3} aria-labelledby="bl-year12">
            <TileTitle
              id="bl-year12"
              right={
                <span className="num text-[13px] text-ink-3">{money(b.by_month.reduce((s, m) => s + m.total, 0))}</span>
              }
            >
              The year ahead
            </TileTitle>
            <MonthBars
              months={b.by_month.map((m) => ({ key: m.month, label: monthCaps(m.month), value: m.total }))}
              line={{ value: b.per_month, label: "Usual month" }}
              role="bills"
              name="Bills"
              current={false}
              format={(v) => money(v)}
              height={240}
              describe={(m) => {
                const mo = b.by_month.find((x) => x.month === m.key);
                return (
                  <>
                    <b className="text-ink">{monthName(m.key)}</b>: {money(m.value)} across {mo?.count ?? 0}{" "}
                    {mo?.count === 1 ? "bill" : "bills"}
                    {m.value > b.per_month * 1.15
                      ? `, ${money(m.value - b.per_month)} more than usual`
                      : m.value < b.per_month * 0.85
                        ? ", a lighter month"
                        : ""}
                  </>
                );
              }}
            />
            <div className="text-xs text-ink-3">
              Dashed: a usual month ({money(b.per_month)}). Tall bars are the big ones landing.
            </div>
          </Tile>
        </div>
      )}
      <YearlyCosts b={b} />
      <SpottedBills i={6} />
      <section aria-labelledby="bl-all" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="bl-all" className="m-0 text-[17px] font-semibold">
            Every bill{acct ? <span className="font-normal text-ink-3"> · most paid from {acct.name}</span> : null}
          </h2>
          {b.bills.length > 0 && (
            <div role="group" aria-label="Show" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
              {(Object.keys(FILTERS) as Filter[])
                .filter((k) => k === "all" || k === filter || count(k) > 0)
                .map((k) => (
                  <ChoiceChip key={k} pressed={filter === k} onClick={() => setFilter(k)}>
                    {FILTERS[k].label} · {count(k)}
                  </ChoiceChip>
                ))}
            </div>
          )}
        </div>
        {b.bills.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-3">
            {shown.map((bill, i) => (
              <BillCard key={bill.id} bill={bill} i={i} />
            ))}
          </div>
        ) : (
          <Tile i={8}>
            <EmptyState
              g={I.bills}
              tone="bills"
              title="No bills yet"
              action={
                <Button primary onClick={() => setEditing("new")}>
                  Add a bill
                </Button>
              }
            >
              Add the ones that come out regularly, once each: the amount and how often.
            </EmptyState>
          </Tile>
        )}
      </section>
      <BillDialog bill={editing} onClose={() => setEditing(null)} />
    </>
  );
}

/** Days from today to an ISO date (negative when it's passed). */
function daysTo(iso: string): number {
  return Math.round((parseDate(iso).getTime() - parseDate(todayIso()).getTime()) / 86400000);
}

/** "today", "tomorrow", "in 12 days", "in 3 months", "4 days ago". */
function whenWords(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 0) return `${-days} ${days === -1 ? "day" : "days"} ago`;
  if (days < 45) return `in ${days} days`;
  return `in ${Math.round(days / 30.4)} months`;
}

/** Roughly how many days apart a bill comes. */
const GAP: Record<Every, number> = {
  weekly: 7,
  fortnightly: 14,
  monthly: 30.4,
  quarterly: 91,
  term: 91,
  "half-yearly": 182,
  yearly: 365,
};

/**
 * A bill as a card: its mark, name, amount and how often, when it's next due, and a bar of how close that is (full on
 * the day). Where it stands sits in the corner. The card opens the bill.
 */
function BillCard({ bill, i }: { bill: Bill; i: number }) {
  const days = daysTo(bill.status === "late" && bill.status_date ? bill.status_date : bill.next_due);
  const gap = GAP[bill.every];
  const near = Math.min(1, Math.max(0, 1 - days / gap));
  const st = bill.status && bill.status !== "later" ? STATUS[bill.status] : null;
  return (
    <Link
      to="/bills/$billId"
      params={{ billId: String(bill.id) }}
      className="rise press flex flex-col gap-3 rounded-2xl border border-line bg-tile p-4 text-ink no-underline hover:border-line-2"
      style={{ "--i": Math.min(i, 12) } as CSSProperties}
    >
      <span className="flex items-start gap-3">
        <MerchantMark name={bill.name} size="lg" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold break-words">{bill.name}</span>
          <span className="block text-[12.5px] text-ink-3">
            {EVERY_WORD[bill.every]} · {bill.how === "auto" ? "comes out by itself" : "paid by hand"}
          </span>
        </span>
        {st && (
          <Pill tone={st[1]}>
            {st[0]}
            {bill.status === "paused" && bill.status_date ? ` · until ${shortDate(bill.status_date)}` : ""}
          </Pill>
        )}
      </span>
      <span className="flex items-baseline justify-between gap-3">
        <span className="mono text-[24px] leading-7 font-semibold tracking-[-0.03em]">
          {bill.varies && <span className="mr-1 font-sans text-[13px] font-normal text-ink-3">about</span>}
          {money(bill.amount, { cents: bill.amount % 100 !== 0 })}
        </span>
        <span className="num text-[12.5px] text-ink-3">{money(bill.per_year)} a year</span>
      </span>
      {bill.status !== "paused" && (
        <span className="flex flex-col gap-1.5">
          <span
            className="relative block h-1.5 overflow-hidden rounded-full bg-raised"
            role="img"
            aria-label={`Next due ${shortDate(bill.next_due)}, ${whenWords(days)}`}
          >
            <i
              className="grow-x absolute inset-y-0 left-0 block rounded-full"
              style={{
                width: `${Math.max(near * 100, 3)}%`,
                background: bill.status === "late" ? "var(--color-bad)" : "var(--color-bills-fill)",
              }}
            />
          </span>
          <span className="flex justify-between text-[12.5px]">
            <span className="text-ink-2">
              {bill.status === "late" ? "Was due" : "Next"}{" "}
              {shortDate(bill.status === "late" && bill.status_date ? bill.status_date : bill.next_due)}
            </span>
            <span className={cn(days <= 7 ? "text-ink" : "text-ink-3", bill.status === "late" && "text-bad")}>
              {whenWords(days)}
            </span>
          </span>
        </span>
      )}
    </Link>
  );
}

type Filter = "all" | "late" | "soon" | "paid" | "paused" | "hand";
const FILTERS: Record<Filter, { label: string; test: (b: Bill) => boolean }> = {
  all: { label: "All", test: () => true },
  late: { label: "Late", test: (b) => b.status === "late" },
  soon: { label: "Due soon", test: (b) => b.status === "soon" },
  paid: { label: "Paid", test: (b) => b.status === "paid" },
  paused: { label: "Paused", test: (b) => b.status === "paused" },
  hand: { label: "By hand", test: (b) => b.how !== "auto" },
};

const EVERY: Every[] = ["weekly", "fortnightly", "monthly", "quarterly", "term", "half-yearly", "yearly"];

export function BillDialog({
  bill,
  spotted,
  fromTx,
  yearly,
  onClose,
}: {
  bill: Bill | "new" | null;
  /** A bill spotted in the statements, to add with any changes made here. */
  spotted?: SpottedBill | null;
  /** A payment to make a bill from: it (and the merchant's others like it) become part of the bill. */
  fromTx?: Transaction | null;
  /** A cost that comes once a year, like Christmas or the holidays, to set money aside for. */
  yearly?: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={bill != null} onClose={onClose} labelledBy="bill-h">
      {bill != null && (
        <BillForm
          key={spotted?.key ?? fromTx?.id ?? "x"}
          bill={bill}
          spotted={spotted}
          fromTx={fromTx}
          yearly={yearly}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

/** "TELSTRA 1234" → "Telstra 1234". */
const titleCase = (text: string) => text.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** The first date on the schedule from `from` that's today or later. */
function nextFrom(from: string, every: Every): string {
  const days: Partial<Record<Every, number>> = { weekly: 7, fortnightly: 14 };
  const months: Partial<Record<Every, number>> = {
    monthly: 1,
    quarterly: 3,
    term: 3,
    "half-yearly": 6,
    yearly: 12,
  };
  const d = parseDate(from);
  const today = todayIso();
  for (let i = 0; i < 400; i++) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (iso >= today) return iso;
    if (days[every]) d.setDate(d.getDate() + days[every]!);
    else d.setMonth(d.getMonth() + (months[every] ?? 1));
  }
  return today;
}

function BillForm({
  bill,
  spotted,
  fromTx,
  yearly,
  onClose,
}: {
  bill: Bill | "new";
  spotted?: SpottedBill | null;
  fromTx?: Transaction | null;
  yearly?: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const accounts = useQuery(accountsQuery);
  const banks: Account[] = accounts.data?.accounts ?? [];
  const [f, setF] = useState<BillDraft>(() =>
    fromTx
      ? {
          name: titleCase(fromTx.remember_as || fromTx.merchant || fromTx.description),
          amount: editable(-fromTx.amount),
          every: "monthly" as Every,
          next_due: nextFrom(fromTx.date, "monthly"),
          account_id: String(fromTx.account_id),
          how: "auto",
          varies: false,
          category_id: fromTx.category_kind === "bills" && fromTx.category_id != null ? String(fromTx.category_id) : "",
          match: fromTx.remember_as || fromTx.merchant,
        }
      : spotted
        ? {
            name: spotted.name,
            amount: editable(spotted.amount),
            every: spotted.every,
            next_due: spotted.next_due,
            account_id: String(spotted.account_id ?? ""),
            how: "auto",
            varies: spotted.variable || spotted.how === "estimate",
            category_id: String(spotted.category_id ?? ""),
            match: spotted.match,
          }
        : bill === "new"
          ? {
              name: "",
              amount: "",
              every: (yearly ? "yearly" : "monthly") as Every,
              next_due: todayIso(),
              account_id: String(banks.find((a) => a.role === "bills")?.id ?? ""),
              how: "auto",
              varies: !!yearly,
              category_id: "",
              match: "",
            }
          : {
              name: bill.name,
              amount: editable(bill.amount),
              every: bill.every,
              next_due: bill.next_due,
              account_id: String(bill.account_id ?? ""),
              how: bill.how,
              varies: bill.varies,
              category_id: String(bill.category_id ?? ""),
              match: bill.match,
            },
  );
  const body = () => ({
    ...f,
    amount: parseMoney(f.amount),
    account_id: f.account_id || null,
    category_id: f.category_id || null,
  });
  const save = useMutation({
    mutationFn: () =>
      spotted
        ? apiSend("POST", "bills/spotted/accept", { key: spotted.key, changes: body() })
        : bill === "new"
          ? apiSend("POST", "bills", { ...body(), transaction_id: fromTx?.id })
          : apiSend("PUT", `bills/${(bill as Bill).id}`, body()),
    onSuccess: (r) => {
      refresh(qc);
      onClose();
      const linked = (r as { linked?: number } | undefined)?.linked ?? 0;
      toast(
        bill !== "new"
          ? `${f.name} saved`
          : linked > 1
            ? `${f.name} added, with ${linked} payments`
            : `${f.name} added`,
      );
    },
  });
  const remove = useMutation({
    mutationFn: () => apiSend("DELETE", `bills/${(bill as Bill).id}`),
    onSuccess: () => (refresh(qc), onClose()),
  });
  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-6">
      <h2 id="bill-h" className="m-0 text-xl font-semibold">
        {spotted
          ? "Add a spotted bill"
          : fromTx
            ? "Make it a recurring bill"
            : yearly
              ? "Add a yearly cost"
              : bill === "new"
                ? "Add a bill"
                : f.name || "Bill"}
      </h2>
      {yearly && (
        <div className="text-[13px] text-ink-2">
          Something that comes once a year, like Christmas, the holidays or the car&apos;s service. Give it a rough
          amount and when it&apos;s next due, and the Bills page works out what to put aside each month.
        </div>
      )}
      {fromTx && (
        <div className="text-[13px] text-ink-2">
          This payment, and earlier ones to {fromTx.remember_as || fromTx.merchant} for about the same amount, become
          part of the bill. Check how often it comes and when it&apos;s next due.
        </div>
      )}
      {spotted && (
        <div className="text-[13px] text-ink-2">
          Seen {spotted.seen} times, as <span className="mono">{spotted.example}</span>. Its payments are linked to the
          bill once it&apos;s added.
        </div>
      )}
      <BillFields f={f} onChange={setF} yearly={yearly} />
      {(save.isError || remove.isError) && <ErrorText>{errorMessage(save.error ?? remove.error)}</ErrorText>}
      <div className="flex justify-between gap-2">
        {bill !== "new" ? <Button onClick={() => remove.mutate()}>Remove</Button> : <span />}
        <div className="flex gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            primary
            disabled={!f.name || parseMoney(f.amount) == null || save.isPending}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

/** What a bill is, as it's edited: amounts as typed, ids as strings ("" for none). */
export type BillDraft = {
  name: string;
  amount: string;
  every: Every;
  next_due: string;
  account_id: string;
  how: string;
  varies: boolean;
  category_id: string;
  match: string;
};

/** The fields of a bill, shared by the Add/Change dialog here and the bill page's edit panel. */
export function BillFields({
  f,
  onChange,
  yearly,
}: {
  f: BillDraft;
  onChange: (f: BillDraft) => void;
  yearly?: boolean;
}) {
  const accounts = useQuery(accountsQuery);
  const cats = useQuery(categoriesQuery);
  const banks: Account[] = accounts.data?.accounts ?? [];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor="b-name">Bill</Label>
        <Input
          id="b-name"
          className="font-sans"
          value={f.name}
          onChange={(e) => onChange({ ...f, name: e.target.value })}
          placeholder={yearly ? "Christmas" : "Internet"}
        />
      </div>
      <div>
        <Label htmlFor="b-amt">Amount</Label>
        <Input
          id="b-amt"
          inputMode="decimal"
          value={f.amount}
          onChange={(e) => onChange({ ...f, amount: e.target.value })}
          placeholder="89.00"
        />
      </div>
      <div>
        <Label htmlFor="b-every">Every</Label>
        <Select id="b-every" value={f.every} onChange={(e) => onChange({ ...f, every: e.target.value as Every })}>
          {EVERY.map((e) => (
            <option key={e} value={e}>
              {EVERY_LABEL[e]}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="b-next">Next due</Label>
        <Input
          id="b-next"
          type="date"
          value={f.next_due}
          onChange={(e) => onChange({ ...f, next_due: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="b-acct">Paid from</Label>
        <Select id="b-acct" value={f.account_id} onChange={(e) => onChange({ ...f, account_id: e.target.value })}>
          <option value="">—</option>
          {banks.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="b-how">How</Label>
        <Select id="b-how" value={f.how} onChange={(e) => onChange({ ...f, how: e.target.value })}>
          <option value="auto">Comes out automatically</option>
          <option value="manual">Paid by hand</option>
        </Select>
      </div>
      <label className="flex min-h-11 cursor-pointer items-start gap-2.5 sm:col-span-2">
        <input
          type="checkbox"
          checked={f.varies}
          onChange={(e) => onChange({ ...f, varies: e.target.checked })}
          className="mt-1 size-4"
        />
        <span>
          <span className="block text-[14px] text-ink">The amount changes each time</span>
          <span className="block text-[13px] text-ink-3">
            Then it&apos;s an estimate, and What&apos;s likely does the guessing.
          </span>
        </span>
      </label>
      <div>
        <Label>Category</Label>
        <CategoryPicker
          label="Category"
          value={f.category_id ? Number(f.category_id) : null}
          categories={cats.data?.categories ?? []}
          placeholder="Bills"
          onChange={(c) => onChange({ ...f, category_id: c != null ? String(c) : "" })}
          className="min-h-10 text-[13px]"
        />
      </div>
      <div>
        <Label htmlFor="b-match">On the statement as (optional)</Label>
        <Input
          id="b-match"
          value={f.match}
          onChange={(e) => onChange({ ...f, match: e.target.value })}
          placeholder="TELSTRA"
        />
      </div>
    </div>
  );
}
