/**
 * Early retirement: Outside super (the FIRE on track canvas's bridge sub page). The investments you can reach before
 * super opens: built up while working (what you put in, then the loan's leftovers and freed repayments), spent down
 * across the years from stopping to 60. Against the path it has to follow, the money going in and out each year, the
 * bridge years one by one, and more each month to try. From the engine (GET/POST /api/fire/track).
 */
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { FireNav } from "~/features/fire/FireNav";
import type { TrackReady } from "~/features/fire/api";
import { COLOUR, CompareChart, Status, TONE, k, statusOf, useScrub, useTrack } from "~/features/fire/track";
import { errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card, Eyebrow } from "~/features/common/ds";
import { money } from "~/features/common/format";
import { Empty, ErrorText, PageHead } from "~/features/common/ui";

export function FireBridge() {
  const [extra, setExtra] = useState(0);
  const base = useTrack();
  const tried = useTrack(extra > 0 ? { extra_etfs: extra } : undefined);
  const q = extra > 0 ? tried : base;
  if (q.isError && !q.data) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!q.data || !base.data) return <Loading />;
  const t = q.data;
  return (
    <>
      <PageHead over="Future · Early retirement" title="Outside super" />
      <p className="-mt-2 mb-0 max-w-[680px] text-[14px] text-ink-3">
        The investments you can reach before super opens. It&apos;s the only money between stopping work and 60, so it
        has to carry you across.
      </p>
      <FireNav />
      {!t.ready || !base.data.ready ? (
        <Empty
          title="Add your super first"
          action={
            <Link to="/retirement" className="text-teal">
              Go to Retirement
            </Link>
          }
        >
          {t.ready ? "" : t.needs}
        </Empty>
      ) : (
        <Bridge t={t} base={base.data} extra={extra} setExtra={setExtra} />
      )}
    </>
  );
}

