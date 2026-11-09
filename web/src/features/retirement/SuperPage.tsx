/**
 * One person's super (the uplift canvas's EnSuper, on the entity template): the balance now, what work adds a year
 * and what it's likely to be when super opens, in a sentence; its balance by statement and on to opening (today's
 * dollars); contributions against this year's cap; the fees and how it's invested; and each balance given.
 */
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loading } from "~/features/common/brand";
import { Bar, Card, CardHead, ChoiceChip, ROLE } from "~/features/common/ds";
import { EntityHeader, EntityHero } from "~/features/common/entity";
import { longDate, money, pct } from "~/features/common/format";
import { Chip, I } from "~/features/common/icons";
import { retirementQuery, type SuperAccount } from "~/features/common/queries";
import { ScrubChart } from "~/features/common/ScrubChart";
import { Button, Empty } from "~/features/common/ui";
import { assumptionsOf } from "~/features/retirement/Assumptions";
import { fundTerms } from "~/features/retirement/model";

type Withvalues = SuperAccount & { values: { date: string; balance: number }[] };

export function SuperPage({ id }: { id: number }) {
  const q = useQuery(retirementQuery);
  const navigate = useNavigate();
  const people = (q.data?.people ?? []) as Withvalues[];
  const p = people.find((x) => x.id === id);
  useEffect(() => {
    if (p) document.title = `${p.person}'s super · WheresMyMoney`;
  }, [p]);
  if (!q.data) return <Loading />;
  if (!p)
    return (
      <Empty
        title="That super isn't here any more"
        action={
          <Link to="/retirement" className="text-teal">
            See Retirement
          </Link>
        }
      >
        It may have been removed.
      </Empty>
    );
  const s = q.data.settings;
  const a = assumptionsOf(s);
  const terms = fundTerms(p, a, p.balance);
  const fromWork = Math.round(p.salary * p.rate);
  const sacrifice = p.sacrifice ?? 0;
  const inNet = Math.round((fromWork + sacrifice) * (1 - s.contrib_tax));
  const year = new Date().getFullYear();
  // `opens` is the year super opens (the preservation age, 60, is the same for everyone now).
  const opensAge = q.data.preservation;
  const years = Math.max(p.opens - year, 0);
  // Year by year to opening, in today's dollars: grows at the real return, plus what goes in, less dollar fees.
  const ahead: number[] = [p.balance];
  for (let i = 0; i < years; i++) ahead.push(Math.max(ahead[i] * (1 + terms.real) + inNet - terms.fixed, 0));
  const atOpen = ahead[ahead.length - 1];
  // Known balances by year (the last given in each), then the likely ones.
  const known = new Map<number, number>();
  for (const v of p.values) known.set(Number(v.date.slice(0, 4)), v.balance);
  const firstYear = Math.min(...[...known.keys(), year]);
  const points: { year: number; value: number; likely: boolean }[] = [];
  for (let y = firstYear; y < year; y++)
    if (known.has(y)) points.push({ year: y, value: known.get(y)!, likely: false });
  ahead.forEach((v, i) => points.push({ year: year + i, value: v, likely: i > 0 }));
  const feeDollars = Math.round(terms.pct * p.balance + terms.fixed);
  const room = p.room ?? 0;
  const cap = p.cap ?? 3000000;

  return (
    <>
      <EntityHeader
        back={{ to: "/retirement", label: "Retirement" }}
        mark={<Chip g={I.retire} tone="savings" size="xl" />}
        title={`${p.person}'s super`}
        sub={[
          p.fund || "Fund not set",
          p.options.length ? p.options.map((o) => o.name).join(", ") : null,
          `opens at ${opensAge}${years ? ` in ${years} ${years === 1 ? "year" : "years"}` : ""}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <Button primary onClick={() => navigate({ to: "/retirement/statement", search: { person: p.id } })}>
            Add a statement
          </Button>
        }
      />
      {people.length > 1 && (
        <div role="group" aria-label="Whose super" className="flex flex-wrap gap-2">
          {people.map((x) => (
            <ChoiceChip
              key={x.id}
              pressed={x.id === p.id}
              onClick={() => navigate({ to: "/retirement/super/$personId", params: { personId: String(x.id) } })}
            >
              {x.person} · {money(x.balance)}
            </ChoiceChip>
          ))}
        </div>
      )}

      <EntityHero
        tint="savings"
        label={`${p.person}'s super in a sentence`}
        numbers={[
          { label: "Now", value: money(p.balance), note: p.as_of ? `as of ${longDate(p.as_of)}` : "" },
          {
            label: "From work, a year",
            value: money(fromWork),
            note: `${pct(p.rate, 0)}, ${money(inNet - Math.round(sacrifice * (1 - s.contrib_tax)))} after tax`,
          },
          { label: `Likely at ${opensAge}`, value: money(atOpen), note: "today's dollars" },
          {
            label: "Fees a year",
            value: money(feeDollars),
            note: `${pct(p.balance ? feeDollars / p.balance : 0, 2)} of the balance`,
          },
        ]}
      >
        <p className="m-0 text-[17px] leading-relaxed text-ink">
          {p.person}&apos;s super is <b>{money(p.balance)}</b>, grows about {money(inNet)} a year from what goes in, and
          is likely about <b>{money(atOpen)}</b> when it opens{years ? ` in ${year + years}` : ""}.
        </p>
        <p className="m-0 text-[15px] text-ink-2">
          In today&apos;s dollars, at {pct(terms.real, 1)} a year after fees and inflation. An estimate to plan with,
          not advice.
        </p>
      </EntityHero>

      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        <Card aria-labelledby="sp-chart" className="flex flex-col gap-3 md:col-span-8">
          <CardHead id="sp-chart" title="Balance by statement, and on to opening" />
          <ScrubChart
            label={`${p.person}'s super by year, likely ${money(atOpen)} when it opens`}
            lines={[{ name: "Balance", values: points.map((x) => x.value), colour: ROLE.savings, fill: true }]}
            at={(i) =>
              points[i]
                ? `${points[i].year}${points[i].likely ? ", likely" : points[i].year === year ? ", now" : ""}`
                : ""
            }
            axisAt={(i) => (points[i] ? String(points[i].year) : "")}
            format={(v) => money(v)}
            floor={0}
            height={200}
            axis={[0, Math.round((points.length - 1) / 2), points.length - 1]}
          />
          <p className="m-0 text-[12px] text-ink-3">
            Years before this one are the balances given (statements, check-ins); after it, what&apos;s likely.
          </p>
        </Card>

        <Card aria-labelledby="sp-cap" className="flex flex-col gap-2 md:col-span-4">
          <CardHead id="sp-cap" title="Contributions and the cap" />
          <p className="m-0 text-[14px] text-ink-2">
            Money in before tax is capped at {money(cap)} a year. {p.person} has{" "}
            <b className="text-ink">{money(room)}</b> of room this year.
          </p>
          <Bar
            label={`${money(fromWork)} from work and ${money(sacrifice)} sacrificed, of ${money(cap)}`}
            max={Math.max(cap, fromWork + sacrifice)}
            height={10}
            marker={cap}
            segments={[
              { value: fromWork, role: "invest" },
              { value: sacrifice, role: "savings" },
            ]}
          />
          <div className="text-[13px] text-ink-3">
            {money(fromWork)} from work ·{" "}
            {sacrifice ? `${money(Math.round(sacrifice / 12))} a month sacrificed` : "no salary sacrifice"}
          </div>
          <Link
            to="/settings"
            search={{ section: "household" }}
            className="text-[13px] font-semibold text-teal no-underline"
          >
            Change what you each earn →
          </Link>
          <p className="m-0 text-[12px] text-ink-3">
            Unused cap from the last five years may add more while the balance is under $500,000; the fund or myGov can
            tell you the amount.
          </p>
        </Card>

        <Card aria-labelledby="sp-fees" className="flex flex-col gap-2 md:col-span-6">
          <CardHead
            id="sp-fees"
            title="Fees"
            right={<span className="text-[13px] text-ink-3">about {money(feeDollars)} a year</span>}
          />
          <ul className="m-0 flex list-none flex-col p-0 text-[14px]">
            {p.fees.map((f) => (
              <li key={f.name} className="flex justify-between gap-3 border-b border-line py-1.5 last:border-b-0">
                <span className="text-ink-2">{f.name}</span>
                <span className="num">
                  {f.kind === "pct"
                    ? `${pct(f.amount, 2)}${f.cap ? ` to ${money(f.cap)}` : ""}`
                    : `${money(f.amount)} a year`}
                </span>
              </li>
            ))}
          </ul>
          {!p.fees.length && <p className="m-0 text-[13px] text-ink-3">No fees given yet; add a statement.</p>}
        </Card>

        <Card aria-labelledby="sp-opt" className="flex flex-col gap-2 md:col-span-6">
          <CardHead id="sp-opt" title="How it's invested" />
          {p.options.length ? (
            <ul className="m-0 flex list-none flex-col p-0 text-[14px]">
              {p.options.map((o) => (
                <li key={o.name} className="flex justify-between gap-3 border-b border-line py-1.5 last:border-b-0">
                  <span className="text-ink-2">{o.name}</span>
                  <span className="num">
                    {pct(o.share, 0)}
                    {o.return_pct != null ? ` · ${pct(o.return_pct, 1)} a year` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[13px] text-ink-3">
              Not given yet: the estimate uses {pct(s.super_return, 1)} a year before fees. A statement fills it in.
            </p>
          )}
        </Card>

        <Card aria-labelledby="sp-values" className="flex flex-col gap-1 md:col-span-8">
          <CardHead
            id="sp-values"
            title="Balances given"
            right={<span className="text-[13px] text-ink-3">newest first</span>}
          />
          <ul className="m-0 flex list-none flex-col p-0 text-[14px]">
            {[...p.values].reverse().map((v) => (
              <li key={v.date} className="flex justify-between gap-3 border-b border-line py-2 last:border-b-0">
                <span className="text-ink-2">{longDate(v.date)}</span>
                <span className="num">{money(v.balance)}</span>
              </li>
            ))}
          </ul>
          {!p.values.length && <p className="m-0 text-[13px] text-ink-3">None yet.</p>}
        </Card>

        <Card aria-labelledby="sp-fire" className="flex flex-col gap-2 md:col-span-4">
          <CardHead id="sp-fire" title="Early retirement" />
          <p className="m-0 text-[14px] text-ink-2">
            {years
              ? `Super opens in ${p.opens}, when ${p.person} is ${opensAge}. Stopping before that needs a bridge: your ETFs.`
              : `${p.person}'s super is open.`}
          </p>
          <Link to="/retirement" className="self-start text-[14px] font-semibold text-teal no-underline">
            Open the plan →
          </Link>
        </Card>
      </div>
    </>
  );
}
