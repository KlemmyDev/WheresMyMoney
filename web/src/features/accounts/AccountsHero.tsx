/**
 * The top of Accounts as pictures, not a sentence: how much of the loan our accounts cover (a bar of the loan with each
 * offsetting account's share in it), what that saves in interest (a ring of the interest the loan would charge, split
 * into saved and charged), and how the accounts moved over the last 30 days (their total, day by day, and who moved
 * it). Every part reads out on hover or focus.
 */
import { useQueries } from "@tanstack/react-query";
import { useState, type CSSProperties, type ReactNode } from "react";
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
    <section
      aria-label="Our accounts at a glance"
      className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1.25fr_0.9fr_1.25fr]"
    >
      <Cover data={data} />
      {data.loan && <Interest data={data} loan={data.loan} />}
      <Moved data={data} />
    </section>
  );
}

/** The loan as a bar, filled by each account that sits against it; what's left is charged interest. */
function Cover({ data }: { data: AccountsOverview }) {
  const loan = data.loan;
  const [on, setOn] = useState<number | "rest" | null>(null);
  const parts = data.accounts.filter((a) => (loan ? a.offsets_loan : true) && a.balance > 0);
  const whole = loan ? Math.max(loan.balance, data.offsetting, 1) : Math.max(data.total, 1);
  const rest = loan ? Math.max(loan.balance - data.offsetting, 0) : 0;
  const rate = loan?.rate_bp ?? 0;
  const picked = parts.find((a) => a.id === on);
  const readout: ReactNode = picked ? (
    <>
      <b className="text-ink">{picked.name}</b> {money(picked.balance)} · {pct(picked.balance / whole)} of{" "}
      {loan ? "the loan" : "the total"}
      {loan && <> · saves {money(monthly(picked.balance, rate))} a month</>}
    </>
  ) : on === "rest" && loan ? (
    <>
      <b className="text-ink">Charged interest</b> on {money(rest)} · about {money(monthly(rest, rate))} a month
    </>
  ) : loan ? (
    <>
      {pct(data.offsetting / Math.max(loan.balance, 1))} of the {money(loan.balance)} {loan.name.toLowerCase()} isn't
      charged interest
    </>
  ) : (
    <>
      Across {parts.length} {parts.length === 1 ? "account" : "accounts"}
    </>
  );
  return (
    <Tile
      i={0}
      aria-labelledby="ah-cover"
      className="lit md:col-span-2 xl:col-span-1"
      style={{
        background:
          "radial-gradient(420px 260px at 0% 0%, color-mix(in srgb, var(--color-accent-fill) 18%, transparent), transparent 70%), var(--color-tile)",
      }}
    >
      <TileTitle id="ah-cover" right={loan ? <Pill tone="teal">{pct(data.offsetting / whole, 0)} covered</Pill> : null}>
        {loan ? "Against the loan" : "In our accounts"}
      </TileTitle>
      <div className="mono text-[40px] leading-[46px] font-semibold tracking-[-0.045em] sm:text-[46px] sm:leading-[52px]">
        <Count k="acct:off" value={loan ? data.offsetting : data.total} format={(v) => money(v)} />
      </div>
      <div
        className="relative flex h-9 w-full gap-[3px] overflow-hidden rounded-xl"
        role="group"
        aria-label={loan ? `The ${loan.name}, ${money(loan.balance)}` : "Our accounts"}
        onPointerLeave={() => setOn(null)}
      >
        {parts.map((a, i) => (
          <button
            key={a.id}
            type="button"
            aria-label={`${a.name} ${money(a.balance)}`}
            onPointerEnter={() => setOn(a.id)}
            onFocus={() => setOn(a.id)}
            onBlur={() => setOn(null)}
            onClick={() => setOn(on === a.id ? null : a.id)}
            className="grow-x block h-full min-w-[6px] cursor-pointer transition-opacity duration-200 first:rounded-l-xl"
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
        {loan && rest > 0 && (
          <button
            type="button"
            aria-label={`Charged interest on ${money(rest)}`}
            onPointerEnter={() => setOn("rest")}
            onFocus={() => setOn("rest")}
            onBlur={() => setOn(null)}
            onClick={() => setOn(on === "rest" ? null : "rest")}
            className="block h-full cursor-pointer rounded-r-xl border border-dashed transition-opacity duration-200"
            style={{
              flex: `${rest} 1 0`,
              borderColor: "color-mix(in srgb, var(--color-bad) 45%, transparent)",
              background:
                "repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-bad) 14%, transparent) 0 6px, transparent 6px 12px)",
              opacity: on != null && on !== "rest" ? 0.45 : 1,
            }}
          />
        )}
      </div>
      <div className="min-h-[20px] text-[13px] text-ink-3" aria-live="polite">
        {readout}
      </div>
      <div className="mt-auto flex flex-col gap-1" onPointerLeave={() => setOn(null)}>
        {parts.map((a) => (
          <div
            key={a.id}
            tabIndex={0}
            onPointerEnter={() => setOn(a.id)}
            onFocus={() => setOn(a.id)}
            onBlur={() => setOn(null)}
            aria-label={`${a.name} ${money(a.balance)}, ${pct(a.balance / whole)}`}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_minmax(40px,1.2fr)_auto] items-center gap-3 rounded-lg px-1 py-0.5 text-[12.5px] transition-opacity",
              on != null && on !== a.id && "opacity-45",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <i className="size-2 flex-none rounded-full" style={{ background: tint(a) }} />
              <span className="truncate text-ink-2">{a.name}</span>
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-raised">
              <i
                className="grow-x block h-full rounded-full"
                style={{ width: `${Math.min(a.balance / whole, 1) * 100}%`, background: tint(a) }}
              />
            </span>
            <span className="num text-right whitespace-nowrap text-ink">
              {money(a.balance)}
              {loan && <span className="text-ink-3"> · {money(monthly(a.balance, rate))}/mo</span>}
            </span>
          </div>
        ))}
        {loan && rest > 0 && (
          <div
            tabIndex={0}
            onPointerEnter={() => setOn("rest")}
            onFocus={() => setOn("rest")}
            onBlur={() => setOn(null)}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_minmax(40px,1.2fr)_auto] items-center gap-3 rounded-lg px-1 py-0.5 text-[12.5px] transition-opacity",
              on != null && on !== "rest" && "opacity-45",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <i className="size-2 flex-none rounded-full border border-dashed border-bad" />
              <span className="truncate text-ink-2">Charged interest</span>
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-raised">
              <i
                className="block h-full rounded-full"
                style={{
                  width: `${(rest / whole) * 100}%`,
                  background: "color-mix(in srgb, var(--color-bad) 45%, transparent)",
                }}
              />
            </span>
            <span className="num text-right whitespace-nowrap text-ink-3">{money(rest)}</span>
          </div>
        )}
      </div>
    </Tile>
  );
}

/** A ring of the interest the whole loan would charge a month: the part our accounts save, and the part still charged. */
function Interest({ data, loan }: { data: AccountsOverview; loan: Account }) {
  const [on, setOn] = useState<"saved" | "charged" | null>(null);
  const rate = loan.rate_bp ?? 0;
  const full = monthly(loan.balance, rate);
  const saved = monthly(Math.min(Math.max(data.offsetting, 0), Math.max(loan.balance, 0)), rate);
  const charged = Math.max(full - saved, 0);
  const share = full ? saved / full : 0;
  const R = 52;
  const C = 2 * Math.PI * R;
  const gap = share > 0 && share < 1 ? 6 : 0;
  const arc = (from: number, len: number, stroke: string, key: "saved" | "charged", dashed?: boolean) => (
    <circle
      key={key}
      cx="70"
      cy="70"
      r={R}
      fill="none"
      stroke={stroke}
      strokeWidth={on === key ? 18 : 14}
      strokeLinecap="round"
      strokeDasharray={dashed ? undefined : `${Math.max(len * C - gap, 0)} ${C}`}
      strokeDashoffset={-from * C}
      opacity={on && on !== key ? 0.35 : 1}
      className="cursor-pointer transition-[stroke-width,opacity] duration-200"
      tabIndex={0}
      role="button"
      aria-label={key === "saved" ? `Saved ${money(saved)} a month` : `Still charged about ${money(charged)} a month`}
      onPointerEnter={() => setOn(key)}
      onPointerLeave={() => setOn(null)}
      onFocus={() => setOn(key)}
      onBlur={() => setOn(null)}
    />
  );
  return (
    <Tile i={1} aria-labelledby="ah-int">
      <TileTitle id="ah-int" right={<span className="mono text-teal">{(rate / 100).toFixed(2)}%</span>}>
        Interest saved
      </TileTitle>
      <div className="flex items-center gap-4">
        <div className="relative size-[124px] flex-none">
          <svg viewBox="0 0 140 140" className="size-full -rotate-90">
            <circle cx="70" cy="70" r={R} fill="none" stroke="var(--color-raised)" strokeWidth="14" />
            {charged > 0 && arc(share, 1 - share, "color-mix(in srgb, var(--color-bad) 70%, transparent)", "charged")}
            {saved > 0 && arc(0, share, "var(--color-teal)", "saved")}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="mono text-[22px] leading-6 font-semibold tracking-[-0.03em]">
              {on === "charged" ? money(charged) : <Count k="acct:int" value={saved} format={(v) => money(v)} />}
            </span>
            <span className="text-[11.5px] text-ink-3">{on === "charged" ? "still charged" : "a month"}</span>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 text-[13px]">
          <div className="text-[11.5px] text-ink-3">A month</div>
          <Row c="var(--color-teal)" label="Saved" value={money(saved)} on={on === "saved"} />
          <Row
            c="color-mix(in srgb, var(--color-bad) 70%, transparent)"
            label="Charged"
            value={money(charged)}
            on={on === "charged"}
          />
          <div className="border-t border-line pt-2.5">
            <div className="text-[11.5px] text-ink-3">A year</div>
            <div className="mono text-[18px] font-semibold tracking-[-0.02em]">{money(saved * 12)}</div>
          </div>
        </div>
      </div>
      <div className="text-[12.5px] text-ink-3">
        {pct(share, 0)} of the loan's interest, and the money is still ours to use
      </div>
    </Tile>
  );
}

function Row({ c, label, value, on }: { c: string; label: string; value: string; on: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 transition-opacity", on ? "opacity-100" : "opacity-90")}>
      <i className="size-2.5 flex-none rounded-full" style={{ background: c }} />
      <span className={cn("text-ink-3", on && "text-ink")}>{label}</span>
      <span className="num ml-auto pl-2 whitespace-nowrap text-ink">{value}</span>
    </div>
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
    <Tile i={2} aria-labelledby="ah-30" className="md:col-span-2 xl:col-span-1">
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
          height={96}
          axis={[0, 15, 30]}
        />
      ) : (
        <div className="h-[96px] rounded-xl bg-raised/40" />
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
