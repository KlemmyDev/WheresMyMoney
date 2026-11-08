/**
 * A merchant's own details and sorting: a note ("car insurance for the Mazda"), its default category, and rules by how
 * much was spent ("over $30 at 7-Eleven is fuel, otherwise eating out"). Rules are tried top to bottom before the
 * default. Saving re-sorts the merchant's transactions that weren't sorted by hand.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { CategoryPicker } from "~/features/common/CategoryPicker";
import { Card, CardHead } from "~/features/common/ds";
import { money, parseMoney } from "~/features/common/format";
import { useToast } from "~/features/common/overlay";
import { categoriesQuery, refresh } from "~/features/common/queries";
import type { MerchantDetail } from "~/features/common/types";
import { Button, ErrorText, Input, Segmented } from "~/features/common/ui";

type Rule = { over: boolean; amount: string; category_id: number | null };

const KINDS = ["spending", "bills"] as const;

export function MerchantSettings({ d }: { d: MerchantDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const cats = useQuery(categoriesQuery);
  const [note, setNote] = useState(d.settings.note);
  const [category, setCategory] = useState<number | null>(d.settings.category_id);
  const [rules, setRules] = useState<Rule[]>(
    d.settings.rules.map((r) => ({ over: r.over, amount: (r.amount / 100).toString(), category_id: r.category_id })),
  );
  const categories = cats.data?.categories ?? [];
  const nameOf = (id: number | null) => categories.find((c) => c.id === id)?.name ?? "a category";
  const bad = rules.find((r) => !(parseMoney(r.amount) ?? 0) || r.category_id == null);
  const save = useMutation({
    mutationFn: () =>
      apiSend<{ changed: number }>("PUT", `merchants/settings/${encodeURIComponent(d.key)}`, {
        note,
        category_id: category,
        rules: rules.map((r) => ({ over: r.over, amount: parseMoney(r.amount), category_id: r.category_id })),
      }),
    onSuccess: (r) => {
      refresh(qc);
      toast(r.changed ? `Saved. ${r.changed} ${r.changed === 1 ? "transaction" : "transactions"} re-sorted` : "Saved");
    },
  });
  const set = (i: number, patch: Partial<Rule>) =>
    setRules((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <Card aria-labelledby="mp-set" className="flex flex-col gap-4">
      <CardHead id="mp-set" title="Details and sorting" />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="mp-note" className="text-[12px] font-semibold text-ink-2">
          Note
        </label>
        <Input
          id="mp-note"
          value={note}
          maxLength={200}
          placeholder="What it's for, e.g. car insurance for the Mazda"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold text-ink-2">Usually</span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-56">
            <CategoryPicker
              value={category}
              categories={categories}
              kinds={KINDS}
              label={`Default category for ${d.name}`}
              placeholder="No default"
              className={
                category == null
                  ? "border-dashed border-line-2 bg-transparent text-ink-3 hover:bg-transparent"
                  : undefined
              }
              onChange={(id) => setCategory(id)}
            />
          </div>
          <span className="text-[13px] text-ink-3">
            {category != null
              ? `Spending at ${d.name} goes to ${nameOf(category)} unless a rule below says otherwise.`
              : "Without a default, it's sorted the way you've sorted it before."}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-semibold text-ink-2">By how much is spent</span>
        {rules.length === 0 && (
          <p className="m-0 text-[13px] text-ink-3">
            For a place you go for different things: over $30 at a servo is probably fuel, under is a drink and a snack.
          </p>
        )}
        {rules.map((r, i) => (
          <div
            key={i}
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-tile-2 px-3 py-2.5"
          >
            <span className="text-[14px]">If it's</span>
            <Segmented
              label="Over or under"
              value={r.over ? "over" : "under"}
              options={[
                { value: "over", label: "over" },
                { value: "under", label: "under" },
              ]}
              onChange={(v) => set(i, { over: v === "over" })}
            />
            <div className="relative w-[104px]">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3">$</span>
              <Input
                inputMode="decimal"
                aria-label="Amount"
                value={r.amount}
                onChange={(e) => set(i, { amount: e.target.value })}
                className="pl-6"
              />
            </div>
            <span className="text-[14px]">it's</span>
            <div className="w-full sm:w-48">
              <CategoryPicker
                value={r.category_id}
                categories={categories}
                kinds={KINDS}
                allowClear={false}
                label={`Category when ${r.over ? "over" : "under"} ${r.amount ? money(parseMoney(r.amount)) : "the amount"}`}
                onChange={(id) => set(i, { category_id: id })}
              />
            </div>
            <span className="flex-1" />
            <Button small onClick={() => setRules((rs) => rs.filter((_, k) => k !== i))}>
              Remove
            </Button>
          </div>
        ))}
        <div>
          <Button small onClick={() => setRules((rs) => [...rs, { over: true, amount: "30", category_id: null }])}>
            Add a rule
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button primary disabled={save.isPending || !!bad} onClick={() => save.mutate()}>
          Save
        </Button>
        <span className="text-[13px] text-ink-3">
          {bad
            ? "Each rule needs an amount and a category."
            : "Re-sorts its transactions, except ones you sorted yourself, bills and splits."}
        </span>
      </div>
      {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
    </Card>
  );
}
