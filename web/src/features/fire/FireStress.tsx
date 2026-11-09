/**
 * Early retirement: What could go wrong (the uplift canvas's FiStress). The plan's age to stop tested against one
 * piece of bad luck at a time (a rough start, high inflation, spending more, an income lost), how long the money
 * then lasts, and the two cheapest fixes. Good, typical and bad years as a fan.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FireNav } from "~/features/fire/FireNav";
import { fireQuery } from "~/features/fire/api";
import { apiSend } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card, CardHead, ChoiceChip, ROLE } from "~/features/common/ds";
import { money } from "~/features/common/format";
import { ScrubChart } from "~/features/common/ScrubChart";
import { Empty, PageHead, Pill } from "~/features/common/ui";

type Fix = { kind: "later" | "spend"; age: number; spend?: number; lasts: number; ok: boolean };
type Stress = {
  retire_age: number;
  typical: number;
  shocks: { key: string; label: string; what: string; lasts: number; ok: boolean }[];
  fan: {
    ages: number[];
    good: { lasts: number; path: number[] };
    typical: { lasts: number; path: number[] };
    bad: { lasts: number; path: number[] };
  };
  shock?: {
    key: string;
    label: string;
    what: string;
    lasts: number;
    ok: boolean;
    gap: number | null;
    path: number[];
    fixes: Fix[];
  };
};

export function FireStress() {
  const fire = useQuery(fireQuery);
  const [shock, setShock] = useState<string | null>(null);
  useEffect(() => {
    document.title = "What could go wrong · Early retirement · WheresMyMoney";
  }, []);
  const q = useQuery({
    queryKey: ["fire", "stress", shock],
    queryFn: () => apiSend<Stress>("POST", "fire/stress", { shock }),
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
  const s = d?.shock;
  const lasts = s ? s.lasts : d?.typical;
  const aim = f.assumptions.plan_to;
  const ages = d?.fan.ages ?? [];
  const cut = ages.findIndex((a) => a > 100);
  const end = cut < 0 ? ages.length : cut;

  return (
    <>
      <PageHead over="Future · Early retirement" title="What could go wrong" />
      <p className="-mt-2 mb-0 text-[14px] text-ink-3">
        Test the plan{d ? ` to stop at ${d.retire_age}` : ""} against bad luck, then fix it. One thing at a time, in
        today&apos;s dollars.
      </p>
      <FireNav />

      <Card lit tint="spending" aria-labelledby="fs-hero" className="flex flex-col gap-3">
        <CardHead
          id="fs-hero"
          title={d ? `Stop at ${d.retire_age} · what could go wrong` : "What could go wrong"}
          right={lasts != null && <Pill tone={lasts >= aim ? "good" : "bad"}>Lasts to {Math.min(lasts, 100)}</Pill>}
        />
        <p className="m-0 text-[17px] leading-relaxed text-ink">
          {s ? (
            <>
              With {s.label.toLowerCase()}, the money lasts to <b>{Math.min(s.lasts, 100)}</b>
              {s.ok ? ", still past the aim." : `, short of ${aim}.`}
            </>
          ) : d ? (
            <>
              In typical years it lasts to <b>{Math.min(d.typical, 100)}</b>. Pick something going wrong to see how far
              it drops.
            </>
          ) : null}
        </p>
        {s && <p className="m-0 text-[14px] text-ink-2">{s.what}</p>}
        <div className="flex flex-wrap gap-2">
          {(d?.shocks ?? []).map((x) => (
            <ChoiceChip key={x.key} pressed={shock === x.key} onClick={() => setShock(shock === x.key ? null : x.key)}>
              {x.label}
            </ChoiceChip>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        <Card aria-labelledby="fs-fan" className="flex flex-col gap-3 md:col-span-8">
          <CardHead id="fs-fan" title="Your money by age, good years to bad" />
          {d && end > 1 && (
            <ScrubChart
              label="Put-away money by age in good, typical and bad years"
              lines={[
                { name: "Good years", values: d.fan.good.path.slice(0, end), colour: ROLE.savings },
                { name: "Typical years", values: d.fan.typical.path.slice(0, end), colour: ROLE.accent, fill: true },
                { name: "Bad years", values: d.fan.bad.path.slice(0, end), colour: ROLE.ink },
                ...(s ? [{ name: "With the bad luck", values: s.path.slice(0, end), colour: ROLE.bad }] : []),
              ]}
              at={(i) => `Age ${ages[i]}`}
              axisAt={(i) => String(ages[i])}
              format={(v) => money(v)}
              floor={0}
              height={210}
              axis={[0, Math.round((end - 1) / 2), end - 1]}
            />
          )}
          {d && (
            <p className="m-0 text-[12px] text-ink-3">
              Good years last to {Math.min(d.fan.good.lasts, 100)}, typical to {Math.min(d.fan.typical.lasts, 100)}, bad
              to {Math.min(d.fan.bad.lasts, 100)}. Good is 1.5 points more growth after inflation a year, bad 1.5 less.
            </p>
          )}
        </Card>

        <Card aria-labelledby="fs-fix" className="flex flex-col gap-2 md:col-span-4">
          <CardHead id="fs-fix" title="The fix" />
          {s ? (
            s.fixes.map((x) => (
              <div
                key={`${x.kind}-${x.age}-${x.spend ?? ""}`}
                className="flex items-center justify-between gap-3 border-b border-line py-2 text-[14px] last:border-b-0"
              >
                <span>
                  <b className="block">
                    {x.kind === "later" ? `Stop at ${x.age} instead` : `Spend ${money((x.spend ?? 0) * 100)} a year`}
                  </b>
                  <span className="block text-[12px] text-ink-3">
                    {x.kind === "later"
                      ? `${x.age - (d?.retire_age ?? x.age)} more years of work and saving`
                      : "Once stopped"}
                  </span>
                </span>
                <Pill tone={x.ok ? "good" : "warn"}>Lasts to {Math.min(x.lasts, 100)}</Pill>
              </div>
            ))
          ) : (
            <p className="m-0 text-[14px] text-ink-3">
              Pick something above. You&apos;ll see how far it drops, and the two cheapest ways to fix it.
            </p>
          )}
        </Card>
      </div>
      <p className="m-0 text-[12px] text-ink-3">
        Estimates to plan with, not advice. Past returns don&apos;t promise future ones.
      </p>
    </>
  );
}
