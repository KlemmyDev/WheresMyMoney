/**
 * The top of Accounts as pictures, not a sentence: where our money sits (the total split by account, with the loan's
 * offset as a note when there is one) and how the accounts moved over the last 30 days (their total, day by day, and
 * who moved it). Every part reads out on hover or focus.
 */
import { useQueries } from "@tanstack/react-query";
import { useState, type CSSProperties } from "react";
import { Count } from "~/features/common/charts";
import { colour, dayDate, money, pct } from "~/features/common/format";
import { accountActivityQuery } from "~/features/common/queries";
import { ScrubChart } from "~/features/common/ScrubChart";
import type { Account, AccountsOverview } from "~/features/common/types";
import { Pill, Tile, TileTitle, cn } from "~/features/common/ui";

/** An account's colour in the pictures: the one picked for it, as on its card. */
const tint = (a: Account) => colour(a.colour);

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** What the loan would charge a month on `cents`, at its rate. */
const monthly = (cents: number, rateBp: number) => (Math.max(cents, 0) * rateBp) / 10000 / 12;

export function AccountsHero({ data }: { data: AccountsOverview }) {
  return (
    <section aria-label="Our accounts at a glance" className="grid grid-cols-1 gap-3 lg:grid-cols-[1.15fr_1fr]">
      <Holdings data={data} />
      <Moved data={data} />
    </section>
  );
}

/**
 * Where our money sits: the total, a bar split by account, and a row each with its share. When there's a home loan,
 * a note under it says how much of the loan the offsetting accounts cover and what that saves.
 */
