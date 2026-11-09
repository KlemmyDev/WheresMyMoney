/**
 * One holding (the uplift canvas's EnHolding, on the entity template): what it's worth against what was put in, in a
 * sentence; its value over time; each parcel, oldest first, with whether its gain would half count for tax if sold
 * (the 12-month discount, from the day after the anniversary); what selling it all today would add to taxable
 * income; and its share of the ETFs against its aim. Record a trade and Change sit in the header.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FundSheet, GROUP_TONE, TradeForm } from "~/features/investments/InvestmentsPage";
import { apiGet } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card, CardHead, ROLE, Term } from "~/features/common/ds";
import { EntityHeader, EntityHero } from "~/features/common/entity";
import { dayDate, longDate, money, monthYear, pct } from "~/features/common/format";
import { Chip, I } from "~/features/common/icons";
import { capitalGainsQuery, investmentsQuery } from "~/features/common/queries";
import { ScrubChart } from "~/features/common/ScrubChart";
import { Button, Empty, Pill, Segmented } from "~/features/common/ui";

type Range = "1m" | "6m" | "1y" | "5y";
const signed = (c: number) => `${c >= 0 ? "+" : "−"}${money(Math.abs(c))}`;
const units = (u: number) => u.toLocaleString("en-AU", { maximumFractionDigits: 6 });

export function HoldingPage({ id }: { id: number }) {
  const q = useQuery(investmentsQuery);
  const tax = useQuery(capitalGainsQuery(null));
  const [range, setRange] = useState<Range>("1y");
  const hist = useQuery({
    queryKey: ["investments", "history", range, id],
    queryFn: ({ signal }) =>
      apiGet<{ date: string; value: number; cost: number }[]>("investments/history", { range, fund: id }, { signal }),
    placeholderData: keepPreviousData,
  });
  const [trading, setTrading] = useState(false);
  const [editing, setEditing] = useState(false);
  const f = q.data?.funds.find((x) => x.id === id);
  useEffect(() => {
    if (f) document.title = `${f.ticker} · WheresMyMoney`;
  }, [f]);
  if (!q.data) return <Loading />;
  if (!f)
    return (
      <Empty
        title="That holding isn't here any more"
        action={
          <Link to="/investments" className="text-teal">
            See investments
          </Link>
        }
      >
        It may have been removed.
      </Empty>
    );
  const p = q.data;
  const parcels = (tax.data?.parcels ?? [])
    .filter((x) => x.fund_id === id)
    .sort((a, b) => (a.bought < b.bought ? -1 : 1));
  const longOnes = parcels.filter((x) => x.long);
  const longGain = longOnes.reduce((t, x) => t + Math.max(x.gain ?? 0, 0), 0);
  const shortGain = parcels.filter((x) => !x.long).reduce((t, x) => t + (x.gain ?? 0), 0);
  const counts = Math.round(longGain / 2) + shortGain;
  const sameKind = p.funds.filter((x) => (x.kind === "crypto") === (f.kind === "crypto"));
  const kindTotal = sameKind.reduce((t, x) => t + x.value, 0);
  const share = kindTotal ? f.value / kindTotal : 0;
  const toAim = f.target != null ? Math.round(f.target * kindTotal - f.value) : null;
  const series = hist.data ?? [];
  const n = series.length;
  const label = f.kind === "crypto" ? "your crypto" : "your ETFs";

  return (
    <>
      <EntityHeader
        back={{ to: "/investments", label: "Investments" }}
        mark={<Chip g={I.invest} tone={GROUP_TONE[f.group] ?? "neutral"} size="xl" />}
        title={f.ticker}
        sub={[
          f.name,
          f.group_name,
          `${units(f.units)} units at ${f.price != null ? money(f.price, { cents: true }) : "no price yet"}`,
          f.price_date ? `price from ${dayDate(f.price_date)}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <Button onClick={() => setEditing(true)}>Change</Button>
            <Button primary onClick={() => setTrading((t) => !t)} aria-expanded={trading}>
              Record a trade
            </Button>
          </>
        }
      />
      {trading && <TradeForm p={p} only={f.id} onDone={() => setTrading(false)} />}

      <EntityHero
        tint="invest"
        label={`${f.ticker} in a sentence`}
        numbers={[
          { label: "Worth", value: money(f.value), note: `${units(f.units)} units` },
          {
            label: "Put in",
            value: money(f.cost),
            note: `${parcels.length} ${parcels.length === 1 ? "parcel" : "parcels"}`,
          },
          { label: "Up", value: signed(f.gain), note: f.cost ? pct(f.gain / f.cost, 1) : "" },
          {
            label: `Share of ${label}`,
            value: pct(share, 0),
            note: f.target != null ? `aim ${pct(f.target, 0)}` : "no aim set",
          },
        ]}
      >
        <p className="m-0 text-[17px] leading-relaxed text-ink">
          {f.ticker} is worth <b>{money(f.value)}</b>, {f.gain >= 0 ? "up" : "down"} <b>{money(Math.abs(f.gain))}</b> on
          the {money(f.cost)} you put in.
        </p>
        {parcels.length > 0 && (
          <p className="m-0 text-[15px] text-ink-2">
            {longOnes.length === parcels.length
              ? `All ${parcels.length === 1 ? "of it is" : `${parcels.length} parcels are`} past 12 months, so a gain would only half count for tax if you sold.`
              : longOnes.length
                ? `${longOnes.length} of its ${parcels.length} parcels are past 12 months, so most of a gain on those would only half count for tax if you sold.`
                : `No parcel is past 12 months yet; the first is from ${longDate(parcels[0].discount_from)}.`}
          </p>
        )}
      </EntityHero>

      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        <Card aria-labelledby="hp-chart" className="flex flex-col gap-3 md:col-span-8">
          <CardHead
            id="hp-chart"
            title="Value against what you put in"
            right={
              <Segmented<Range>
                label="Timeframe"
                value={range}
                onChange={setRange}
                options={[
                  { value: "1m", label: "1M" },
                  { value: "6m", label: "6M" },
                  { value: "1y", label: "1Y" },
                  { value: "5y", label: "5Y" },
                ]}
              />
            }
          />
          {n >= 2 ? (
            <ScrubChart
              label={`${f.ticker}'s value and what was put in`}
              lines={[
                { name: "Value", values: series.map((x) => x.value), colour: ROLE.invest, fill: true },
                { name: "Put in", values: series.map((x) => x.cost), colour: ROLE.ink },
              ]}
              at={(i) => (series[i] ? (i === n - 1 ? "Today" : dayDate(series[i].date)) : "")}
              format={(v) => money(v)}
              height={200}
              axis={[0, Math.round((n - 1) / 2), n - 1]}
            />
          ) : (
            <p className="m-0 text-[14px] text-ink-3">The chart fills in once there&apos;s a little history.</p>
          )}
          <p className="m-0 text-[12px] text-ink-3">
            Prices are looked up once a day; nothing else leaves the house. Steps in what you put in are your trades.
          </p>
        </Card>

        <Card aria-labelledby="hp-share" className="flex flex-col gap-2 md:col-span-4">
          <CardHead id="hp-share" title={`Share of ${label}`} />
          <div className="num text-[26px] font-semibold">{pct(share, 0)}</div>
          <p className="m-0 text-[14px] text-ink-2">
            Of {money(kindTotal)} across {sameKind.map((x) => x.ticker).join(", ")}.
            {toAim != null &&
              (toAim > 1000
                ? ` About ${money(toAim)} more into ${f.ticker} brings it to your ${pct(f.target!, 0)} aim.`
                : toAim < -1000
                  ? ` It's ${money(-toAim)} over your ${pct(f.target!, 0)} aim; put new money elsewhere to even it out.`
                  : ` Right about your ${pct(f.target!, 0)} aim.`)}
          </p>
        </Card>

        <Card aria-labelledby="hp-parcels" className="flex flex-col gap-2 md:col-span-8">
          <CardHead
            id="hp-parcels"
            title="Parcels"
            right={<span className="text-[13px] text-ink-3">each buy, oldest first</span>}
          />
          {parcels.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[14px]">
                <thead>
                  <tr className="text-left text-[12px] text-ink-3">
                    {["Bought", "Units", "Put in", "Up", "Tax if sold"].map((h, i) => (
                      <th
                        key={h}
                        className={`border-b border-line px-2 py-2 font-semibold ${i > 0 && i < 4 ? "text-right" : ""}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parcels.map((x) => (
                    <tr key={`${x.bought}-${x.units}`}>
                      <td className="border-b border-line px-2 py-2.5">{longDate(x.bought)}</td>
                      <td className="num border-b border-line px-2 py-2.5 text-right">{units(x.units)}</td>
                      <td className="num border-b border-line px-2 py-2.5 text-right">{money(x.cost)}</td>
                      <td
                        className={`num border-b border-line px-2 py-2.5 text-right ${(x.gain ?? 0) >= 0 ? "text-savings" : "text-bad"}`}
                      >
                        {x.gain != null ? signed(x.gain) : "—"}
                      </td>
                      <td className="border-b border-line px-2 py-2.5">
                        {x.long ? (
                          <Pill tone="good">Half counts · held 12+ months</Pill>
                        ) : (
                          <Pill tone="warn">Counts in full until {dayDate(x.discount_from)}</Pill>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="m-0 text-[14px] text-ink-3">No parcels held.</p>
          )}
        </Card>

        <Card aria-labelledby="hp-sell" className="flex flex-col gap-2 md:col-span-4">
          <CardHead id="hp-sell" title="If you sold it all today" />
          <Line label="Gain on parcels past 12 months" value={money(longGain)} />
          <Line label="Half of that counts" value={money(Math.round(longGain / 2))} />
          <Line label="Gain on newer parcels, counts in full" value={signed(shortGain)} />
          <Line label="Added to taxable income" value={money(Math.max(counts, 0))} strong />
          <p className="m-0 text-[12px] text-ink-3">
            The <Term k="cgt">CGT discount</Term> in plain numbers, before any losses you have. Not advice.
          </p>
        </Card>

        <Card aria-labelledby="hp-fire" className="flex flex-col gap-2 md:col-span-12">
          <CardHead id="hp-fire" title="Early retirement" />
          <p className="m-0 text-[14px] text-ink-2">
            {f.kind === "crypto"
              ? "Crypto stays out of the plan unless you turn it on."
              : `Your ETFs are the bridge: what you live on between stopping work and super opening.${f.first ? ` ${f.ticker} since ${monthYear(f.first.slice(0, 7))}.` : ""}`}
          </p>
          <Link to="/retirement" className="self-start text-[14px] font-semibold text-teal no-underline">
            Open the plan →
          </Link>
        </Card>
      </div>

      <FundSheet fund={editing ? f : null} groups={p.groups} onClose={() => setEditing(false)} />
    </>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex justify-between gap-3 border-b border-line pb-1.5 text-[14px] last:border-b-0 ${strong ? "font-semibold" : ""}`}
    >
      <span className={strong ? "text-ink" : "text-ink-2"}>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}
