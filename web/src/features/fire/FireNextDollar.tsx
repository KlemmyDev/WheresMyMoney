/**
 * Early retirement: Where the extra goes (the uplift canvas's FiNextDollar). For the money spare each month: put it
 * in the offset now, then split it between ETFs and super once the loan's gone; the freedom date that gets; and
 * what $100 of pay becomes in 10 years each way, after tax, ranked for retiring early, with the room left in super.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FireNav } from "~/features/fire/FireNav";
import { fireQuery, type Rung, type WhatIf } from "~/features/fire/api";
import { apiSend } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card, CardHead, ChoiceChip, Term } from "~/features/common/ds";
import { money, monthYear, pct } from "~/features/common/format";
import { Empty, PageHead, Pill, cn } from "~/features/common/ui";

const NAME: Record<Rung["key"], string> = {
  offset: "Offset",
  super: "Salary sacrifice into super",
  etfs: "ETFs outside super",
  repay: "Extra loan repayments",
};
const WHY: Record<Rung["key"], string> = {
  offset: "Bridge money with no risk, while the loan's on. Ties with ETFs on return.",
  super: "The biggest number, but locked until 60. Fill the bridge first.",
  etfs: "Pays for the years before super opens, once the loan's gone.",
  repay: "Same saving as the offset, but the money is stuck. Use the offset.",
};

export function FireNextDollar() {
  const fire = useQuery(fireQuery);
  const f = fire.data;
  const own = f && f.ready ? Math.round(f.spare / 100) : 1000;
  const [amt, setAmt] = useState<number | null>(null);
  const spare = amt ?? own;
  useEffect(() => {
    document.title = "Where the extra goes · Early retirement · WheresMyMoney";
  }, []);
  const q = useQuery({
    queryKey: ["fire", "whatif", "next", spare],
    queryFn: () =>
      apiSend<WhatIf>("POST", "fire/whatif", { levers: { retire_age: 60, keep: true, spare: spare * 100 } }),
    placeholderData: keepPreviousData,
    enabled: !!f && f.ready,
  });
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
  const today = f.today?.retire_age ?? null;
  const soonest = q.data?.soonest ?? null;
  const half = (spare * 100 + (f.loan ? f.loan.freed - f.spare : 0)) / 2;
  const amounts = [...new Set([500, 1000, 2000, own])].filter((x) => x > 0).sort((a, b) => a - b);
  const maxOut = Math.max(160, ...f.ladder.map((r) => r.out));
  const lead = f.next_dollar[0];

  return (
    <>
      <PageHead over="Future · Early retirement" title="Where the extra goes" />
      <p className="-mt-2 mb-0 text-[14px] text-ink-3">
        Where each spare dollar does the most for retiring early, after tax, and whether you can reach it.
      </p>
      <FireNav />

      <Card lit tint="savings" aria-labelledby="fn-hero" className="flex flex-col gap-3">
        <CardHead id="fn-hero" title={`The answer for your spare ${money(spare * 100)} a month`} />
        <p className="m-0 text-[17px] leading-relaxed text-ink">
          {f.loan ? (
            <>
              Put it in the <b>offset</b> now. Once the loan&apos;s gone in {monthYear(f.loan.gone)}, split it between
              ETFs and super: about <b>{money(half)}</b> a month each.
            </>
          ) : (
            <>
              Split it between <b>ETFs</b> and <b>super</b>: fill the bridge first, then super.
            </>
          )}{" "}
          {soonest != null ? (
            <>
              That gets you to <b>{soonest}</b>
              {today != null && soonest < today
                ? `, ${today - soonest} ${today - soonest === 1 ? "year" : "years"} sooner than today's plan of ${today}`
                : ""}
              .
            </>
          ) : (
            <>That isn&apos;t enough to stop by 70 yet.</>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-ink-3">Spare each month</span>
          {amounts.map((x) => (
            <ChoiceChip key={x} pressed={x === spare} onClick={() => setAmt(x)}>
              {money(x * 100)}
              {x === own ? " (yours)" : ""}
            </ChoiceChip>
          ))}
        </div>
        <p className="m-0 text-[12px] text-ink-3">
          The app never moves money. Make it the plan on Freedom and check-ins follow it.
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        <Card aria-labelledby="fn-ladder" className="flex flex-col gap-3 md:col-span-8">
          <CardHead id="fn-ladder" title="What $100 of pay becomes in 10 years" />
          <p className="m-0 -mt-1 text-[13px] text-ink-3">
            Ranked for retiring early. At {lead ? pct(lead.rate, 0) : "your"} tax,{" "}
            {lead ? money(lead.in_hand * 100, { cents: true }) : ""} of $100 reaches your pocket; super keeps $85
            because it&apos;s taxed 15% going in, not at your rate.
          </p>
          {f.ladder.map((r, i) => (
            <div
              key={r.key}
              className={cn(
                "flex flex-col gap-1.5 rounded-2xl border p-3",
                i === 0 ? "border-offset/50 bg-offset/5" : "border-line",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Pill tone={i === 0 ? "info" : "mute"}>{["1st", "2nd", "3rd", "4th"][i]}</Pill>
                  <b>{NAME[r.key]}</b>
                </span>
                <span className="text-[12px] text-ink-3">
                  {pct(r.rate, 1)} {r.key === "offset" || r.key === "repay" ? "saved" : "likely"} · {r.reach} ·{" "}
                  {r.risk ? "ups and downs" : "no ups and downs"}
                </span>
              </div>
              <div
                className="flex items-center gap-2"
                aria-label={`$100 of pay: ${money(r.in * 100)} goes in, likely ${money(r.out * 100)} in 10 years`}
              >
                <span className="h-3 rounded-full bg-savings-fill" style={{ width: `${(r.in / maxOut) * 100}%` }} />
                <span
                  className="hatched h-3 rounded-full"
                  style={{
                    width: `${((r.out - r.in) / maxOut) * 100}%`,
                    ["--c" as string]: "var(--color-savings-fill)",
                  }}
                />
                <span className="num text-[13px]">
                  {money(r.in * 100)} → <b>{money(r.out * 100)}</b>
                </span>
              </div>
              <span className="text-[12px] text-ink-3">{WHY[r.key]}</span>
            </div>
          ))}
          <p className="m-0 text-[12px] text-ink-3">
            ETFs keep most of their growth thanks to the <Term k="cgt">CGT discount</Term>. Facts from your own numbers,
            not advice.
          </p>
        </Card>

        <Card aria-labelledby="fn-room" className="flex flex-col gap-2 md:col-span-4">
          <CardHead id="fn-room" title="Room left in super, each year" />
          {f.next_dollar.map((p) => (
            <div
              key={p.person}
              className="flex items-center justify-between gap-3 border-b border-line py-2 text-[14px] last:border-b-0"
            >
              <span>
                <b>{p.person}</b> <span className="text-[12px] text-ink-3">· {pct(p.rate, 0)} tax</span>
              </span>
              <span className="num">{money(p.room)} a year</span>
            </div>
          ))}
          <p className="m-0 text-[13px] text-ink-2">Together: {money(f.room)} a year of room under the $30,000 caps.</p>
          <Link
            to="/settings"
            search={{ section: "household" }}
            className="text-[13px] font-semibold text-teal no-underline"
          >
            What you each earn →
          </Link>
        </Card>
      </div>
    </>
  );
}
