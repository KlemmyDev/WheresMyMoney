/**
 * Early retirement: Freedom (the uplift canvas's FiHub). The earliest the household could stop work, on today's plan
 * and with the plan (keep the loan money working once it's gone), as a dial; the biggest lever and Make it the plan;
 * how far along it is; the milestones on the way; the what-ifs; and this year against the saved plan. Every figure
 * comes from the engine (GET /api/fire); nothing here works out its own date.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { FireNav } from "~/features/fire/FireNav";
import { fireQuery, type FireReady } from "~/features/fire/api";
import { apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card, CardHead, Details, ROLE, Stat } from "~/features/common/ds";
import { money, monthYear, pct } from "~/features/common/format";
import { useToast } from "~/features/common/overlay";
import { refresh } from "~/features/common/queries";
import { Button, Empty, PageHead, Pill, cn } from "~/features/common/ui";

const k = (c: number) => (c >= 100_000_000 ? `$${(c / 100_000_000).toFixed(2)}M` : `$${Math.round(c / 100_000)}k`);

export function FireHub() {
  const q = useQuery(fireQuery);
  useEffect(() => {
    document.title = "Early retirement · WheresMyMoney";
  }, []);
  if (!q.data) return <Loading />;
  const f = q.data;
  return (
    <>
      <PageHead over="Future · Early retirement" title="Freedom" />
      <p className="-mt-2 mb-0 text-[14px] text-ink-3">
        The earliest you could stop work, and what would bring it sooner.
      </p>
      <FireNav />
      {!f.ready ? (
        <Empty
          title="Add your super first"
          action={
            <Link to="/retirement" className="text-teal">
              Go to Retirement
            </Link>
          }
        >
          {f.needs}
        </Empty>
      ) : (
        <Hub f={f} />
      )}
    </>
  );
}

function Hub({ f }: { f: FireReady }) {
  const qc = useQueryClient();
  const toast = useToast();
  const today = f.today;
  const plan = f.plan;
  const lead = f.people[0];
  const other = f.people[1];
  const sooner = today && plan ? today.retire_age - plan.retire_age : 0;
  const save = useMutation({
    mutationFn: () => apiSend<{ rules: { later: { year: number | null; monthly: number } } }>("POST", "fire/plan"),
    onSuccess: () => {
      refresh(qc);
      toast("It's the plan now", () =>
        apiSend("DELETE", "fire/plan")
          .then(() => refresh(qc))
          .catch((e) => toast(errorMessage(e))),
      );
    },
    onError: (e) => toast(errorMessage(e)),
  });
  const saved = f.saved;
  const needle = saved?.retire_age ?? plan?.retire_age ?? today?.retire_age ?? 70;
  const ghost = today?.retire_age ?? needle;
  const year = (age: number) => (lead ? new Date().getFullYear() + (age - lead.age) : age);

  return (
    <>
      <Card lit tint="bills" aria-labelledby="fh-hero" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 id="fh-hero" className="m-0 text-[15px] font-semibold text-ink-2">
            Your freedom date
          </h2>
          {plan && (
            <Pill tone={saved ? "good" : "teal"}>
              {saved ? `In the plan · lasts to ${saved.lasts}` : `${plan.retire_age} lasts to ${plan.lasts}`}
            </Pill>
          )}
        </div>
        <div className="grid items-center gap-4 md:grid-cols-[320px_1fr]">
          <Dial
            age={needle}
            ghost={ghost}
            year={year(needle)}
            other={other ? `${other.name} ${other.age - (lead?.age ?? 0) + needle}` : null}
          />
          <div className="flex flex-col gap-2">
            <p className="m-0 text-[19px] leading-relaxed text-ink">
              {saved ? (
                <>
                  Your freedom date:{" "}
                  <b>
                    {saved.retire_age}, in {saved.retire_year}
                  </b>
                  .
                </>
              ) : today && plan ? (
                <>
                  On today&apos;s plan you could stop at {today.retire_age}, in {today.retire_year}. Could be{" "}
                  <b>
                    {plan.retire_age} ({plan.retire_year})
                  </b>{" "}
                  if the loan money keeps working.
                </>
              ) : today ? (
                <>
                  You could stop at <b>{today.retire_age}</b>, in {today.retire_year}.
                </>
              ) : (
                <>Not by 70 on these numbers yet. Spending less once stopped, or putting more away, brings it in.</>
              )}
            </p>
            {today && (
              <p className="m-0 text-[14px] text-ink-3">
                Today&apos;s plan: {today.retire_age}, in {today.retire_year}
                {sooner > 0
                  ? `. ${sooner} ${sooner === 1 ? "year" : "years"} sooner if the loan money keeps working.`
                  : "."}
              </p>
            )}
            <Details label="See the numbers">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Stat
                  label="Today's plan"
                  value={today ? `${today.retire_age} · ${today.retire_year}` : "Not by 70"}
                  note={today ? `lasts to ${today.lasts}` : ""}
                  role="bills"
                />
                <Stat
                  label={`Put away at ${f.put_away.age}`}
                  value={k(f.put_away.super + f.put_away.etfs)}
                  note={`super ${k(f.put_away.super)}, ETFs ${k(f.put_away.etfs)}`}
                  role="bills"
                />
                <Stat
                  label="Loan gone"
                  value={f.loan ? monthYear(f.loan.gone) : "Gone"}
                  note={f.loan ? `then ${money(f.loan.freed)} a month is free` : ""}
                  role="bills"
                />
                <Stat
                  label="Before super opens"
                  value={`${f.bridge.years} ${f.bridge.years === 1 ? "year" : "years"}`}
                  note={
                    f.bridge.years ? `need ${k(f.bridge.need)}, on track for ${k(f.bridge.outside)}` : "super's open"
                  }
                  role="bills"
                />
              </div>
            </Details>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        {today && plan && sooner > 0 && f.loan && (
          <Card aria-labelledby="fh-lever" className="flex flex-col gap-3 md:col-span-7">
            <CardHead id="fh-lever" title="Biggest lever" right={<Pill tone="good">{sooner} years sooner</Pill>} />
            <p className="m-0 text-[17px] font-semibold text-ink">Keep investing the loan money once it&apos;s gone</p>
            <p className="m-0 text-[14px] text-ink-2">
              From {monthYear(f.loan.gone)} the loan&apos;s repayment and what now goes to the offset are free:{" "}
              <b className="text-ink">{money(f.loan.freed)}</b> a month. Put half into ETFs and half into super.
            </p>
            <div className="flex items-center gap-6">
              <span>
                <span className="block text-[12px] text-ink-3">Today&apos;s plan</span>
                <span className="num text-[26px]">{today.retire_age}</span>
              </span>
              <span aria-hidden className="text-ink-3">
                →
              </span>
              <span>
                <span className="block text-[12px] text-ink-3">With this</span>
                <span className="num text-[26px] text-savings">{plan.retire_age}</span>
              </span>
            </div>
            {saved ? (
              <p className="m-0 rounded-xl bg-savings/10 p-3 text-[14px] text-ink">
                <b>It&apos;s the plan now.</b> We&apos;ll remind you at the check-in after the loan&apos;s gone. The app
                never moves money.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button primary disabled={save.isPending} onClick={() => save.mutate()}>
                  Make it the plan
                </Button>
                <span className="text-[13px] text-ink-3">
                  Nothing changes in Rules today: until the loan&apos;s gone, what&apos;s spare still goes to the
                  offset.
                </span>
              </div>
            )}
          </Card>
        )}

        <Card aria-labelledby="fh-ring" className="flex flex-col gap-3 md:col-span-5">
          <CardHead id="fh-ring" title={`On the way to ${needle}`} />
          <div className="flex items-center gap-4">
            <Ring share={f.progress.share} />
            <div>
              <div className="num text-[20px] font-semibold">
                {k(f.progress.now)}{" "}
                <span className="text-[14px] font-normal text-ink-3">of about {k(f.progress.target)}</span>
              </div>
              <p className="m-0 text-[13px] text-ink-3">
                Super and ETFs today. The offset counts too, but it clears the loan first.
              </p>
            </div>
          </div>
          {f.vs_plan && (
            <p className="m-0 rounded-xl bg-tile-2 p-3 text-[14px]">
              This year against the plan:{" "}
              <b className={f.vs_plan.ahead >= 0 ? "text-savings" : "text-bad"}>
                {f.vs_plan.ahead >= 0 ? "ahead by" : "behind by"} {money(Math.abs(f.vs_plan.ahead))}
              </b>
              .
            </p>
          )}
        </Card>

        <Card aria-labelledby="fh-along" className="flex flex-col gap-3 md:col-span-12">
          <CardHead id="fh-along" title="Along the way" />
          <ol className="m-0 grid list-none gap-3 p-0 sm:grid-cols-3">
            <Mile
              name="Coast"
              m={f.milestones.coast}
              say="From here, work only has to pay for today: what you have grows enough to stop when super opens."
              role="offset"
            />
            <Mile
              name="Lean"
              m={f.milestones.lean}
              say={`Essentials covered for life${f.milestones.lean?.spend ? `: ${money(f.milestones.lean.spend)} a year` : ""}, lasting to ${f.assumptions.plan_to}.`}
              role="invest"
            />
            <Mile
              name="Full"
              m={f.milestones.full}
              say={`Your chosen ${f.milestones.full?.spend ? money(f.milestones.full.spend) : "spending"} a year, lasting to ${f.assumptions.plan_to}. After that, work is a choice.`}
              role="accent"
            />
          </ol>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0 text-[13px]">
            {f.loan && (
              <li className="rounded-full border border-line px-3 py-1">Loan gone · {monthYear(f.loan.gone)}</li>
            )}
            {f.people.map((p) => (
              <li key={p.name} className="rounded-full border border-line px-3 py-1">
                {p.name}&apos;s super opens · {p.opens}
              </li>
            ))}
          </ul>
        </Card>

        <Card aria-labelledby="fh-scen" className="flex flex-col gap-1 md:col-span-12">
          <CardHead
            id="fh-scen"
            title="Your scenarios"
            right={
              <Link to="/early-retirement/scenarios" className="text-[13px] font-semibold text-teal no-underline">
                Try a what-if →
              </Link>
            }
          />
          {f.scenarios.map((s) => {
            const mine = saved ? s.key === "keep" : s.key === "today";
            return (
              <div
                key={s.key}
                className={cn(
                  "flex min-h-12 items-center justify-between gap-3 border-b border-line text-[14px] last:border-b-0",
                  mine && "font-semibold",
                )}
              >
                <span className="flex items-center gap-2">
                  {s.name}
                  {mine && <Pill tone="teal">Plan</Pill>}
                </span>
                <span className="flex items-center gap-3">
                  <span className="num text-[18px]">{s.retire_age ?? "—"}</span>
                  <span className={cn("w-40 text-right text-[13px]", s.ok === false ? "text-bills" : "text-ink-3")}>
                    {s.lasts == null
                      ? ""
                      : s.ok
                        ? `Lasts to ${Math.min(s.lasts, 100)}`
                        : `Runs short · lasts to ${s.lasts}`}
                  </span>
                </span>
              </div>
            );
          })}
        </Card>
      </div>

      <p className="m-0 text-[12px] text-ink-3">
        Estimates to plan with, not advice. Today&apos;s dollars, {pct(f.assumptions.real_growth, 1)} growth after fees
        ({f.assumptions.fee_from === "funds" ? "your funds' own" : "a 0.6% guess"}) and inflation, 15% tax going into
        super, no age pension, money lasting to {f.assumptions.plan_to}. {f.assumptions.rules_year - 1}–
        {String(f.assumptions.rules_year).slice(2)} tax rules.
      </p>
    </>
  );
}

function Mile({
  name,
  m,
  say,
  role,
}: {
  name: string;
  m: { age: number; year: number } | null;
  say: string;
  role: keyof typeof ROLE;
}) {
  return (
    <li className="flex flex-col gap-1 rounded-2xl border border-line p-3">
      <span className="flex items-center gap-2 text-[14px] font-semibold">
        <i className="size-2.5 rounded-full" style={{ background: ROLE[role] }} />
        {name}
      </span>
      <span className="num text-[18px]">{m ? `${m.year} · ${m.age}` : "Not by 70"}</span>
      <span className="text-[13px] text-ink-3">{say}</span>
    </li>
  );
}

function Ring({ share }: { share: number }) {
  const c = 2 * Math.PI * 30;
  const p = Math.max(0, Math.min(1, share));
  return (
    <svg viewBox="0 0 72 72" className="size-20 flex-none" role="img" aria-label={`${Math.round(p * 100)}% of the way`}>
      <circle cx="36" cy="36" r="30" fill="none" stroke="var(--color-raised)" strokeWidth="8" />
      <circle
        cx="36"
        cy="36"
        r="30"
        fill="none"
        stroke="var(--color-bills-fill)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${(c * p).toFixed(1)} ${c.toFixed(1)}`}
        transform="rotate(-90 36 36)"
      />
      <text x="36" y="41" textAnchor="middle" className="fill-[var(--color-ink)] text-[15px] font-semibold">
        {Math.round(p * 100)}%
      </text>
    </svg>
  );
}

/** A 220° dial from 45 to 70: the needle at the freedom age, today's plan as a dashed ghost, the years between lit. */
function Dial({ age, ghost, year, other }: { age: number; ghost: number; year: number; other: string | null }) {
  const CX = 160;
  const CY = 170;
  const R = 120;
  const ang = (a: number) => ((200 - (220 * (Math.max(45, Math.min(70, a)) - 45)) / 25) * Math.PI) / 180;
  const P = (a: number, r: number) => [CX + r * Math.cos(ang(a)), CY - r * Math.sin(ang(a))];
  const arc = (a1: number, a2: number, r: number) => {
    if (a2 <= a1) return "";
    const [x1, y1] = P(a1, r);
    const [x2, y2] = P(a2, r);
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 ${(220 * (a2 - a1)) / 25 > 180 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  const [nx, ny] = P(age, R);
  const [gx1, gy1] = P(ghost, R - 18);
  const [gx2, gy2] = P(ghost, R + 22);
  const ticks = Array.from({ length: 26 }, (_, i) => 45 + i);
  return (
    <svg
      viewBox="0 0 320 230"
      className="w-full max-w-[320px]"
      role="img"
      aria-label={`Freedom dial from 45 to 70: could stop at ${age}, in ${year}. Today's plan, ${ghost}, is marked.`}
    >
      <path d={arc(45, 70, R)} fill="none" stroke="var(--color-raised)" strokeWidth="14" strokeLinecap="round" />
      <path d={arc(45, age, R)} fill="none" stroke="var(--color-bills-fill)" strokeWidth="14" strokeLinecap="round" />
      {ghost !== age && (
        <path
          d={arc(Math.min(age, ghost), Math.max(age, ghost), R)}
          fill="none"
          stroke="var(--color-savings-fill)"
          strokeWidth="14"
          opacity="0.45"
        />
      )}
      {ticks.map((a) => {
        const major = a % 5 === 0;
        const [x1, y1] = P(a, R + 13);
        const [x2, y2] = P(a, R + (major ? 23 : 18));
        const [lx, ly] = P(a, R + 36);
        return (
          <g key={a}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-ink-3)" strokeWidth={major ? 1.6 : 1} />
            {major && (
              <text x={lx} y={ly + 4} textAnchor="middle" className="fill-[var(--color-ink-3)] text-[11px]">
                {a}
              </text>
            )}
          </g>
        );
      })}
      {ghost !== age && (
        <line x1={gx1} y1={gy1} x2={gx2} y2={gy2} stroke="var(--color-ink-2)" strokeWidth="2" strokeDasharray="4 3" />
      )}
      <circle cx={nx} cy={ny} r="10" fill="var(--color-ink)" />
      <text x={CX} y={CY - 26} textAnchor="middle" className="fill-[var(--color-ink-3)] text-[11px] tracking-wider">
        COULD STOP AT
      </text>
      <text x={CX} y={CY + 18} textAnchor="middle" className="fill-[var(--color-ink)] text-[52px] font-semibold">
        {age}
      </text>
      <text x={CX} y={CY + 42} textAnchor="middle" className="fill-[var(--color-ink-3)] text-[12px]">
        in {year}
        {other != null ? ` · ${other}` : ""}
      </text>
    </svg>
  );
}
