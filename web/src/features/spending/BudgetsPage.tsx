/**
 * Budgets, every spending category in one place (the uplift canvas's MoBudgets): what they add up to against the
 * spending month, the ones that don't match what's usually spent, and a row per category with this month, a usual
 * month, the suggested amount and its budget. Changes stay as a draft until Save, which ends in a toast with Undo.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Bar, Card, CardHead, Details, type Segment } from "~/features/common/ds";
import { EntityHero } from "~/features/common/entity";
import { editable, money, monthYear, parseMoney } from "~/features/common/format";
import { useToast } from "~/features/common/overlay";
import { budgetSuggestionsQuery, categoriesQuery, refresh, spendingQuery } from "~/features/common/queries";
import type { BudgetSuggestions } from "~/features/common/types";
import { Button, ErrorText, Input, cn } from "~/features/common/ui";

type Suggestion = BudgetSuggestions["categories"][number];

/** "Groceries went over in 5 of the last 6 months. Usually $1,405, so $1,410 would fit." */
function mismatchText(r: Suggestion, months: number): string {
  return r.note === "over"
    ? `${r.name} went over its ${money(r.budget)} in ${r.over} of the last ${months} months. Usually ${money(r.average)}, so ${money(r.suggested)} would fit.`
    : `${r.name} stayed well under its ${money(r.budget)} every month. Usually ${money(r.average)}, so ${money(r.suggested)} would free up ${money((r.budget ?? 0) - (r.suggested ?? 0))}.`;
}

