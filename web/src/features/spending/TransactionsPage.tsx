/**
 * Every transaction, newest first: filter by account and search; change a category (and remember it for the merchant),
 * add a note, or remove one typed in by hand.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { amount, capsDate } from "~/features/common/format";
import { useToast } from "~/features/common/overlay";
import { accountsQuery, categoriesQuery, refresh, transactionsQuery } from "~/features/common/queries";
import type { Transaction } from "~/features/common/types";
import { Button, Dot, ErrorText, Input, PageHead, Pill, Select, Tile } from "~/features/common/ui";

export function TransactionsPage({ account }: { account?: number }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const accounts = useQuery(accountsQuery);
  const cats = useQuery(categoriesQuery);
  const txs = useQuery(transactionsQuery({ account_id: account, q: q || undefined, limit: 500 }));
  const qc = useQueryClient();
  const toast = useToast();
  const [remember, setRemember] = useState(true);
  const update = useMutation({
    mutationFn: ({ id, category_id }: { id: number; category_id: number | null }) =>
      apiSend<Transaction>("PUT", `transactions/${id}`, { category_id, always: remember }),
    onSuccess: (t) => (refresh(qc), toast(`${t.description} is ${t.category ?? "not sorted"}`)),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiSend("DELETE", `transactions/${id}`),
    onSuccess: () => refresh(qc),
  });
  const banks = accounts.data?.accounts ?? [];
  const byId = Object.fromEntries(banks.map((a) => [a.id, a]));
  return (
    <>
      <PageHead over={`${txs.data?.length ?? 0} SHOWN`} title="Transactions" />
      <Tile i={0}>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            aria-label="Account"
            className="w-auto"
            value={account ?? ""}
            onChange={(e) =>
              navigate({ to: "/transactions", search: e.target.value ? { account: Number(e.target.value) } : {} })
            }
          >
            <option value="">Every account</option>
            {banks.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Input
            aria-label="Search"
            className="max-w-[280px] font-sans"
            placeholder="Search descriptions and notes"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember a category for its merchant
          </label>
        </div>
        {txs.isError && <ErrorText>{errorMessage(txs.error)}</ErrorText>}
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            {(txs.data ?? []).map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-[64px_100px_minmax(0,1fr)_auto_160px_100px_32px] items-center gap-3 border-t border-line py-2 text-[13px] first:border-t-0"
              >
                <span className="mono text-ink-3">{capsDate(t.date)}</span>
                <span className="flex items-center gap-1.5 truncate text-ink-2">
                  <Dot c={byId[t.account_id]?.colour} />
                  {byId[t.account_id]?.name}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{t.description}</span>
                  {t.note && <span className="block truncate text-xs text-ink-3">{t.note}</span>}
                </span>
                <span>
                  {t.kind === "adjustment" ? (
                    <Pill tone="teal">ADJUSTMENT</Pill>
                  ) : t.kind === "cash" ? (
                    <Pill>CASH</Pill>
                  ) : t.kind === "manual" ? (
                    <Pill tone="info">BY HAND</Pill>
                  ) : t.merged ? (
                    <Pill tone="good">MERGED</Pill>
                  ) : null}
                </span>
                {t.kind === "adjustment" ? (
                  <span />
                ) : (
                  <select
                    aria-label={`Category for ${t.description}`}
                    className="min-h-8 rounded-md border border-line bg-raised px-2 text-xs text-ink"
                    value={t.category_id ?? ""}
                    onChange={(e) =>
                      update.mutate({ id: t.id, category_id: e.target.value ? Number(e.target.value) : null })
                    }
                  >
                    <option value="">Not sorted</option>
                    {(cats.data?.categories ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
                <span className="mono text-right" style={{ color: t.amount > 0 ? "var(--color-good)" : undefined }}>
                  {amount(t.amount, { cents: true, sign: true })}
                </span>
                {t.kind !== "statement" ? (
                  <Button small aria-label={`Remove ${t.description}`} onClick={() => remove.mutate(t.id)}>
                    ✕
                  </Button>
                ) : (
                  <span />
                )}
              </div>
            ))}
            {txs.data && !txs.data.length && <div className="py-4 text-ink-3">No transactions match.</div>}
          </div>
        </div>
      </Tile>
    </>
  );
}
