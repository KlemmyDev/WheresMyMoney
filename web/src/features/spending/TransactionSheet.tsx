/**
 * One transaction, as a sheet (the canvas's "A transaction" flow): what it was, its category (tap to change, and
 * optionally remember it for the merchant), a note, and delete. Only what was typed in can be deleted; a statement's
 * rows are the bank's, so the sheet says so instead. Deleting asks first.
 */
import { MerchantIcon, MerchantMark } from "~/features/spending/MerchantIcon";
import { MerchantPicker } from "~/features/merchants/MerchantPicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { ChoiceChip, Sheet } from "~/features/common/ds";
import { longDate, money, parseMoney } from "~/features/common/format";
import { Chip, I } from "~/features/common/icons";
import { useToast } from "~/features/common/overlay";
import { billsQuery, categoriesQuery, refresh } from "~/features/common/queries";
import { BillDialog } from "~/features/bills/BillsPage";
import { CategoryPicker } from "~/features/common/CategoryPicker";
import type { Category, Transaction } from "~/features/common/types";
import { Button, ErrorText, Input, Pill, Switch, cn } from "~/features/common/ui";

const HOW: Record<Transaction["kind"], [string, "teal" | "info" | "warn"]> = {
  manual: ["Entered", "teal"],
  cash: ["Cash", "teal"],
  statement: ["Imported", "info"],
  adjustment: ["Balance correction", "warn"],
};

export function TransactionSheet({ tx, onClose }: { tx: Transaction | null; onClose: () => void }) {
  return (
    <Sheet open={!!tx} onClose={onClose} title={tx ? tx.merchant || tx.description : ""}>
      {tx && <Body key={tx.id} tx={tx} onClose={onClose} />}
    </Sheet>
  );
}