export function BudgetsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const cats = useQuery(categoriesQuery);
  const sug = useQuery(budgetSuggestionsQuery);
  const spending = useQuery(spendingQuery);
  // Budgets changed but not saved yet: category id → cents a month, or null for no budget.
  const [draft, setDraft] = useState<Record<number, number | null>>({});
  const [text, setText] = useState<Record<number, string>>({});
  const [name, setName] = useState("");

  const save = useMutation({
    mutationFn: async (budgets: Record<number, number | null>) => {
      const all = cats.data?.categories ?? [];
      for (const [id, budget] of Object.entries(budgets)) {
        const c = all.find((x) => x.id === Number(id));
        if (c) await apiSend("PUT", `categories/${c.id}`, { name: c.name, kind: c.kind, budget });
      }
    },
    onSuccess: (_r, budgets) => refresh(qc).then(() => budgets),
  });
  const add = useMutation({
    mutationFn: () => apiSend("POST", "categories", { name, kind: "spending", budget: null }),
    onSuccess: () => {
      setName("");
      void refresh(qc);
    },
  });
  const removeRule = useMutation({
    mutationFn: (id: number) => apiSend("DELETE", `merchant-rules/${id}`),
    onSuccess: () => refresh(qc),
  });

  if (cats.isError) return <ErrorText>{errorMessage(cats.error)}</ErrorText>;
  if (!cats.data || !sug.data) return <Loading />;

  const usual = Object.fromEntries(sug.data.categories.map((r) => [r.id, r]));
  const month = spending.data?.month;
  const spentNow = Object.fromEntries((month?.categories ?? []).map((c) => [c.id, c.spent]));
  const rows = cats.data.categories
    .filter((c) => c.kind === "spending")
    .sort((a, b) => (usual[b.id]?.average ?? -1) - (usual[a.id]?.average ?? -1));
  const budgetOf = (id: number, saved: number | null) => (id in draft ? draft[id] : saved);
  const budgeted = rows.reduce((t, c) => t + (budgetOf(c.id, c.budget) ?? 0), 0);
  const usuallySpent = rows.reduce((t, c) => t + (usual[c.id]?.average ?? 0), 0);
  const everySuggestion = rows.reduce((t, c) => t + (usual[c.id]?.suggested ?? 0), 0);
  const allowance = month?.allowance ?? null;
  const mismatched = sug.data.categories.filter(
    (r) => r.note && r.suggested != null && budgetOf(r.id, r.budget) === r.budget,
  );
  const changed = rows.filter((c) => c.id in draft && draft[c.id] !== c.budget);

  const set = (id: number, budget: number | null) => {
    setDraft((d) => ({ ...d, [id]: budget }));
    setText((t) => ({ ...t, [id]: editable(budget) }));
  };
  const saveAll = () => {
    const before = Object.fromEntries(changed.map((c) => [c.id, c.budget]));
    const after = Object.fromEntries(changed.map((c) => [c.id, draft[c.id]]));
    save.mutate(after, {
      onSuccess: () => {
        setDraft({});
        setText({});
        toast(changed.length === 1 ? `${changed[0].name}'s budget saved` : `${changed.length} budgets saved`, () =>
          save.mutate(before),
        );
      },
    });
  };

  // The budgets as a bar against the spending month: each category its own segment.
  const scale = Math.max(allowance ?? 0, budgeted, usuallySpent, 1);
  const segments: Segment[] = rows
    .filter((c) => (budgetOf(c.id, c.budget) ?? 0) > 0)
    .map((c, i) => ({
      value: budgetOf(c.id, c.budget) ?? 0,
      role: (["spending", "bills", "savings", "offset", "invest", "accent"] as const)[i % 6],
    }));

  return (
    <>
      <div className="flex flex-col gap-3">
        <Link to="/spending" className="self-start text-[14px] font-semibold text-teal no-underline">
          ← Spending
        </Link>
        <h1 className="m-0 text-[28px] font-semibold tracking-tight">Budgets</h1>
      </div>

      <EntityHero
        tint="spending"
        label="Budgets in a sentence"
        numbers={[
          {
            label: "Budgeted",
            value: money(budgeted),
            note: `${rows.filter((c) => budgetOf(c.id, c.budget)).length} categories`,
          },
          { label: "Spending month", value: allowance != null ? money(allowance) : "—", note: "what Spending gets" },
          {
            label: "Usually spent",
            value: money(usuallySpent),
            note: sug.data.months ? `a month, since ${monthYear(sug.data.from?.slice(0, 7))}` : "not enough yet",
          },
          { label: "Every suggestion", value: money(everySuggestion), note: "if you used them all" },
        ]}
      >
        <p className="m-0 text-[17px] leading-relaxed text-ink">
          Budgets add up to <b>{money(budgeted)}</b>
          {allowance != null
            ? budgeted <= allowance
              ? ` of the ${money(allowance)} spending month, leaving ${money(allowance - budgeted)} for everything else.`
              : ` of the ${money(allowance)} spending month: ${money(budgeted - allowance)} more than there is.`
            : "."}{" "}
          A usual month is {money(usuallySpent)}.
        </p>
        <Bar
          segments={segments}
          max={scale}
          height={14}
          marker={allowance ?? undefined}
          label={`Budgets ${money(budgeted)}${allowance != null ? ` against the ${money(allowance)} spending month` : ""}`}
        />
      </EntityHero>

      {mismatched.length > 0 && (
        <Card aria-labelledby="bud-mis">
          <CardHead
            id="bud-mis"
            title={
              mismatched.length === 1
                ? "One budget doesn't match what's usually spent"
                : `${mismatched.length} budgets don't match what's usually spent`
            }
            right={
              <Button small onClick={() => mismatched.forEach((r) => set(r.id, r.suggested))}>
                {mismatched.length === 1 ? "Use it" : `Use these ${mismatched.length}`}
              </Button>
            }
          />
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[14px] text-ink-2">
            {mismatched.map((r) => (
              <li key={r.id}>{mismatchText(r, sug.data.months)}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card aria-labelledby="bud-all">
        <CardHead id="bud-all" title="Every category" right={<span className="text-[13px] text-ink-3">a month</span>} />
        <div className="hidden grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_150px_44px] gap-3 px-1 text-[12px] font-semibold tracking-[0.06em] text-ink-3 uppercase sm:grid">
          <span>Category</span>
          <span className="text-right">This month</span>
          <span className="text-right">Usual</span>
          <span className="text-right">Suggested</span>
          <span className="text-right">Budget</span>
          <span />
        </div>
        <div className="flex flex-col">
          {rows.map((c) => {
            const u = usual[c.id];
            const b = budgetOf(c.id, c.budget);
            const dirty = c.id in draft && draft[c.id] !== c.budget;
            return (
              <div
                key={c.id}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_150px] items-center gap-x-3 gap-y-1 border-t border-line px-1 py-2.5 sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_150px_44px]",
                  dirty && "bg-teal/5",
                )}
              >
                <Link
                  to="/spending/$categoryId"
                  params={{ categoryId: String(c.id) }}
                  className="min-w-0 truncate font-semibold text-ink no-underline hover:text-teal"
                >
                  {c.name}
                  {u?.note && (
                    <span className="ml-2 text-[12px] font-normal text-warn">
                      {u.note === "over" ? "often over" : "well under"}
                    </span>
                  )}
                </Link>
                <span className="num hidden text-right sm:block">{money(spentNow[c.id] ?? 0)}</span>
                <span className="num hidden text-right text-ink-2 sm:block">{u ? money(u.average) : "—"}</span>
                <span className="hidden text-right sm:block">
                  {u?.suggested != null && u.suggested !== b ? (
                    <button
                      type="button"
                      onClick={() => set(c.id, u.suggested)}
                      className="press num cursor-pointer border-0 bg-transparent p-0 font-semibold text-teal"
                      title={`Use ${money(u.suggested)}`}
                    >
                      Use {money(u.suggested)}
                    </button>
                  ) : (
                    <span className="num text-ink-3">{u?.suggested != null ? money(u.suggested) : "—"}</span>
                  )}
                </span>
                <Input
                  aria-label={`${c.name} budget`}
                  inputMode="decimal"
                  className="num text-right"
                  placeholder="No budget"
                  value={c.id in text ? text[c.id] : editable(c.budget)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setText((t) => ({ ...t, [c.id]: v }));
                    const cents = v.trim() ? parseMoney(v) : null;
                    if (cents !== null || !v.trim()) setDraft((d) => ({ ...d, [c.id]: cents }));
                  }}
                />
                <span className="hidden justify-end sm:flex">
                  {b != null && (
                    <button
                      type="button"
                      aria-label={`Take away ${c.name}'s budget`}
                      onClick={() => set(c.id, null)}
                      className="press size-11 cursor-pointer rounded-full border-0 bg-transparent text-ink-3 hover:text-bad"
                    >
                      ✕
                    </button>
                  )}
                </span>
                <span className="col-span-2 text-[12px] text-ink-3 sm:hidden">
                  {money(spentNow[c.id] ?? 0)} this month · usually {u ? money(u.average) : "—"}
                  {u?.suggested != null && u.suggested !== b && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        onClick={() => set(c.id, u.suggested)}
                        className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-teal"
                      >
                        Use {money(u.suggested)}
                      </button>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 border-t border-line pt-3">
          <Input
            className="font-sans"
            placeholder="A new category"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>
            Add
          </Button>
        </div>
        {(save.isError || add.isError) && <ErrorText>{errorMessage(save.error ?? add.error)}</ErrorText>}
      </Card>

      <Details label="Merchants remembered">
        <div className="flex flex-col">
          {(cats.data.merchant_rules ?? []).map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 border-t border-line py-1.5 text-[13px]">
              <span className="mono">{r.pattern}</span>
              <span className="flex items-center gap-2 text-ink-2">
                {r.category}
                <Button small aria-label={`Forget ${r.pattern}`} onClick={() => removeRule.mutate(r.id)}>
                  ✕
                </Button>
              </span>
            </div>
          ))}
          {!cats.data.merchant_rules?.length && (
            <div className="text-[13px] text-ink-3">None yet: choose Remember when sorting.</div>
          )}
        </div>
      </Details>

      {changed.length > 0 && (
        <div className="sticky bottom-[92px] z-20 flex items-center justify-between gap-3 rounded-[20px] border border-line-2 bg-tile/95 px-4 py-3 shadow-[var(--shadow-float)] backdrop-blur sm:bottom-4">
          <span className="text-[14px]">
            {changed.length} {changed.length === 1 ? "change" : "changes"} · budgets would add up to {money(budgeted)}
          </span>
          <span className="flex gap-2">
            <Button
              onClick={() => {
                setDraft({});
                setText({});
              }}
            >
              Discard
            </Button>
            <Button primary disabled={save.isPending} onClick={saveAll}>
              {save.isPending ? "Saving…" : `Save ${changed.length} ${changed.length === 1 ? "change" : "changes"}`}
            </Button>
          </span>
        </div>
      )}
    </>
  );
}
