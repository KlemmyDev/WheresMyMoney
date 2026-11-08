/**
 * Choose the merchant a statement name belongs to: type to find one, or name a new one. Every transaction with that
 * statement name follows, past and future.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { merchantDirectoryQuery, refresh } from "~/features/common/queries";
import { Button, ErrorText, Input } from "~/features/common/ui";
import { MerchantMark } from "~/features/spending/MerchantIcon";

export function MerchantPicker({
  text,
  current,
  onDone,
}: {
  /** The statement name being placed. */
  text: string;
  /** The merchant it belongs to now (left out of the choices). */
  current: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const all = useQuery(merchantDirectoryQuery);
  const [find, setFind] = useState("");
  const assign = useMutation({
    mutationFn: (body: { key?: string; name?: string }) => apiSend("POST", "merchants/assign", { text, ...body }),
    onSuccess: () => {
      refresh(qc);
      onDone();
    },
  });
  const needle = find.trim().toLowerCase();
  const choices = (all.data ?? [])
    .filter((m) => m.key !== current)
    .filter((m) => !needle || m.name.toLowerCase().includes(needle) || m.key.toLowerCase().includes(needle))
    .slice(0, needle ? 8 : 5);
  const exact = (all.data ?? []).some((m) => m.name.toLowerCase() === needle);
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-tile-2 p-2.5">
      <Input
        autoFocus
        aria-label="Find or name a merchant"
        placeholder="Find a merchant, or type a new name"
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
        {needle && !exact && (
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
        <span className="min-w-0 text-[12px] text-ink-3">Every “{text}” transaction moves with it.</span>
        <Button small onClick={onDone}>
          Cancel
        </Button>
      </div>
      {assign.isError && <ErrorText>{errorMessage(assign.error)}</ErrorText>}
    </div>
  );
}
