/**
 * The loan and offset (design: CkLoan): balance, what's offsetting it, the interest charged on the rest, the rate and
 * repayment; the projection of the loan against the offsets (at the recent pace, or the planned saving from the
 * rules) with the date they meet and the goal; each account's share of the coverage; and what extra a month would do.
 * Estimates at today's rate, for the household's own planning.
 */
import { Loading } from "~/features/common/brand";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, type CSSProperties } from "react";
import { errorMessage } from "~/features/common/api";
import { colour, daysBetween, money, monthYear, pct, todayIso } from "~/features/common/format";
import { loanQuery } from "~/features/common/queries";
import { Dot, Empty, ErrorText, PageHead, Segmented, Tile, TileTitle } from "~/features/common/ui";
import { LoanSimulator } from "~/features/accounts/LoanSimulator";
import { RateChangeSheet, type Spotted } from "~/features/accounts/RateChange";
import { Banner } from "~/features/common/ds";
import { I } from "~/features/common/icons";
import { useStoredFlag } from "~/features/common/theme";
import { Button } from "~/features/common/ui";

export function LoanPage() {
  const q = useQuery(loanQuery);
  const [mode, setMode] = useState<"recent" | "planned">("recent");
  const search = useSearch({ from: "/_app/loan" });
  const navigate = useNavigate();
  const [rateOpen, setRateOpen] = useState(false);
  // A new rate an imported statement showed in the last two months, until it's been looked at.
  const latest = q.data?.changes.find((c) => c.field === "rate");
  const fresh =
    latest && latest.description !== "Changed in the app" && daysBetween(latest.date, todayIso()) < 61 ? latest : null;
  const [seen, setSeen] = useStoredFlag(`wmm:rate-seen:${fresh?.date}:${fresh?.value}`);
  const spotted: Spotted = fresh && !seen ? { date: fresh.date, value: fresh.value, was: fresh.was } : null;
  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (q.data === undefined) return <Loading />;
  const v = q.data;
  if (!v)
    return (
      <Empty
        title="No home loan yet"
        action={
          <Link to="/accounts" className="text-teal">
            Add the home loan
          </Link>
        }
      >
        Add the loan with its balance, rate and repayment, and choose which accounts offset it.
      </Empty>
    );
  const p = v[mode];
  const lo = v.loan;
  const goal = lo.goal_date;
  return (
    <>
      <PageHead
        over={`HOME LOAN${lo.rate_bp != null ? ` · ${(lo.rate_bp / 100).toFixed(2)}%` : ""}${goal ? ` · GOAL ${monthYear(goal).toUpperCase()}` : ""}`}
        title="Loan and offset"
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setRateOpen(true)}>Rate changed?</Button>
            <Segmented
              label="Pace"
              options={[
                { value: "recent", label: "Recent pace" },
                { value: "planned", label: "Planned saving" },
              ]}
              value={mode}
              onChange={setMode}
            />
          </span>
        }
      />
      {spotted && (
        <Banner
          g={I.loan}
          tone="loan"
          title={`The rate changed to ${(spotted.value / 100).toFixed(2)}%`}
          action={
            <span className="flex gap-2">
              <Button onClick={() => setSeen(true)}>Dismiss</Button>
              <Button primary onClick={() => setRateOpen(true)}>
                Check what changes
              </Button>
            </span>
          }
        >
          Spotted in a statement from {monthYear(spotted.date)}
          {spotted.was != null
            ? `, ${spotted.value > spotted.was ? "up" : "down"} from ${(spotted.was / 100).toFixed(2)}%`
            : ""}
          .
        </Banner>
      )}
      <RateChangeSheet
        open={rateOpen || !!search.rate}
        onClose={() => {
          setRateOpen(false);
          if (spotted) setSeen(true);
          if (search.rate) navigate({ to: "/loan", search: {}, replace: true });
        }}
        v={v}
        spotted={spotted}
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
        <Fig
          i={0}
          title="Loan balance"
          value={money(lo.balance)}
          sub={`−${money(Math.max(v.principal_per_month, 0))} a month in principal`}
        />
        <Fig
          i={1}
          title="Offsetting"
          value={money(v.offsetting)}
          sub={`${pct(v.coverage)} · ${v.by_account.length} accounts`}
        />
        <Fig
          i={2}
          title="Interest charged on"
          value={money(Math.max(lo.balance - v.offsetting, 0))}
          sub={`≈ ${money(v.charged_per_month)} this month`}
        />
        <Fig
          i={3}
          title="Rate"
          value={`${((lo.rate_bp ?? 0) / 100).toFixed(2)}%`}
          sub={`saving ${money(v.interest_per_day, { cents: true })} a day`}
        />
        <Fig i={4} title="Repayment" value={money(lo.repayment)} sub="monthly" />
      </div>
      {lo.rate_bp != null && lo.repayment ? (
        <LoanSimulator
          balance={lo.balance}
          offsetting={v.offsetting}
          rateBp={lo.rate_bp}
          repayment={lo.repayment}
          recentGrowth={v.monthly_growth}
        />
      ) : null}
      <Tile i={5} aria-labelledby="ln-proj">
        <TileTitle
          id="ln-proj"
          right={
            <span className="flex flex-wrap gap-3.5 text-[13px] font-medium">
              <span className="inline-flex items-center gap-1.5">
                <i className="h-0.5 w-3.5 bg-ink" />
                Loan
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="h-0.5 w-3.5 bg-teal" />
                All accounts
              </span>
            </span>
          }
        >
          Projection · loan vs offset
        </TileTitle>
        <Projection points={p.points} date={p.date} goal={goal} />
        <div className="text-[13px] text-ink-2">
          {p.date ? (
            <>
              At {mode === "recent" ? "the recent pace" : "the planned saving"} (
              {money(mode === "recent" ? v.monthly_growth : v.planned_growth)} a month more offsetting), the loan is
              fully offset by <b className="text-ink">{monthYear(p.date)}</b>
              {goal ? `, ${goalGap(p.date, goal)} your ${monthYear(goal)} goal` : ""}.
            </>
          ) : (
            "At this pace the offsets don't catch up with the loan. Planned saving uses the rules' monthly surplus instead."
          )}
        </div>
      </Tile>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] gap-4">
        <Tile i={6} aria-labelledby="ln-acc">
          <TileTitle id="ln-acc" right={<span className="mono">{pct(v.coverage)}</span>}>
            Coverage by account
          </TileTitle>
          {v.by_account.map((a, i) => (
            <div key={a.id} className="grid grid-cols-[110px_1fr_150px] items-center gap-3 text-[13px]">
              <span className="flex items-center gap-2">
                <Dot c={a.colour} />
                {a.name}
              </span>
              <span className="relative h-2.5 rounded-[3px] bg-raised">
                <i
                  className="grow-x absolute inset-y-0 left-0 rounded-[3px]"
                  style={
                    {
                      width: `${v.coverage ? (a.share / v.coverage) * 100 : 0}%`,
                      background: colour(a.colour),
                      "--i": i,
                    } as CSSProperties
                  }
                />
              </span>
              <span className="mono text-right">
                {money(a.balance)} · {pct(a.share)}
              </span>
            </div>
          ))}
          <div className="text-xs text-ink-3">Bars are each account's share of the {pct(v.coverage)} covered.</div>
        </Tile>
        <Tile i={7} aria-labelledby="ln-sc">
          <TileTitle id="ln-sc">Extra into offset · scenarios</TileTitle>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-xs text-ink-3">
                <th className="border-b border-line py-2 font-semibold">Extra / mo</th>
                <th className="border-b border-line py-2 font-semibold">100% date</th>
                <th className="border-b border-line py-2 text-right font-semibold">Sooner</th>
                <th className="border-b border-line py-2 text-right font-semibold">Interest saved</th>
              </tr>
            </thead>
            <tbody className="mono">
              {v.scenarios.map((s) => (
                <tr key={s.extra}>
                  <td className="border-b border-line py-2.5">{s.extra ? `+${money(s.extra)}` : "$0"}</td>
                  <td className="border-b border-line py-2.5">{monthYear(s.date)}</td>
                  <td className="border-b border-line py-2.5 text-right">
                    {s.extra && s.sooner ? `${s.sooner} mo` : "—"}
                  </td>
                  <td className="border-b border-line py-2.5 text-right">{s.extra ? money(s.interest_saved) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-xs text-ink-3">
            Estimates at today's rate, until the loan is fully offset. General information for your own planning, not
            advice.
          </div>
        </Tile>
      </div>
    </>
  );
}

function goalGap(date: string, goal: string): string {
  const [y1, m1] = date.split("-").map(Number);
  const [y2, m2] = goal.split("-").map(Number);
  const months = (y2 - y1) * 12 + (m2 - m1);
  if (months === 0) return "right on";
  return months > 0 ? `${months} months before` : `${-months} months after`;
}

function Fig({ i, title, value, sub }: { i: number; title: string; value: string; sub: string }) {
  return (
    <Tile i={i}>
      <div className="tt">{title}</div>
      <div className="mono text-[26px] font-semibold">{value}</div>
      <div className="mono text-xs text-ink-3">{sub}</div>
    </Tile>
  );
}

function Projection({
  points,
  date,
  goal,
}: {
  points: [string, number, number][];
  date: string | null;
  goal: string | null;
}) {
  const shown = points.length > 1 ? points : [];
  if (!shown.length) return <div className="h-[260px]" />;
  const w = 1000;
  const h = 260;
  const hi = Math.max(...shown.flatMap(([, l, o]) => [l, o])) * 1.05;
  const x = (i: number) => (i / (shown.length - 1)) * w;
  const y = (v: number) => h - (v / hi) * h;
  const line = (k: 1 | 2) => shown.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join("");
  const meet = date ? shown.findIndex((p) => p[0] === date) : -1;
  const goalIdx = goal ? shown.findIndex((p) => p[0] === goal) : -1;
  const years = shown.map((p, i) => [p[0], i] as const).filter(([m], i) => m.endsWith("-01") || i === 0);
  const step = Math.ceil(years.length / 6);
  return (
    <div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        height={h}
        preserveAspectRatio="none"
        role="img"
        aria-label={`The loan falling and the offsets growing until they meet${date ? ` in ${monthYear(date)}` : ""}`}
      >
        <path
          d={line(1)}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
          pathLength={1000}
          className="draw"
          style={{ strokeDasharray: 1000, ["--len" as string]: 1000 } as CSSProperties}
        />
        <path
          d={line(2)}
          fill="none"
          stroke="var(--color-teal)"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
          pathLength={1000}
          className="draw"
          style={{ strokeDasharray: 1000, ["--len" as string]: 1000 } as CSSProperties}
        />
        {meet >= 0 && (
          <line
            x1={x(meet)}
            x2={x(meet)}
            y1="0"
            y2={h}
            stroke="var(--color-teal)"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {goalIdx >= 0 && (
          <line
            x1={x(goalIdx)}
            x2={x(goalIdx)}
            y1="0"
            y2={h}
            stroke="var(--color-ink-3)"
            strokeDasharray="6 5"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="mono relative mt-1.5 h-4 text-xs text-ink-3">
        {years
          .filter((_, i) => i % step === 0)
          .map(([m, i]) => (
            <span key={m} className="absolute -translate-x-1/2" style={{ left: `${(i / (shown.length - 1)) * 100}%` }}>
              {m.slice(0, 4)}
            </span>
          ))}
      </div>
      <div className="mono mt-1 flex flex-wrap gap-4 text-xs">
        {date && <span className="text-teal">100% · {monthYear(date).toUpperCase()}</span>}
        {goal && <span className="text-ink-3">GOAL {monthYear(goal).toUpperCase()}</span>}
      </div>
    </div>
  );
}
