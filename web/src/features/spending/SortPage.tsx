/**
 * Sorting what's new, one at a time (the uplift canvas's SfSort): each merchant with spending not sorted yet, as a
 * card with its statement line, a suggested category and the everyday ones as chips. One tap sorts it; "Remember for"
 * (on by default) remembers it for that merchant, so it and every later import sort themselves. Not now moves it to
 * the back. Each sort ends in a toast with Undo, and what's been sorted is listed beside the queue.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { CategoryPicker } from "~/features/common/CategoryPicker";
import { Card, CardHead, ChoiceChip, EmptyState } from "~/features/common/ds";
import { money, monthYear } from "~/features/common/format";
import { I } from "~/features/common/icons";
import { useToast } from "~/features/common/overlay";
import { categoriesQuery, merchantsQuery, refresh } from "~/features/common/queries";
import type { MerchantGroup } from "~/features/common/types";
import { Button, ErrorText, PageHead, Switch } from "~/features/common/ui";
import { MerchantMark } from "~/features/spending/MerchantIcon";

type Undo = { pattern: string; rule_was: number | null; transactions: unknown[] };
type Done = { pattern: string; category: string; count: number };

const span = (g: MerchantGroup) => {
  const a = monthYear(g.first.slice(0, 7));
  const b = monthYear(g.last.slice(0, 7));
  return a === b ? a : `${a} – ${b}`;
};

export function SortPage() {
  const q = useQuery(merchantsQuery(false));
  const cats = useQuery(categoriesQuery);
  const qc = useQueryClient();
  const toast = useToast();
  // Merchants put off with Not now go to the back, in the order they were put off.
  const [later, setLater] = useState<string[]>([]);
  const [done, setDone] = useState<Done[]>([]);
  const [remember, setRemember] = useState(true);
  const [total, setTotal] = useState<number | null>(null);
  const categories = cats.data?.categories ?? [];
  const name = (id: number) => categories.find((c) => c.id === id)?.name ?? "that";
  const waiting = (q.data ?? []).filter((g) => g.unsorted > 0);
  const queue = [
    ...waiting.filter((g) => !later.includes(g.pattern)),
    ...later.map((p) => waiting.find((g) => g.pattern === p)).filter((g): g is MerchantGroup => !!g),
  ];
  const all = total ?? waiting.length;
  if (total == null && q.data) setTotal(waiting.length);
  const g = queue[0];

  const undoSort = useMutation({
    mutationFn: (undo: Undo) => apiSend("POST", "merchants/sort/undo", { undo }),
    onSuccess: () => refresh(qc),
  });
  const undoOne = useMutation({
    mutationFn: (txId: number) => apiSend("PUT", `transactions/${txId}`, { category_id: null }),
    onSuccess: () => refresh(qc),
  });
  const sort = useMutation({
    mutationFn: async ({ g, category_id }: { g: MerchantGroup; category_id: number }) =>
      remember
        ? apiSend<{ changed: number; pattern: string; undo: Undo }>("POST", "merchants/sort", {
            transaction_id: g.transaction_id,
            category_id,
          })
        : apiSend("PUT", `transactions/${g.transaction_id}`, { category_id }).then(() => null),
    onSuccess: (r, { g, category_id }) => {
      refresh(qc);
      const c = name(category_id);
      const count = r ? r.changed : 1;
      setDone((d) => [{ pattern: g.pattern, category: c, count }, ...d]);
      setLater((l) => l.filter((p) => p !== g.pattern));
      const drop = () => setDone((d) => d.filter((x) => x.pattern !== g.pattern));
      if (r)
        toast(`${g.pattern} is ${c} from now on${count > 1 ? ` · ${count} sorted` : ""}`, () => {
          undoSort.mutate(r.undo);
          drop();
        });
      else
        toast(`Sorted as ${c}`, () => {
          undoOne.mutate(g.transaction_id);
          drop();
        });
    },
  });

  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  const left = queue.length;
  const sortedSoFar = Math.max(0, all - left);
  const everyday = categories.filter((c) => c.kind === "spending" && c.budget).slice(0, 6);
  const suggested = g?.suggest_id ?? g?.categories[0]?.id ?? null;
  const chips = [
    ...(suggested != null ? categories.filter((c) => c.id === suggested) : []),
    ...everyday.filter((c) => c.id !== suggested),
  ];

  return (
    <>
      <PageHead over="Spending" title="Sort what's new" />
      {!q.data ? null : !g ? (
        <EmptyState
          g={I.savings}
          tone="savings"
          title={done.length ? "That's everything sorted" : "Nothing to sort"}
          action={
            <span className="flex flex-wrap justify-center gap-2">
              <Link to="/spending" className="text-[14px] font-semibold text-teal no-underline">
                See spending
              </Link>
              <Link to="/" className="text-[14px] font-semibold text-teal no-underline">
                Back to Overview
              </Link>
            </span>
          }
        >
          {done.length
            ? `${done.length} ${done.length === 1 ? "merchant sorts itself" : "merchants sort themselves"} from now on.`
            : "Every spend has a category."}
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
          <Card className="md:col-span-8" aria-labelledby="sort-h">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="sort-h" className="m-0 text-[17px] font-semibold">
                {left} of {all} to sort
              </h2>
              <Button small onClick={() => setLater((l) => [...l.filter((p) => p !== g.pattern), g.pattern])}>
                Not now
              </Button>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-raised"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={all}
              aria-valuenow={sortedSoFar}
              aria-label="Sorted so far"
            >
              <div
                className="h-full rounded-full bg-savings-fill transition-[width] duration-300"
                style={{ width: `${all ? (sortedSoFar / all) * 100 : 0}%` }}
              />
            </div>
            <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-tile-2 p-3.5">
              <MerchantMark name={g.pattern} size="xl" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[19px] font-semibold">{g.pattern}</div>
                <div className="mono truncate text-[12px] text-ink-3">{g.example}</div>
                <div className="text-[13px] text-ink-3">
                  {g.unsorted} to sort · {g.count} {g.count === 1 ? "payment" : "payments"}, {span(g)}
                </div>
              </div>
              <div className="num flex-none text-[18px]">{money(g.spent)}</div>
            </div>
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="eyebrow mb-2">Which category?</legend>
              <div className="flex flex-wrap gap-2">
                {chips.map((c) => (
                  <ChoiceChip
                    key={c.id}
                    pressed={false}
                    onClick={() => sort.mutate({ g, category_id: c.id })}
                    role="spending"
                  >
                    {c.name}
                    {c.id === suggested && <span className="text-[11px] font-normal text-teal">Suggested</span>}
                  </ChoiceChip>
                ))}
                <div className="w-44">
                  <CategoryPicker
                    label="Another category"
                    value={null}
                    categories={categories}
                    kinds={["spending", "bills"]}
                    placeholder="More…"
                    className="min-h-11 rounded-full border-line-2 bg-transparent text-[14px] text-ink-2"
                    onChange={(c) => c != null && sort.mutate({ g, category_id: c })}
                  />
                </div>
              </div>
            </fieldset>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div id="sort-remember" className="font-semibold">
                  Remember for {g.pattern}
                </div>
                <div className="text-[13px] text-ink-3">
                  Sorts its other {g.unsorted > 1 ? `${g.unsorted - 1} ` : ""}spends and every import after.{" "}
                  <Link to="/merchants/$key" params={{ key: g.pattern }} className="text-teal no-underline">
                    Change it on the merchant's page
                  </Link>
                </div>
              </div>
              <Switch checked={remember} onChange={setRemember} labelledBy="sort-remember" />
            </div>
            {sort.isError && <ErrorText>{errorMessage(sort.error)}</ErrorText>}
          </Card>
          <Card className="md:col-span-4" aria-labelledby="sorted-h">
            <CardHead id="sorted-h" title="Sorted" right={<span className="mono">{done.length}</span>} />
            {done.length === 0 ? (
              <p className="m-0 text-[14px] text-ink-3">What you sort shows here.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {done.map((d) => (
                  <li key={d.pattern} className="flex items-center justify-between gap-2 text-[14px]">
                    <span className="truncate">{d.pattern}</span>
                    <span className="flex-none text-ink-3">
                      {d.category}
                      {d.count > 1 ? ` · ${d.count}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
