/**
 * Every transaction, newest first and grouped by day (the canvas's "All transactions"), a month at a time with the
 * one before a tap away: filter by account, show only what's not sorted, or search (searching looks back over
 * everything). Tap one for its sheet: its category (or a split), a note, someone's paying it back,
 * and deleting one typed in by hand.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { errorMessage } from "~/features/common/api";
import { Card, ChoiceChip, EmptyState } from "~/features/common/ds";
import { dayDate, longDate, money } from "~/features/common/format";
import { I } from "~/features/common/icons";
import { accountsQuery, transactionsQuery } from "~/features/common/queries";
import type { Transaction } from "~/features/common/types";
import { Button, ErrorText, Input, PageHead } from "~/features/common/ui";
import { TransactionSheet, TxRow } from "~/features/spending/TransactionSheet";

/** The month before the ones shown: "October", or "October 2025" in an earlier year. */
function monthName(shown: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - shown);
  const name = d.toLocaleString("en-AU", { month: "long" });
  return d.getFullYear() === new Date().getFullYear() ? name : `${name} ${d.getFullYear()}`;
}

export function TransactionsPage({ account }: { account?: number }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [unsorted, setUnsorted] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  // How many months back to show: this month to start with, one more each time "Show earlier" is tapped.
  const [months, setMonths] = useState(1);
  const from = new Date();
  from.setDate(1);
  from.setMonth(from.getMonth() - (months - 1));
  const start = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-01`;
  const accounts = useQuery(accountsQuery);
  const txs = useQuery({
    ...transactionsQuery(q ? { account_id: account, q, limit: 500 } : { account_id: account, start, limit: 3000 }),
    placeholderData: keepPreviousData,
  });
  const banks = (accounts.data?.accounts ?? []).filter((a) => a.kind === "bank");
  const byId = Object.fromEntries(banks.map((a) => [a.id, a]));
  const shown = (txs.data ?? []).filter(
    (t) => !unsorted || (t.category_id == null && t.kind !== "adjustment" && !t.splits?.length),
  );
  const days: [string, Transaction[]][] = [];
  for (const t of shown) {
    const last = days[days.length - 1];
    if (last && last[0] === t.date) last[1].push(t);
    else days.push([t.date, [t]]);
  }
  const openTx = (txs.data ?? []).find((t) => t.id === open) ?? null;
  const go = (id: number | null) =>
    navigate({ to: "/transactions", search: id != null ? { account: id } : {}, replace: true });
  return (
    <>
      <PageHead
        over={q ? `Money · ${shown.length} found` : `Money · ${shown.length} since ${longDate(start)}`}
        title="Transactions"
      />
      <div className="flex flex-col gap-3">
        <div role="group" aria-label="Account" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          <ChoiceChip pressed={account == null} onClick={() => go(null)}>
            Every account
          </ChoiceChip>
          {banks.map((a) => (
            <ChoiceChip key={a.id} pressed={account === a.id} onClick={() => go(a.id)}>
              {a.name}
            </ChoiceChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Search"
            className="max-w-[320px] flex-1"
            placeholder="Search descriptions and notes"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ChoiceChip pressed={unsorted} onClick={() => setUnsorted((u) => !u)} role="bills">
            Not sorted
          </ChoiceChip>
        </div>
      </div>
      {txs.isError && <ErrorText>{errorMessage(txs.error)}</ErrorText>}
      {txs.data && !shown.length ? (
        <EmptyState g={I.list} tone="neutral" title={unsorted ? "Everything's sorted" : "No transactions match"}>
          {unsorted ? "Nothing here is waiting for a category." : "Try another account, or fewer words."}
        </EmptyState>
      ) : (
        <Card className="flex flex-col gap-1">
          {days.map(([day, list]) => {
            const net = list.reduce((s, t) => s + (t.excluded ? 0 : t.amount), 0);
            return (
              <section key={day} aria-label={dayDate(day)} className="flex flex-col">
                <div className="flex items-baseline justify-between px-1.5 pt-3 pb-1 text-[12px] font-semibold tracking-[0.06em] text-ink-3 uppercase first:pt-0">
                  <span>{dayDate(day)}</span>
                  <span className="num normal-case">{money(net, { cents: true, sign: true })}</span>
                </div>
                {list.map((t) => (
                  <TxRow key={t.id} tx={t} onOpen={(x) => setOpen(x.id)} sub={byId[t.account_id]?.name ?? ""} />
                ))}
              </section>
            );
          })}
        </Card>
      )}
      {!q && txs.data && (
        <div className="flex justify-center">
          <Button onClick={() => setMonths((n) => n + 1)} disabled={txs.isFetching}>
            {txs.isFetching ? "Loading…" : `Show ${monthName(months)} too`}
          </Button>
        </div>
      )}
      <TransactionSheet tx={openTx} onClose={() => setOpen(null)} />
    </>
  );
}
