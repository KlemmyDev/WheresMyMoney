/**
 * Adding a transaction by hand (the uplift canvas's SfAdd): one sheet. What happened (a spend, income, or a transfer
 * between accounts), the amount on the number pad, where (with recent places a tap away), when, the category (guessed
 * from where it was, as last time) and which account. Add closes the sheet with a toast and Undo. A statement import
 * later matches it to the bank's row, so it never counts twice.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { CategoryPicker } from "~/features/common/CategoryPicker";
import { ChoiceChip, Keypad, Sheet } from "~/features/common/ds";
import { money, todayIso } from "~/features/common/format";
import { Chip, I, type Glyph, type Tone } from "~/features/common/icons";
import { useToast } from "~/features/common/overlay";
import { accountsQuery, categoriesQuery, merchantDirectoryQuery, refresh } from "~/features/common/queries";
import type { Account, Transaction } from "~/features/common/types";
import { Button, ErrorText, Input, Switch, cn } from "~/features/common/ui";

type Kind = "spend" | "income" | "transfer";

const KINDS: { k: Kind; label: string; sub: string; g: Glyph; tone: Tone }[] = [
  { k: "spend", label: "Spend", sub: "Money out", g: I.spending, tone: "spending" },
  { k: "income", label: "Income", sub: "Pay, refunds, gifts", g: I.pay, tone: "savings" },
  { k: "transfer", label: "Transfer", sub: "Between accounts", g: I.transfer, tone: "offset" },
];

const ACCOUNT_LOOK: Record<string, { g: Glyph; tone: Tone }> = {
  offset: { g: I.offset, tone: "offset" },
  bills: { g: I.bills, tone: "bills" },
  spending: { g: I.spending, tone: "spending" },
  savings: { g: I.savings, tone: "savings" },
  track: { g: I.accounts, tone: "neutral" },
};

const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function AddSpending({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Add a transaction">
      {open && <AddForm onClose={onClose} />}
    </Sheet>
  );
}

function AccountChips({
  accounts,
  value,
  onChange,
  label,
}: {
  accounts: Account[];
  value: number | null;
  onChange: (id: number) => void;
  label: string;
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="eyebrow mb-2">{label}</legend>
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {accounts.map((a) => {
          const l = ACCOUNT_LOOK[a.role] ?? ACCOUNT_LOOK.track;
          return (
            <ChoiceChip
              key={a.id}
              pressed={value === a.id}
              onClick={() => onChange(a.id)}
              g={l.g}
              tone={l.tone}
              role={l.tone === "neutral" ? "accent" : (l.tone as "offset")}
            >
              {a.name}
            </ChoiceChip>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Mounted each time the sheet opens, so it starts empty. */
function AddForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const accounts = useQuery(accountsQuery);
  const categories = useQuery(categoriesQuery);
  const directory = useQuery(merchantDirectoryQuery);
  const toast = useToast();
  const [kind, setKind] = useState<Kind>("spend");
  const [entry, setEntry] = useState("");
  const [what, setWhat] = useState("");
  const [date, setDate] = useState(todayIso());
  const [category, setCategory] = useState<number | null>(null);
  const [cash, setCash] = useState(false);
  const [fromId, setFrom] = useState<number | null>(null);
  const [toId, setTo] = useState<number | null>(null);
  const [changingCategory, setChangingCategory] = useState(false);

  const banks = (accounts.data?.accounts ?? []).filter((a) => a.kind === "bank");
  const from =
    fromId ?? (banks.find((a) => a.role === (kind === "income" ? "offset" : "spending")) ?? banks[0])?.id ?? null;
  const to =
    toId ??
    banks.find((a) => a.id !== from && a.role === "savings")?.id ??
    banks.find((a) => a.id !== from)?.id ??
    null;
  const cents = Math.round(Number(entry || "0") * 100);
  const cats = (categories.data?.categories ?? []).filter((c) =>
    kind === "income" ? c.kind === "income" : c.kind === "spending" || c.kind === "bills",
  );
  // The everyday ones as chips (budgeted, or income's first few); the rest from the picker.
  const chips = (kind === "income" ? cats : cats.filter((c) => c.budget)).slice(0, 8);
  if (category != null && !chips.some((c) => c.id === category)) {
    const picked = cats.find((c) => c.id === category);
    if (picked) chips.push(picked);
  }
  const transferCat = categories.data?.categories.find((c) => c.kind === "transfer")?.id ?? null;
  const name = (id: number | null) => banks.find((a) => a.id === id)?.name ?? "";
  const shownAmount = entry
    ? entry.split(".")[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (entry.includes(".") ? `.${entry.split(".")[1]}` : "")
    : "0";

  // Places spent at lately, newest first, and the category each was sorted into last time.
  const places = (directory.data ?? [])
    .filter((m) => m.direction === "out")
    .sort((a, b) => b.last.localeCompare(a.last));
  const known = places.find((m) => m.name.toLowerCase() === what.trim().toLowerCase());
  const guessName = kind === "spend" ? (known?.default_category ?? known?.category ?? null) : null;
  const guessed = guessName ? (cats.find((c) => c.name === guessName)?.id ?? null) : null;
  const chosen = category ?? guessed;
  const canAdd =
    cents > 0 &&
    (kind === "transfer"
      ? from != null && to != null && from !== to
      : kind === "spend"
        ? !!what.trim() && chosen != null
        : true);

  const save = useMutation({
    mutationFn: async () => {
      if (kind === "transfer") {
        if (from == null || to == null || from === to) throw new Error("Choose two different accounts.");
        const out = await apiSend<Transaction>("POST", "transactions", {
          account_id: from,
          amount: -cents,
          description: what || `Transfer to ${name(to)}`,
          category_id: transferCat,
          date,
        });
        const into = await apiSend<Transaction>("POST", "transactions", {
          account_id: to,
          amount: cents,
          description: what || `Transfer from ${name(from)}`,
          category_id: transferCat,
          date,
        });
        return [out, into];
      }
      const desc = what || cats.find((c) => c.id === chosen)?.name || (kind === "income" ? "Income" : "Spending");
      return [
        await apiSend<Transaction>("POST", "transactions", {
          account_id: from,
          amount: kind === "income" ? cents : -cents,
          description: desc,
          category_id: chosen,
          cash: kind === "spend" && cash,
          date,
        }),
      ];
    },
    onSuccess: (txs) => {
      refresh(qc);
      onClose();
      const catName = cats.find((c) => c.id === chosen)?.name;
      const said =
        kind === "transfer"
          ? `Moved ${money(cents, { cents: true })} from ${name(from)} to ${name(to)}`
          : kind === "income"
            ? `Added ${money(cents, { cents: true })} into ${name(from)}${catName ? ` · ${catName}` : ""}`
            : `Added ${money(cents, { cents: true })} · ${what.trim()}${catName ? `, ${catName}` : ""}`;
      toast(date === todayIso() ? said : `${said}, ${date === yesterday() ? "yesterday" : date}`, async () => {
        for (const t of txs) await apiSend("DELETE", `transactions/${t.id}`);
        refresh(qc);
      });
    },
  });

  return (
    <form
      className="flex flex-col gap-5 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (canAdd) save.mutate();
      }}
    >
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="What happened">
        {KINDS.map((k) => (
          <button
            key={k.k}
            type="button"
            aria-pressed={kind === k.k}
            onClick={() => {
              setKind(k.k);
              setCategory(null);
              setChangingCategory(false);
              setFrom(null);
            }}
            className="chip-host press flex cursor-pointer flex-col items-start gap-2 rounded-[18px] border border-line bg-tile-2 p-3 text-left text-ink aria-pressed:border-line-2 aria-pressed:bg-raised"
          >
            <Chip g={k.g} tone={k.tone} size="md" />
            <span>
              <span className="block text-[14px] font-semibold">{k.label}</span>
              <span className="hidden text-[12px] text-ink-3 sm:block">{k.sub}</span>
            </span>
          </button>
        ))}
      </div>

      <div>
        <div
          className="flex h-[84px] items-center justify-center gap-1 rounded-[20px] border bg-sunken"
          style={{ borderColor: "color-mix(in srgb, var(--color-accent) 35%, var(--color-line))" }}
        >
          <span className="text-[24px] text-ink-3">$</span>
          <span className={cn("num text-[40px] leading-none", !entry && "text-ink-3")} aria-live="polite">
            {shownAmount}
          </span>
        </div>
        {/* The number pad; on a desktop the number keys type into the field too. */}
        <label className="sr-only" htmlFor="as-amount">
          Amount
        </label>
        <Input
          id="as-amount"
          inputMode="decimal"
          autoComplete="off"
          className="mx-auto mt-2 hidden max-w-[220px] text-center sm:block"
          value={entry}
          onChange={(e) => setEntry(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="Type the amount"
        />
        <div className="mt-3 sm:mx-auto sm:max-w-[360px]">
          <Keypad value={entry} onChange={setEntry} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <label className="flex flex-col gap-2">
            <span className="eyebrow">
              {kind === "spend" ? "Where" : kind === "income" ? "What" : "Note (optional)"}
            </span>
            <Input
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              placeholder={kind === "income" ? "Pay, a refund…" : kind === "transfer" ? "Optional" : "Woolworths"}
            />
          </label>
          {kind === "spend" && !known && places.length > 0 && (
            <div role="group" aria-label="Recent places" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
              {places.slice(0, 6).map((m) => (
                <ChoiceChip key={m.key} pressed={false} onClick={() => setWhat(m.name)}>
                  {m.name}
                </ChoiceChip>
              ))}
            </div>
          )}
        </div>
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="eyebrow mb-2">When</legend>
          <div className="flex gap-2">
            <ChoiceChip pressed={date === todayIso()} onClick={() => setDate(todayIso())}>
              Today
            </ChoiceChip>
            <ChoiceChip pressed={date === yesterday()} onClick={() => setDate(yesterday())}>
              Yesterday
            </ChoiceChip>
            <Input
              type="date"
              aria-label="Another day"
              max={todayIso()}
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="min-w-0 flex-1"
            />
          </div>
        </fieldset>
      </div>

      {kind === "spend" && guessed != null && category == null && !changingCategory ? (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-tile-2 px-3.5 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{cats.find((c) => c.id === guessed)?.name}</span>
            <span className="block text-[13px] text-ink-3">Guessed from {known?.name}, as last time</span>
          </span>
          <Button small onClick={() => setChangingCategory(true)}>
            Change
          </Button>
        </div>
      ) : (
        kind !== "transfer" && (
          <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
            <legend className="eyebrow mb-2">Category</legend>
            <div className="flex flex-wrap gap-2">
              {chips.map((c) => (
                <ChoiceChip
                  key={c.id}
                  pressed={category === c.id}
                  onClick={() => setCategory(category === c.id ? null : c.id)}
                  role={kind === "income" ? "savings" : "spending"}
                >
                  {c.name}
                </ChoiceChip>
              ))}
              <div className="w-40">
                <CategoryPicker
                  label="Another category"
                  value={chips.some((c) => c.id === category) ? null : category}
                  categories={categories.data?.categories ?? []}
                  kinds={kind === "income" ? ["income"] : ["spending", "bills"]}
                  placeholder="More…"
                  className="min-h-11 rounded-full border-line-2 bg-transparent text-[14px] text-ink-2"
                  onChange={(c) => setCategory(c)}
                />
              </div>
            </div>
          </fieldset>
        )
      )}

      <AccountChips
        accounts={banks}
        value={from}
        onChange={setFrom}
        label={kind === "income" ? "Into" : kind === "transfer" ? "From" : "From"}
      />
      {kind === "transfer" && (
        <AccountChips accounts={banks.filter((a) => a.id !== from)} value={to} onChange={setTo} label="To" />
      )}

      {kind === "spend" && (
        <label className="flex items-center gap-3 rounded-2xl border border-line p-3.5">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Paid in cash</span>
            <span className="block text-[13px] text-ink-3">
              From a wallet, so the account's balance stays as it is.
            </span>
          </span>
          <Switch checked={cash} onChange={setCash} label="Paid in cash" />
        </label>
      )}

      <p className="m-0 text-[13px] text-ink-3">
        {kind === "transfer"
          ? "The next statement import matches both sides, so the move never counts twice."
          : "The next statement import matches it, so it never counts twice."}
      </p>

      {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
      <div className="flex gap-2">
        <Button type="button" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button primary type="submit" className="min-h-12 flex-[2] text-[15px]" disabled={!canAdd || save.isPending}>
          {cents ? `Add ${money(cents, { cents: true })}` : "Add"}
        </Button>
      </div>
    </form>
  );
}
