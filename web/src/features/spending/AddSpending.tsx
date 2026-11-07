/**
 * Adding a transaction by hand (the canvas's "Add a transaction"): what happened (spent, income, or a transfer
 * between accounts), the amount on a number pad (typed on a desktop), what it was, when, its category, which account,
 * and what safe to spend becomes. Then "Added", with Undo, as a hand entry can be taken back. A statement import later
 * matches it to the bank's row, so it won't count twice.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { CategoryPicker } from "~/features/common/CategoryPicker";
import { ChoiceChip, Keypad, Sheet, useSheetTop } from "~/features/common/ds";
import { dayDate, money, todayIso } from "~/features/common/format";
import { Chip, I, type Glyph, type Tone } from "~/features/common/icons";
import { accountsQuery, categoriesQuery, refresh, spendingQuery } from "~/features/common/queries";
import type { Account, Transaction } from "~/features/common/types";
import { Button, ErrorText, Input, Switch, cn } from "~/features/common/ui";

type Kind = "spend" | "income" | "transfer";

const KINDS: { k: Kind; label: string; sub: string; g: Glyph; tone: Tone }[] = [
  { k: "spend", label: "Spent", sub: "Money out", g: I.spending, tone: "spending" },
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
  const spending = useQuery(spendingQuery);
  const [kind, setKind] = useState<Kind>("spend");
  const [entry, setEntry] = useState("");
  const [what, setWhat] = useState("");
  const [date, setDate] = useState(todayIso());
  const [category, setCategory] = useState<number | null>(null);
  const [cash, setCash] = useState(false);
  const [fromId, setFrom] = useState<number | null>(null);
  const [toId, setTo] = useState<number | null>(null);
  const [added, setAdded] = useState<Transaction[] | null>(null);
  // Safe to spend as it was worked out when it was added (the month refetches with the spend already in it).
  const [safeThen, setSafeThen] = useState<number | null>(null);
  const top = useSheetTop<HTMLElement>(!!added);

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

  // What safe to spend becomes, when it's spending from the spending account.
  const month = spending.data?.month;
  const affectsSafe =
    month && kind !== "income" && from === month.account_id && !cash && date >= month.start && cents > 0;
  const safeAfter = month ? month.safe_per_day - (affectsSafe ? cents / Math.max(month.remaining, 1) : 0) : null;

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
      const desc = what || cats.find((c) => c.id === category)?.name || (kind === "income" ? "Income" : "Spending");
      return [
        await apiSend<Transaction>("POST", "transactions", {
          account_id: from,
          amount: kind === "income" ? cents : -cents,
          description: desc,
          category_id: category,
          cash: kind === "spend" && cash,
          date,
        }),
      ];
    },
    onSuccess: (txs) => {
      setSafeThen(affectsSafe && safeAfter != null ? safeAfter : null);
      setAdded(txs);
      refresh(qc);
    },
  });

  const undo = useMutation({
    mutationFn: async () => {
      for (const t of added ?? []) await apiSend("DELETE", `transactions/${t.id}`);
    },
    onSuccess: () => {
      setAdded(null);
      refresh(qc);
    },
  });

  if (added) {
    const k = KINDS.find((x) => x.k === kind)!;
    return (
      <div
        ref={top as React.RefObject<HTMLDivElement>}
        className="flex flex-col items-center gap-3 pt-2 pb-2 text-center"
      >
        <Chip g={k.g} tone={k.tone} size="xxl" solid />
        <h3 className="m-0 text-[22px] font-semibold">
          {money(cents, { cents: true })}{" "}
          {kind === "transfer" ? `moved to ${name(to)}` : kind === "income" ? `in to ${name(from)}` : "added"}
        </h3>
        <p className="m-0 max-w-[400px] text-[14px] text-ink-2">
          {kind === "spend" && cash
            ? "Paid in cash, so the account's balance stays as it is."
            : "The next statement import looks for a match and merges it, so it won't count twice."}
          {safeThen != null && ` Safe to spend is now ${money(Math.max(safeThen, 0))} a day.`}
        </p>
        {undo.isError && <ErrorText>{errorMessage(undo.error)}</ErrorText>}
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button onClick={() => undo.mutate()} disabled={undo.isPending}>
            Undo
          </Button>
          <Button
            onClick={() => {
              setAdded(null);
              setEntry("");
              setWhat("");
              setCategory(null);
            }}
          >
            Add another
          </Button>
          <Button primary onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      ref={top as React.RefObject<HTMLFormElement>}
      className="flex flex-col gap-5 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (cents) save.mutate();
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
        {/* The number pad on a phone; a desktop types into the field instead. */}
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
        <div className="mt-3 sm:hidden">
          <Keypad value={entry} onChange={setEntry} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="eyebrow">Description</span>
          <Input
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            placeholder={kind === "income" ? "Pay, a refund…" : kind === "transfer" ? "Optional" : "Woolworths"}
          />
        </label>
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

      {kind !== "transfer" && (
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

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl bg-sunken p-3.5">
          <div className="eyebrow">When</div>
          <div className="text-[15px]">{date === todayIso() ? "Today" : dayDate(date)}</div>
          <div className="text-[13px] text-ink-3">Saved as entered by hand</div>
        </div>
        {month && safeAfter != null ? (
          <div className="rounded-2xl bg-sunken p-3.5">
            <div className="eyebrow">Safe to spend after</div>
            <div className="num text-[20px]" style={{ color: safeAfter < 0 ? "var(--color-bad)" : undefined }}>
              {money(Math.max(safeAfter, 0))}
            </div>
            <div className="text-[13px] text-ink-3">a day, for the {month.remaining} days left</div>
          </div>
        ) : (
          <span />
        )}
      </div>

      {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
      <div className="flex gap-2">
        <Button type="button" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button primary type="submit" className="min-h-12 flex-[2] text-[15px]" disabled={!cents || save.isPending}>
          {cents ? `Add ${money(cents, { cents: true })}` : "Add"}
        </Button>
      </div>
    </form>
  );
}
