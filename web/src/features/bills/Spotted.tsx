/**
 * On the Bills page: a banner for bills spotted in the imported statements (reviewed on their own page), and bills
 * whose latest payment was a different price, to update.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Banner } from "~/features/common/ds";
import { I } from "~/features/common/icons";
import { apiSend, errorMessage } from "~/features/common/api";
import { Spark } from "~/features/common/charts";
import { money, shortDate } from "~/features/common/format";
import { useToast } from "~/features/common/overlay";
import { refresh, spottedBillsQuery } from "~/features/common/queries";
import type { BillUpdate } from "~/features/common/types";
import { Button, ErrorText, Pill, Tile, TileTitle } from "~/features/common/ui";

/** The spark's bottom: 15% under the highest, so a few cents' wobble stays flat and a real rise still shows. */
const floorOf = (h: { amount: number }[]) => Math.max(...h.map((x) => x.amount)) * 0.85;

export function SpottedBills({ i }: { i: number }) {
  const q = useQuery(spottedBillsQuery);
  const qc = useQueryClient();
  const toast = useToast();
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
  const error = dismiss.error ?? update.error;
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
        <Banner
          g={I.bills}
          tone="bills"
          title={`We spotted ${s.length} repeating ${s.length === 1 ? "payment that looks like a bill" : "payments that look like bills"}`}
          action={
            <Link to="/bills/spotted" className="font-semibold text-teal">
              Review them
            </Link>
          }
        >
          About {money(s.reduce((t, x) => t + (x.per_year ?? 0), 0) / 12)} a month together. Nothing is added until you
          say.
        </Banner>
      )}
      {error && <ErrorText>{errorMessage(error)}</ErrorText>}
    </>
  );
}
