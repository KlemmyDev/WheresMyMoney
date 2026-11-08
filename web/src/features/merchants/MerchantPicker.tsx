/**
 * Choose the merchant a statement name belongs to (or, with `merge`, the merchant to fold some into): type to find one,
 * or name a new one. Every transaction with that statement name, or under those merchants, follows, past and future.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { businessesQuery, merchantDirectoryQuery, refresh } from "~/features/common/queries";
import { sameName } from "~/features/merchants/names";
import { money } from "~/features/common/format";
import { Button, ErrorText, Input, Segmented } from "~/features/common/ui";
import { MerchantMark } from "~/features/spending/MerchantIcon";

export function MerchantPicker({
  text = "",
  current,
  merge,
  payment,
  onDone,
}: {
  /** The statement name being placed. */
  text?: string;
  /** The merchant it belongs to now (left out of the choices). */
  current?: string;
  /** Merchant keys to merge into the one chosen, instead of placing a statement name. */
  merge?: string[];
  /** A payment that doesn't say who it was to (BPAY): place just it, or every one of its amount. `single`: only
   * ever this one (a line with no name to go on, or a transfer). */
  payment?: { id: number; amount: number; single?: boolean };
  /** Called with the merchant chosen, or nothing when cancelled. */
  onDone: (key?: string) => void;
}) {
  const qc = useQueryClient();
  const all = useQuery(merchantDirectoryQuery);
  const known = useQuery(businessesQuery);
  const [find, setFind] = useState("");
  const [chosen, setScope] = useState<"amount" | "this">("amount");
  const scope = payment?.single ? "this" : chosen;
  const assign = useMutation({
    mutationFn: (body: { key?: string; name?: string }) =>
      merge
        ? apiSend<{ key: string }>("POST", "merchants/merge", { from: merge, into: body.key, name: body.name })
        : payment
          ? apiSend<{ key: string }>("POST", "merchants/assign", { transaction_id: payment.id, scope, ...body })
          : apiSend<{ key: string }>("POST", "merchants/assign", { text, ...body }),
    onSuccess: (r) => {
      refresh(qc);
      onDone(r.key);
    },
  });
  const needle = find.trim().toLowerCase();
  const choices = (all.data ?? [])
    .filter((m) => m.key !== current && !merge?.includes(m.key))
    .filter((m) => !needle || m.name.toLowerCase().includes(needle) || m.key.toLowerCase().includes(needle))
    .slice(0, needle ? 8 : 5);
  // A merchant by that name already (or the same key): pick it rather than make a second one.
  const exact = (all.data ?? []).some((m) => sameName(find, m));
  // Businesses the app knows that aren't merchants here yet: picking one gives its mark, name and category.
  const have = new Set((all.data ?? []).map((m) => m.key));
  const businesses = needle
    ? (known.data ?? [])
        .filter((b) => !have.has(b.key) && b.key !== current)
        .filter((b) => b.name.toLowerCase().includes(needle) || b.key.toLowerCase().includes(needle))
        .slice(0, 5)
    : [];
  const knownExact = businesses.some((b) => sameName(find, b));
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-tile-2 p-2.5">
      {payment && !payment.single && (
        <Segmented
          label="Which payments"
          value={scope}
          options={[
            { value: "amount", label: `Every BPAY of ${money(Math.abs(payment.amount), { cents: true })}` },
            { value: "this", label: "Just this one" },
          ]}
          onChange={setScope}
        />
      )}
      <Input
        autoFocus
        aria-label="Find or name a merchant"
        placeholder={merge ? "Merge into… (find one, or type a new name)" : "Find a merchant, or type a new name"}
        value={find}
        onChange={(e) => setFind(e.target.value)}
      />
      <div className="flex flex-col">
        {choices.map((m) => (
          <button
            key={m.key}
            type="button"
            disabled={assign.isPending}
            onClick={() => assign.mutate({ key: m.key })}
            className="press flex min-h-11 min-w-0 cursor-pointer items-center gap-2.5 rounded-xl border-0 bg-transparent px-1.5 text-left text-ink hover:bg-tile"
          >
            <MerchantMark name={m.key} size="md" />
            <span className="min-w-0 flex-1 truncate">{m.name}</span>
            <span className="flex-none text-[12px] text-ink-3">{m.count} visits</span>
          </button>
        ))}
        {businesses.map((b) => (
          <button
            key={b.key}
            type="button"
            disabled={assign.isPending}
            onClick={() => assign.mutate({ key: b.key })}
            className="press flex min-h-11 min-w-0 cursor-pointer items-center gap-2.5 rounded-xl border-0 bg-transparent px-1.5 text-left text-ink hover:bg-tile"
          >
            <MerchantMark name={b.key} size="md" />
            <span className="min-w-0 flex-1 truncate">{b.name}</span>
            <span className="flex-none text-[12px] text-ink-3">{b.category}</span>
          </button>
        ))}
        {needle && exact && (
          <span className="px-1.5 py-1.5 text-[12px] text-ink-3">
            There's already a merchant called that: pick it above rather than making a second one.
          </span>
        )}
        {needle && !exact && !knownExact && (
          <button
            type="button"
            disabled={assign.isPending}
            onClick={() => assign.mutate({ name: find.trim() })}
            className="press flex min-h-11 min-w-0 cursor-pointer items-center gap-2.5 rounded-xl border-0 bg-transparent px-1.5 text-left text-teal hover:bg-tile"
          >
            <MerchantMark name={find.trim()} size="md" />
            <span className="min-w-0 flex-1 truncate font-semibold">New merchant “{find.trim()}”</span>
          </button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-[12px] text-ink-3">
          {merge
            ? `All their transactions and statement names move into the one you pick.`
            : payment?.single
              ? "Only this transaction."
              : payment
                ? scope === "amount"
                  ? `This one, and every BPAY of that amount from now on.`
                  : `Only this payment. Other BPAY payments stay as they are.`
                : `Every “${text}” transaction moves with it.`}
        </span>
        <Button small onClick={() => onDone()}>
          Cancel
        </Button>
      </div>
      {assign.isError && <ErrorText>{errorMessage(assign.error)}</ErrorText>}
    </div>
  );
}
