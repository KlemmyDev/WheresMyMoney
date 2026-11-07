/**
 * Sorting a long history a merchant at a time: every merchant with transactions not sorted yet (or sorted only by a
 * suggestion), biggest first. Choosing a category remembers it for the merchant and sorts the rest of its
 * transactions, and every import after.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { money, monthYear } from "~/features/common/format";
import { useToast } from "~/features/common/overlay";
import { categoriesQuery, merchantsQuery, refresh } from "~/features/common/queries";
import type { Category, MerchantGroup } from "~/features/common/types";
import { Button, ErrorText, PageHead, Pill, Tile, TileTitle, cn } from "~/features/common/ui";

const KIND_LABEL: Record<string, string> = {
  spending: "Spending",
  bills: "Bills",
  income: "Money in",
  transfer: "Between accounts",
};

const span = (g: MerchantGroup) => {
  const a = monthYear(g.first.slice(0, 7));
  const b = monthYear(g.last.slice(0, 7));
  return a === b ? a : `${a} – ${b}`;
};

export function SortPage() {
  const [all, setAll] = useState(false);
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
        over={
          <>
            <Link to="/spending" className="text-ink-3 no-underline hover:text-ink">
              SPENDING
            </Link>{" "}
            › {groups.length} MERCHANTS
          </>
        }
        title="Sort by merchant"
        actions={
          <div role="group" aria-label="Show" className="inline-flex rounded-lg border border-line bg-tile p-[3px]">
            {(
              [
                [false, "Needs sorting"],
                [true, "Every merchant"],
              ] as const
            ).map(([v, l]) => (
              <button
                key={l}
                type="button"
                aria-pressed={all === v}
                onClick={() => setAll(v)}
                className={cn(
                  "press min-h-8 cursor-pointer rounded-md border-0 px-3 text-[13px]",
                  all === v ? "bg-raised text-ink" : "bg-transparent text-ink-3",
                )}
              >
                {l}
              </button>
            ))}
          </div>
        }
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
        <Tile i={0}>
          <div className="tt">Not sorted yet</div>
          <div className="mono text-[26px] font-semibold text-warn">{unsorted}</div>
          <div className="text-xs text-ink-3">
            transactions, across {groups.filter((g) => g.unsorted).length} merchants
          </div>
        </Tile>
        <Tile i={1}>
          <div className="tt">Sorted by a suggestion</div>
          <div className="mono text-[26px] font-semibold">{ready.length}</div>
          <div className="text-xs text-ink-3">merchants to confirm, so they&apos;re remembered</div>
          {ready.length > 0 && !all && (
            <div>
              <Button small primary disabled={busy} onClick={confirmAll}>
                {busy ? "Remembering…" : `Confirm all ${ready.length}`}
              </Button>
            </div>
          )}
        </Tile>
      </div>
      <Tile i={2} aria-labelledby="so-list">
        <TileTitle id="so-list">Merchants</TileTitle>
        <div className="text-[13px] text-ink-2">
          Choose a category and it&apos;s remembered for the merchant: its other transactions are sorted now, and new
          ones on every import. Anything you sorted one at a time stays as you chose.
        </div>
        {q.isError && <ErrorText>{errorMessage(q.error)}</ErrorText>}
        {sort.isError && <ErrorText>{errorMessage(sort.error)}</ErrorText>}
        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            {groups.map((g) => (
              <Row key={g.pattern} g={g} categories={categories} onSort={(c) => sort.mutate({ g, category_id: c })} />
            ))}
          </div>
        </div>
        {q.data && !groups.length && (
          <div className="py-4 text-ink-3">
            Every merchant is sorted and remembered. New ones from the next import will show up here.
          </div>
        )}
      </Tile>
    </>
  );
}

function Row({
  g,
  categories,
  onSort,
}: {
  g: MerchantGroup;
  categories: Category[];
  onSort: (category: number) => void;
}) {
  const current = g.category_id ?? g.suggest_id;
  const [pick, setPick] = useState<number | null>(current);
  const status = g.unsorted ? (
    <Pill tone="warn">{g.unsorted} NOT SORTED</Pill>
  ) : g.remembered ? (
    <Pill tone="good">REMEMBERED</Pill>
  ) : (
    <Pill tone="info">SUGGESTED</Pill>
  );
  const kinds = Object.keys(KIND_LABEL);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_70px_100px_180px_88px] items-center gap-3 border-t border-line py-2.5 text-[13px] first:border-t-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="mono font-medium">{g.pattern}</span>
          {status}
        </div>
        <div className="truncate text-xs text-ink-3">
          {g.example} · {span(g)}
          {g.categories.length > 1 ? ` · now in ${g.categories.map((c) => c.name).join(", ")}` : ""}
        </div>
      </div>
      <div className="mono text-right text-ink-2">{g.count}×</div>
      <div className="mono text-right">
        {g.spent ? money(g.spent) : ""}
        {g.received ? <div className="text-good">+{money(g.received)}</div> : null}
      </div>
      <select
        aria-label={`Category for ${g.pattern}`}
        className="min-h-8 rounded-md border border-line bg-raised px-2 text-xs text-ink"
        value={pick ?? ""}
        onChange={(e) => {
          const v = e.target.value ? Number(e.target.value) : null;
          setPick(v);
          if (v != null && v !== current) onSort(v);
        }}
      >
        <option value="">Choose…</option>
        {kinds.map((k) => (
          <optgroup key={k} label={KIND_LABEL[k]}>
            {categories
              .filter((c) => c.kind === k)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.id === g.suggest_id && c.id !== g.category_id ? " (suggested)" : ""}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {pick != null && (pick === current || !g.unsorted) && !g.remembered ? (
        <Button small onClick={() => onSort(pick)}>
          Looks right
        </Button>
      ) : (
        <span />
      )}
    </div>
  );
}