function Body({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const cats = useQuery(categoriesQuery);
  const [cat, setCat] = useState(tx.category_id);
  const [always, setAlways] = useState(true);
  const [note, setNote] = useState(tx.note ?? "");
  const [confirm, setConfirm] = useState(false);
  const [mode, setMode] = useState<"view" | "split">("view");
  const [splits, setSplits] = useState(tx.splits ?? []);
  const [excluded, setExcluded] = useState(!!tx.excluded);
  const [oneOff, setOneOff] = useState(!!tx.one_off);
  const [picking, setPicking] = useState(false);
  const [making, setMaking] = useState(false);
  const bills = useQuery(billsQuery);
  // Unlinking shows straight away, before the list comes back.
  const [unlinked, setUnlinked] = useState<number | null>(null);
  const bill =
    tx.bill_id != null && unlinked !== tx.bill_id ? bills.data?.bills.find((b) => b.id === tx.bill_id) : undefined;
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiSend<Transaction>("PUT", `transactions/${tx.id}`, body),
    onSuccess: (t) => {
      setSplits(t.splits ?? []);
      refresh(qc);
    },
  });
  const del = useMutation({
    mutationFn: () => apiSend("DELETE", `transactions/${tx.id}`),
    onSuccess: () => {
      refresh(qc);
      toast(`${tx.merchant || tx.description} deleted`);
      onClose();
    },
  });
  const [how, tone] = tx.merged ? (["Matched", "good"] as const) : HOW[tx.kind];
  const spend = (cats.data?.categories ?? []).filter((c) => c.kind !== "income" && c.kind !== "transfer");
  const removable = tx.kind !== "statement";
  if (mode === "split")
    return (
      <SplitEditor
        total={Math.abs(tx.amount)}
        start={splits}
        current={cat}
        categories={spend}
        pending={save.isPending}
        error={save.isError ? errorMessage(save.error) : null}
        onCancel={() => setMode("view")}
        onSave={(parts) => save.mutate({ splits: parts }, { onSuccess: () => setMode("view") })}
      />
    );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1.5 text-center">
        {tx.amount < 0 && tx.merchant_key && tx.category_kind !== "transfer" ? (
          <MerchantMark name={tx.merchant_key} size="xl" />
        ) : (
          <Chip
            g={tx.amount > 0 ? I.pay : I.spending}
            tone={tx.amount > 0 ? "savings" : "spending"}
            size="xl"
            round
            solid
          />
        )}
        <span className="num mt-1 text-[34px] leading-10 text-ink">
          {money(tx.amount, { cents: true, sign: true })}
        </span>
        <span className="text-[13px] text-ink-3">
          {longDate(tx.date)}
          {tx.who ? ` · ${tx.who}` : ""}
        </span>
        <span className="flex gap-1.5">
          <Pill tone={tone}>{how}</Pill>
          {tx.category_by === "rule" && <Pill tone="good">Sorted by a rule</Pill>}
        </span>
      </div>
      {tx.description !== tx.merchant && (
        <div className="mono rounded-xl border border-line bg-tile-2 px-3.5 py-2.5 text-[12px] text-ink-3">
          {tx.description}
        </div>
      )}
      {tx.amount < 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
            Category · tap to change
          </div>
          {splits.length > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-tile-2 px-3.5 py-3">
              <Chip g={I.spending} tone="grad" size="md" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">Split</span>
                <span className="block text-[12px] text-ink-3">
                  {splits.map((p) => `${p.category} ${money(p.amount, { cents: true })}`).join(" · ")}
                </span>
              </span>
              <Button small onClick={() => setMode("split")}>
                Change
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {[...spend.filter((c) => c.id === cat), ...spend.filter((c) => c.budget && c.id !== cat)]
              .slice(0, 9)
              .map((c) => (
                <ChoiceChip
                  key={c.id}
                  pressed={!splits.length && cat === c.id}
                  onClick={() => {
                    setCat(c.id);
                    save.mutate({ category_id: c.id, always });
                  }}
                >
                  {c.name}
                </ChoiceChip>
              ))}
            <div className="w-40">
              <CategoryPicker
                label="Another category"
                value={null}
                categories={spend}
                placeholder="More…"
                allowClear={false}
                className="min-h-11 rounded-full border-line-2 bg-transparent text-[14px] text-ink-2"
                onChange={(c) => {
                  if (c == null) return;
                  setCat(c);
                  save.mutate({ category_id: c, always });
                }}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-tile-2 px-3.5 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">
                Sort every {tx.remember_as || "one like it"} this way
              </span>
              <span className="block text-[12px] text-ink-3">Makes a rule for future imports</span>
            </span>
            <Switch checked={always} onChange={setAlways} label="Remember for this merchant" />
          </div>
        </div>
      )}
      {tx.amount < 0 && tx.kind !== "adjustment" && (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-tile-2 px-3.5 py-3">
          <Chip g={I.bills} tone="bills" size="md" />
          {bill ? (
            <>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">Part of the {bill.name} bill</span>
                <button
                  type="button"
                  className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-ink-3 underline"
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate(
                      { bill_id: null },
                      { onSuccess: () => (setUnlinked(bill.id), toast(`No longer part of ${bill.name}`)) },
                    )
                  }
                >
                  Not part of this bill
                </button>
              </span>
              <Link
                to="/bills/$billId"
                params={{ billId: String(bill.id) }}
                className="inline-flex min-h-[34px] items-center rounded-[10px] px-3 text-[13px] font-medium text-ink no-underline shadow-[inset_0_0_0_1px_var(--color-line-2)]"
              >
                See the bill
              </Link>
            </>
          ) : (
            <>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">Comes out regularly?</span>
                <span className="block text-[12px] text-ink-3">
                  Make it a bill to plan for it and see what it costs.
                </span>
              </span>
              <Button small onClick={() => setMaking(true)}>
                Make it a bill
              </Button>
            </>
          )}
        </div>
      )}
      <BillDialog bill={making ? "new" : null} fromTx={making ? tx : null} onClose={() => setMaking(false)} />
      <label className="flex items-center gap-3 rounded-2xl border border-line bg-tile-2 px-3.5 py-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">
            {tx.amount < 0 ? "Someone's paying us back" : "This is someone paying us back"}
          </span>
          <span className="block text-[12px] text-ink-3">
            {excluded
              ? tx.amount < 0
                ? "Not counted as spending, and the money counts as coming back; mark their payment the same way when it lands."
                : "Not counted as income: it squares up what was spent for them."
              : tx.amount < 0
                ? "Counted in this month's spending."
                : "Counted as money in."}
          </span>
        </span>
        <Switch
          checked={excluded}
          onChange={(v) => {
            setExcluded(v);
            save.mutate({ excluded: v });
          }}
          label="Someone's paying us back"
        />
      </label>
      {tx.merchant && tx.merchant_key && tx.amount < 0 && tx.category_kind !== "transfer" && (
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-tile-2 px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <MerchantMark name={tx.merchant_key} size="md" />
            <span className="min-w-0 flex-1">
              <span className={cn("block text-[12px]", tx.merchant_key === "BPAY" ? "text-warn" : "text-ink-3")}>
                {tx.merchant_key === "BPAY" ? "Who was this BPAY to?" : "Merchant"}
              </span>
              <Link
                to="/merchants/$key"
                params={{ key: tx.merchant_key }}
                onClick={onClose}
                className="block truncate text-[14px] font-semibold text-ink no-underline hover:text-teal"
              >
                {tx.merchant_name} →
              </Link>
              {tx.merchant_note && <span className="block truncate text-[12px] text-ink-3">{tx.merchant_note}</span>}
            </span>
            <Button small onClick={() => setPicking((p) => !p)}>
              {picking ? "Close" : tx.merchant_key === "BPAY" ? "Say who" : "Change"}
            </Button>
          </div>
          {picking && (
            <MerchantPicker
              text={tx.merchant}
              current={tx.merchant_key}
              payment={tx.merchant_unnamed ? { id: tx.id, amount: tx.amount } : undefined}
              onDone={() => setPicking(false)}
            />
          )}
        </div>
      )}
      {tx.amount < 0 && !excluded && (
        <label className="flex items-center gap-3 rounded-2xl border border-line bg-tile-2 px-3.5 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">A one-off</span>
            <span className="block text-[12px] text-ink-3">
              {oneOff
                ? "Still counted this month, but the forecast won't expect it again."
                : "Something that won't happen again, like a birthday party? Mark it so the forecast doesn't learn from it."}
            </span>
          </span>
          <Switch
            checked={oneOff}
            onChange={(v) => {
              setOneOff(v);
              save.mutate({ one_off: v });
            }}
            label="A one-off"
          />
        </label>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tx-note" className="text-[12px] font-semibold text-ink-2">
          Note
        </label>
        <Input
          id="tx-note"
          className="font-sans"
          placeholder="e.g. includes a birthday present"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (tx.note ?? "") && save.mutate({ note })}
        />
      </div>
      {(save.isError || del.isError) && <ErrorText>{errorMessage(save.error ?? del.error)}</ErrorText>}
      {confirm ? (
        <div
          role="alertdialog"
          aria-label="Delete this transaction?"
          className="flex flex-col gap-2.5 rounded-2xl border border-bad/50 bg-bad/8 p-3.5"
        >
          <span className="font-semibold">
            Delete {money(tx.amount, { cents: true, sign: true })} at {tx.merchant || tx.description}?
          </span>
          <span className="text-[13px] text-ink-3">
            What you can spend and the balance update straight away. This can't be undone.
          </span>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
            <Button
              className="flex-1 border-transparent bg-bad text-white enabled:hover:bg-bad"
              disabled={del.isPending}
              onClick={() => del.mutate()}
            >
              Delete
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {removable ? (
            <Button className="text-bad" onClick={() => setConfirm(true)}>
              Delete
            </Button>
          ) : (
            <span className="basis-full text-[12px] text-ink-3 sm:flex-1 sm:basis-auto">
              From a statement, so it stays. Change its category instead.
            </span>
          )}
          <span className="flex-1" />
          {tx.amount < 0 && <Button onClick={() => setMode("split")}>Split it</Button>}
          <Button primary onClick={onClose}>
            Done
          </Button>
        </div>
      )}
    </div>
  );
}

