/**
 * The top of Bills as pictures, not a sentence: what's set aside for bills and how far ahead it reaches (the next 12
 * months of bills laid end to end, lit as far as the balance goes), and what a usual month of bills is made of (split
 * by bill). Every part reads out on hover or focus.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { apiGet } from "~/features/common/api";
import { ScrubChart } from "~/features/common/ScrubChart";
import { useState, type CSSProperties } from "react";
import { Count } from "~/features/common/charts";
import { EVERY_PER } from "~/features/bills/BillsParts";
import { dayDate, money, monthCaps, pct } from "~/features/common/format";
import { MerchantMark } from "~/features/spending/MerchantIcon";
import type { Bill, BillsOverview } from "~/features/common/types";
import { Pill, Tile, TileTitle, cn } from "~/features/common/ui";

/** Colours for the bills in the split, biggest first; the rest share the last. */
export const BILL_TINTS = [
  "var(--color-bills-fill)",
  "var(--color-teal)",
  "var(--color-accent-fill)",
  "var(--color-sky)",
  "var(--color-rose)",
  "var(--color-savings-fill)",
  "var(--color-invest)",
];
const REST = "var(--color-ink-3)";
/** How many bills get their own part of the split before the rest are grouped. */
const OWN = 6;

export function BillsHero({ b, onAdd }: { b: BillsOverview; onAdd: () => void }) {
  return (
    <section aria-label="Our bills at a glance" className="grid grid-cols-1 gap-3 lg:grid-cols-[1.1fr_1fr]">
      <SetAside b={b} />
      <UsualMonth b={b} onAdd={onAdd} />
    </section>
  );
}

/**
 * What's set aside: the balance, then the next 12 months of bills as blocks end to end (each as wide as that month's
 * bills), filled as far as the balance would pay for if nothing more came in. The months we aim to keep are marked.
 */
