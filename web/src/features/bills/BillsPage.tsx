/**
 * Bills (design: CkBills): the bills account against its target, what an average month and the next 30 days hold,
 * the months ahead as a heat strip, and every bill with how often, when next, and how it's paid.
 */
import { Loading } from "~/features/common/brand";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type CSSProperties } from "react";
import { apiGet, apiSend, errorMessage } from "~/features/common/api";
import { AreaLine, Count } from "~/features/common/charts";
import { EVERY_LABEL, editable, money, monthCaps, parseMoney, shortDate, todayIso } from "~/features/common/format";
import { Dialog, useToast } from "~/features/common/overlay";
import { accountsQuery, billsQuery, categoriesQuery, refresh } from "~/features/common/queries";
import type { Account, Bill, Every, SpottedBill } from "~/features/common/types";
import { SpottedBills } from "~/features/bills/Spotted";
import { CategoryPicker } from "~/features/common/CategoryPicker";
import {
  Button,
  Dot,
  ErrorText,
  Input,
  Label,
  PageHead,
  Pill,
  Select,
  Tile,
  TileTitle,
  cn,
} from "~/features/common/ui";

const HOW = { auto: ["AUTO", "info"], manual: ["BY HAND", "warn"], estimate: ["ESTIMATE", "good"] } as const;

export function BillsPage() {
  const q = useQuery(billsQuery);
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
        over={acct && t ? `BILLS ACCOUNT · TARGET ${t.months} MONTHS` : "BILLS"}
        title="Bills"
        actions={
          <Button primary onClick={() => setEditing("new")}>
            Add bill
          </Button>
        }
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
        {acct && (
          <Tile i={0}>
            <TileTitle right={<Dot c="bills" />}>Bills account</TileTitle>
            <div className="mono text-[26px] font-semibold">
              <Count k="bills:bal" value={acct.balance} format={(v) => money(v)} />
            </div>
          </Tile>
        )}
        {t && (
          <Tile i={1}>
            <TileTitle
              right={
                <Pill tone={held >= t.months ? "good" : "warn"}>{held >= t.months ? "ON TARGET" : "UNDER TARGET"}</Pill>
              }
            >
              Months covered
            </TileTitle>
            <div className="mono text-[26px] font-semibold">
              {held.toFixed(1)} <span className="text-[15px] text-ink-3">/ {t.months.toFixed(1)}</span>
            </div>
            <div className="mono text-xs text-ink-3">
              {money(Math.abs((acct?.balance ?? 0) - t.amount))} {(acct?.balance ?? 0) >= t.amount ? "above" : "below"}{" "}
              target
            </div>
          </Tile>
        )}
        <Tile i={2}>
          <div className="tt">Average month</div>
          <div className="mono text-[26px] font-semibold">{money(b.per_month)}</div>
          <div className="mono text-xs text-ink-3">
            {money(b.per_year)} a year · {b.bills.length} bills
          </div>
        </Tile>
        <Tile i={3}>
          <div className="tt">Next 30 days</div>
          <div className="mono text-[26px] font-semibold">{money(b.next30.total)}</div>
          <div className="mono text-xs text-ink-3">
            {b.next30.count} bills{b.next30.by_hand ? ` · ${b.next30.by_hand} you pay by hand` : ""}
          </div>
        </Tile>
      </div>
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
                    Target {money(t.amount)}
                  </span>
                </span>
              }
            >
              Bills account vs {t.months}-month target
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
                  className="rise flex min-h-[72px] flex-col justify-between rounded-md px-1.5 py-2.5 text-center"
                  style={
                    {
                      "--i": i,
                      background: strong ? "var(--color-bills)" : `rgb(251 191 36 / ${0.12 + r * 0.3})`,
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
          <div className="text-xs text-ink-3">The heaviest months are what the buffer is there for.</div>
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
                <tr key={bill.id} className="cursor-pointer hover:bg-raised/40" onClick={() => setEditing(bill)}>
                  <td className="border-b border-line px-2.5 py-2.5 font-medium">{bill.name}</td>
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
                        className="grow-x absolute inset-y-0 left-0 rounded-[3px] bg-bills"
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
            <div className="py-4 text-ink-3">No bills yet. Add the ones that come out regularly, once each.</div>
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
  onClose,
}: {
  bill: Bill | "new" | null;
  /** A bill spotted in the statements, to add with any changes made here. */
  spotted?: SpottedBill | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={bill != null} onClose={onClose} labelledBy="bill-h">
      {bill != null && <BillForm key={spotted?.key ?? "x"} bill={bill} spotted={spotted} onClose={onClose} />}
    </Dialog>
  );
}

function BillForm({
  bill,
  spotted,
  onClose,
}: {
  bill: Bill | "new";
  spotted?: SpottedBill | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const accounts = useQuery(accountsQuery);
  const cats = useQuery(categoriesQuery);
  const banks: Account[] = accounts.data?.accounts ?? [];
  const [f, setF] = useState(() =>
    spotted
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
            every: "monthly" as Every,
            next_due: todayIso(),
            account_id: String(banks.find((a) => a.role === "bills")?.id ?? ""),
            how: "auto",
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
          ? apiSend("POST", "bills", body())
          : apiSend("PUT", `bills/${(bill as Bill).id}`, body()),
    onSuccess: () => (refresh(qc), onClose(), toast(bill === "new" ? `${f.name} added` : `${f.name} saved`)),
  });
  const remove = useMutation({
    mutationFn: () => apiSend("DELETE", `bills/${(bill as Bill).id}`),
    onSuccess: () => (refresh(qc), onClose()),
  });
  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-6">
      <h2 id="bill-h" className="m-0 text-xl font-semibold">
        {spotted ? "Add a spotted bill" : bill === "new" ? "Add a bill" : f.name || "Bill"}
      </h2>
      {spotted && (
        <div className="text-[13px] text-ink-2">
          Seen {spotted.seen} times, as <span className="mono">{spotted.example}</span>. Its payments are linked to the
          bill once it&apos;s added.
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="b-name">Bill</Label>
          <Input
            id="b-name"
            className="font-sans"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder="Internet"
          />
        </div>
        <div>
          <Label htmlFor="b-amt">Amount</Label>
          <Input
            id="b-amt"
            inputMode="decimal"
            value={f.amount}
            onChange={(e) => setF({ ...f, amount: e.target.value })}
            placeholder="89.00"
          />
        </div>
        <div>
          <Label htmlFor="b-every">Every</Label>
          <Select id="b-every" value={f.every} onChange={(e) => setF({ ...f, every: e.target.value as Every })}>
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
            onChange={(e) => setF({ ...f, next_due: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="b-acct">Paid from</Label>
          <Select id="b-acct" value={f.account_id} onChange={(e) => setF({ ...f, account_id: e.target.value })}>
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
          <Select id="b-how" value={f.how} onChange={(e) => setF({ ...f, how: e.target.value })}>
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
            onChange={(c) => setF({ ...f, category_id: c != null ? String(c) : "" })}
            className="min-h-10 text-[13px]"
          />
        </div>
        <div>
          <Label htmlFor="b-match">On the statement as (optional)</Label>
          <Input
            id="b-match"
            value={f.match}
            onChange={(e) => setF({ ...f, match: e.target.value })}
            placeholder="TELSTRA"
          />
        </div>
      </div>
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
