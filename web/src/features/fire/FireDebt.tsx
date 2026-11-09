/**
 * Early retirement: Loan or invest (the uplift canvas's FiDebt). Extra a month into the offset (a sure saving, still
 * reachable) or into ETFs (likely more, with ups and downs), if the rate moves: when the loan's gone, what each
 * gains, the freedom age each way, and the race between them a quarter at a time.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FireNav } from "~/features/fire/FireNav";
import { fireQuery } from "~/features/fire/api";
import { apiSend } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card, CardHead, ChoiceChip, ROLE, Stat, Term } from "~/features/common/ds";
import { money, monthYear, pct } from "~/features/common/format";
import { ScrubChart } from "~/features/common/ScrubChart";
import { Empty, Label, PageHead } from "~/features/common/ui";

type Race = {
  extra: number;
  into: "off" | "inv";
  rate: number;
  months: number;
  base_months: number;
  interest_saved: number;
  etf_extra: number;
  retire_age: number | null;
  loan_path: number[];
  etf_path: number[];
  gone: string;
  base_gone: string;
  start: string;
};

const quarterLabel = (start: string, i: number) => {
  const [y, m] = start.split("-").map(Number);
  const t = m - 1 + i * 3;
  return monthYear(`${y + Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`);
};

export function FireDebt() {
  const fire = useQuery(fireQuery);
  const [extra, setExtra] = useState(500);
  const [into, setInto] = useState<"off" | "inv">("off");
  const [rd, setRd] = useState(0);
  useEffect(() => {
    document.title = "Loan or invest · Early retirement · WheresMyMoney";
  }, []);
  const ask = (i: "off" | "inv") => () =>
    apiSend<Race>("POST", "fire/debt", { extra: extra * 100, into: i, rate_change: rd / 1000 });
  const enabled = !!fire.data && fire.data.ready && !!fire.data.loan;
  const cur = useQuery({
    queryKey: ["fire", "debt", extra, into, rd],
    queryFn: ask(into),
    placeholderData: keepPreviousData,
    enabled,
  });
  const other = into === "off" ? "inv" : "off";
  const oth = useQuery({
    queryKey: ["fire", "debt", extra, other, rd],
    queryFn: ask(other),
    placeholderData: keepPreviousData,
    enabled,
  });
  const f = fire.data;
  if (!f) return <Loading />;
  if (!f.ready || !f.loan)
    return (
      <>
        <PageHead over="Future · Early retirement" title="Loan or invest" />
        <FireNav />
        <Empty
          title={f.ready ? "No loan to race" : "Add your super first"}
          action={
            <Link to={f.ready ? "/early-retirement" : "/retirement"} className="text-teal">
              Back
            </Link>
          }
        >
          {f.ready ? "The offset already matches the loan, so there's nothing to pay off faster." : f.needs}
        </Empty>
      </>
    );
  const c = cur.data;
  const o = oth.data;
  const off = into === "off" ? c : o;
  const inv = into === "inv" ? c : o;
  const base = f.plan?.retire_age ?? f.today?.retire_age ?? null;
  const n = c?.loan_path.length ?? 0;

  return (
    <>
      <PageHead over="Future · Early retirement" title="Loan or invest" />
      <p className="-mt-2 mb-0 text-[14px] text-ink-3">
        Pay the loan off faster, or invest the extra? The race between the two, and what each does to the day you could
        stop.
      </p>
      <FireNav />

      <Card lit tint="offset" aria-labelledby="fd-hero" className="flex flex-col gap-3">
        <CardHead id="fd-hero" title="Loan or invest" />
        {c && o && (
          <>
            <p className="m-0 text-[17px] leading-relaxed text-ink">
              {extra === 0 ? (
                <>
                  As it is, the loan&apos;s gone in <b>{monthYear(c.base_gone)}</b> and you could stop at{" "}
                  <b>{c.retire_age ?? "—"}</b>.
                </>
              ) : (
                <>
                  An extra {money(extra * 100)} a month gets you to <b>{c.retire_age ?? "—"}</b>
                  {o.retire_age === c.retire_age ? " either way" : " this way"}.
                </>
              )}
            </p>
            {extra > 0 && off && inv && (
              <p className="m-0 text-[15px] text-ink-2">
                Into the offset it&apos;s a sure{" "}
                <b className="text-ink">{money(Math.round(off.interest_saved / 10000) * 10000)}</b> of interest saved,
                and the loan&apos;s gone in {monthYear(off.gone)}. Into ETFs it&apos;s likely about{" "}
                <b className="text-ink">{money(Math.round(inv.etf_extra / 10000) * 10000)}</b> more by{" "}
                {monthYear(off.base_gone)}, with ups and downs.
              </p>
            )}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <Stat
                label="Loan gone"
                value={monthYear(c.gone)}
                note={
                  c.months < c.base_months
                    ? `${((c.base_months - c.months) / 12).toFixed(1)} years sooner than ${monthYear(c.base_gone)}`
                    : "as things are"
                }
                role="offset"
              />
              <Stat
                label="You could stop at"
                value={c.retire_age != null ? String(c.retire_age) : "Not by 70"}
                note={base != null ? `with the plan it's ${base}` : ""}
                role="offset"
              />
              <Stat
                label={
                  into === "off" ? "Interest saved, for sure" : `Extra in ETFs by ${monthYear(c.base_gone)}, likely`
                }
                value={
                  extra === 0
                    ? "$0"
                    : money(Math.round((into === "off" ? c.interest_saved : c.etf_extra) / 10000) * 10000)
                }
                note={into === "off" ? "No tax, no swings" : "Could be more or less; gains taxed when sold"}
                role="offset"
              />
            </div>
          </>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        <Card aria-labelledby="fd-levers" className="flex flex-col gap-4 md:col-span-5">
          <CardHead id="fd-levers" title="Try it" />
          <div className="flex flex-col gap-1.5">
            <Label>Put the extra into</Label>
            <div className="flex flex-wrap gap-2">
              <ChoiceChip pressed={into === "off"} onClick={() => setInto("off")}>
                Offset first
              </ChoiceChip>
              <ChoiceChip pressed={into === "inv"} onClick={() => setInto("inv")}>
                Invest first
              </ChoiceChip>
            </div>
            <span className="text-[12px] text-ink-3">
              {into === "off"
                ? "Same saving as an extra repayment, and you can still take it out."
                : "Into ETFs outside super. Reachable, but it goes up and down."}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="fd-extra">Extra each month</Label>
              <span className="num font-semibold">{money(extra * 100)}</span>
            </div>
            <input
              id="fd-extra"
              type="range"
              min={0}
              max={2000}
              step={250}
              value={extra}
              onChange={(e) => setExtra(Number(e.target.value))}
              className="w-full accent-[var(--color-offset-fill)]"
            />
            <span className="text-[12px] text-ink-3">On top of the {money(f.spare)} already going to the offset.</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>If the rate moves</Label>
            <div className="flex flex-wrap gap-2">
              {[-5, 0, 5].map((v) => (
                <ChoiceChip key={v} pressed={rd === v} onClick={() => setRd(v)}>
                  {v === 0 ? "Today" : `${v > 0 ? "+" : "−"}0.5%`}
                </ChoiceChip>
              ))}
            </div>
            {c && <span className="text-[12px] text-ink-3">At {pct(c.rate, 2)}, repayments stay the same.</span>}
          </div>
        </Card>

        <Card aria-labelledby="fd-race" className="flex flex-col gap-3 md:col-span-7">
          <CardHead id="fd-race" title="The race" />
          {c && n > 1 && (
            <ScrubChart
              label="The loan left after the offset, and the ETFs, a quarter at a time"
              lines={[
                { name: "Loan left after the offset", values: c.loan_path, colour: ROLE.offset, fill: true },
                { name: "ETFs outside super", values: c.etf_path, colour: ROLE.invest },
              ]}
              at={(i) => quarterLabel(c.start, i)}
              axisAt={(i) => quarterLabel(c.start, i).slice(-4)}
              format={(v) => money(v)}
              floor={0}
              height={200}
              axis={[0, Math.round((n - 1) / 2), n - 1]}
            />
          )}
          <p className="m-0 text-[13px] text-ink-2">
            Offset or extra repayment? Both clear the loan on the same day and save the same interest. Money in the{" "}
            <Term k="offset">offset</Term> can still pay for the years before super opens. Same saving, more freedom.
          </p>
        </Card>
      </div>
      <p className="m-0 text-[12px] text-ink-3">
        Estimates to plan with, not advice. Loan figures at today&apos;s rate as charged; ETF growth after tax.{" "}
        <Link to="/loan" className="text-teal">
          Open the loan&apos;s page
        </Link>
      </p>
    </>
  );
}
