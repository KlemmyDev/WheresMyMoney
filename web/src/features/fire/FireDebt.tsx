/**
 * Early retirement: Home loan (the FIRE on track canvas's loan sub page). For stopping early the loan only has to be
 * gone by the year you stop; after that its repayments can become investing money. What's owed past the offset
 * against the most you can owe each year, and where a spare amount a month does the most for the goal: into super
 * (salary sacrifice, the same take-home cost), outside super, or onto the loan. From the engine (/api/fire/track).
 */
import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { FireNav } from "~/features/fire/FireNav";
import type { Track, TrackReady } from "~/features/fire/api";
import { COLOUR, CompareChart, Status, TONE, k, statusOf, useScrub, useTrack } from "~/features/fire/track";
import { apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card, Eyebrow } from "~/features/common/ds";
import { money, pct } from "~/features/common/format";
import { Empty, ErrorText, PageHead, cn } from "~/features/common/ui";

export function FireDebt() {
  const q = useTrack();
  if (q.isError && !q.data) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!q.data) return <Loading />;
  const t = q.data;
  return (
    <>
      <PageHead over="Future · Early retirement" title="Home loan" />
      <p className="-mt-2 mb-0 max-w-[680px] text-[14px] text-ink-3">
        For stopping early the loan only has to be gone by the year you stop. After that, its repayments can become
        investing money.
      </p>
      <FireNav />
      {!t.ready ? (
        <Empty
          title="Add your super first"
          action={
            <Link to="/retirement" className="text-teal">
              Go to Retirement
            </Link>
          }
        >
          {t.needs}
        </Empty>
      ) : !t.loan || t.parts.loan.have <= 0 ? (
        <Empty title="Nothing owed past the offset">
          The offset covers the loan, so there&apos;s nothing to clear before you stop. Spare money goes to super or
          investments.
        </Empty>
      ) : (
        <Loan t={t} />
      )}
    </>
  );
}

const AMOUNTS = [25_000, 50_000, 100_000];