type Part = { category_id: number | null; text: string };

/** Split a transaction across categories: parts that must add up to the whole. */
function SplitEditor({
  total,
  start,
  current,
  categories,
  pending,
  error,
  onCancel,
  onSave,
}: {
  total: number;
  start: Transaction["splits"];
  current: number | null;
  categories: Category[];
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (parts: { category_id: number; amount: number }[]) => void;
}) {
  const [parts, setParts] = useState<Part[]>(() =>
    start.length
      ? start.map((p) => ({ category_id: p.category_id, text: (p.amount / 100).toFixed(2) }))
      : [
          { category_id: current, text: (total / 100).toFixed(2) },
          { category_id: null, text: "" },
        ],
  );
  const cents = parts.map((p) => parseMoney(p.text) ?? 0);
  const left = total - cents.reduce((a, b) => a + b, 0);
  const ok = left === 0 && parts.every((p, i) => p.category_id != null && cents[i] > 0);
  const set = (i: number, patch: Partial<Part>) =>
    setParts((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const even = () => {
    const each = Math.floor(total / parts.length);
    setParts((ps) =>
      ps.map((p, j) => ({
        ...p,
        text: ((j === ps.length - 1 ? total - each * (ps.length - 1) : each) / 100).toFixed(2),
      })),
    );
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 text-[18px] font-semibold">Split {money(total, { cents: true })}</h3>
        <Button small onClick={even}>
          Split evenly
        </Button>
      </div>
      <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
        {parts.map((p, i) => (
          <li key={i} className="flex items-center gap-2 rounded-2xl border border-line bg-tile-2 p-2.5">
            <span className="mono flex size-7 flex-none items-center justify-center rounded-full bg-raised text-[12px] text-ink-2">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <CategoryPicker
                label={`Part ${i + 1} category`}
                value={p.category_id}
                categories={categories}
                kinds={["spending", "bills"]}
                allowClear={false}
                onChange={(c) => set(i, { category_id: c })}
              />
            </div>
            <Input
              aria-label={`Part ${i + 1} amount`}
              inputMode="decimal"
              className="w-24 flex-none text-right"
              placeholder="0.00"
              value={p.text}
              onChange={(e) => set(i, { text: e.target.value.replace(/[^0-9.]/g, "") })}
            />
            {parts.length > 2 && (
              <button
                type="button"
                aria-label={`Remove part ${i + 1}`}
                onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))}
                className="flex size-9 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-3"
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ol>
      <Button
        onClick={() => setParts((ps) => [...ps, { category_id: null, text: left > 0 ? (left / 100).toFixed(2) : "" }])}
      >
        Add a part
      </Button>
      <div
        className="text-center text-[14px] font-semibold"
        style={{ color: left === 0 ? "var(--color-savings)" : "var(--color-bills)" }}
        aria-live="polite"
      >
        {left === 0
          ? `All ${money(total, { cents: true })} assigned`
          : left > 0
            ? `${money(left, { cents: true })} still to assign`
            : `${money(-left, { cents: true })} too much`}
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex gap-2">
        {start.length > 0 && (
          <Button onClick={() => onSave([])} disabled={pending}>
            Undo split
          </Button>
        )}
        <span className="flex-1" />
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          primary
          disabled={!ok || pending}
          onClick={() => onSave(parts.map((p, i) => ({ category_id: p.category_id!, amount: cents[i] })))}
        >
          Save split
        </Button>
      </div>
    </div>
  );
}

const ROW_HOW: Partial<Record<Transaction["kind"], [string, "teal" | "info" | "mute"]>> = {
  manual: ["By hand", "info"],
  cash: ["Cash", "mute"],
  adjustment: ["Correction", "teal"],
};

/** One transaction in a list, to tap for its sheet: what, when, its category (or split), and how it got here. */
export function TxRow({
  tx,
  onOpen,
  sub,
}: {
  tx: Transaction;
  onOpen: (t: Transaction) => void;
  /** The second line before the category (the date, or the account). */
  sub: string;
}) {
  const how = tx.merged ? (["Matched", "good"] as const) : ROW_HOW[tx.kind];
  const category = tx.splits?.length
    ? `Split: ${tx.splits.map((p) => p.category).join(", ")}`
    : (tx.category ?? (tx.kind === "adjustment" ? null : "Not sorted"));
  return (
    <button
      type="button"
      onClick={() => onOpen(tx)}
      className="chip-host press flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-2xl border-0 bg-transparent px-1.5 text-left text-ink hover:bg-tile-2"
    >
      <MerchantIcon tx={tx} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{tx.merchant || tx.description}</span>
        <span className="block truncate text-[13px] text-ink-3">
          {[sub, category].filter(Boolean).join(" · ")}
          {tx.note ? ` · ${tx.note}` : ""}
        </span>
      </span>
      <span className="flex flex-none flex-col items-end gap-1">
        <span
          className={`num ${tx.amount > 0 ? "text-good" : ""} ${tx.excluded ? "text-ink-3 line-through decoration-1" : ""}`}
        >
          {money(tx.amount, { cents: true, sign: true })}
        </span>
        <span className="flex gap-1">
          {tx.excluded && <Pill tone="teal">Paid back</Pill>}
          {tx.one_off && !tx.excluded && <Pill tone="mute">One-off</Pill>}
          {tx.splits?.length > 0 && <Pill tone="mute">Split</Pill>}
          {how && <Pill tone={how[1]}>{how[0]}</Pill>}
        </span>
      </span>
    </button>
  );
}
