/**
 * Early retirement: Spending it, and staying on track (the uplift canvas's FiDrawdown). Once stopped, which pot
 * pays each year (the ETFs and a cash buffer first, then the offset, then super once it opens), how long it lasts
 * in typical years and after a rough start, with the buffer and the age pension to try; then whether this year is
 * ahead of the saved plan or behind it.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FireNav } from "~/features/fire/FireNav";
import { fireQuery, type FireRow } from "~/features/fire/api";
import { apiSend } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card, CardHead, ChoiceChip, ROLE, Stat } from "~/features/common/ds";
import { money, monthYear, shortDate } from "~/features/common/format";
import { ScrubChart } from "~/features/common/ScrubChart";
import { cn, Empty, PageHead, Pill, Switch } from "~/features/common/ui";

type Draw = {
  retire_age: number;
  retire_year: number;
  lasts: number;
  rough: number;
  spend: number;
  at_stop: { etfs: number; supers: { name: string; balance: number; opens: number }[] };
  rows: FireRow[];
};

const POTS = [
  ["etfs", "ETFs", ROLE.invest],
  ["cash", "Cash buffer", ROLE.ink],
  ["offset", "Offset", ROLE.offset],
  ["super", "Super", ROLE.savings],
] as const;

export function FireDrawdown() {
  const fire = useQuery(fireQuery);
  const [buffer, setBuffer] = useState(0);
  const [pension, setPension] = useState(false);
  const [at, setAt] = useState<number | null>(null);
  useEffect(() => {
    document.title = "Spending it · Early retirement · WheresMyMoney";
  }, []);
  const q = useQuery({
    queryKey: ["fire", "drawdown", buffer, pension],
    queryFn: () => apiSend<Draw>("POST", "fire/drawdown", { buffer_years: buffer, pension }),
    placeholderData: keepPreviousData,
    enabled: !!fire.data && fire.data.ready,
  });
  const f = fire.data;
  if (!f) return <Loading />;
  if (!f.ready)
    return (
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
    );
  const d = q.data;
  const rows = (d?.rows ?? []).filter((r) => r.paid);
  const hi = Math.max(
    1,
    ...rows.map((r) => (r.paid ? r.paid.etfs + r.paid.cash + r.paid.offset + r.paid.super + r.paid.short : 0)),
  );
  const firstSuper = rows.find((r) => r.paid && r.paid.super > 0);
  const shown = rows[at ?? 0];
  const saved = f.saved;
  const vs = f.vs_plan;
  const track = f.track ?? [];

  return (
    <>
      <PageHead over="Future · Early retirement" title="Spending it, and staying on track" />
      <p className="-mt-2 mb-0 text-[14px] text-ink-3">
        Once you stop, which pot pays and when. And each year, whether you&apos;re ahead of the plan or behind it.
      </p>
      <FireNav />

      {d && (
        <Card lit tint="savings" aria-labelledby="fw-hero" className="flex flex-col gap-3">
          <CardHead
            id="fw-hero"
            title={`Who pays each year, once you stop at ${d.retire_age}`}
            right={
              <Pill tone={d.lasts >= f.assumptions.plan_to ? "good" : "bad"}>Lasts to {Math.min(d.lasts, 100)}</Pill>
            }
          />
          <p className="m-0 text-[16px] leading-relaxed text-ink">
            The ETFs{buffer ? " and the cash buffer" : ""} pay first.{" "}
            {firstSuper
              ? `Super takes over at ${firstSuper.age}, in ${firstSuper.year}`
              : "Super isn't needed by the plan-to age"}
            , and the money lasts to {Math.min(d.lasts, 100)}.
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Stat
              label={`ETFs at ${d.retire_age}`}
              value={money(d.at_stop.etfs)}
              note={`the bridge needs ${money(f.bridge.need)}`}
              role="savings"
            />
            {d.at_stop.supers.map((s) => (
              <Stat
                key={s.name}
                label={`${s.name}'s super at ${d.retire_age}`}
                value={money(s.balance)}
                note={`opens ${s.opens}`}
                role="savings"
              />
            ))}
            <Stat label="Spending" value={money(d.spend)} note="a year, today's dollars" role="savings" />
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        <Card aria-labelledby="fw-bars" className="flex flex-col gap-3 md:col-span-8">
          <CardHead id="fw-bars" title="Which pot pays" />
          <div className="flex flex-wrap gap-3 text-[12px] text-ink-2">
            {POTS.map(([key, label, colour]) => (
              <span key={key} className="inline-flex items-center gap-1.5">
                <i className="size-2.5 rounded-sm" style={{ background: colour }} />
                {label}
              </span>
            ))}
          </div>
          {shown?.paid && (
            <p className="num m-0 min-h-5 text-[13px] text-ink-2" aria-live="polite">
              <b className="text-ink">
                {shown.age} · {shown.year}
              </b>
              {POTS.filter(([key]) => shown.paid![key] > 0).map(([key, label]) => (
                <span key={key}>
                  {" "}
                  · {label} {money(shown.paid![key])}
                </span>
              ))}
              {shown.paid.short > 0 && <span className="text-bad"> · short {money(shown.paid.short)}</span>}
            </p>
          )}
          <div
            className="flex h-[180px] items-end gap-[2px]"
            role="group"
            aria-label="Each year's spending by the pot that pays it"
            onMouseLeave={() => setAt(null)}
          >
            {rows.map((r, i) => (
              <div
                key={r.age}
                tabIndex={0}
                aria-label={`Age ${r.age}, ${r.year}`}
                onMouseEnter={() => setAt(i)}
                onFocus={() => setAt(i)}
                className={cn(
                  "flex h-full min-w-0 flex-1 flex-col justify-end outline-none focus-visible:ring-2 focus-visible:ring-teal",
                  at != null && at !== i && "opacity-60",
                )}
              >
                {POTS.map(([key, label, colour]) => {
                  const v = r.paid![key];
                  return v ? (
                    <i
                      key={key}
                      className="striped block w-full"
                      style={{ height: `${(v / hi) * 100}%`, background: colour }}
                      title={`${label}: ${money(v)}`}
                    />
                  ) : null;
                })}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[12px] text-ink-3">
            <span>{rows[0]?.age}</span>
            <span>{rows.at(-1)?.age}</span>
          </div>
          <p className="m-0 text-[12px] text-ink-3">
            Each bar is a year&apos;s spending. All striped: it hasn&apos;t happened yet.
          </p>
        </Card>

        <Card aria-labelledby="fw-try" className="flex flex-col gap-3 md:col-span-4">
          <CardHead id="fw-try" title="Try it" />
          <div className="flex flex-col gap-1.5">
            <span className="text-[14px]">Cash buffer when you stop</span>
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2].map((y) => (
                <ChoiceChip key={y} pressed={buffer === y} onClick={() => setBuffer(y)}>
                  {y === 0 ? "None" : `${y} ${y === 1 ? "year" : "years"}`}
                </ChoiceChip>
              ))}
            </div>
            <span className="text-[12px] text-ink-3">
              Spending kept in cash and used first in a bad year, so nothing&apos;s sold while prices are down.
            </span>
          </div>
          {d && (
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Lasts to" value={String(Math.min(d.lasts, 100))} note="typical years" role="savings" />
              <Stat label="Rough start" value={String(Math.min(d.rough, 100))} note="stress test" role="spending" />
            </div>
          )}
          <div className="flex items-start justify-between gap-3">
            <span>
              <span className="block text-[14px]">Count the age pension</span>
              <span className="block text-[12px] text-ink-3">A bonus from 67. Off: the plan works without it.</span>
            </span>
            <Switch checked={pension} onChange={setPension} label="Count the age pension" />
          </div>
        </Card>

        <Card aria-labelledby="fw-track" className="flex flex-col gap-3 md:col-span-12">
          <CardHead id="fw-track" title="On track?" />
          {saved && vs ? (
            <>
              <p className="m-0 text-[16px] text-ink">
                {Math.abs(vs.ahead) < vs.expected * 0.005 ? (
                  <>Right on the plan</>
                ) : (
                  <>
                    {vs.ahead >= 0 ? "Ahead of the plan" : "Behind the plan"} by <b>{money(Math.abs(vs.ahead))}</b>
                  </>
                )}
                : super, ETFs and the offset come to {money(vs.actual)} against the {money(vs.expected)} the plan has
                for today.
              </p>
              {track.length > 1 ? (
                <>
                  <ScrubChart
                    label="Each check-in's super, ETFs and offset against where the saved plan has them"
                    lines={[
                      {
                        name: "The plan",
                        values: track.map((p) => p.expected),
                        colour: ROLE.savings,
                        dashed: true,
                      },
                      { name: "Check-ins", values: track.map((p) => p.actual), colour: ROLE.invest, fill: true },
                    ]}
                    at={(i) => (track[i] ? shortDate(track[i].date) : "")}
                    format={(v) => money(v)}
                    floor={0}
                    height={160}
                    axis={[0, track.length - 1]}
                    axisAt={(i) => (track[i] ? monthYear(track[i].date) : "")}
                  />
                  <p className="m-0 text-[12px] text-ink-3">
                    Each check-in, and today. The plan&apos;s line starts the day it was saved, {shortDate(saved.date)}.
                  </p>
                </>
              ) : (
                saved.path.length > 1 && (
                  <ScrubChart
                    label="The saved plan's path: super, ETFs and offset together, by year"
                    lines={[
                      { name: "The plan", values: saved.path.map((p) => p.total), colour: ROLE.savings, fill: true },
                    ]}
                    at={(i) => String(saved.path[i]?.year ?? "")}
                    format={(v) => money(v)}
                    floor={0}
                    height={160}
                    marks={[{ i: 0, label: `Now ${money(vs.actual)}` }]}
                    axis={[0, Math.round((saved.path.length - 1) / 2), saved.path.length - 1]}
                  />
                )
              )}
            </>
          ) : (
            <p className="m-0 text-[14px] text-ink-3">
              Make it the plan on{" "}
              <Link to="/early-retirement" className="text-teal">
                Freedom
              </Link>{" "}
              and each check-in shows whether you&apos;re ahead of it or behind.
            </p>
          )}
        </Card>
      </div>
      <p className="m-0 text-[12px] text-ink-3">
        Estimates to plan with, not advice. Today&apos;s dollars, no age pension unless counted.
      </p>
    </>
  );
}
