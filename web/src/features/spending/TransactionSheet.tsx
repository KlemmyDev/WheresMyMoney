/**
 * One transaction, as a sheet (the canvas's "A transaction" flow): what it was, its category (tap to change, and
 * optionally remember it for the merchant), a note, and delete. Only what was typed in can be deleted; a statement's
 * rows are the bank's, so the sheet says so instead. Deleting asks first.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { ChoiceChip, Sheet } from "~/features/common/ds";
import { longDate, money } from "~/features/common/format";
import { Chip, I } from "~/features/common/icons";
import { useToast } from "~/features/common/overlay";
import { categoriesQuery, refresh } from "~/features/common/queries";
import type { Transaction } from "~/features/common/types";
import { Button, ErrorText, Input, Pill, Switch } from "~/features/common/ui";

const HOW: Record<Transaction["kind"], [string, "teal" | "info" | "warn"]> = {
  manual: ["Entered", "teal"],
  cash: ["Cash", "teal"],
  statement: ["Imported", "info"],
  adjustment: ["Balance adjustment", "warn"],
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
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiSend("PUT", `transactions/${tx.id}`, body),
    onSuccess: () => refresh(qc),
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
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <Chip
          g={tx.amount > 0 ? I.pay : I.spending}
          tone={tx.amount > 0 ? "savings" : "spending"}
          size="xl"
          round
          solid
        />
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
          <div className="flex flex-wrap gap-2">
            {spend.map((c) => (
              <ChoiceChip
                key={c.id}
                pressed={cat === c.id}
                onClick={() => {
                  setCat(c.id);
                  save.mutate({ category_id: c.id, always });
                }}
              >
                {c.name}
              </ChoiceChip>
            ))}
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
            Safe to spend and the balance update straight away. This can't be undone.
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
        <div className="flex items-center gap-2">
          {removable ? (
            <Button className="text-bad" onClick={() => setConfirm(true)}>
              Delete
            </Button>
          ) : (
            <span className="flex-1 text-[12px] text-ink-3">
              From a statement, so it stays. Change its category instead.
            </span>
          )}
          <span className="flex-1" />
          <Button primary onClick={onClose}>
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
