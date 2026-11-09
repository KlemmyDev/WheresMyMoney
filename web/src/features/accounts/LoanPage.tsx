/**
 * The loan and offset (the uplift canvas's EnLoan, on the entity template): what's owed and what the offset saves this
 * month in a sentence, the interest actually charged month by month; the projection of the loan against the offsets (at the recent pace, or the planned saving from the
 * rules) with the date they meet and the goal; each account's share of the coverage; and what extra a month would do.
 * Estimates at today's rate, for the household's own planning.
 */
import { Loading } from "~/features/common/brand";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, type CSSProperties } from "react";
import { errorMessage } from "~/features/common/api";
import { colour, daysBetween, longDate, money, monthYear, pct, todayIso } from "~/features/common/format";
import { loanQuery, type LoanView } from "~/features/common/queries";
import { Dot, Empty, ErrorText, Segmented, Tile, TileTitle } from "~/features/common/ui";
import { EntityHeader, EntityHero, Legend, MonthBars } from "~/features/common/entity";
import { EditButton, ROLE_GLYPH, ROLE_TONE } from "~/features/accounts/AccountsPage";
import { LoanChangePanel } from "~/features/accounts/LoanChangePanel";
import { LoanSimulator } from "~/features/accounts/LoanSimulator";
import { RateChangeSheet, type Spotted } from "~/features/accounts/RateChange";
import { Banner, Card, CardHead, Details, Term } from "~/features/common/ds";
import { Chip, I } from "~/features/common/icons";
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
  // What the offset saves this month: interest not charged on the part of the loan the accounts cover.
  const saved = (Math.min(v.offsetting, lo.balance) * (lo.rate_bp ?? 0)) / 10000 / 12;
  const rateNote = lo.rate_bp != null ? `at ${(lo.rate_bp / 100).toFixed(2)}% variable` : undefined;
  return (
    <>
      <EntityHeader
        back={{ to: "/accounts", label: "Accounts" }}
        mark={<Chip g={ROLE_GLYPH.loan} tone={ROLE_TONE.loan} size="xl" />}
        title={lo.name}
        sub={[
          lo.lender ?? null,
          lo.rate_bp != null ? `${(lo.rate_bp / 100).toFixed(2)}% ${lo.rate_type ?? "variable"}` : null,
          lo.repayment ? `${money(lo.repayment)} a month` : null,
          v.by_account.length
            ? `${v.by_account.length === 1 ? "one account offsets" : `${v.by_account.length} accounts offset`} it`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <EditButton
              account={lo}
              onClick={() => navigate({ to: "/loan", search: search.edit ? {} : { edit: 1 }, replace: true })}
            />
            {!spotted && <Button onClick={() => setRateOpen(true)}>Rate changed?</Button>}
          </>
        }
      />
      <LoanChangePanel
        key={String(!!search.edit)}
        v={v}
        open={!!search.edit}
        onClose={() => navigate({ to: "/loan", search: {}, replace: true })}
        onRateChanged={() => {
          navigate({ to: "/loan", search: {}, replace: true });
          setRateOpen(true);
        }}
      />
      {spotted && (
        <Banner
          g={I.loan}
          tone="loan"
          title={`The rate changed to ${(spotted.value / 100).toFixed(2)}%`}
          action={
            <>
              <Button onClick={() => setSeen(true)}>Dismiss</Button>
              <Button primary onClick={() => setRateOpen(true)}>
                Check what changes
              </Button>
            </>
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
          if (search.rate) navigate({ to: "/loan", search: { ...search, rate: undefined }, replace: true });
        }}
        v={v}
        spotted={spotted}
      />
      <EntityHero
        tint="bad"
        label="The loan in a sentence"
        numbers={[
          { label: "Owed", value: money(lo.balance), note: rateNote },
          { label: "Offsetting it", value: money(v.offsetting), note: `${pct(v.coverage)} of the loan` },
          {
            label: "Interest this month",
            value: money(v.charged_per_month),
            note: `${money(Math.max(v.principal_per_month, 0))} comes off the loan`,
          },
          { label: "Saved by the offset", value: money(saved), note: "this month" },
        ]}
      >
        <p className="m-0 text-[17px] leading-relaxed text-ink">
          We owe <b>{money(lo.balance)}</b> on the {lo.name.toLowerCase()}. Our accounts hold {money(v.offsetting)}{" "}
          <Term k="offset">against it</Term>, so interest is only charged on the other{" "}
          {money(Math.max(lo.balance - v.offsetting, 0))}. That saves about <b>{money(saved)} this month</b>.
        </p>
        <p className="m-0 text-[15px] text-ink-2">
          {v.recent.date
            ? `At the rate our accounts have been growing, they'll match the loan by ${monthYear(v.recent.date)}${goal ? `, ${goalGap(v.recent.date, goal)} our ${monthYear(goal)} aim` : ""}, and then no interest is charged at all.`
            : "At the rate our accounts have been growing, they won't catch up with the loan yet."}
        </p>
        {lo.rate_bp != null && lo.repayment ? (
          <Details label="What if we paid more, or the rate moved?">
            <LoanSimulator
              balance={lo.balance}
              offsetting={v.offsetting}
              rateBp={lo.rate_bp}
              repayment={lo.repayment}
              recentGrowth={v.monthly_growth}
            />
          </Details>
        ) : null}
      </EntityHero>
      {v.changes.length > 0 && <Changes changes={v.changes} />}
      {v.interest_charged && <InterestCharged c={v.interest_charged} estimate={v.charged_per_month} />}
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
          When our accounts match the loan
        </TileTitle>
        <Segmented
          label="Growth"
          options={[
            { value: "recent", label: "As lately" },
            { value: "planned", label: "As planned" },
          ]}
          value={mode}
          onChange={setMode}
        />
        <Projection points={p.points} date={p.date} goal={goal} />
        <div className="text-[13px] text-ink-2">
          {p.date ? (
            <>
              If our accounts keep growing by {money(mode === "recent" ? v.monthly_growth : v.planned_growth)} a month (
              {mode === "recent" ? "as they have lately" : "as the rules plan"}), they match the loan by{" "}
              <b className="text-ink">{monthYear(p.date)}</b>
              {goal ? `, ${goalGap(p.date, goal)} your ${monthYear(goal)} goal` : ""}.
            </>
          ) : (
            'At this rate our accounts don\'t catch up with the loan. "As planned" uses what the rules leave in the offset each month instead.'
          )}
        </div>
      </Tile>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] gap-4">
        <Tile i={6} aria-labelledby="ln-acc">
          <TileTitle id="ln-acc" right={<span className="mono">{pct(v.coverage)}</span>}>
            The offset effect
          </TileTitle>
          {v.by_account.map((a, i) => (
            <div key={a.id} className="grid grid-cols-[96px_1fr_auto] items-center gap-3 text-[13px]">
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
              <span className="mono text-right whitespace-nowrap">
                {money(a.balance)} · saves {money((a.balance * (lo.rate_bp ?? 0)) / 10000 / 12)}
              </span>
            </div>
          ))}
          <div className="text-xs text-ink-3">
            Each account's share of the {pct(v.coverage)} covered, and the interest it saves this month: {money(saved)}{" "}
            in all.
          </div>
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

/** The loan's changes, newest first, kept with its history: rates, repayments, lump sums and refinances. */
function Changes({ changes }: { changes: LoanView["changes"] }) {
  const said = (c: LoanView["changes"][number]) =>
    c.field === "lump"
      ? `${money(c.value)} paid in`
      : c.field === "repayment"
        ? `Repayment ${c.was != null ? `${money(c.was)} → ` : ""}${money(c.value)}`
        : `Rate ${c.was != null ? `${(c.was / 100).toFixed(2)}% → ` : ""}${(c.value / 100).toFixed(2)}%`;
  return (
    <Card aria-labelledby="ln-changes" className="flex flex-col gap-1">
      <CardHead
        id="ln-changes"
        title="Changes to the loan"
        right={<span className="text-[13px] text-ink-3">kept with its history</span>}
      />
      <ul className="m-0 flex list-none flex-col p-0">
        {changes.map((c, i) => (
          <li
            key={`${c.date}-${c.field}-${i}`}
            className="flex min-h-11 items-center justify-between gap-3 border-b border-line text-[14px] last:border-b-0"
          >
            <span className="min-w-0">
              <span className="block text-ink">{said(c)}</span>
              <span className="block truncate text-[12px] text-ink-3">{c.description}</span>
            </span>
            <span className="flex-none text-[13px] text-ink-3">{longDate(c.date)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The interest the bank actually charged, from the loan's statements: a cost of the loan, not money coming in. */
function InterestCharged({ c, estimate }: { c: NonNullable<LoanView["interest_charged"]>; estimate: number }) {
  return (
    <Card aria-labelledby="ln-int" className="flex flex-col gap-3">
      <CardHead
        id="ln-int"
        title="Interest charged"
        right={
          <span className="flex flex-wrap items-center gap-3.5">
            <Legend
              items={[
                { label: "Charged", kind: "solid", role: "bills" },
                { label: "At today's rate", kind: "line", role: "ink" },
              ]}
            />
            <span className="mono text-[13px] text-ink-3">{money(c.year)} over 12 months</span>
          </span>
        }
      />
      <p className="m-0 text-[15px] text-ink-2">
        {c.last ? (
          <>
            The bank charged <b className="text-ink">{money(c.last.amount, { cents: true })}</b> on{" "}
            {longDate(c.last.date)}
            {c.per_month ? `, and about ${money(c.per_month)} a month over the past year` : ""}. At today&apos;s rate
            and balances it&apos;s about {money(estimate)} a month.
          </>
        ) : (
          "The loan statements imported so far don't show any interest charged."
        )}
      </p>
      <MonthBars
        months={c.months.map((m) => ({ key: m.month, label: monthYear(m.month), value: Math.max(m.amount, 0) }))}
        line={{ value: estimate, label: "At today's rate" }}
        role="bills"
        name="Interest charged"
        height={140}
        format={(v) => money(v, { cents: true })}
        describe={(m) => (
          <>
            <b className="text-ink">{m.label}</b>: {money(m.value, { cents: true })} charged
            {m.value > estimate * 1.05
              ? `, ${money(m.value - estimate)} more than today's rate gives`
              : m.value < estimate * 0.95
                ? `, ${money(estimate - m.value)} less than today's rate gives`
                : ", about what today's rate gives"}
            .
          </>
        )}
      />
      <div className="text-xs text-ink-3">
        Interest is added to what we owe, so it&apos;s a cost of the loan. It isn&apos;t counted as money in or as a
        merchant.
      </div>
    </Card>
  );
}

function goalGap(date: string, goal: string): string {
  const [y1, m1] = date.split("-").map(Number);
  const [y2, m2] = goal.split("-").map(Number);
  const months = (y2 - y1) * 12 + (m2 - m1);
  if (months === 0) return "right on";
  return months > 0 ? `${months} months before` : `${-months} months after`;
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