function Loan({ t }: { t: TrackReady }) {
  const lead = t.people[0];
  const loan = t.loan!;
  const goalI = Math.min(t.goal.age - lead.age, t.years.length - 1);
  const goneI = loan.gone_year != null ? loan.gone_year - t.years[0].year : goalI;
  const end = Math.min(t.years.length - 1, Math.max(goalI, goneI) + 2);
  const ys = t.years.slice(0, end + 1);
  const { at, handlers } = useScrub(end, Math.max(0, Math.min(goneI - 4, end)));
  const p = t.parts.loan;
  const s = statusOf(p);
  const y = ys[at];
  const inRange = at <= goalI;
  const d = (y.owe_max ?? 0) - y.owed;
  const [amt, setAmt] = useState(50_000);
  const sacGross = Math.round(amt / t.take_home / 5_000) * 5_000;
  const tries = [
    { key: "none", name: "Nothing extra", sub: "Today's plan", colour: "var(--color-ink-3)", body: null },
    {
      key: "super",
      name: "Into super",
      sub: `${money(sacGross)} salary sacrificed (costs ${money(amt)} take-home)`,
      colour: COLOUR.super,
      body: { extra_super: sacGross },
    },
    {
      key: "etfs",
      name: "Outside super",
      sub: `${money(amt)} into investments`,
      colour: COLOUR.outside,
      body: { extra_etfs: amt },
    },
    {
      key: "loan",
      name: "Onto the loan",
      sub: `${money(amt)} extra repayment`,
      colour: COLOUR.loan,
      body: { extra_loan: amt },
    },
  ];
  const results = useQueries({
    queries: tries.map((x) => ({
      queryKey: ["fire", "track", x.body ?? {}],
      queryFn: () => apiSend<Track>("POST", "fire/track", x.body ?? {}),
    })),
  });
  const lo = 80;
  const hi = 101;
  const W = (age: number) => ((Math.min(age, hi) - lo) / (hi - lo)) * 100;
  const rows = tries.map((x, i) => {
    const r = results[i].data;
    const ready = r && r.ready ? r : null;
    const lasts = ready ? Math.min(ready.at_goal.lasts, hi) : null;
    return { ...x, lasts, earliest: ready?.pace?.retire_age ?? null, gone: ready?.loan?.gone_year ?? null };
  });
  const loanRow = rows[3];
  const ranked = rows.slice(1).filter((r) => r.lasts != null);
  const best = ranked.reduce<(typeof rows)[number] | null>(
    (b, r) => (!b || (r.lasts ?? 0) > (b.lasts ?? 0) ? r : b),
    null,
  );
  const early = loan.gone_year != null && loan.gone_year < t.goal.year;
  const marks = [
    { i: goneI, label: `Gone ${loan.gone_year ?? ""}`, colour: COLOUR.loan },
    { i: goalI, label: `Stop ${t.goal.age}`, colour: COLOUR.super },
  ];
  return (
    <>
      <Card lit className="gap-6">
        <div className="flex flex-wrap items-stretch gap-6">
          <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-2">
            <span className="self-start">
              <Status tone={s.tone}>{s.label}</Status>
            </span>
            <h2 className="m-0 font-brand text-[34px] leading-10 font-semibold tracking-[-0.02em] sm:text-[40px] sm:leading-[46px]">
              {loan.gone_year == null
                ? "Not gone by 70"
                : early
                  ? `Gone ${t.goal.year - loan.gone_year} years early`
                  : loan.gone_year === t.goal.year
                    ? "Gone the year you stop"
                    : "Still owing when you stop"}
            </h2>
            <p className="m-0 max-w-[540px] text-ink-2">
              {p.ahead >= 0
                ? `You owe ${k(p.ahead)} less than the most you could. It isn't what's holding you back, so spare money usually does more elsewhere.`
                : `On today's repayments it outlasts your stop date, and its repayments would come out of retirement money.`}
            </p>
          </div>
          <div className="grid min-w-0 flex-[1_1_460px] grid-cols-2 gap-3 sm:grid-cols-4">
            <Fig label="Owe at most" value={k(p.need)} />
            <Fig label="Owe now" value={k(p.have)} colour={COLOUR.loan} />
            <Fig label="In the offset" value={k(loan.offset)} />
            <Fig
              label="Gone in"
              value={loan.gone_year ? String(loan.gone_year) : "After 70"}
              colour={early ? TONE.good : TONE.warn}
            />
          </div>
        </div>
      </Card>
      <Card aria-labelledby="fd-path" className="gap-3.5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="fd-path" className="m-0 text-[20px] leading-7 font-semibold">
              Owing, year by year
            </h2>
            <div className="text-[12px] text-ink-3">
              Dashed: the most you can owe and still be clear by {t.goal.year} · solid: on schedule · hover any year
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-5" aria-live="polite">
            <div>
              <div className="text-[12px] text-ink-3">{y.year} · owe at most</div>
              <div className="num text-[20px]">{inRange ? money(y.owe_max) : "—"}</div>
            </div>
            <div>
              <div className="text-[12px] text-ink-3">On schedule</div>
              <div className="num text-[20px]" style={{ color: COLOUR.loan }}>
                {y.owed > 0 ? money(y.owed) : "Gone"}
              </div>
            </div>
            <Status tone={!inRange || d >= 0 ? "good" : "warn"}>
              {!inRange ? "Past the stop year" : `${d >= 0 ? "Ahead" : "Behind"} ${k(Math.abs(d))}`}
            </Status>
          </div>
        </div>
        <CompareChart
          need={ys.map((x) => x.owe_max)}
          pace={ys.map((x) => x.owed)}
          end={goalI}
          years={ys.map((x) => x.year)}
          colour={COLOUR.loan}
          lower
          at={at}
          handlers={handlers}
          marks={marks}
          label="Loan: pick a year"
          height={280}
        />
      </Card>
      <Card aria-labelledby="fd-spare" className="gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="fd-spare" className="m-0 text-[20px] leading-7 font-semibold">
              Where should a spare {money(amt)} a month go?
            </h2>
            <p className="mt-1 mb-0 max-w-[720px] text-[14px] text-ink-2">
              The same take-home money, three places. Bars show how long the money lasts if you stop at {t.goal.age}
              (longer is better; the goal is {t.goal.plan_to}).
            </p>
          </div>
          <div role="group" aria-label="Spare each month" className="flex flex-wrap gap-2">
            {AMOUNTS.map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={a === amt}
                onClick={() => setAmt(a)}
                className={cn(
                  "press min-h-11 cursor-pointer rounded-full border px-4 text-[14px] font-semibold",
                  a === amt
                    ? "border-teal bg-teal text-on-solid"
                    : "border-line-2 bg-transparent text-ink-2 hover:text-ink",
                )}
              >
                {money(a)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <div
              key={r.key}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(180px,240px)_minmax(0,1fr)_110px]"
            >
              <div>
                <div className="font-semibold">{r.name}</div>
                <div className="text-[13px] leading-[18px] text-ink-2">
                  {r.sub}
                  {r.key === "loan" && r.gone ? `, gone in ${r.gone}` : ""}
                </div>
              </div>
              <div
                className="relative col-span-2 h-7 rounded-lg border border-line bg-sunken sm:col-span-1 sm:col-start-2 sm:row-start-1"
                aria-hidden
              >
                {r.lasts != null && (
                  <div
                    className="absolute inset-y-0 left-0 rounded-lg"
                    style={{ width: `${W(r.lasts)}%`, background: r.colour, opacity: 0.85 }}
                  />
                )}
                <div className="absolute -inset-y-1 w-0.5 bg-ink" style={{ left: `${W(t.goal.plan_to)}%` }} />
              </div>
              <div className="text-right sm:col-start-3 sm:row-start-1">
                <div className="num font-semibold">
                  {r.lasts == null ? "…" : r.lasts >= hi ? "Past 100" : `Until ${r.lasts}`}
                </div>
                <div className="text-[12px] text-ink-3">earliest {r.earliest ?? "70+"}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-line bg-sunken px-4 py-3.5 text-[14px] leading-5 text-ink-2">
          {best == null
            ? "Working it out…"
            : best.key === "loan"
              ? "The loan comes out best here: it goes sooner, and the bigger repayment then keeps working as investments."
              : `${best.name} does the most for this goal. ${early ? `The loan's already gone ${t.goal.year - (loan.gone_year ?? t.goal.year)} years before you stop, so extra repayments only help once they become investing money` : "Extra repayments help most when the loan would otherwise still be there when you stop"}; they're the safe choice (a sure ${pct(loan.rate)}), not the fastest.${loanRow.lasts != null && best.lasts != null && best.lasts - loanRow.lasts <= 1 ? " At this amount the gap is small." : ""}`}
          {!t.levers.keep &&
            " Today's plan stops the loan's repayments going anywhere once it's gone; keeping them working (on the hub) makes the loan option stronger."}
        </div>
      </Card>
      <p className="m-0 text-[13px] text-ink-3">
        Loan at {pct(loan.rate, 2)} on what&apos;s owed after the {money(loan.offset)} offset, {money(loan.repayment)} a
        month. Everything that offsets the loan counts. An estimate, not advice.{" "}
        <Link to="/loan" className="text-teal">
          The loan itself
        </Link>
      </p>
    </>
  );
}

function Fig({ label, value, colour }: { label: string; value: string; colour?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-sunken p-3.5">
      <Eyebrow>{label}</Eyebrow>
      <div className="num mt-1 text-[20px] leading-[26px]" style={colour ? { color: colour } : undefined}>
        {value}
      </div>
    </div>
  );
}
