/**
 * Early retirement: Before super opens (the uplift canvas's FiBridge). Super is locked until each person turns 60;
 * the years between stopping and then are paid from money outside super (the ETFs and the offset). What the bridge
 * needs against what's likely to be there, for a few ages to stop, and which pot pays each year.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FireNav } from "~/features/fire/FireNav";
import { fireQuery, type WhatIf } from "~/features/fire/api";
import { apiSend } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card, CardHead, ChoiceChip, ROLE } from "~/features/common/ds";
import { money } from "~/features/common/format";
import { ScrubChart } from "~/features/common/ScrubChart";
import { Empty, PageHead, Pill } from "~/features/common/ui";

const k = (c: number) => (c >= 100_000_000 ? `$${(c / 100_000_000).toFixed(2)}M` : `$${Math.round(c / 100_000)}k`);

export function FireBridge() {
  const fire = useQuery(fireQuery);
  const [age, setAge] = useState<number | null>(null);
  useEffect(() => {
    document.title = "Before super opens · Early retirement · WheresMyMoney";
  }, []);
  const f = fire.data;
  const planAge = f && f.ready ? ((f.plan ?? f.today)?.retire_age ?? 60) : 60;
  const stop = age ?? planAge;
  const q = useQuery({
    queryKey: ["fire", "whatif", "bridge", stop],
    queryFn: () => apiSend<WhatIf>("POST", "fire/whatif", { levers: { retire_age: stop, keep: true } }),
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
  const d = q.data;
  const b = d?.bridge;
  const lead = f.people[0];
  const opensAge = lead ? lead.age + (f.people[0].opens - new Date().getFullYear()) : 60;
  const rows = (d?.rows ?? []).filter((r) => r.age >= stop - 1 && r.age <= Math.max(opensAge + 4, stop + 4));
  const paying = (d?.rows ?? []).filter((r) => r.paid && r.age >= stop && r.age <= opensAge + 3);

  return (
    <>
      <PageHead over="Future · Early retirement" title="Before super opens" />
      <p className="-mt-2 mb-0 text-[14px] text-ink-3">
        Super stays locked until each of you turns 60. The years between stopping and then are paid from money outside
        super: the bridge.
      </p>
      <FireNav />

      <Card lit tint="invest" aria-labelledby="fb-hero" className="flex flex-col gap-3">
        <CardHead
          id="fb-hero"
          title="The bridge"
          right={
            b && (
              <Pill tone={b.years === 0 ? "good" : b.covered ? "good" : "bad"}>
                {b.years === 0 ? "No bridge" : b.covered ? "Covered" : "Short"}
              </Pill>
            )
          }
        />
        {b && d && (
          <p className="m-0 text-[17px] leading-relaxed text-ink">
            {b.years === 0 ? (
              <>Stopping at {stop}, super&apos;s already open: there&apos;s no bridge to cross.</>
            ) : (
              <>
                You&apos;ll need <b>{k(b.need)}</b> outside super by {d.result.retire_year} for {b.years}{" "}
                {b.years === 1 ? "year" : "years"} until super opens in {b.opens_year}.{" "}
                {b.covered ? (
                  <>
                    You&apos;re on track for <b>{k(b.outside)}</b>.
                  </>
                ) : (
                  <>
                    On this plan it&apos;s about <b>{k(b.outside)}</b>, {k(b.need - b.outside)} short.
                  </>
                )}
              </>
            )}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-ink-3">If you stop at</span>
          {[planAge - 2, planAge - 1, planAge, planAge + 1, planAge + 2]
            .filter((a) => a >= 45 && a <= 70)
            .map((a) => (
              <ChoiceChip key={a} pressed={a === stop} onClick={() => setAge(a)}>
                {a}
                {a === planAge ? " (plan)" : ""}
              </ChoiceChip>
            ))}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        <Card aria-labelledby="fb-chart" className="flex flex-col gap-3 md:col-span-8">
          <CardHead id="fb-chart" title="Outside super, and super" />
          {rows.length > 1 && (
            <ScrubChart
              label="Money outside super and in super by age, around stopping"
              lines={[
                { name: "Outside super", values: rows.map((r) => r.etfs + r.offset), colour: ROLE.invest, fill: true },
                { name: "Super", values: rows.map((r) => r.super), colour: ROLE.savings },
              ]}
              at={(i) =>
                rows[i]
                  ? `Age ${rows[i].age} · ${rows[i].year}${rows[i].age === stop ? " · stop" : rows[i].age === opensAge ? " · super opens" : ""}`
                  : ""
              }
              axisAt={(i) => (rows[i] ? String(rows[i].age) : "")}
              format={(v) => money(v)}
              floor={0}
              height={200}
              axis={[0, Math.round((rows.length - 1) / 2), rows.length - 1]}
            />
          )}
          <p className="m-0 text-[12px] text-ink-3">
            Ages are {lead?.name ?? "the first person"}&apos;s. Outside super is the ETFs and the offset, reachable any
            time; super is locked until 60.
          </p>
        </Card>

        <Card aria-labelledby="fb-opens" className="flex flex-col gap-2 md:col-span-4">
          <CardHead id="fb-opens" title="When each super opens" />
          {f.people.map((p) => (
            <div
              key={p.name}
              className="flex items-center justify-between gap-3 border-b border-line py-2 text-[14px] last:border-b-0"
            >
              <span>
                <b>{p.name}</b> <span className="text-ink-3">· {p.age} now</span>
              </span>
              <span className="num">
                {p.opens} <span className="text-[12px] text-ink-3">at 60</span>
              </span>
            </div>
          ))}
          <p className="m-0 text-[12px] text-ink-3">
            Preservation age: when super can first be reached once you stop work. For anyone born after June 1964
            it&apos;s 60.
          </p>
        </Card>

        <Card aria-labelledby="fb-pots" className="flex flex-col gap-1 md:col-span-12">
          <CardHead id="fb-pots" title="Which pot pays each year" />
          {paying.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-[14px]">
                <thead>
                  <tr className="text-left text-[12px] text-ink-3">
                    {["Age · year", "ETFs", "Offset", "Super", "Short"].map((h, i) => (
                      <th key={h} className={`border-b border-line px-2 py-2 font-semibold ${i ? "text-right" : ""}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paying.map((r) => (
                    <tr key={r.age}>
                      <td className="border-b border-line px-2 py-2">
                        {r.age} · {r.year}
                      </td>
                      {(["etfs", "offset", "super", "short"] as const).map((key) => (
                        <td
                          key={key}
                          className={`num border-b border-line px-2 py-2 text-right ${key === "short" && r.paid![key] ? "text-bad" : ""}`}
                        >
                          {r.paid![key] ? money(r.paid![key]) : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="m-0 text-[14px] text-ink-3">Nothing to pay yet at this age.</p>
          )}
          <p className="m-0 text-[12px] text-ink-3">
            The ETFs pay first, then the offset while the loan&apos;s still there, then super once it opens.
            Today&apos;s dollars. Estimates to plan with, not advice.
          </p>
        </Card>
      </div>
    </>
  );
}