function SetAside({ b }: { b: BillsOverview }) {
  const acct = b.account;
  const t = acct?.target?.kind === "months" ? acct.target : null;
  const [on, setOn] = useState<number | null>(null);
  const balance = acct?.balance ?? 0;
  const months = b.by_month;
  const whole = Math.max(
    months.reduce((s, m) => s + m.total, 0),
    1,
  );
  // How much of each month the balance pays for, in order.
  const paid: number[] = [];
  for (let i = 0, left = balance; i < months.length; left -= months[i].total, i++) {
    const m = months[i];
    paid.push(m.total ? Math.min(Math.max(left, 0), m.total) / m.total : 1);
  }
  const reach = paid.findIndex((p) => p < 1);
  const throughAll = reach === -1 && months.length > 0;
  const lastFull = reach === -1 ? months.length - 1 : reach - 1;
  const picked = on != null ? months[on] : null;
  const extra = t ? balance - t.amount : 0;
  // Where the months we keep end, as a share of the strip.
  const keepAt = t ? months.slice(0, t.months).reduce((s, m) => s + m.total, 0) / whole : null;
  if (!acct)
    return (
      <Tile i={0} aria-labelledby="bh-set" className="lit">
        <TileTitle id="bh-set">Set aside for bills</TileTitle>
        <p className="m-0 text-[15px] text-ink-2">
          Pick an account to pay the bills from (Accounts, then the account&apos;s settings), and this shows how far
          ahead its balance reaches.
        </p>
      </Tile>
    );
  return (
    <Tile
      i={0}
      aria-labelledby="bh-set"
      className="lit"
      style={{
        background:
          "radial-gradient(420px 260px at 0% 0%, color-mix(in srgb, var(--color-bills-fill) 20%, transparent), transparent 70%), var(--color-tile)",
      }}
    >
      <TileTitle
        id="bh-set"
        right={
          t ? (
            <Pill tone={extra >= 0 ? "good" : "warn"}>{extra >= 0 ? "Enough set aside" : "Running low"}</Pill>
          ) : undefined
        }
      >
        In {acct.name}
      </TileTitle>
      <div className="mono text-[40px] leading-[46px] font-semibold tracking-[-0.045em] sm:text-[46px] sm:leading-[52px]">
        <Count k="bills:bal" value={balance} format={(v) => money(v)} />
      </div>
      <div className="-mt-1 min-h-[20px] text-[13px] text-ink-3" aria-live="polite">
        {picked ? (
          <>
            <b className="text-ink">{monthName(picked.month)}</b>: {money(picked.total)} of bills, {picked.count}{" "}
            {picked.count === 1 ? "bill" : "bills"} ·{" "}
            {paid[on!] >= 1 ? (
              <span className="text-good">covered</span>
            ) : paid[on!] > 0 ? (
              <span className="text-warn">{pct(paid[on!], 0)} covered</span>
            ) : (
              "not yet covered"
            )}
          </>
        ) : throughAll ? (
          <>Pays every bill for the next 12 months</>
        ) : lastFull >= 0 ? (
          <>
            Pays every bill up to the end of <b className="text-ink">{monthName(months[lastFull].month)}</b>, if nothing
            more came in
          </>
        ) : (
          "Not enough for this month's bills yet"
        )}
      </div>
      <div className="relative pt-5">
        {keepAt != null && t && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 bottom-0 z-10 border-l-[1.5px] border-dashed border-ink"
            style={{ left: `${keepAt * 100}%` }}
          >
            <span
              className={cn(
                "absolute top-0 text-[11px] whitespace-nowrap text-ink",
                keepAt > 0.7 ? "right-1.5" : "left-1.5",
              )}
            >
              we keep {t.months} months
            </span>
          </span>
        )}
        <div
          className="flex h-16 w-full gap-[3px]"
          role="group"
          aria-label="The next 12 months of bills, and how far the balance reaches"
          onPointerLeave={() => setOn(null)}
        >
          {months.map((m, i) => (
            <button
              key={m.month}
              type="button"
              aria-label={`${monthName(m.month)}: ${money(m.total)} of bills, ${paid[i] >= 1 ? "covered" : paid[i] > 0 ? `${pct(paid[i], 0)} covered` : "not covered yet"}`}
              onPointerEnter={() => setOn(i)}
              onFocus={() => setOn(i)}
              onBlur={() => setOn(null)}
              onClick={() => setOn(on === i ? null : i)}
              className="relative block h-full min-w-[4px] cursor-pointer overflow-hidden rounded-md bg-raised transition-opacity duration-200 first:rounded-l-xl last:rounded-r-xl"
              style={{ flex: `${Math.max(m.total, 1)} 1 0`, opacity: on != null && on !== i ? 0.45 : 1 }}
            >
              <i
                className="grow-x striped absolute inset-y-0 left-0 block"
                style={{ width: `${paid[i] * 100}%`, background: "var(--color-bills-fill)", "--i": i } as CSSProperties}
              />
            </button>
          ))}
        </div>
        <div className="mono mt-1.5 flex gap-[3px] text-[11px] text-ink-3" aria-hidden>
          {months.map((m, i) => (
            <span
              key={m.month}
              className={cn("min-w-[4px] overflow-hidden text-center", on === i && "text-ink")}
              style={{ flex: `${Math.max(m.total, 1)} 1 0` }}
            >
              {monthCaps(m.month).slice(0, 1)}
            </span>
          ))}
        </div>
      </div>
      <History id={acct.id} name={acct.name} target={t?.amount ?? null} months={t?.months ?? null} />
      <div className="mt-auto grid grid-cols-2 gap-2 border-t border-line pt-3 sm:grid-cols-3">
        <Figure label="A usual month" value={money(b.per_month)} />
        <Figure label="Next 30 days" value={money(b.next30.total)} />
        {t && (
          <Figure
            label={extra >= 0 ? `Over ${t.months} months` : `Short of ${t.months} months`}
            value={money(Math.abs(extra))}
            tone={extra >= 0 ? "good" : "warn"}
          />
        )}
      </div>
    </Tile>
  );
}

