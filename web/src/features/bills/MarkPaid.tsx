/**
 * Mark a bill paid by hand (the uplift canvas's SfBill): one tap records the payment of its amount, today, and a toast
 * offers Undo. A bill whose amount varies asks for what was paid first. Once paid, it says so.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { editable, money, parseMoney } from "~/features/common/format";
import { useToast } from "~/features/common/overlay";
import { refresh } from "~/features/common/queries";
import type { Due } from "~/features/common/types";
import { Button, Input, Pill } from "~/features/common/ui";

type Paid = { transaction_id: number; amount: number };

export function MarkPaid({ due, primary }: { due: Due; primary?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const varies = due.how === "estimate";
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState(editable(due.amount));
  const undo = useMutation({
    mutationFn: (id: number) => apiSend("DELETE", `transactions/${id}`),
    onSuccess: () => refresh(qc),
  });
  const pay = useMutation({
    mutationFn: (amount: number) => apiSend<Paid>("POST", `bills/${due.bill_id}/pay`, { amount }),
    onSuccess: (p) => {
      refresh(qc);
      setAsking(false);
      toast(`${due.name} paid, ${money(p.amount, { cents: true })}`, () => undo.mutate(p.transaction_id));
    },
    onError: (e) => toast(errorMessage(e)),
  });
  if (due.paid) return <Pill tone="good">Paid</Pill>;
  if (asking) {
    const cents = parseMoney(text);
    return (
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="text-ink-3">
          $
        </span>
        <Input
          aria-label={`What was paid for ${due.name}`}
          inputMode="decimal"
          className="num w-24 text-right"
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && cents && pay.mutate(cents)}
        />
        <Button
          small={!primary}
          primary={primary}
          disabled={!cents || pay.isPending}
          onClick={() => cents && pay.mutate(cents)}
        >
          Paid
        </Button>
      </span>
    );
  }
  return (
    <Button
      small={!primary}
      primary={primary}
      disabled={pay.isPending}
      onClick={() => (varies ? setAsking(true) : pay.mutate(due.amount))}
      aria-label={`Mark ${due.name} paid`}
    >
      Mark paid
    </Button>
  );
}
