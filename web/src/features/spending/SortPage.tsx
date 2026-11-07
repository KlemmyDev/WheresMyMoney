/**
 * Sorting a long history a merchant at a time (the canvas's "Sort imported"): every merchant with transactions not
 * sorted yet (or sorted only by a suggestion), biggest first, each as a card with its likely categories as chips.
 * Choosing one remembers it for the merchant and sorts the rest of its transactions, and every import after.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { CategoryPicker } from "~/features/common/CategoryPicker";
import { Card, ChoiceChip, EmptyState, Stat } from "~/features/common/ds";
import { money, monthYear } from "~/features/common/format";
import { Chip, I } from "~/features/common/icons";
import { useToast } from "~/features/common/overlay";
import { categoriesQuery, merchantsQuery, refresh } from "~/features/common/queries";
import type { Category, MerchantGroup } from "~/features/common/types";
import { Button, ErrorText, PageHead, Pill, Segmented } from "~/features/common/ui";

const span = (g: MerchantGroup) => {
  const a = monthYear(g.first.slice(0, 7));
  const b = monthYear(g.last.slice(0, 7));
  return a === b ? a : `${a} – ${b}`;
};

export function SortPage() {
  const [show, setShow] = useState<"needs" | "all">("needs");
  const all = show === "all";
  const q = useQuery(merchantsQuery(all));
  const cats = useQuery(categoriesQuery);
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const sort = useMutation({
    mutationFn: ({ g, category_id }: { g: MerchantGroup; category_id: number }) =>
      apiSend<{ changed: number; pattern: string }>("POST", "merchants/sort", {
        transaction_id: g.transaction_id,
        category_id,
      }),
    onSuccess: (r, { category_id }) => {
      refresh(qc);
      const name = cats.data?.categories.find((c) => c.id === category_id)?.name;
      toast(`${r.pattern} is ${name} from now on${r.changed ? ` · ${r.changed} sorted` : ""}`);
    },
  });
  const groups = q.data ?? [];
  const categories = cats.data?.categories ?? [];
  const ready = groups.filter((g) => !g.unsorted && g.category_id != null && !g.remembered);
  const unsorted = groups.reduce((s, g) => s + g.unsorted, 0);
  // The everyday categories, offered as chips on every card.
  const everyday = categories.filter((c) => c.kind === "spending" && c.budget).slice(0, 5);

  const confirmAll = async () => {
    setBusy(true);
    try {
      for (const g of ready) {
        await apiSend("POST", "merchants/sort", { transaction_id: g.transaction_id, category_id: g.category_id });
      }
      toast(`${ready.length} merchants remembered`);
    } finally {
      setBusy(false);
      refresh(qc);
    }
  };

  return (
    <>
      <PageHead
        over="Money · Spending"
        title="Sort by merchant"
        actions={
          <Segmented
            label="Show"
            options={[
              { value: "needs", label: "Needs sorting" },
              { value: "all", label: "Every merchant" },
            ]}
            value={show}
            onChange={setShow}
          />
        }
      />
      <Card lit className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Chip g={I.sort} tone="grad" size="xl" solid />
          <div className="min-w-0">
            <h2 className="m-0 text-[20px] font-semibold">Sort imported</h2>
            <p className="m-0 text-[13px] text-ink-3">
              Not counted in any category until sorted. Choose one and it's remembered for the merchant: its other
              transactions are sorted now, and new ones on every import.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:w-[360px]">
          <Stat
            label="Not sorted"
            value={unsorted}
            note={`across ${groups.filter((g) => g.unsorted).length} merchants`}
            role="bills"
          />
          <Stat label="To confirm" value={ready.length} note="sorted by a suggestion" role="accent" />
        </div>
      </Card>
      {ready.length > 0 && !all && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-line bg-tile px-4 py-3">
          <span className="text-[14px] text-ink-2">
            {ready.length} merchants were sorted by a suggestion. Confirm them so they're remembered.
          </span>
          <Button primary disabled={busy} onClick={confirmAll}>
            {busy ? "Remembering…" : `Confirm all ${ready.length}`}
          </Button>
        </div>
      )}
      {q.isError && <ErrorText>{errorMessage(q.error)}</ErrorText>}
      {sort.isError && <ErrorText>{errorMessage(sort.error)}</ErrorText>}
      {q.data && !groups.length ? (
        <EmptyState g={I.sort} tone="savings" title="All sorted">
          Every merchant is sorted and remembered. New ones from the next import will show up here.
        </EmptyState>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups.map((g) => (
            <MerchantCard
              key={g.pattern}
              g={g}
              categories={categories}
              everyday={everyday}
              onSort={(c) => sort.mutate({ g, category_id: c })}
            />
          ))}
        </div>
      )}
    </>
  );
}

function MerchantCard({
  g,
  categories,
  everyday,
  onSort,
}: {
  g: MerchantGroup;
  categories: Category[];
  everyday: Category[];
  onSort: (category: number) => void;
}) {
  const current = g.category_id ?? g.suggest_id;
  const offered = [...categories.filter((c) => c.id === current), ...everyday.filter((c) => c.id !== current)].slice(
    0,
    5,
  );
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Chip g={g.received && !g.spent ? I.pay : I.spending} tone={g.unsorted ? "bills" : "neutral"} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold">{g.pattern}</span>
            {g.unsorted ? (
              <Pill tone="warn">{g.unsorted} not sorted</Pill>
            ) : g.remembered ? (
              <Pill tone="good">Remembered</Pill>
            ) : (
              <Pill tone="info">Suggested</Pill>
            )}
          </div>
          <div className="truncate text-[13px] text-ink-3">
            {g.example} · {span(g)}
            {g.categories.length > 1 ? ` · now in ${g.categories.map((c) => c.name).join(", ")}` : ""}
          </div>
        </div>
        <div className="flex-none text-right">
          <div className="num text-[15px]">{g.spent ? money(g.spent) : `+${money(g.received)}`}</div>
          <div className="text-[12px] text-ink-3">{g.count}×</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Category for ${g.pattern}`}>
        {offered.map((c) => (
          <ChoiceChip
            key={c.id}
            pressed={g.remembered && g.category_id === c.id}
            onClick={() => onSort(c.id)}
            role="spending"
          >
            {c.id === current && !g.remembered ? `✓ ${c.name}` : c.name}
          </ChoiceChip>
        ))}
        <div className="w-36">
          <CategoryPicker
            label={`Another category for ${g.pattern}`}
            value={offered.some((c) => c.id === g.category_id) ? null : g.category_id}
            categories={categories}
            allowClear={false}
            placeholder="More…"
            className="min-h-11 rounded-full border-line-2 bg-transparent text-[14px] text-ink-2"
            onChange={(v) => v != null && v !== g.category_id && onSort(v)}
          />
        </div>
      </div>
    </Card>
  );
}