/** The bills account over the last six months, to drag across, against the months we keep. */
function History({
  id,
  name,
  target,
  months,
}: {
  id: number;
  name: string;
  target: number | null;
  months: number | null;
}) {
  const q = useQuery({
    queryKey: ["accounts", id, "history"],
    queryFn: () => apiGet<{ history: [string, number][] }>(`accounts/${id}`),
  });
  const h = q.data?.history ?? [];
  if (h.length < 2) return null;
  return (
    <div>
      <div className="mb-1 text-[12px] text-ink-3">The last six months</div>
      <ScrubChart
        lines={[
          { values: h.map(([, v]) => v), colour: "var(--color-bills)", name, fill: true },
          ...(target != null
            ? [{ values: h.map(() => target), colour: "var(--color-ink-3)", name: `${months} months`, dashed: true }]
            : []),
        ]}
        label={`${name} over the last six months`}
        at={(i) => dayDate(h[i][0])}
        format={(v) => money(v)}
        height={96}
        floor={0}
      />
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[12px] text-ink-3">{label}</div>
      <div
        className={cn("num text-[17px] font-semibold", tone === "good" && "text-good", tone === "warn" && "text-warn")}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * What a usual month of bills is made of: the total, a bar split by bill (the biggest few, then the rest), and a row
 * each with its mark, how often it comes, and what it comes to a month.
 */
function UsualMonth({ b, onAdd }: { b: BillsOverview; onAdd: () => void }) {
  const [on, setOn] = useState<number | null>(null);
  const bills = [...b.bills].filter((x) => x.per_year > 0).sort((x, y) => y.per_year - x.per_year);
  const own = bills.length > OWN + 1 ? bills.slice(0, OWN) : bills;
  const rest = bills.slice(own.length);
  const parts: { key: number; name: string; monthly: number; colour: string; bill?: Bill; n?: number }[] = [
    ...own.map((x, i) => ({ key: x.id, name: x.name, monthly: x.per_year / 12, colour: BILL_TINTS[i], bill: x })),
    ...(rest.length
      ? [
          {
            key: -1,
            name: `${rest.length} more`,
            monthly: rest.reduce((s, x) => s + x.per_year, 0) / 12,
            colour: REST,
            n: rest.length,
          },
        ]
      : []),
  ];
  const whole = Math.max(b.per_month, 1);
  const picked = parts.find((p) => p.key === on);
  return (
    <Tile i={1} aria-labelledby="bh-month">
      <TileTitle
        id="bh-month"
        right={
          <span className="text-[12.5px] text-ink-3">
            {b.bills.length} {b.bills.length === 1 ? "bill" : "bills"} · {money(b.per_year)} a year
          </span>
        }
      >
        A usual month of bills
      </TileTitle>
      {bills.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="m-0 text-[15px] text-ink-2">
            Add the bills that come out regularly, once each: the amount and how often.
          </p>
          <button
            type="button"
            onClick={onAdd}
            className="cursor-pointer border-0 bg-transparent p-0 text-[14px] font-semibold text-teal"
          >
            Add a bill
          </button>
        </div>
      ) : (
        <>
          <div className="mono text-[34px] leading-10 font-semibold tracking-[-0.04em]">
            {picked ? money(picked.monthly) : money(b.per_month)}
          </div>
          <div className="-mt-1 min-h-[20px] text-[13px] text-ink-3" aria-live="polite">
            {picked ? (
              <>
                <b className="text-ink">{picked.name}</b> is {pct(picked.monthly / whole, 0)} of a usual month
              </>
            ) : (
              "Split by bill"
            )}
          </div>
          <div
            className="flex h-9 w-full gap-[3px] overflow-hidden rounded-xl"
            role="group"
            aria-label="A usual month of bills, by bill"
            onPointerLeave={() => setOn(null)}
          >
            {parts.map((p, i) => (
              <button
                key={p.key}
                type="button"
                aria-label={`${p.name} ${money(p.monthly)} a month, ${pct(p.monthly / whole, 0)}`}
                onPointerEnter={() => setOn(p.key)}
                onFocus={() => setOn(p.key)}
                onBlur={() => setOn(null)}
                onClick={() => setOn(on === p.key ? null : p.key)}
                className="grow-x block h-full min-w-[6px] cursor-pointer transition-opacity duration-200 first:rounded-l-xl last:rounded-r-xl"
                style={
                  {
                    flex: `${p.monthly} 1 0`,
                    background: p.colour,
                    opacity: on != null && on !== p.key ? 0.35 : 1,
                    "--i": i,
                  } as CSSProperties
                }
              />
            ))}
          </div>
          <div className="flex flex-col gap-0.5" onPointerLeave={() => setOn(null)}>
            {parts.map((p) => {
              const row = (
                <>
                  <span className="flex min-w-0 items-center gap-2.5">
                    {p.bill ? (
                      <MerchantMark name={p.name} size="md" />
                    ) : (
                      <span className="flex size-8 flex-none items-center justify-center rounded-full bg-raised text-[11px] text-ink-3">
                        +{p.n}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{p.name}</span>
                      {p.bill && (
                        <span className="block truncate text-[11.5px] text-ink-3">
                          {money(p.bill.amount)} {EVERY_PER[p.bill.every]}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="hidden h-1.5 overflow-hidden rounded-full bg-raised sm:block">
                    <i
                      className="grow-x block h-full rounded-full"
                      style={{ width: `${(p.monthly / whole) * 100}%`, background: p.colour }}
                    />
                  </span>
                  <span className="num text-right whitespace-nowrap text-ink">{money(p.monthly)}</span>
                </>
              );
              const cls = cn(
                "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-1 py-1 text-[13px] text-ink no-underline transition-opacity sm:grid-cols-[minmax(0,1.3fr)_minmax(40px,1fr)_auto]",
                on != null && on !== p.key && "opacity-45",
                p.bill && "hover:bg-tile-2",
              );
              const hover = {
                onPointerEnter: () => setOn(p.key),
                onFocus: () => setOn(p.key),
                onBlur: () => setOn(null),
              };
              return p.bill ? (
                <Link
                  key={p.key}
                  to="/bills/$billId"
                  params={{ billId: String(p.bill.id) }}
                  className={cls}
                  aria-label={`${p.name}, ${money(p.monthly)} a month`}
                  {...hover}
                >
                  {row}
                </Link>
              ) : (
                <div
                  key={p.key}
                  tabIndex={0}
                  className={cls}
                  aria-label={`${p.name}, ${money(p.monthly)} a month`}
                  {...hover}
                >
                  {row}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Tile>
  );
}

/** "2026-11" → "November". */
export function monthName(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-AU", { month: "long" });
}
