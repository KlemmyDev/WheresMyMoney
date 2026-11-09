/**
 * Crypto (the uplift canvas's NwCrypto, on the entity template): what the coins are worth against what went in, as a
 * share of the investments or net worth against the household's own cap; each coin; each buy with how a sale would
 * be taxed; and whether crypto counts in the early-retirement plan (off by default: it can halve in a year).
 * The app never connects to an exchange and can't buy or sell anything.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TradeForm } from "~/features/investments/InvestmentsPage";
import { apiGet, apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Bar, Card, CardHead, ChoiceChip, ROLE, Term } from "~/features/common/ds";
import { EntityHeader, EntityHero } from "~/features/common/entity";
import { dayDate, longDate, money, pct } from "~/features/common/format";
import { Chip, I } from "~/features/common/icons";
import { useToast } from "~/features/common/overlay";
import {
  capitalGainsQuery,
  investmentsQuery,
  netWorthOf,
  netWorthQuery,
  refresh,
  retirementQuery,
} from "~/features/common/queries";
import { ScrubChart } from "~/features/common/ScrubChart";
import { Button, Empty, Pill, Segmented, Switch } from "~/features/common/ui";

type Range = "1m" | "6m" | "1y" | "5y";
const signed = (c: number) => `${c >= 0 ? "+" : "−"}${money(Math.abs(c))}`;
const units = (u: number) => u.toLocaleString("en-AU", { maximumFractionDigits: 6 });
const CAPS = [0.02, 0.05, 0.1];

export function CryptoPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const inv = useQuery(investmentsQuery);
  const ret = useQuery(retirementQuery);
  const worth = useQuery(netWorthQuery("1y"));
  const tax = useQuery(capitalGainsQuery(null));
  const [range, setRange] = useState<Range>("1y");
  const hist = useQuery({
    queryKey: ["investments", "history", range, "crypto"],
    queryFn: ({ signal }) =>
      apiGet<{ date: string; value: number; cost: number }[]>(
        "investments/history",
        { range, crypto: true },
        { signal },
      ),
    placeholderData: keepPreviousData,
  });
  const [trading, setTrading] = useState(false);
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiSend("PUT", "retirement/settings", body),
    onSuccess: () => refresh(qc),
    onError: (e) => toast(errorMessage(e)),
  });
  useEffect(() => {
    document.title = "Crypto · WheresMyMoney";
  }, []);
  if (!inv.data || !ret.data) return <Loading />;
  const p = inv.data;
  const s = ret.data.settings;
  const coins = p.funds.filter((f) => f.kind === "crypto");
  if (!coins.length)
    return (
      <Empty
        title="No crypto here"
        action={
          <Link to="/investments" className="text-teal">
            Add a coin on Investments
          </Link>
        }
      >
        Add a coin as a fund of the kind Crypto, then record what you bought.
      </Empty>
    );
  const value = coins.reduce((t, f) => t + f.value, 0);
  const cost = coins.reduce((t, f) => t + f.cost, 0);
  const gain = value - cost;
  const base = s.crypto_cap_of === "networth" ? (worth.data ? netWorthOf(worth.data.now) : 0) : p.total;
  const baseWords = s.crypto_cap_of === "networth" ? "your net worth" : "your investments";
  const share = base ? value / base : 0;
  const capDollars = Math.round(s.crypto_cap * base);
  const over = value > capDollars;
  const ids = new Set(coins.map((c) => c.id));
  const parcels = (tax.data?.parcels ?? [])
    .filter((x) => ids.has(x.fund_id))
    .sort((a, b) => (a.bought < b.bought ? -1 : 1));
  const longGain = parcels.filter((x) => x.long).reduce((t, x) => t + (x.gain ?? 0), 0);
  const shortGain = parcels.filter((x) => !x.long).reduce((t, x) => t + (x.gain ?? 0), 0);
  const counts = Math.max(Math.round(Math.max(longGain + Math.min(shortGain, 0), 0) / 2) + Math.max(shortGain, 0), 0);
  const series = hist.data ?? [];
  const n = series.length;
  const priceDate = coins
    .map((c) => c.price_date)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <>
      <EntityHeader
        back={{ to: "/investments", label: "Investments" }}
        mark={<Chip g={I.invest} tone="bills" size="xl" />}
        title="Crypto"
        sub={[
          coins.map((c) => c.name || c.ticker).join(" and "),
          priceDate ? `prices as of ${dayDate(priceDate)}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <Button primary onClick={() => setTrading((t) => !t)} aria-expanded={trading}>
            Record a trade
          </Button>
        }
      />
      {trading && <TradeForm p={{ ...p, funds: coins }} onDone={() => setTrading(false)} />}

      <EntityHero
        tint="bills"
        label="Crypto in a sentence"
        numbers={[
          { label: "Worth", value: money(value), note: priceDate ? `at ${dayDate(priceDate)} prices` : "" },
          { label: "Put in", value: money(cost), note: `${parcels.length} ${parcels.length === 1 ? "buy" : "buys"}` },
          { label: "Up", value: signed(gain), note: cost ? pct(gain / cost, 1) : "" },
          { label: "Share", value: pct(share, 1), note: `of ${baseWords}` },
        ]}
      >
        <p className="m-0 text-[17px] leading-relaxed text-ink">
          Your crypto is worth <b>{money(value)}</b>, {gain >= 0 ? "up" : "down"} <b>{money(Math.abs(gain))}</b> on the{" "}
          {money(cost)} you put in. It&apos;s {pct(share, 1)} of {baseWords},{" "}
          {over ? `over your ${pct(s.crypto_cap, 0)} cap` : `inside your ${pct(s.crypto_cap, 0)} cap`}.
        </p>
        <p className="m-0 text-[15px] text-ink-2">
          It counts in your net worth, but{" "}
          {s.count_crypto
            ? "you've turned it on in your early-retirement plan."
            : "it's left out of your early-retirement plan unless you turn it on: it can halve in a year."}
        </p>
      </EntityHero>

      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        <Card aria-labelledby="cr-chart" className="flex flex-col gap-3 md:col-span-8">
          <CardHead
            id="cr-chart"
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
          {n >= 2 && (
            <ScrubChart
              label="Crypto's value and what was put in"
              lines={[
                { name: "Value", values: series.map((x) => x.value), colour: ROLE.bills, fill: true },
                { name: "Put in", values: series.map((x) => x.cost), colour: ROLE.ink },
              ]}
              at={(i) => (series[i] ? (i === n - 1 ? "Today" : dayDate(series[i].date)) : "")}
              format={(v) => money(v)}
              height={200}
              axis={[0, Math.round((n - 1) / 2), n - 1]}
            />
          )}
          <ul className="m-0 flex list-none flex-col p-0">
            {coins.map((c) => (
              <li key={c.id}>
                <Link
                  to="/investments/$fundId"
                  params={{ fundId: String(c.id) }}
                  className="flex min-h-12 items-center justify-between gap-3 border-t border-line text-ink no-underline hover:bg-tile-2"
                >
                  <span>
                    <b>{c.ticker}</b> <span className="text-ink-3">· {c.name}</span>
                    <span className="block text-[12px] text-ink-3">
                      {units(c.units)} at {c.price != null ? money(c.price) : "—"} each · put in {money(c.cost)}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="num block">{money(c.value)}</span>
                    <span className={`num block text-[12px] ${c.gain >= 0 ? "text-savings" : "text-bad"}`}>
                      {signed(c.gain)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="m-0 text-[12px] text-ink-3">
            Prices are looked up once a day. It swings a lot more than ETFs do.
          </p>
        </Card>

        <Card aria-labelledby="cr-cap" className="flex flex-col gap-3 md:col-span-4">
          <CardHead
            id="cr-cap"
            title="Your cap"
            right={<Pill tone={over ? "bad" : "good"}>{over ? "Over" : "Inside"}</Pill>}
          />
          <p className="m-0 -mt-1 text-[13px] text-ink-3">A rule you set so a small bet stays small.</p>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-ink-2">Keep crypto under</span>
            <div className="flex flex-wrap gap-2">
              {CAPS.map((c) => (
                <ChoiceChip
                  key={c}
                  pressed={Math.abs(s.crypto_cap - c) < 1e-9}
                  onClick={() => save.mutate({ crypto_cap: c })}
                >
                  {pct(c, 0)}
                </ChoiceChip>
              ))}
            </div>
            <span className="text-[13px] text-ink-2">Of</span>
            <Segmented
              label="The cap is a share of"
              value={s.crypto_cap_of}
              onChange={(v) => save.mutate({ crypto_cap_of: v })}
              options={[
                { value: "investments", label: "Investments" },
                { value: "networth", label: "Net worth" },
              ]}
            />
          </div>
          <Bar
            label={`${money(value)} of a ${money(capDollars)} cap`}
            max={Math.max(capDollars, value, 1)}
            height={10}
            marker={capDollars}
            segments={[{ value, role: over ? "bad" : "bills" }]}
          />
          <div className="flex justify-between text-[14px]">
            <span className="text-ink-2">{over ? "Over by" : "Room left"}</span>
            <span className="num">{money(Math.abs(capDollars - value))}</span>
          </div>
          <p className="m-0 text-[12px] text-ink-3">
            {over
              ? "Hold off on buying more until it's back under, or sell a little: that's up to you."
              : `The cap is ${money(capDollars)}: ${pct(s.crypto_cap, 0)} of ${baseWords}.`}
          </p>
        </Card>

        <Card aria-labelledby="cr-buys" className="flex flex-col gap-2 md:col-span-8">
          <CardHead id="cr-buys" title="Buys" right={<span className="text-[13px] text-ink-3">oldest first</span>} />
          <ul className="m-0 flex list-none flex-col p-0 text-[14px]">
            {parcels.map((x) => (
              <li
                key={`${x.fund_id}-${x.bought}-${x.units}`}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 last:border-b-0"
              >
                <span>
                  {longDate(x.bought)} · <b>{x.ticker}</b> {units(x.units)}
                  <span className="block text-[12px] text-ink-3">
                    put in {money(x.cost)} · worth {x.value != null ? money(x.value) : "—"}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={`num ${(x.gain ?? 0) >= 0 ? "text-savings" : "text-bad"}`}>
                    {x.gain != null ? signed(x.gain) : "—"}
                  </span>
                  {(x.gain ?? 0) < 0 ? (
                    <Pill tone="mute">Loss · comes off the gains first</Pill>
                  ) : x.long ? (
                    <Pill tone="good">Half counts · held 12+ months</Pill>
                  ) : (
                    <Pill tone="warn">Counts in full until {dayDate(x.discount_from)}</Pill>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card aria-labelledby="cr-sell" className="flex flex-col gap-2 md:col-span-4">
          <CardHead id="cr-sell" title="If you sold it all today" />
          <Line label="Gains held 12+ months" value={signed(longGain)} />
          <Line label="Newer gains (losses come off first)" value={signed(shortGain)} />
          <Line label="Added to taxable income" value={money(counts)} strong />
          <p className="m-0 text-[12px] text-ink-3">
            Crypto is taxed like shares: the <Term k="cgt">CGT discount</Term> halves gains held over 12 months.
            Swapping one coin for another counts as selling. Not advice.
          </p>
        </Card>

        <Card aria-labelledby="cr-plan" className="flex flex-col gap-2 md:col-span-12">
          <CardHead
            id="cr-plan"
            title="In your early-retirement plan"
            right={
              <Switch
                checked={s.count_crypto}
                onChange={(v) => save.mutate({ count_crypto: v })}
                label="Count crypto in the plan"
              />
            }
          />
          <p className="m-0 text-[14px] text-ink-2">
            {s.count_crypto
              ? `${money(value)} of crypto counts toward the years before super opens, like your ETFs.`
              : "Left out. The plan should work without it."}{" "}
            It&apos;s outside super, so it could help pay for the years before super opens. It&apos;s off by default
            because it can halve in a year.
          </p>
          <Link to="/retirement" className="self-start text-[14px] font-semibold text-teal no-underline">
            Open the plan →
          </Link>
        </Card>
      </div>
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
