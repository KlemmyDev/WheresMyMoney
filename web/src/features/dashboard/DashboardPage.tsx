/**
 * The dashboard (design: DirB, and CkPhone on a phone): loan coverage, interest avoided, the bills buffer and the
 * spending month as gauges, savings goals, cash flow, the accounts, the payday rules and the bills due.
 */
import { Loading } from "~/features/common/brand";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState, type CSSProperties } from "react";
import { errorMessage } from "~/features/common/api";
import { AreaLine, ArcGauge, Count, CoverageRing, FlowBars, Spark } from "~/features/common/charts";
import { amount, capsDate, colour, dayDate, money, monthCaps, monthYear, pct } from "~/features/common/format";
import { useActions } from "~/features/common/layout";
import { dashboardQuery } from "~/features/common/queries";
import type { Dashboard, Rule, Target } from "~/features/common/types";
import { Button, Dot, Empty, ErrorText, Pill, Segmented, Tile, TileTitle } from "~/features/common/ui";

const PERIODS = [
  { value: "30d", label: "30D" },
  { value: "6m", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "All" },
] as const;

export function DashboardPage() {
  const [period, setPeriod] = useState<"30d" | "6m" | "1y" | "all">("6m");
  const q = useQuery(dashboardQuery(period));
  const actions = useActions();
  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  const d = q.data;
  if (!d) return <Loading />;
  if (!d.accounts.length)
    return (
      <Empty
        title="No accounts yet"
        action={
          <Link to="/setup" className="text-teal">
            Set up your accounts
          </Link>
        }
      >
        Add your accounts and the home loan, and the dashboard fills in.
      </Empty>
    );
  const checkinDue = d.checkin.next <= d.today && d.checkin.last?.date !== d.today;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="mono text-xs text-ink-3">
          {d.checkin.last ? `BALANCES CHECKED IN ${dayDate(d.checkin.last.date).toUpperCase()}` : "NO CHECK-IN YET"} ·
          NEXT {dayDate(d.checkin.next).toUpperCase()}
        </div>
        <Segmented label="Period" options={[...PERIODS]} value={period} onChange={setPeriod} />
      </div>
      {(checkinDue || d.checkin.flags.length > 0) && (
        <div
          className="rise flex flex-wrap items-center gap-3 rounded-tile border border-teal/40 bg-teal/8 px-4 py-3"
          style={{ "--i": 0 } as CSSProperties}
        >
          <span className="min-w-0 flex-1">
            {d.checkin.flags.length ? (
              <>
                <b>
                  {d.checkin.flags[0].account} was {money(Math.abs(d.checkin.flags[0].difference))}{" "}
                  {d.checkin.flags[0].difference < 0 ? "short" : "over"}
                </b>{" "}
                <span className="text-ink-2">
                  at the last check-in
                  {d.checkin.flags[0].rule ? `: the ${d.checkin.flags[0].rule.label || "transfer"} didn't add up` : ""}.
                </span>
              </>
            ) : (
              <>
                <b>Check-in due</b>{" "}
                <span className="text-ink-2">· {d.accounts.length} balances · about 30 seconds</span>
              </>
            )}
          </span>
          <Button primary onClick={actions.checkin}>
            Check in
          </Button>
        </div>
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
        <Coverage d={d} />
        <Interest d={d} />
        <BillsGauge d={d} />
        <SpendingGauge d={d} />
        <Savings d={d} />
        <Flow d={d} />
        <Accounts d={d} />
        <Rules
          rules={d.rules}
          names={Object.fromEntries(d.accounts.map((a) => [a.id, a.name]))}
          colours={Object.fromEntries(d.accounts.map((a) => [a.id, a.colour]))}
        />
        <Due d={d} />
      </div>
    </>
  );
}

function Coverage({ d }: { d: Dashboard }) {
  const c = d.coverage;
  const ratio = c.ratio ?? 0;
  return (
    <Tile i={1} aria-labelledby="b-cov" className="flex-row flex-wrap items-center gap-6 md:col-span-2">
      <CoverageRing k="dash" all={ratio} offset={c.offset_ratio ?? 0}>
        <div className="mono text-[40px] leading-none font-semibold">
          <Count k="dash:cov" value={ratio * 1000} format={(v) => (v / 10).toFixed(1)} />
          <span className="text-xl">%</span>
        </div>
        <div className="mt-1 text-xs text-ink-3">of loan offset</div>
      </CoverageRing>
      <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-3.5">
        <div className="tt justify-start">
          <span id="b-cov">Loan coverage</span>
          {c.change_mtd != null && (
            <Pill tone={c.change_mtd >= 0 ? "good" : "warn"}>
              {c.change_mtd >= 0 ? "+" : "−"}
              {Math.abs(c.change_mtd * 100).toFixed(1)} pts MTD
            </Pill>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
          <Fig
            label={
              <>
                <Dot c="teal" />
                All accounts
              </>
            }
            value={<Count k="dash:all" value={c.offsetting} format={(v) => money(v)} />}
          />
          <Fig
            label={
              <>
                <Dot c="offset" />
                Offset only
              </>
            }
            value={money(c.offset_only)}
          />
          <Fig label="Loan balance" value={money(c.loan)} />
          <Fig label="100% ETA" value={monthYear(c.eta)} />
        </div>
      </div>
    </Tile>
  );
}

function Fig({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-ink-3">{label}</div>
      <div className="mono text-xl font-medium">{value}</div>
    </div>
  );
}

function Interest({ d }: { d: Dashboard }) {
  const i = d.interest;
  return (
    <Tile i={2} aria-labelledby="b-int">
      <TileTitle id="b-int" right={<span className="mono text-teal">{(d.coverage.rate_bp / 100).toFixed(2)}%</span>}>
        Interest avoided
      </TileTitle>
      <div className="mono text-[34px] leading-tight font-semibold">
        <Count k="dash:int" value={i.per_day} format={(v) => money(v, { cents: true })} />
        <span className="text-[15px] font-normal text-ink-3"> /day</span>
      </div>
      <AreaLine
        values={i.months.map((m) => m.per_day)}
        colour="var(--color-teal)"
        height={70}
        label="Daily interest avoided, month by month"
      />
      <div className="mono flex justify-between text-xs text-ink-2">
        <span>{money(i.this_month)} this month</span>
        <span>{money(i.per_year)} / yr</span>
      </div>
    </Tile>
  );
}

function BillsGauge({ d }: { d: Dashboard }) {
  const b = d.bills;
  const t = b?.target as Extract<Target, { kind: "months" }> | null | undefined;
  if (!b || !t) return null;
  const held = t.held ?? 0;
  const full = (t.months || 3) * (4 / 3);
  const on = held >= t.months;
  return (
    <Tile i={3} aria-labelledby="b-bills">
      <TileTitle id="b-bills" right={<Pill tone={on ? "good" : "warn"}>{on ? "ON TARGET" : "UNDER TARGET"}</Pill>}>
        Bills account
      </TileTitle>
      <ArcGauge
        k="dash:bills"
        value={held / full}
        mark={t.months / full}
        colour="var(--color-bills)"
        label={`${held.toFixed(1)} months of bills held, target ${t.months} months`}
      >
        <span className="mono text-[26px] font-semibold">{held.toFixed(1)}</span>
        <span className="text-[13px] text-ink-3"> months</span>
      </ArcGauge>
      <div className="mono flex justify-between text-xs text-ink-2">
        <span>{money(b.balance)}</span>
        <span>
          target {money(t.amount)} ({t.months} mo)
        </span>
      </div>
    </Tile>
  );
}

function SpendingGauge({ d }: { d: Dashboard }) {
  const s = d.spending;
  if (!s) return null;
  const under = s.vs_pace <= 0;
  const evenLeft = s.allowance * (1 - s.pace);
  return (
    <Tile i={4} aria-labelledby="b-spend">
      <TileTitle id="b-spend" right={<Pill tone={under ? "good" : "warn"}>{under ? "UNDER PACE" : "OVER PACE"}</Pill>}>
        Spending account
      </TileTitle>
      <ArcGauge
        k="dash:spend"
        value={s.allowance ? s.left / s.allowance : 0}
        mark={s.allowance ? evenLeft / s.allowance : null}
        colour="var(--color-spending)"
        label={`${money(s.left)} of ${money(s.allowance)} left with ${s.remaining} days to go; even pace would leave ${money(evenLeft)}`}
      >
        <span className="mono text-[26px] font-semibold">
          <Count k="dash:left" value={s.left} format={(v) => money(v)} />
        </span>
        <span className="text-[13px] text-ink-3"> left</span>
      </ArcGauge>
      <div className="mono flex justify-between text-xs text-ink-2">
        <span>of {money(s.allowance)} (1 mo)</span>
        <span>{s.remaining} days to top-up</span>
      </div>
    </Tile>
  );
}

function Savings({ d }: { d: Dashboard }) {
  const s = d.savings;
  if (!s) return null;
  return (
    <Tile i={5} aria-labelledby="b-save">
      <TileTitle id="b-save" right={<span className="mono text-ink-3">{s.goals.length} GOALS</span>}>
        Savings account
      </TileTitle>
      <div className="mono text-[34px] leading-tight font-semibold">
        <Count k="dash:save" value={s.balance} format={(v) => money(v)} />
      </div>
      <div className="flex flex-col gap-2 text-xs">
        {s.goals.slice(0, 3).map((g, i) => {
          const p = g.target ? Math.min(g.saved / g.target, 1) : 0;
          return (
            <div key={g.id}>
              <div className="flex justify-between">
                <span className="text-ink-2">{g.name}</span>
                <span className="mono">{pct(p, 0)}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-sm bg-raised">
                <i
                  className="grow-x block h-full rounded-sm bg-savings"
                  style={{ width: `${p * 100}%`, "--i": i } as CSSProperties}
                />
              </div>
            </div>
          );
        })}
        {!s.goals.length && (
          <Link to="/accounts" className="text-teal">
            Split it into goals
          </Link>
        )}
      </div>
    </Tile>
  );
}

function Flow({ d }: { d: Dashboard }) {
  const surplus = d.flow.filter((m) => !m.partial);
  const avg = surplus.length ? surplus.reduce((s, m) => s + m.in - m.out, 0) / surplus.length : 0;
  return (
    <Tile i={6} aria-labelledby="b-flow" className="md:col-span-2">
      <TileTitle
        id="b-flow"
        right={
          <span className="flex gap-3.5 text-[13px] font-medium">
            <span className="inline-flex items-center gap-1.5">
              <i className="size-2 rounded-sm bg-teal" />
              In
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="size-2 rounded-sm bg-out" />
              Out
            </span>
          </span>
        }
      >
        Cash flow · {d.flow.length} {d.flow.length === 1 ? "month" : "months"}
      </TileTitle>
      <FlowBars
        label="Money in and out each month, transfers between your accounts left out"
        months={d.flow.map((m) => ({
          label: monthCaps(m.month) + (m.partial ? "*" : ""),
          in: m.in,
          out: m.out,
          partial: m.partial,
        }))}
      />
      <div className="mono text-xs text-ink-2">
        Avg surplus {money(avg)} / mo
        {d.accounts.every((a) => a.offsets_loan) ? ", all of it landing in offsetting accounts" : ""}
      </div>
    </Tile>
  );
}

function targetText(t: Target | null | undefined, balance: number): string {
  if (!t) return "—";
  if (t.kind === "loan") return `${pct(t.progress)} of 100%`;
  if (t.kind === "months") return `${(t.held ?? 0).toFixed(1)} of ${t.months} mo`;
  if (t.kind === "allowance") return `${pct(t.progress, 0)} of 1 mo`;
  return t.amount ? `${pct(balance / t.amount, 0)} of goals` : "no goals yet";
}

function Accounts({ d }: { d: Dashboard }) {
  return (
    <Tile i={7} aria-labelledby="b-acc" className="md:col-span-2">
      <TileTitle
        id="b-acc"
        right={
          <span className="mono text-ink-3">
            {d.accounts.every((a) => a.offsets_loan) ? "ALL OFFSET THE LOAN" : ""}
          </span>
        }
      >
        Accounts
      </TileTitle>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[minmax(120px,1.2fr)_1fr_90px_1fr_90px] items-center gap-3 pb-2 text-xs text-ink-3">
            <span>Account</span>
            <span>Balance</span>
            <span>30 days</span>
            <span>Target</span>
            <span>Trend</span>
          </div>
          {d.accounts.map((a) => (
            <Link
              key={a.id}
              to="/accounts"
              search={{ id: a.id }}
              className="grid grid-cols-[minmax(120px,1.2fr)_1fr_90px_1fr_90px] items-center gap-3 border-t border-line py-[11px] text-ink no-underline hover:bg-raised/40"
            >
              <span className="flex items-center gap-2 font-medium">
                <Dot c={a.colour} />
                {a.name}
              </span>
              <span className="mono">{money(a.balance)}</span>
              <span className="mono" style={{ color: a.change_30d >= 0 ? "var(--color-good)" : "var(--color-warn)" }}>
                {amount(a.change_30d, { sign: true })}
              </span>
              <span className="mono text-xs text-ink-2">{targetText(a.target, a.balance)}</span>
              <Spark values={a.spark} colour={colour(a.colour)} />
            </Link>
          ))}
        </div>
      </div>
    </Tile>
  );
}

function ruleText(r: Rule, names: Record<number, string>) {
  const to = names[r.to_account ?? 0] ?? "?";
  const from = names[r.from_account ?? 0] ?? "?";
  if (r.kind === "pay")
    return (
      <>
        Pay lands in <b>{to}</b>
      </>
    );
  if (r.kind === "top_up")
    return (
      <>
        Top <b>{to}</b> up to
      </>
    );
  if (r.kind === "sweep")
    return (
      <>
        Sweep <b>{from}</b> over {r.amount / 100} mo → <b>{to}</b>
      </>
    );
  return (
    <>
      {from} → <b>{to}</b>
    </>
  );
}

function Rules({
  rules,
  names,
  colours,
}: {
  rules: Rule[];
  names: Record<number, string>;
  colours: Record<number, string>;
}) {
  const on = rules.filter((r) => r.enabled);
  const next =
    on
      .filter((r) => r.kind === "pay")
      .map((r) => r.next_run)
      .sort()[0] ?? on.map((r) => r.next_run).sort()[0];
  return (
    <Tile i={8} aria-labelledby="b-rules">
      <TileTitle id="b-rules" right={<Pill tone={on.length ? "good" : "mute"}>{on.length} ACTIVE</Pill>}>
        Payday rules
      </TileTitle>
      {on.slice(0, 5).map((r) => (
        <div key={r.id} className="flex items-center gap-2.5 rounded-lg bg-raised px-3 py-2.5 text-[13px]">
          <Dot c={colours[r.to_account ?? 0]} />
          <span className="flex-1">{ruleText(r, names)}</span>
          <span className="mono text-ink-2">{r.kind === "sweep" ? "varies" : money(r.amount)}</span>
        </div>
      ))}
      {!on.length && (
        <Link to="/rules" className="text-teal">
          Set up your payday rules
        </Link>
      )}
      {next && <div className="mono text-xs text-ink-3">NEXT RUN {dayDate(next).toUpperCase()}</div>}
    </Tile>
  );
}

function Due({ d }: { d: Dashboard }) {
  const biggest = [...d.due.items]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <Tile i={9} aria-labelledby="b-due">
      <TileTitle id="b-due" right={<span className="mono">{money(d.due.total)}</span>}>
        Due · 30 days{d.due.count > 5 ? ` · biggest 5 of ${d.due.count}` : ""}
      </TileTitle>
      <div>
        {biggest.map((b) => (
          <div key={`${b.bill_id}-${b.date}`} className="flex items-center gap-3 border-t border-line py-2">
            <span className="mono w-[52px] text-xs text-ink-3">{capsDate(b.date)}</span>
            <span className="flex-1">{b.name}</span>
            <span className="mono">{amount(b.amount, { cents: true })}</span>
          </div>
        ))}
        {!biggest.length && <div className="text-ink-3">Nothing due in the next 30 days.</div>}
      </div>
    </Tile>
  );
}
