/**
 * Every spending category this spending month, each opening its own page. Those with a budget show a bar against it
 * (the tick is where you'd be on plan); those without show what's gone this month and a usual month, with the budget
 * that would fit one tap away. Categories with nothing yet stay folded away until asked for.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState, type CSSProperties } from "react";
import { apiSend } from "~/features/common/api";
import { Card, CardHead } from "~/features/common/ds";
import { amount, money } from "~/features/common/format";
import { useToast } from "~/features/common/overlay";
import { budgetSuggestionsQuery, categoriesQuery, refresh } from "~/features/common/queries";
import type { SpendingMonth } from "~/features/common/types";
import { Button, cn } from "~/features/common/ui";
import { CategoryGlyph } from "~/features/spending/MerchantIcon";

type Month = SpendingMonth;

export function SpendingCategories({ m, onBudgets }: { m: Month; onBudgets: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const cats = useQuery(categoriesQuery);
  const sug = useQuery(budgetSuggestionsQuery);
  const [quiet, setQuiet] = useState(false);
  const spentOf = Object.fromEntries(m.categories.map((c) => [c.id, c.spent]));
  const usual = Object.fromEntries((sug.data?.categories ?? []).map((r) => [r.id, r]));
  const all = (cats.data?.categories ?? m.categories.map((c) => ({ ...c, kind: "spending" as const, icon: null })))
    .filter((c) => c.kind === "spending")
    .map((c) => ({
      id: c.id,
      name: c.name,
      budget: c.budget,
      spent: spentOf[c.id] ?? 0,
      average: usual[c.id]?.average ?? 0,
      suggested: usual[c.id]?.suggested ?? null,
    }));
  const budgeted = all
    .filter((c) => c.budget != null)
    .sort((a, b) => b.spent / (b.budget || 1) - a.spent / (a.budget || 1));
  const open = all
    .filter((c) => c.budget == null && (c.spent > 0 || c.average > 0))
    .sort((a, b) => b.spent - a.spent || b.average - a.average);
  const idle = all.filter((c) => c.budget == null && c.spent <= 0 && c.average <= 0);
  const spentTotal = m.categories.reduce((s, c) => s + c.spent, 0) + m.unsorted;
  const budgetTotal = budgeted.reduce((s, c) => s + (c.budget ?? 0), 0);

  const save = useMutation({
    mutationFn: (c: { id: number; name: string; budget: number | null }) =>
      apiSend("PUT", `categories/${c.id}`, { name: c.name, kind: "spending", budget: c.budget }),
    onSuccess: (_r, c) => {
      refresh(qc);
      if (c.budget != null) toast(`${c.name}: ${money(c.budget)} a month`, () => save.mutate({ ...c, budget: null }));
    },
  });

  return (
    <Card aria-labelledby="s-cat">
      <CardHead
        id="s-cat"
        title="Categories"
        right={
          <span className="flex items-center gap-3">
            <span className="mono text-[13px] text-ink-2">{money(spentTotal)} this month</span>
            <Button small onClick={onBudgets}>
              Edit budgets
            </Button>
          </span>
        }
      />
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2 [&>*]:min-w-0">
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2 pb-1">
            <span className="text-[13px] font-semibold text-ink-2">With a budget</span>
            <span className="text-[12px] text-ink-3">the tick is where you'd be on plan</span>
          </div>
          {budgeted.map((c, i) => {
            const ratio = c.budget ? c.spent / c.budget : 0;
            const over = ratio > m.pace * 1.25 && ratio > 0.5;
            return (
              <Link
                key={c.id}
                to="/spending/$categoryId"
                params={{ categoryId: String(c.id) }}
                className="-mx-2 grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-xl px-2 py-2 text-[14px] text-ink no-underline hover:bg-tile-2"
              >
                <span className="row-span-2">
                  <CategoryGlyph name={c.name} size="md" />
                </span>
                <span className="truncate font-semibold">{c.name}</span>
                <span className="mono text-right text-[13px]" style={{ color: over ? "var(--color-warn)" : undefined }}>
                  {money(c.spent)} <span className="text-ink-3">/ {amount(c.budget)}</span>
                </span>
                <span className="relative col-span-2 h-2 rounded-full bg-raised">
                  <i
                    className="striped grow-x absolute inset-y-0 left-0 rounded-full"
                    style={
                      {
                        width: `${Math.min(ratio, 1) * 100}%`,
                        backgroundColor: over ? "var(--color-bills-fill)" : "var(--color-spending-fill)",
                        "--i": i,
                      } as CSSProperties
                    }
                  />
                  <b
                    className="absolute -top-[3px] -bottom-[3px] w-0.5 bg-ink-2"
                    style={{ left: `${m.pace * 100}%` }}
                  />
                </span>
              </Link>
            );
          })}
          {!budgeted.length && (
            <p className="m-0 text-[14px] text-ink-3">
              No budgets yet. Give a category one to see it against the month.
            </p>
          )}
          <div className="mt-1 border-t border-line pt-2 text-[12px] text-ink-3">
            Budgets add up to {money(budgetTotal)} of the {money(m.allowance)}
            {budgetTotal <= m.allowance
              ? `, leaving ${money(m.allowance - budgetTotal)} as a cushion.`
              : `, ${money(budgetTotal - m.allowance)} more than the spending money.`}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2 pb-1">
            <span className="text-[13px] font-semibold text-ink-2">No budget yet</span>
            <span className="text-[12px] text-ink-3">this month · a usual month</span>
          </div>
          {open.map((c) => (
            <div
              key={c.id}
              className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-1.5 text-[14px] hover:bg-tile-2"
            >
              <Link
                to="/spending/$categoryId"
                params={{ categoryId: String(c.id) }}
                className="flex min-w-0 flex-1 items-center gap-3 text-ink no-underline"
              >
                <CategoryGlyph name={c.name} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="block text-[12px] text-ink-3">
                    {c.average > 0 ? `Usually ${money(c.average)} a month` : "New this month"}
                  </span>
                </span>
                <span className="mono text-[13px]">{money(c.spent)}</span>
              </Link>
              {c.suggested != null && (
                <Button
                  small
                  aria-label={`Give ${c.name} a ${money(c.suggested)} budget`}
                  disabled={save.isPending}
                  onClick={() => save.mutate({ id: c.id, name: c.name, budget: c.suggested })}
                >
                  + {money(c.suggested)}
                </Button>
              )}
            </div>
          ))}
          {m.unsorted > 0 && (
            <Link
              to="/transactions"
              search={{ account: m.account_id, category: "unsorted" }}
              className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-1.5 text-[14px] text-ink-2 no-underline hover:bg-tile-2"
            >
              <CategoryGlyph name={null} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Not sorted yet</span>
                <span className="block text-[12px] text-ink-3">Sort them to see where it went</span>
              </span>
              <span className="mono text-[13px]">{money(m.unsorted)}</span>
            </Link>
          )}
          {!open.length && !m.unsorted && (
            <p className="m-0 text-[14px] text-ink-3">Everything that's gone this month is in a budget.</p>
          )}
          {idle.length > 0 && (
            <>
              <button
                type="button"
                aria-expanded={quiet}
                className="mt-1 cursor-pointer self-start border-0 bg-transparent p-0 text-[13px] font-semibold text-teal"
                onClick={() => setQuiet((q) => !q)}
              >
                {quiet ? "Hide" : "Show"} {idle.length} with nothing yet
              </button>
              {quiet && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {idle.map((c) => (
                    <Link
                      key={c.id}
                      to="/spending/$categoryId"
                      params={{ categoryId: String(c.id) }}
                      className={cn(
                        "rounded-full border border-line px-2.5 py-1 text-[12px] text-ink-2 no-underline hover:text-ink",
                      )}
                    >
                      {c.name}
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