function Bridge({
  t,
  base,
  extra,
  setExtra,
}: {
  t: TrackReady;
  base: TrackReady;
  extra: number;
  setExtra: (v: number) => void;
}) {
  const lead = t.people[0];
  const goalI = Math.min(t.goal.age - lead.age, t.years.length - 1);
  const opensI = Math.min(t.opens - lead.age, t.years.length - 1);
  const end = Math.min(t.years.length - 1, opensI + 6);
  const ys = t.years.slice(0, end + 1);
  const { at, handlers } = useScrub(end, goalI);
  const p = t.parts.outside;
  const bridge = t.goal.age < t.opens;
  const s = statusOf(p);
  const y = ys[at];
  const goneI = t.loan?.gone_year != null ? t.loan.gone_year - ys[0].year : null;
  const marks = [
    ...(goneI != null && goneI <= end ? [{ i: goneI, label: "Loan gone", colour: COLOUR.loan }] : []),
    { i: goalI, label: `Stop ${t.goal.age}`, colour: COLOUR.super },
    { i: opensI, label: "Super opens", colour: TONE.good },
  ];
  const inThisYear = y.put_in.etfs + y.put_in.lump;
  const outThisYear = (y.paid?.etfs ?? 0) + (y.paid?.cash ?? 0);
  const d = y.etfs - y.outside_need;

  // Money in (up) and out (down) each year.
  const W = 1200;
  const H = 130;
  const pl = 64;
  const pr = 16;
  const mid = 64;
  const slot = (W - pl - pr) / end;
  const bw = Math.max(3, slot * 0.6);
  const xs = (i: number) => pl + (i / end) * (W - pl - pr);
  const mx = Math.max(
    1,
    ...ys.map((x) => Math.max(x.put_in.etfs + x.put_in.lump, (x.paid?.etfs ?? 0) + (x.paid?.cash ?? 0))),
  );
  const sc = (v: number) => (v / mx) * (mid - 8);
  const bar = (x: number, y0: number, h: number) =>
    h < 0.3
      ? ""
      : `M${(x - bw / 2).toFixed(1)} ${y0.toFixed(1)} h${bw.toFixed(1)} v${h.toFixed(1)} h${(-bw).toFixed(1)} Z `;
  let saved = "";
  let lump = "";
  let spent = "";
  ys.forEach((x, i) => {
    const a = sc(x.put_in.etfs);
    const l = sc(x.put_in.lump);
    saved += bar(xs(i), mid - a, a);
    lump += bar(xs(i), mid - a - l, l);
    spent += bar(xs(i), mid, sc((x.paid?.etfs ?? 0) + (x.paid?.cash ?? 0)));
  });
  const pc = (v: number, of: number) => `${(v / of) * 100}%`;
  const rows = t.years.filter((x) => x.age >= t.goal.age && x.age <= Math.max(t.opens + 1, t.goal.age + 1));
  return (
    <>
      <Card lit className="gap-6">
        <div className="flex flex-wrap items-stretch gap-6">
          <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-2">
            {bridge && (
              <span className="self-start">
                <Status tone={s.tone}>{s.label}</Status>
              </span>
            )}
            <h2 className="m-0 font-brand text-[34px] leading-10 font-semibold tracking-[-0.02em] sm:text-[40px] sm:leading-[46px]">
              {!bridge ? "No bridge to pay for" : p.ahead >= 0 ? "Ahead of the path" : `${k(-p.ahead)} behind the path`}
            </h2>
            <p className="m-0 max-w-[540px] text-ink-2">
              {bridge
                ? `On pace it reaches ${k(t.years[goalI].etfs)} by ${t.goal.year}, against ${k(t.years[goalI].outside_need)} needed for ${t.opens - t.goal.age} years at ${money(t.goal.spend)}.`
                : `Stopping at ${t.goal.age}, super is open the year you stop, so everything outside super is extra.`}
              {goneI != null && goneI < goalI
                ? ` The loan's leftovers and freed repayments arrive from ${t.loan?.gone_year}.`
                : ""}
            </p>
          </div>
          <div className="grid min-w-0 flex-[1_1_420px] grid-cols-3 gap-3">
            <Fig label="Need today" value={k(p.need)} />
            <Fig label="Have today" value={k(p.have)} colour={COLOUR.outside} />
            <Fig label={`Need by ${t.goal.year}`} value={k(t.years[goalI].outside_need)} />
          </div>
        </div>
      </Card>
      <Card aria-labelledby="fb-path" className="gap-3.5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="fb-path" className="m-0 text-[20px] leading-7 font-semibold">
              Build it up, then spend it down
            </h2>
            <div className="text-[12px] text-ink-3">
              Line: balance against the path it needs · bars: money in and out each year · hover any year
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-5" aria-live="polite">
            <div>
              <div className="text-[12px] text-ink-3">{y.year} · need</div>
              <div className="num text-[20px]">{at <= opensI ? money(y.outside_need) : "—"}</div>
            </div>
            <div>
              <div className="text-[12px] text-ink-3">On pace</div>
              <div className="num text-[20px]" style={{ color: COLOUR.outside }}>
                {money(y.etfs)}
              </div>
            </div>
            <div>
              <div className="text-[12px] text-ink-3">{outThisYear > 0 ? "Taken out" : "Going in"}</div>
              <div className="num text-[20px]">{money(outThisYear > 0 ? outThisYear : inThisYear)}</div>
            </div>
            <Status tone={at > opensI ? "good" : d >= 0 ? "good" : "warn"}>
              {at > opensI ? "Super pays now" : `${d >= 0 ? "Ahead" : "Behind"} ${k(Math.abs(d))}`}
            </Status>
          </div>
        </div>
        <CompareChart
          need={ys.map((x, i) => (i <= opensI ? x.outside_need : null))}
          pace={ys.map((x) => x.etfs)}
          ghost={extra > 0 ? base.years.slice(0, end + 1).map((x) => x.etfs) : undefined}
          end={opensI}
          years={ys.map((x) => x.year)}
          colour={COLOUR.outside}
          at={at}
          handlers={handlers}
          marks={marks}
          label="Outside super: pick a year"
          height={280}
        />
        <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" aria-hidden>
            <path d={`M${pl} ${mid} H${W - pr}`} style={{ stroke: "var(--color-line-2)" }} strokeWidth={1} />
            <path d={saved} style={{ fill: COLOUR.outside, fillOpacity: 0.85 }} />
            <path d={lump} style={{ fill: COLOUR.loan }} />
            <path d={spent} style={{ fill: TONE.warn, fillOpacity: 0.8 }} />
            <line x1={xs(at)} x2={xs(at)} y1={4} y2={H - 4} style={{ stroke: "var(--color-ink)" }} strokeWidth={1.2} />
          </svg>
          <span className="absolute top-0 left-0 text-[11px] text-ink-3">In</span>
          <span className="absolute bottom-0 left-0 text-[11px] text-ink-3">Out</span>
          <div
            {...handlers}
            aria-hidden
            tabIndex={-1}
            className="absolute inset-y-0 cursor-crosshair"
            style={{ ...handlers.style, left: pc(pl, W), right: pc(pr, W) }}
          />
        </div>
        <div className="flex flex-wrap gap-4 text-[13px] text-ink-2">
          <Key colour={COLOUR.outside}>What you put in{t.saving.etfs ? ` (${money(t.saving.etfs)}/mo now)` : ""}</Key>
          <Key colour={COLOUR.loan}>Loan&apos;s leftovers when it&apos;s gone</Key>
          <Key colour={TONE.warn}>Taken out to live on</Key>
        </div>
      </Card>
      <div className="flex flex-wrap items-stretch gap-4">
        <Card className="min-w-0 flex-[999_1_560px] gap-3">
          <h2 className="m-0 text-[20px] leading-7 font-semibold">The bridge years</h2>
          <div className="text-[12px] text-ink-3">
            {bridge
              ? `From ${t.goal.year}, when you stop, until super opens. Spending ${money(t.goal.spend)} a year.`
              : "No bridge years at this age to stop."}
          </div>
          {bridge && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-[14px]">
                <thead>
                  <tr className="bg-sunken text-[12px] text-ink-3">
                    <th scope="col" className="px-3 py-2.5 text-left font-medium">
                      Year · ages
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Start of year
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Taken out
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Paid by
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((x) => {
                    const pd = x.paid ?? { etfs: 0, cash: 0, offset: 0, super: 0, short: 0 };
                    const sup = pd.super;
                    const out = pd.etfs + pd.cash + pd.offset;
                    const who =
                      pd.short > 0
                        ? `Short ${k(pd.short)}`
                        : sup > 0 && out > 0
                          ? "Outside super, then super"
                          : sup > 0
                            ? "Super"
                            : "Outside super";
                    return (
                      <tr key={x.year}>
                        <th scope="row" className="border-t border-line px-3 py-2.5 text-left font-medium">
                          {x.year} · {[x.age, ...t.people.slice(1).map((o) => o.age + (x.age - lead.age))].join(" / ")}
                        </th>
                        <td className="num border-t border-line px-3 py-2.5 text-right">{money(x.etfs)}</td>
                        <td className="num border-t border-line px-3 py-2.5 text-right text-warn">
                          {money(out + sup)}
                        </td>
                        <td
                          className="border-t border-line px-3 py-2.5 text-right"
                          style={{ color: pd.short > 0 ? TONE.bad : sup > 0 ? TONE.good : COLOUR.outside }}
                        >
                          {who}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card className="min-w-0 flex-[1_1_320px] gap-3.5">
          <h2 className="m-0 text-[20px] leading-7 font-semibold">Try putting more in</h2>
          <label className="flex flex-col gap-1.5">
            <span className="flex justify-between gap-2">
              <span className="text-[14px] text-ink-2">Extra each month</span>
              <span className="num font-semibold">{money(extra)}/mo</span>
            </span>
            <input
              type="range"
              min={0}
              max={250_000}
              step={5_000}
              value={extra}
              onChange={(e) => setExtra(Number(e.target.value))}
              className="h-7 w-full accent-[var(--color-teal)]"
            />
          </label>
          <div className="text-[14px] text-ink-2">
            Earliest stop{" "}
            <span
              className="num font-semibold"
              style={{ color: t.pace && t.pace.retire_age <= t.goal.age ? TONE.good : TONE.warn }}
            >
              {t.pace ? `${lead.name} ${t.pace.retire_age}` : "after 70"}
            </span>
          </div>
          <Link to="/investments" className="text-[14px] font-semibold text-teal no-underline">
            Holdings →
          </Link>
          <p className="m-0 text-[13px] text-ink-3">
            Selling in the bridge years, with no salary, usually means little or no capital gains tax. An estimate, not
            advice.
          </p>
        </Card>
      </div>
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

function Key({ colour, children }: { colour: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-3 rounded-[3px]" style={{ background: colour }} />
      {children}
    </span>
  );
}
