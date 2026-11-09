/**
 * Bills (design: CkBills): the bills account against its target, what an average month and the next 30 days hold,
 * the months ahead as a heat strip, and every bill with how often, when next, and how it's paid.
 */
import { Loading } from "~/features/common/brand";
import { Bar, BigNumber, Card, Details, EmptyState, Eyebrow, Stat, Term } from "~/features/common/ds";
import { I } from "~/features/common/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type CSSProperties } from "react";
import { apiGet, apiSend, errorMessage } from "~/features/common/api";
import { AreaLine, Count } from "~/features/common/charts";
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

const HOW = { auto: ["AUTO", "info"], manual: ["BY HAND", "warn"], estimate: ["ESTIMATE", "good"] } as const;

export function BillsPage() {
  const q = useQuery(billsQuery);
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Bill | "new" | null>(null);
  const [spotted, setSpotted] = useState<SpottedBill | null>(null);
  const b = q.data;
  const acct = b?.account;
  const history = useQuery({
    queryKey: ["accounts", acct?.id, "history"],
    queryFn: () => apiGet<{ history: [string, number][] }>(`accounts/${acct!.id}`),
    enabled: !!acct,
  });
  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!b) return <Loading />;
  const t = acct?.target?.kind === "months" ? acct.target : null;
  const held = t?.held ?? 0;
  const maxMonth = Math.max(1, ...b.by_month.map((m) => m.total));
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
      <Card lit tint="bills" aria-labelledby="bl-hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Eyebrow id="bl-hero">{acct ? acct.name : "Bills"}</Eyebrow>
            <BigNumber className="mt-1">
              <Count k="bills:bal" value={acct?.balance ?? 0} format={(v) => money(v)} />
            </BigNumber>
          </div>
          {t && (
            <Pill tone={held >= t.months ? "good" : "warn"}>
              {held >= t.months ? "Enough set aside" : "Running low"}
            </Pill>
          )}
        </div>
        {t && (
          <p className="m-0 text-[16px] text-ink-2">
            That's enough for {held.toFixed(1)} months of bills. We keep {t.months} months, so{" "}
            {(acct?.balance ?? 0) >= t.amount ? (
              <>
                {money((acct?.balance ?? 0) - t.amount)} more than that could go to <Term k="offset">the offset</Term>.
              </>
            ) : (
              <>it needs {money(t.amount - (acct?.balance ?? 0))} more.</>
            )}{" "}
            {`${money(b.next30.total)} of bills are due in the next 30 days.`}
          </p>
        )}
        {t && (
          <div>
            <Bar
              label={`Enough for ${held.toFixed(1)} months of bills; we keep ${t.months}`}
              max={Math.max(t.months + 1, held)}
              marker={t.months}
              height={14}
              segments={[{ value: held, role: "bills" }]}
            />
            <div className="mt-2 flex justify-between text-[12px] text-ink-3">
              <span>0</span>
              <span className="text-ink">we keep {t.months} months</span>
              <span>{Math.max(t.months + 1, Math.ceil(held))} months</span>
            </div>
          </div>
        )}
        <Details label="See the numbers">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Stat
              label="Bills in a usual month"
              value={money(b.per_month)}
              note={`${money(b.per_year)} a year · ${b.bills.length} bills`}
              role="bills"
            />
            <Stat
              label="Next 30 days"
              value={money(b.next30.total)}
              note={`${b.next30.count} bills${b.next30.by_hand ? ` · ${b.next30.by_hand} by hand` : ""}`}
              role="bills"
            />
            {t && (
              <Stat
                label={(acct?.balance ?? 0) >= t.amount ? "Extra" : "Still needed"}
                value={money(Math.abs((acct?.balance ?? 0) - t.amount))}
                note={`${t.months} months is ${money(t.amount)}`}
                role={(acct?.balance ?? 0) >= t.amount ? "savings" : "bills"}
              />
            )}
          </div>
        </Details>
      </Card>
      <YearlyCosts b={b} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,520px),1fr))] gap-4">
        {acct && t && (
          <Tile i={4} aria-labelledby="bl-bal">
            <TileTitle
              id="bl-bal"
              right={
                <span className="flex gap-3.5 text-[13px] font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <i className="h-0.5 w-3.5 bg-bills" />
                    Balance
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <i className="w-3.5 border-t-2 border-dashed border-ink-2" />
                    {t.months} months ({money(t.amount)})
                  </span>
                </span>
              }
            >
              The bills account over time
            </TileTitle>
            <AreaLine
              values={(history.data?.history ?? []).map(([, v]) => v)}
              colour="var(--color-bills)"
              target={t.amount}
              height={200}
              min={0}
              label="The bills account's balance over six months, against its target"
            />
          </Tile>
        )}
        <Tile i={5} aria-labelledby="bl-heat">
          <TileTitle
            id="bl-heat"
            right={<span className="mono">{money(b.by_month.reduce((s, m) => s + m.total, 0))}</span>}
          >
            Bills by month · next 12
          </TileTitle>
          <div
            className="mono grid grid-cols-6 gap-1 sm:grid-cols-12"
            role="img"
            aria-label={`Monthly bills from ${money(Math.min(...b.by_month.map((m) => m.total)))} to ${money(maxMonth)}`}
          >
            {b.by_month.map((m, i) => {
              const r = m.total / maxMonth;
              const strong = r > 0.85;
              return (
                <div
                  key={m.month}
                  className="rise flex min-h-[72px] flex-col justify-between rounded-xl px-1.5 py-2.5 text-center"
                  style={
                    {
                      "--i": i,
                      background: strong
                        ? "var(--color-bills-fill)"
                        : `color-mix(in srgb, var(--color-bills-fill) ${Math.round((0.12 + r * 0.3) * 100)}%, transparent)`,
                      color: strong ? "var(--color-page)" : undefined,
                    } as CSSProperties
                  }
                >
                  <span className={cn("text-xs", strong ? "font-semibold" : "text-ink-2")}>
                    {monthCaps(m.month).slice(0, 1)}
                  </span>
                  <span className={cn("text-xs", strong && "font-semibold")}>{(m.total / 100000).toFixed(1)}k</span>
                </div>
              );
            })}
          </div>
          <div className="text-xs text-ink-3">The bills account is there to cover the heaviest months.</div>
        </Tile>
      </div>
      <SpottedBills i={6} onEdit={setSpotted} />
      <Tile i={8} aria-labelledby="bl-all">
        <TileTitle id="bl-all" right={<span className="mono">{b.bills.length} BILLS</span>}>
          All bills{acct ? ` · paid from ${acct.name}` : ""}
        </TileTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-xs text-ink-3">
                {["Bill", "Every", "Next", "Amount", "Per year", "Share", "How"].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      "border-b border-line px-2.5 py-2 font-semibold whitespace-nowrap",
                      (i === 3 || i === 4) && "text-right",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.bills.map((bill) => (
                <tr
                  key={bill.id}
                  className="cursor-pointer hover:bg-raised/40"
                  onClick={() => navigate({ to: "/bills/$billId", params: { billId: String(bill.id) } })}
                >
                  <td className="border-b border-line px-2.5 py-2.5 font-medium">
                    <Link
                      to="/bills/$billId"
                      params={{ billId: String(bill.id) }}
                      className="text-ink no-underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {bill.name}
                    </Link>
                  </td>
                  <td className="border-b border-line px-2.5 py-2.5 text-ink-2">{EVERY_LABEL[bill.every]}</td>
                  <td className="mono border-b border-line px-2.5 py-2.5 text-ink-2">{shortDate(bill.next_due)}</td>
                  <td className="mono border-b border-line px-2.5 py-2.5 text-right">
                    {money(bill.amount, { cents: true })}
                  </td>
                  <td className="mono border-b border-line px-2.5 py-2.5 text-right">
                    {money(bill.per_year, { cents: true })}
                  </td>
                  <td className="border-b border-line px-2.5 py-2.5">
                    <span className="relative inline-block h-1.5 w-20 rounded-[3px] bg-raised align-middle">
                      <i
                        className="striped grow-x absolute inset-y-0 left-0 rounded-full bg-bills-fill"
                        style={{ width: `${(bill.share ?? 0) * 100}%` }}
                      />
                    </span>
                  </td>
                  <td className="border-b border-line px-2.5 py-2.5">
                    <Pill tone={HOW[bill.how][1]}>{HOW[bill.how][0]}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!b.bills.length && (
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
          )}
        </div>
      </Tile>
      <BillDialog bill={editing} onClose={() => setEditing(null)} />
      <BillDialog bill={spotted ? "new" : null} spotted={spotted} onClose={() => setSpotted(null)} />
    </>
  );
}

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
            how: spotted.how as string,
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
              how: yearly ? "estimate" : "auto",
              category_id: "",
              match: "",
            }
          : {
              name: bill.name,
              amount: editable(bill.amount),
              every: bill.every,
              next_due: bill.next_due,
              account_id: String(bill.account_id ?? ""),
              how: bill.how as string,
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
          <option value="estimate">An estimate (it varies)</option>
        </Select>
      </div>
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
