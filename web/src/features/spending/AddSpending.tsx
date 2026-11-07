/**
 * Adding spending by hand (the phone prototype's sheet): the amount on a keypad, what it was, a category chip, and
 * whether it was cash. Saving says so in a toast with Undo, as a hand entry can be taken back; a statement import
 * later matches it to the bank's row and keeps the note.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { money } from "~/features/common/format";
import { Dialog, useToast } from "~/features/common/overlay";
import { accountsQuery, categoriesQuery, refresh } from "~/features/common/queries";
import { CategoryPicker } from "~/features/common/CategoryPicker";
import type { Transaction } from "~/features/common/types";
import { Button, ErrorText, Input, Label, Option, Select, cn } from "~/features/common/ui";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];

export function AddSpending({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="as-h">
      <AddSpendingForm onClose={onClose} />
    </Dialog>
  );
}

/** Mounted each time the sheet opens, so it starts empty. */
function AddSpendingForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const accounts = useQuery(accountsQuery);
  const categories = useQuery(categoriesQuery);
  const [entry, setEntry] = useState("");
  const [what, setWhat] = useState("");
  const [category, setCategory] = useState<number | null>(null);
  const [cash, setCash] = useState(false);
  const [note, setNote] = useState("");
  const [chosen, setAccount] = useState<number | null>(null);
  const banks = accounts.data?.accounts ?? [];
  const account = chosen ?? (banks.find((a) => a.role === "spending") ?? banks[0])?.id ?? null;

  const press = (k: string) =>
    setEntry((v) => {
      if (k === "del") return v.slice(0, -1);
      if (k === ".") return v.includes(".") ? v : (v || "0") + ".";
      if (v.includes(".") && v.split(".")[1].length >= 2) return v;
      if (v.replace(".", "").length >= 8) return v;
      return (v === "0" ? "" : v) + k;
    });
  const cents = Math.round(Number(entry || "0") * 100);

  const save = useMutation({
    mutationFn: () =>
      apiSend<Transaction>("POST", "transactions", {
        account_id: account,
        amount: -cents,
        description: what || categories.data?.categories.find((c) => c.id === category)?.name || "Spending",
        category_id: category,
        cash,
        note,
      }),
    onSuccess: (tx) => {
      refresh(qc);
      onClose();
      toast(`Saved ${money(cents, { cents: true })}`, async () => {
        await apiSend("DELETE", `transactions/${tx.id}`);
        refresh(qc);
      });
    },
  });

  const spendingCats = (categories.data?.categories ?? []).filter((c) => c.kind === "spending");
  // The budgeted ones as chips (the everyday ones); the rest, and a new one, from the picker.
  const chips = spendingCats.filter((c) => c.budget || c.id === category).slice(0, 8);
  const shown = entry
    ? entry.split(".")[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (entry.includes(".") ? "." + entry.split(".")[1] : "")
    : "0";

  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-5 pt-3 pb-5 sm:pt-6">
      <h2 id="as-h" className="m-0 text-lg font-semibold">
        Add spending
      </h2>
      <div className="py-2 text-center">
        <div
          className="mono text-[40px] leading-none font-semibold"
          aria-live="polite"
          style={{ color: entry ? "var(--color-ink)" : "var(--color-ink-3)" }}
        >
          ${shown}
        </div>
        <label className="sr-only" htmlFor="as-amount">
          Amount
        </label>
        {/* The keypad on a phone; a desktop can type into the field instead. */}
        <Input
          id="as-amount"
          inputMode="decimal"
          className="mx-auto mt-2 hidden max-w-[200px] text-center sm:block"
          value={entry}
          onChange={(e) => setEntry(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.00"
        />
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:hidden">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            aria-label={k === "del" ? "Delete" : k}
            className="press mono min-h-[50px] cursor-pointer rounded-lg border-0 bg-raised text-[22px] font-medium text-ink hover:bg-[#243040]"
          >
            {k === "del" ? "⌫" : k}
          </button>
        ))}
      </div>
      <div>
        <Label htmlFor="as-what">What was it?</Label>
        <Input
          id="as-what"
          className="font-sans"
          value={what}
          onChange={(e) => setWhat(e.target.value)}
          placeholder="Woolworths"
        />
      </div>
      <div role="group" aria-label="Category" className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={category === c.id}
            onClick={() => setCategory(category === c.id ? null : c.id)}
            className={cn(
              "press min-h-[38px] cursor-pointer rounded-full border px-3 text-[13px] font-medium",
              category === c.id ? "border-teal bg-teal text-page" : "border-line bg-raised text-ink",
            )}
          >
            {c.name}
          </button>
        ))}
        <div className="w-40">
          <CategoryPicker
            label="Another category"
            value={chips.some((c) => c.id === category) ? null : category}
            categories={categories.data?.categories ?? []}
            kinds={["spending"]}
            placeholder="More…"
            className="min-h-[38px] rounded-full border-line bg-raised text-[13px] text-ink"
            onChange={(c) => setCategory(c)}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="as-acct">From</Label>
          <Select id="as-acct" value={account ?? ""} onChange={(e) => setAccount(Number(e.target.value))}>
            {banks.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="as-note">Note</Label>
          <Input
            id="as-note"
            className="font-sans"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional"
          />
        </div>
      </div>
      <Option role="checkbox" on={cash} onClick={() => setCash((c) => !c)} title="Paid in cash">
        It came from your wallet, so the account's balance stays as it is.
      </Option>
      {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button
          primary
          className="min-h-12 flex-[2] text-[15px]"
          disabled={!cents || save.isPending}
          onClick={() => save.mutate()}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
