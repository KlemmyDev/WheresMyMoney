/**
 * Every transaction, a month at a time (the canvas's "All transactions"): step back and forward through the months,
 * for every account or one, with what came in and went out that month and where it went by category. Tap a category
 * to see only its transactions, or show only what's not sorted, money in or money out. Searching looks back over
 * every month. Tap a transaction for its sheet: its category (or a split), making it a recurring bill, a note,
 * someone paying it back, and deleting one typed in by hand. Select picks several to sort into one category at once.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { useToast } from "~/features/common/overlay";
import { CategoryPicker } from "~/features/common/CategoryPicker";
import { Card, ChoiceChip, EmptyState, Eyebrow } from "~/features/common/ds";
import { dayDate, money } from "~/features/common/format";
import { I } from "~/features/common/icons";
import { accountsQuery, categoriesQuery, refresh, transactionsQuery } from "~/features/common/queries";
import type { Transaction } from "~/features/common/types";
import { Button, ErrorText, Input, PageHead, Segmented, cn } from "~/features/common/ui";
import { TransactionSheet, TxRow } from "~/features/spending/TransactionSheet";

export type TxSearch = { account?: number; month?: string; category?: number | "unsorted" };

/** This month, as "2026-11". */
export function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shift(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "November", or "November 2025" in another year. */
function monthName(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const name = new Date(y, m - 1, 1).toLocaleString("en-AU", { month: "long" });
  return y === new Date().getFullYear() ? name : `${name} ${y}`;
}

function lastDay(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

/** Counted in money in and out: not a balance correction, not paid back, not a move between our own accounts. */
const counted = (t: Transaction) => t.kind !== "adjustment" && !t.excluded && t.category_kind !== "transfer";
const unsortedTx = (t: Transaction) => t.category_id == null && t.kind !== "adjustment" && !t.splits?.length;

/** How many categories show before "Every category". */
const TOP = 6;

export function TransactionsPage({ search }: { search: TxSearch }) {
  const navigate = useNavigate();
  const { account, category } = search;
  const month = search.month ?? thisMonth();
  const current = month === thisMonth();
  const [q, setQ] = useState("");
  const [dir, setDir] = useState<"all" | "out" | "in">("all");
  const [open, setOpen] = useState<number | null>(null);
  const [everyCat, setEveryCat] = useState(false);
  // Picking several to sort at once.
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const stopPicking = () => {
    setPicking(false);
    setPicked([]);
  };
  const accounts = useQuery(accountsQuery);
  const cats = useQuery(categoriesQuery);
  const txs = useQuery({
    ...transactionsQuery(
      q
        ? { account_id: account, q, limit: 500 }
        : { account_id: account, start: `${month}-01`, end: lastDay(month), limit: 3000 },
    ),
    placeholderData: keepPreviousData,
  });
  const go = (next: Partial<TxSearch>) =>
    navigate({ to: "/transactions", search: { ...search, ...next }, replace: true });

  const banks = (accounts.data?.accounts ?? []).filter((a) => a.kind === "bank");
  const byId = Object.fromEntries(banks.map((a) => [a.id, a]));
  // Only the bank accounts: the loan's own rows (interest added, repayments as the loan sees them) aren't money in
  // or out of the household, and its repayments are already here from the account that paid them.
  const loanId = accounts.data?.loan?.id;
  const all = (txs.data ?? []).filter((t) => t.account_id !== loanId);

  // The month in numbers: what came in, what went out, and where it went.
  const counting = all.filter(counted);
  const moneyIn = counting.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const moneyOut = counting.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const where = new Map<string, { id: number | "unsorted"; name: string; total: number }>();
  const add = (id: number | "unsorted", name: string, cents: number) => {
    const key = String(id);
    const row = where.get(key) ?? { id, name, total: 0 };
    row.total += cents;
    where.set(key, row);
  };
  for (const t of counting.filter((x) => x.amount < 0)) {
    if (t.splits?.length) for (const p of t.splits) add(p.category_id, p.category ?? "Other", p.amount);
    else if (t.category_id != null) add(t.category_id, t.category ?? "Other", -t.amount);
    else add("unsorted", "Not sorted", -t.amount);
  }
  const breakdown = [...where.values()].sort((a, b) => b.total - a.total);
  const biggest = breakdown[0]?.total ?? 1;
  const unsortedCount = all.filter(unsortedTx).length;

  const shown = all.filter(
    (t) =>
      (category == null ||
        (category === "unsorted"
          ? unsortedTx(t)
          : t.category_id === category || !!t.splits?.some((p) => p.category_id === category))) &&
      (dir === "all" || (dir === "in" ? t.amount > 0 : t.amount < 0)),
  );
  const days: [string, Transaction[]][] = [];
  for (const t of shown) {
    const last = days[days.length - 1];
    if (last && last[0] === t.date) last[1].push(t);
    else days.push([t.date, [t]]);
  }
  const openTx = all.find((t) => t.id === open) ?? null;
  const catName =
    category === "unsorted"
      ? "Not sorted"
      : category != null
        ? ((cats.data?.categories ?? []).find((c) => c.id === category)?.name ?? "That category")
        : null;
  const where1 = account != null && byId[account] ? ` in ${byId[account].name}` : "";

  return (
    <>
      <PageHead
        over={q ? `Money · ${shown.length} found in every month` : `Money · ${monthName(month)}`}
        title="Transactions"
      />
      <div className="flex flex-col gap-3">
        <div role="group" aria-label="Account" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          <ChoiceChip pressed={account == null} onClick={() => go({ account: undefined })}>
            Every account
          </ChoiceChip>
          {banks.map((a) => (
            <ChoiceChip key={a.id} pressed={account === a.id} onClick={() => go({ account: a.id })}>
              {a.name}
            </ChoiceChip>
          ))}
        </div>
        <Input
          aria-label="Search every month"
          className="font-sans sm:max-w-[360px]"
          placeholder="Search every month: descriptions and notes"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {!q && (
        <Card lit tint="spending" aria-labelledby="tx-month" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <Button
              aria-label={`Back to ${monthName(shift(month, -1))}`}
              onClick={() => go({ month: shift(month, -1) })}
            >
              ‹
            </Button>
            <div className="flex min-w-0 flex-col items-center text-center">
              <h2 id="tx-month" className="m-0 text-[19px] leading-6 font-semibold">
                {monthName(month)}
              </h2>
              {!current && (
                <button
                  type="button"
                  className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-teal"
                  onClick={() => go({ month: undefined })}
                >
                  Back to this month
                </button>
              )}
            </div>
            <Button
              aria-label={`On to ${monthName(shift(month, 1))}`}
              disabled={current}
              onClick={() => go({ month: shift(month, 1) === thisMonth() ? undefined : shift(month, 1) })}
            >
              ›
            </Button>
          </div>
          <p className="m-0 text-[16px] leading-relaxed text-ink">
            {current ? "So far this month" : `In ${monthName(month)}`}
            {where1}, <b>{money(moneyIn)}</b> came in and <b>{money(moneyOut)}</b> went out.{" "}
            <span className="text-ink-2">
              {moneyIn >= moneyOut
                ? `That's ${money(moneyIn - moneyOut)} more in than out.`
                : `That's ${money(moneyOut - moneyIn)} more out than in.`}
            </span>
          </p>
          <span className="text-[13px] text-ink-3">Money moved between our own accounts isn&apos;t counted.</span>
          {breakdown.length > 0 && (
            <div className="flex flex-col gap-1">
              <Eyebrow>Where it went · tap one to see its transactions</Eyebrow>
              <ul className="m-0 flex list-none flex-col p-0">
                {(everyCat ? breakdown : breakdown.slice(0, TOP)).map((r) => {
                  const on = category === r.id;
                  return (
                    <li key={String(r.id)}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => go({ category: on ? undefined : r.id })}
                        className={cn(
                          "press flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl border-0 bg-transparent px-1.5 text-left text-ink hover:bg-tile-2",
                          on && "bg-teal/12",
                        )}
                      >
                        <span
                          className={cn(
                            "w-[38%] min-w-0 truncate text-[14px] sm:w-[200px]",
                            r.id === "unsorted" && "text-warn",
                          )}
                        >
                          {r.name}
                        </span>
                        <span className="relative h-2 min-w-0 flex-1 rounded-full bg-raised">
                          <i
                            className={cn(
                              "absolute inset-y-0 left-0 rounded-full",
                              r.id === "unsorted" ? "bg-warn" : "bg-spending-fill",
                            )}
                            style={{ width: `${Math.max(2, (r.total / biggest) * 100)}%` }}
                          />
                        </span>
                        <span className="num w-[84px] text-right text-[14px]">{money(r.total)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {breakdown.length > TOP && (
                <button
                  type="button"
                  className="cursor-pointer self-start border-0 bg-transparent p-1.5 text-[14px] font-semibold text-teal"
                  onClick={() => setEveryCat((v) => !v)}
                >
                  {everyCat ? "Fewer categories" : `Every category (${breakdown.length})`}
                </button>
              )}
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Show"
          options={[
            { value: "all", label: "Everything" },
            { value: "out", label: "Money out" },
            { value: "in", label: "Money in" },
          ]}
          value={dir}
          onChange={setDir}
        />
        <ChoiceChip
          pressed={category === "unsorted"}
          onClick={() => go({ category: category === "unsorted" ? undefined : "unsorted" })}
          role="bills"
        >
          Not sorted{!q && unsortedCount ? ` · ${unsortedCount}` : ""}
        </ChoiceChip>
        <div className="w-44">
          <CategoryPicker
            label="Only this category"
            value={typeof category === "number" ? category : null}
            categories={cats.data?.categories ?? []}
            placeholder="Any category"
            onChange={(c) => go({ category: c ?? undefined })}
            className="min-h-11 rounded-full border-line-2 bg-transparent text-[14px] text-ink-2"
          />
        </div>
        {unsortedCount > 0 && category === "unsorted" && (
          <Link to="/sort" className="text-[14px] font-semibold text-teal no-underline">
            Sort them by merchant
          </Link>
        )}
        <span className="hidden flex-1 sm:block" />
        <Button small onClick={() => (picking ? stopPicking() : setPicking(true))} aria-pressed={picking}>
          {picking ? "Done" : "Select"}
        </Button>
      </div>
      {picking && (
        <SortBar
          picked={picked}
          all={shown.filter((t) => t.kind !== "adjustment" && !t.splits?.length).map((t) => t.id)}
          onPick={setPicked}
          onDone={stopPicking}
        />
      )}

      {txs.isError && <ErrorText>{errorMessage(txs.error)}</ErrorText>}
      {txs.data && !shown.length ? (
        <EmptyState
          g={I.list}
          tone="neutral"
          title={category === "unsorted" ? "Everything's sorted" : "No transactions here"}
        >
          {category === "unsorted"
            ? "Nothing here is waiting for a category."
            : q
              ? "Try fewer words, or another account."
              : `Nothing${catName ? ` in ${catName}` : ""}${where1} in ${monthName(month)}. Try another month or account.`}
        </EmptyState>
      ) : (
        <Card className="flex flex-col gap-1" aria-label="Transactions">
          {catName && (
            <div className="flex items-center justify-between gap-2 px-1.5 pb-1">
              <span className="text-[14px] text-ink-2">
                Only <b className="text-ink">{catName}</b> · {shown.length}
              </span>
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-teal"
                onClick={() => go({ category: undefined })}
              >
                Show everything
              </button>
            </div>
          )}
          {days.map(([day, list]) => {
            const net = list.reduce((s, t) => s + (t.excluded ? 0 : t.amount), 0);
            return (
              <section key={day} aria-label={dayDate(day)} className="flex flex-col">
                <div className="flex items-baseline justify-between px-1.5 pt-3 pb-1 text-[12px] font-semibold tracking-[0.06em] text-ink-3 uppercase first:pt-0">
                  <span>{q ? `${dayDate(day)} ${day.slice(0, 4)}` : dayDate(day)}</span>
                  <span className="num normal-case">{money(net, { cents: true, sign: true })}</span>
                </div>
                {list.map((t) => (
                  <TxRow
                    key={t.id}
                    tx={t}
                    sub={byId[t.account_id]?.name ?? ""}
                    picked={picking ? picked.includes(t.id) : undefined}
                    onOpen={(x) =>
                      picking
                        ? setPicked((p) => (p.includes(x.id) ? p.filter((i) => i !== x.id) : [...p, x.id]))
                        : setOpen(x.id)
                    }
                  />
                ))}
              </section>
            );
          })}
        </Card>
      )}
      {!q && txs.data && (
        <div className="flex justify-center gap-2">
          <Button onClick={() => go({ month: shift(month, -1) })}>See {monthName(shift(month, -1))}</Button>
        </div>
      )}
      <TransactionSheet tx={openTx} onClose={() => setOpen(null)} />
    </>
  );
}

/**
 * Sorting several at once: how many are picked (or pick everything shown), the category for them, whether to remember
 * it for their merchants, and Sort. The toast offers Undo, which puts back the categories and anything remembered.
 */
function SortBar({
  picked,
  all,
  onPick,
  onDone,
}: {
  picked: number[];
  all: number[];
  onPick: (ids: number[]) => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const cats = useQuery(categoriesQuery);
  const [cat, setCat] = useState<number | null>(null);
  const [always, setAlways] = useState(false);
  const name = cats.data?.categories.find((c) => c.id === cat)?.name ?? "";
  const sort = useMutation({
    mutationFn: () =>
      apiSend<{ sorted: number; skipped: number; also: number; undo: unknown }>("POST", "transactions/sort", {
        ids: picked,
        category_id: cat,
        always,
      }),
    onSuccess: (r) => {
      refresh(qc);
      onDone();
      const extra = r.also ? `, and ${r.also} more by their merchants` : "";
      toast(`Sorted ${r.sorted} into ${name}${extra}`, () =>
        apiSend("POST", "transactions/sort/undo", { undo: r.undo })
          .then(() => refresh(qc))
          .catch((e) => toast(errorMessage(e))),
      );
    },
    onError: (e) => toast(errorMessage(e)),
  });
  const everything = all.length > 0 && all.every((id) => picked.includes(id));
  return (
    <div
      role="region"
      aria-label="Sort the picked transactions"
      className="sticky top-20 z-10 flex flex-col gap-2 rounded-2xl border border-line-2 bg-tile p-3 shadow-lg"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 text-[14px]">
          {picked.length ? `${picked.length} picked` : "Tap transactions to pick them."}
        </span>
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-teal"
          onClick={() => onPick(everything ? [] : all)}
        >
          {everything ? "Pick none" : `Pick all ${all.length}`}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-48">
          <CategoryPicker
            label="Sort as"
            value={cat}
            categories={cats.data?.categories ?? []}
            placeholder="Sort as…"
            onChange={setCat}
            className="min-h-11 text-[14px]"
          />
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[14px] text-ink-2">
          <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} className="size-4" />
          Remember for these merchants
        </label>
        <span className="flex-1" />
        <Button primary small disabled={!picked.length || cat == null || sort.isPending} onClick={() => sort.mutate()}>
          Sort {picked.length || ""}
        </Button>
      </div>
    </div>
  );
}
