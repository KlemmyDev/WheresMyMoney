/**
 * A merchant paid on a steady schedule: how often and how much, when it's next expected (or that it looks stopped),
 * and its price over time, step by step, with the latest rise or drop called out.
 */
import { Card, CardHead } from "~/features/common/ds";
import { dayDate, longDate, money, monthYear } from "~/features/common/format";
import type { MerchantDetail } from "~/features/common/types";
import { cn } from "~/features/common/ui";

/** Runs of the same price: each price and the month it started. */
function steps(history: { date: string; amount: number }[]): { from: string; amount: number }[] {
  const out: { from: string; amount: number }[] = [];
  for (const h of history) {
    const last = out[out.length - 1];
    if (!last || Math.abs(h.amount - last.amount) > Math.max(50, last.amount * 0.02))
      out.push({ from: h.date, amount: h.amount });
  }
  return out;
}

export function RegularCard({ d }: { d: MerchantDetail }) {
  const r = d.regular;
  if (!r) return null;
  const c = d.price_change;
  const thisYear = String(new Date().getFullYear());
  const when = (iso: string) => (iso.startsWith(thisYear) ? dayDate(iso) : longDate(iso));
  const priced = r.fixed || c ? steps(d.history) : [];
  return (
    <Card aria-labelledby="mp-reg" className="flex flex-col gap-2.5">
      <CardHead id="mp-reg" title="Regular payment" right={<span className="text-[13px] text-ink-3">{r.label}</span>} />
      {r.stopped ? (
        <p className="m-0 text-[15px] text-ink">
          Last paid on {when(r.last)}. It was {r.label.toLowerCase()}, so it <b className="text-warn">looks stopped</b>:
          cancelled, or paid another way now.
        </p>
      ) : (
        <p className="m-0 text-[15px] text-ink">
          {r.label}, {r.fixed ? "" : "about "}
          <b>{money(r.typical, { cents: true })}</b>. Next expected around <b>{when(r.next)}</b>.
        </p>
      )}
      {c && (
        <p className={cn("m-0 text-[14px]", c.up ? "text-warn" : "text-good")}>
          {c.up ? "Went up" : "Went down"} from {money(c.was, { cents: true })} to {money(c.now, { cents: true })} on{" "}
          {when(c.date)}
          {c.pct != null ? ` (${c.up ? "+" : ""}${c.pct}%)` : ""}.
          {c.up && !r.stopped
            ? ` That's ${money(Math.round((c.now - c.was) * (365 / r.every_days)), { cents: false })} more a year.`
            : ""}
        </p>
      )}
      {priced.length > 1 && (
        <ol className="m-0 flex list-none flex-wrap items-center gap-x-2 gap-y-1 p-0 text-[13px] text-ink-3">
          {priced.map((p, i) => (
            <li key={p.from} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden>→</span>}
              <span>
                <span className="num text-ink">{money(p.amount, { cents: true })}</span> from{" "}
                {monthYear(p.from.slice(0, 7))}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