function Holdings({ data }: { data: AccountsOverview }) {
  const loan = data.loan;
  const [on, setOn] = useState<number | null>(null);
  const parts = data.accounts.filter((a) => a.balance > 0).sort((a, b) => b.balance - a.balance);
  const whole = Math.max(
    parts.reduce((t, a) => t + a.balance, 0),
    1,
  );
  const picked = parts.find((a) => a.id === on);
  const rate = loan?.rate_bp ?? 0;
  const covered = loan ? Math.min(Math.max(data.offsetting, 0), Math.max(loan.balance, 0)) : 0;
  const cover = loan && loan.balance > 0 ? covered / loan.balance : 0;
  return (
    <Tile
      i={0}
      aria-labelledby="ah-hold"
      className="lit"
      style={{
        background:
          "radial-gradient(420px 260px at 0% 0%, color-mix(in srgb, var(--color-accent-fill) 18%, transparent), transparent 70%), var(--color-tile)",
      }}
    >
      <TileTitle
        id="ah-hold"
        right={
          <span className="text-[12.5px] text-ink-3">
            {data.accounts.length} {data.accounts.length === 1 ? "account" : "accounts"}
          </span>
        }
      >
        In our accounts
      </TileTitle>
      <div className="mono text-[40px] leading-[46px] font-semibold tracking-[-0.045em] sm:text-[46px] sm:leading-[52px]">
        {picked ? money(picked.balance) : <Count k="acct:total" value={data.total} format={(v) => money(v)} />}
      </div>
      <div className="-mt-1 min-h-[20px] text-[13px] text-ink-3" aria-live="polite">
        {picked ? (
          <>
            <b className="text-ink">{picked.name}</b> holds {pct(picked.balance / whole)} of it
          </>
        ) : (
          "Split by account"
        )}
      </div>
      <div
        className="flex h-9 w-full gap-[3px] overflow-hidden rounded-xl"
        role="group"
        aria-label="Our money by account"
        onPointerLeave={() => setOn(null)}
      >
        {parts.map((a, i) => (
          <button
            key={a.id}
            type="button"
            aria-label={`${a.name} ${money(a.balance)}, ${pct(a.balance / whole)}`}
            onPointerEnter={() => setOn(a.id)}
            onFocus={() => setOn(a.id)}
            onBlur={() => setOn(null)}
            onClick={() => setOn(on === a.id ? null : a.id)}
            className="grow-x block h-full min-w-[6px] cursor-pointer transition-opacity duration-200 first:rounded-l-xl last:rounded-r-xl"
            style={
              {
                flex: `${a.balance} 1 0`,
                background: tint(a),
                opacity: on != null && on !== a.id ? 0.35 : 1,
                "--i": i,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="flex flex-col gap-1" onPointerLeave={() => setOn(null)}>
        {parts.map((a) => (
          <div
            key={a.id}
            tabIndex={0}
            onPointerEnter={() => setOn(a.id)}
            onFocus={() => setOn(a.id)}
            onBlur={() => setOn(null)}
            aria-label={`${a.name} ${money(a.balance)}, ${pct(a.balance / whole)}`}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_auto_40px] items-center gap-3 rounded-lg px-1 py-0.5 text-[13px] transition-opacity sm:grid-cols-[minmax(0,1fr)_minmax(40px,1.4fr)_auto_44px]",
              on != null && on !== a.id && "opacity-45",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <i className="size-2 flex-none rounded-full" style={{ background: tint(a) }} />
              <span className="truncate text-ink-2">{a.name}</span>
            </span>
            <span className="hidden h-1.5 overflow-hidden rounded-full bg-raised sm:block">
              <i
                className="grow-x block h-full rounded-full"
                style={{ width: `${(a.balance / whole) * 100}%`, background: tint(a) }}
              />
            </span>
            <span className="num text-right whitespace-nowrap text-ink">{money(a.balance)}</span>
            <span className="num text-right text-ink-3">{pct(a.balance / whole, 0)}</span>
          </div>
        ))}
      </div>
      {loan && rate > 0 && (
        <div className="mt-auto flex items-center gap-3 border-t border-line pt-3 text-[12.5px] text-ink-3">
          <span
            className="relative size-9 flex-none rounded-full"
            role="img"
            aria-label={`Offsetting accounts cover ${pct(cover)} of the loan`}
            style={{
              background: `conic-gradient(var(--color-teal) ${cover * 360}deg, var(--color-raised) 0)`,
            }}
          >
            <span className="absolute inset-[5px] rounded-full bg-tile" />
          </span>
          <span>
            Accounts that offset the {loan.name.toLowerCase()} cover <b className="text-ink">{pct(cover, 0)}</b> of it,
            saving about <b className="text-ink">{money(monthly(covered, rate))} a month</b> in interest (
            {money(monthly(covered, rate) * 12)} a year).
          </span>
        </div>
      )}
    </Tile>
  );
}

/** The accounts' total over the last 30 days, to scrub, and what each account added or took away. */
function Moved({ data }: { data: AccountsOverview }) {
  const banks = data.accounts;
  const acts = useQueries({ queries: banks.map((a) => accountActivityQuery(a.id)) });
  const moved = banks.reduce((t, a) => t + a.change_30d, 0);
  const [on, setOn] = useState<number | null>(null);

  // Each day's total across the accounts, over the last 31 days (an account without that day carries its last balance).
  const ready = acts.every((q) => q.data);
  const days: string[] = [];
  const totals: number[] = [];
  if (ready && banks.length) {
    const end = new Date();
    const series = acts.map((q) => new Map((q.data?.days ?? []).map((d) => [d.date, d.balance])));
    const start = new Date(end);
    start.setDate(end.getDate() - 30);
    const from = iso(start);
    const last = acts.map((q) => {
      const before = (q.data?.days ?? []).filter((d) => d.date < from);
      return before.length ? before[before.length - 1].balance : 0;
    });
    for (let k = 30; k >= 0; k--) {
      const d = new Date(end);
      d.setDate(end.getDate() - k);
      const key = iso(d);
      let t = 0;
      series.forEach((m, j) => {
        const v = m.get(key);
        if (v != null) last[j] = v;
        t += last[j];
      });
      days.push(key);
      totals.push(t);
    }
  }
  const rows = [...banks].sort((a, b) => b.change_30d - a.change_30d);
  const hi = Math.max(1, ...rows.map((a) => Math.abs(a.change_30d)));
  return (
    <Tile i={1} aria-labelledby="ah-30">
      <TileTitle id="ah-30" right={<Pill tone={moved >= 0 ? "good" : "warn"}>{moved >= 0 ? "Up" : "Down"}</Pill>}>
        Last 30 days
      </TileTitle>
      <div className="mono text-[34px] leading-10 font-semibold tracking-[-0.04em]">{money(moved, { sign: true })}</div>
      {ready ? (
        <ScrubChart
          lines={[{ values: totals, colour: "var(--color-teal)", name: "All accounts", fill: true }]}
          label="All our accounts together, each day for the last 30 days"
          at={(i) => dayDate(days[i])}
          format={(v) => money(v)}
          height={120}
          axis={[0, 15, 30]}
        />
      ) : (
        <div className="h-[120px] rounded-xl bg-raised/40" />
      )}
      <div className="flex flex-col gap-1.5" onPointerLeave={() => setOn(null)}>
        {rows.map((a) => {
          const up = a.change_30d >= 0;
          const w = (Math.abs(a.change_30d) / hi) * 50;
          return (
            <div
              key={a.id}
              tabIndex={0}
              onPointerEnter={() => setOn(a.id)}
              onFocus={() => setOn(a.id)}
              onBlur={() => setOn(null)}
              aria-label={`${a.name} ${money(a.change_30d, { sign: true })} in 30 days, now ${money(a.balance)}`}
              className={cn(
                "grid grid-cols-[88px_1fr_76px] items-center gap-2 rounded-lg px-1 text-[12.5px] transition-opacity",
                on != null && on !== a.id && "opacity-45",
              )}
            >
              <span className="truncate text-ink-2">{a.name}</span>
              <span className="relative h-2.5">
                <i className="absolute inset-y-[-3px] left-1/2 w-px bg-line-2" />
                <i
                  className="grow-x absolute inset-y-0 rounded-full"
                  style={{
                    width: `${w}%`,
                    left: up ? "50%" : `${50 - w}%`,
                    background: up ? tint(a) : "var(--color-out)",
                  }}
                />
              </span>
              <span className={cn("num text-right", up ? "text-ink" : "text-ink-3")}>
                {on === a.id ? money(a.balance) : money(a.change_30d, { sign: true })}
              </span>
            </div>
          );
        })}
      </div>
    </Tile>
  );
}
