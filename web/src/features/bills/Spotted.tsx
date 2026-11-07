/**
 * Bills spotted in the imported statements (regular payments to one merchant), each to add as it is, edit first, or
 * wave away; and bills whose latest payment was a different price, to update.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiSend, errorMessage } from "~/features/common/api";
import { Spark } from "~/features/common/charts";
import { EVERY_LABEL, money, monthYear, shortDate } from "~/features/common/format";
import { useToast } from "~/features/common/overlay";
import { accountsQuery, refresh, spottedBillsQuery } from "~/features/common/queries";
import type { BillUpdate, SpottedBill } from "~/features/common/types";
import { Button, Dot, ErrorText, Pill, Tile, TileTitle } from "~/features/common/ui";

const month = (iso: string) => monthYear(iso.slice(0, 7));
/** The spark's bottom: 15% under the highest, so a few cents' wobble stays flat and a real rise still shows. */
const floorOf = (h: { amount: number }[]) => Math.max(...h.map((x) => x.amount)) * 0.85;

export function SpottedBills({ onEdit, i }: { onEdit: (s: SpottedBill) => void; i: number }) {
  const q = useQuery(spottedBillsQuery);
  const accounts = useQuery(accountsQuery);
  const qc = useQueryClient();
  const toast = useToast();
  const byId = Object.fromEntries((accounts.data?.accounts ?? []).map((a) => [a.id, a]));
  const accept = useMutation({
    mutationFn: (s: SpottedBill) => apiSend("POST", "bills/spotted/accept", { key: s.key }),
    onSuccess: (_, s) => (refresh(qc), toast(`${s.name} added`)),
  });
  const dismiss = useMutation({
    mutationFn: (key: string) => apiSend("POST", "bills/spotted/dismiss", { key }),
    onSuccess: () => refresh(qc),
  });
  const update = useMutation({
    mutationFn: (u: BillUpdate) => apiSend("PUT", `bills/${u.bill_id}`, { amount: u.now }),
    onSuccess: (_, u) => (refresh(qc), toast(`${u.name} is now ${money(u.now, { cents: true })}`)),
  });
  const s = q.data?.suggestions ?? [];
  const u = q.data?.updates ?? [];
  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!s.length && !u.length) return null;
  const error = accept.error ?? dismiss.error ?? update.error;
  return (
    <>
      {u.length > 0 && (
        <Tile i={i} aria-labelledby="bl-up">
          <TileTitle id="bl-up" right={<Pill tone="warn">{u.length} CHANGED</Pill>}>
            Price changes
          </TileTitle>
          <div className="text-[13px] text-ink-2">
            The statements show these bills coming out at a different amount from what they say here.
          </div>
          {u.map((x) => (
            <div
              key={x.key}
              className="grid grid-cols-1 items-center gap-2 border-t border-line pt-3 text-[13px] sm:grid-cols-[minmax(0,1fr)_90px_auto]"
            >
              <div className="min-w-0">
                <div className="font-medium">
                  {x.name}{" "}
                  <Pill tone={x.now > x.was ? "warn" : "good"}>
                    {x.now > x.was ? "UP" : "DOWN"} {Math.abs(x.pct).toFixed(1)}%
                  </Pill>
                </div>
                <div className="text-ink-2">
                  <span className="mono">{money(x.was, { cents: true })}</span> →{" "}
                  <span className="mono font-semibold text-ink">{money(x.now, { cents: true })}</span> since{" "}
                  {shortDate(x.since)} · <span className="mono">{money(Math.abs(x.per_year_change))}</span> a year{" "}
                  {x.per_year_change > 0 ? "more" : "less"}
                </div>
              </div>
              <Spark values={x.history.map((h) => h.amount)} colour="var(--color-warn)" floor={floorOf(x.history)} />
              <div className="flex gap-2">
                <Button small primary onClick={() => update.mutate(x)} disabled={update.isPending}>
                  Use {money(x.now, { cents: true })}
                </Button>
                <Button small onClick={() => dismiss.mutate(x.key)}>
                  Ignore
                </Button>
              </div>
            </div>
          ))}
        </Tile>
      )}
      {s.length > 0 && (
        <Tile i={i + 1} aria-labelledby="bl-spot">
          <TileTitle id="bl-spot" right={<span className="mono">{s.length} TO REVIEW</span>}>
            Spotted in your statements
          </TileTitle>
          <div className="text-[13px] text-ink-2">
            Payments that come regularly to the same place. Add the ones that are bills: they&apos;re matched on every
            import from then on, and a change in price shows up here.
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[680px]">
              {s.map((x) => (
                <div
                  key={x.key}
                  className="grid grid-cols-[minmax(0,1fr)_110px_110px_90px_auto] items-center gap-3 border-t border-line py-2.5 text-[13px]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      {x.name}
                      {x.rise && (
                        <Pill tone={x.rise.now > x.rise.was ? "warn" : "good"}>
                          {x.rise.now > x.rise.was ? "UP" : "DOWN"} {Math.abs(x.rise.pct).toFixed(1)}% ·{" "}
                          {shortDate(x.changes[x.changes.length - 1].date).toUpperCase()}
                        </Pill>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 truncate text-xs text-ink-3">
                      <Dot c={byId[x.account_id]?.colour} />
                      {x.seen} payments since {month(x.first)} · {x.category ?? "Bills"}
                      {x.rise ? ` · was ${money(x.rise.was, { cents: true })}` : ""}
                    </div>
                  </div>
                  <div className="text-ink-2">{EVERY_LABEL[x.every]}</div>
                  <div className="mono text-right">
                    {x.variable ? "~" : ""}
                    {money(x.amount, { cents: true })}
                    <div className="text-xs text-ink-3">next {shortDate(x.next_due)}</div>
                  </div>
                  <Spark
                    values={x.history.map((h) => h.amount)}
                    colour="var(--color-bills)"
                    floor={floorOf(x.history)}
                  />
                  <div className="flex gap-1.5">
                    <Button small primary onClick={() => accept.mutate(x)} disabled={accept.isPending}>
                      Add
                    </Button>
                    <Button small onClick={() => onEdit(x)}>
                      Edit
                    </Button>
                    <Button small aria-label={`${x.name} isn't a bill`} onClick={() => dismiss.mutate(x.key)}>
                      Not a bill
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {error && <ErrorText>{errorMessage(error)}</ErrorText>}
        </Tile>
      )}
    </>
  );
}
