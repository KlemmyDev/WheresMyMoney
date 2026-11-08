/**
 * Investments (the canvas's Future · Investments): the ETFs held, entered by hand when bought or sold, valued at each
 * fund's close (looked up once a day). The portfolio over time against what was put in, the mix against targets with
 * a split for putting more in, holdings, distributions, trades, and offset or shares, as facts from the household's
 * own numbers. Money in cents; a price can have fractions of a cent.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import {
  Bar,
  BigNumber,
  Card,
  CardHead,
  ChoiceChip,
  EmptyState,
  Eyebrow,
  ROLE,
  Sheet,
  Stat,
  type Role,
} from "~/features/common/ds";
import { longDate, money, monthYear, parseMoney, todayIso } from "~/features/common/format";
import { Chip, I, type Tone } from "~/features/common/icons";
import {
  capitalGainsQuery,
  investmentHistoryQuery,
  investmentsQuery,
  refresh,
  type Fund,
  type Portfolio,
} from "~/features/common/queries";
import { ScrubChart } from "~/features/common/ScrubChart";
import { Button, ErrorText, Input, PageHead, Pill, Segmented } from "~/features/common/ui";

const GROUP_ROLE: Record<string, Role> = {
  aus: "invest",
  intl: "accent",
  bonds: "bills",
  property: "savings",
  cash: "offset",
  crypto: "spending",
  other: "ink",
};
const GROUP_TONE: Record<string, Tone> = {
  aus: "invest",
  intl: "grad",
  bonds: "bills",
  property: "savings",
  cash: "offset",
  crypto: "spending",
  other: "neutral",
};
const PLATFORMS = [
  "Vanguard Personal Investor",
  "CommSec",
  "Pearler",
  "SelfWealth",
  "Stake",
  "Superhero",
  "Betashares Direct",
  "Raiz",
  "Spaceship",
  "CoinSpot",
  "Swyftx",
  "Independent Reserve",
];

/** Funds by where they're held, the biggest platform first. */
function byPlatform(funds: Fund[]): [string, Fund[]][] {
  const out = new Map<string, Fund[]>();
  for (const f of funds) out.set(f.platform, [...(out.get(f.platform) ?? []), f]);
  return [...out.entries()].sort(
    (a, b) => b[1].reduce((t, f) => t + f.value, 0) - a[1].reduce((t, f) => t + f.value, 0),
  );
}

const colourOf = (f: Fund) => ROLE[GROUP_ROLE[f.group] ?? "ink"];
const price = (c: number | null) =>
  c == null ? "—" : `$${(c / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
/** Units held: whole for most, up to six decimals for crypto and fractional shares. */
const units = (u: number) => u.toLocaleString("en-AU", { maximumFractionDigits: 6 });
const signed = (c: number) => `${c >= 0 ? "+" : "−"}${money(Math.abs(c))}`;

type Range = "1m" | "6m" | "1y" | "5y";

export function InvestmentsPage() {
  const q = useQuery(investmentsQuery);
  const [fundSheet, setFundSheet] = useState<Fund | "new" | null>(null);
  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!q.data) return <Loading />;
  const p = q.data;
  return (
    <>
      <PageHead over="Future" title="Investments" />
      <p className="m-0 -mt-2 max-w-[640px] text-[14px] text-ink-3">
        ETFs you hold, entered when you buy or sell. Prices are looked up once a day: only the fund codes leave the
        house.
      </p>
      {p.funds.length === 0 ? (
        <EmptyState
          g={I.invest}
          tone="invest"
          title="No funds yet"
          action={
            <Button primary onClick={() => setFundSheet("new")}>
              Add a fund
            </Button>
          }
        >
          Add each ETF you hold by its code (like VAS), then record your buys and sells. The app works out what they're
          worth each day.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
          <PortfolioHero p={p} />
          <div className="flex flex-col gap-4 md:col-span-4">
            <MixCard p={p} onEdit={setFundSheet} />
            <PutMoreIn p={p} />
          </div>
          <Holdings p={p} onFund={setFundSheet} />
          <div className="flex flex-col gap-4 md:col-span-4">
            <Distributions p={p} />
            <OffsetOrShares p={p} />
          </div>
          <CapitalGainsCard />
          <Trades p={p} />
        </div>
      )}
      <FundSheet fund={fundSheet} groups={p.groups} onClose={() => setFundSheet(null)} />
    </>
  );
}

function PortfolioHero({ p }: { p: Portfolio }) {
  const qc = useQueryClient();
  const [range, setRange] = useState<Range>("1y");
  const h = useQuery({ ...investmentHistoryQuery(range), placeholderData: keepPreviousData });
  const look = useMutation({
    mutationFn: () => apiSend<{ updated: string[]; failed: string[] }>("POST", "investments/prices"),
    onSuccess: () => refresh(qc),
  });
  const series = h.data ?? [];
  const n = series.length;
  const gainPct = p.cost ? (p.gain / p.cost) * 100 : 0;
  return (
    <Card lit aria-labelledby="inv-hero" className="flex flex-col gap-4 md:col-span-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow id="inv-hero">Portfolio</Eyebrow>
          <BigNumber size="xl" className="mt-1">
            {money(p.total, { cents: true })}
          </BigNumber>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
            <Pill tone={p.day >= 0 ? "good" : "bad"}>
              {p.day >= 0 ? "▲" : "▼"} {signed(p.day)} today
            </Pill>
            <span>
              <b className={p.gain >= 0 ? "text-savings" : "text-bad"}>
                {signed(p.gain)} ({gainPct.toFixed(1)}%)
              </b>{" "}
              since you bought
              {p.price_date ? ` · prices from ${longDate(p.price_date)}` : ""}
            </span>
          </div>
        </div>
        <Button small onClick={() => look.mutate()} disabled={look.isPending}>
          {look.isPending ? "Looking up…" : "Look up prices"}
        </Button>
      </div>
      {(p.failed.length > 0 || look.data?.failed.length) && (
        <p className="m-0 text-[13px] text-bills">
          Couldn't find a price for {(look.data?.failed ?? p.failed).join(", ")}. Check the code, or the last trade's
          price is used.
        </p>
      )}
      {look.isError && <ErrorText>{errorMessage(look.error)}</ErrorText>}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-ink-3">Drag across the chart to read any day</span>
        <Segmented<Range>
          label="Range"
          value={range}
          onChange={setRange}
          options={[
            { value: "1m", label: "1M" },
            { value: "6m", label: "6M" },
            { value: "1y", label: "1Y" },
            { value: "5y", label: "5Y" },
          ]}
        />
      </div>
      <ScrubChart
        label={`Portfolio over ${range.toUpperCase()}, now ${money(p.total)}`}
        lines={[
          { name: "Value", values: series.map((s) => s.value), colour: ROLE.invest, fill: true },
          { name: "Put in", values: series.map((s) => s.cost), colour: "var(--color-ink-3)", dashed: true },
        ]}
        at={(i) => (series[i] ? longDate(series[i].date) : "")}
        format={(v) => money(v)}
        height={190}
        axis={n > 2 ? [0, Math.round((n - 1) / 2), n - 1] : undefined}
        axisAt={(i) => (series[i] ? (i === n - 1 ? "Today" : monthYear(series[i].date)) : "")}
      />
      <div className="flex gap-4 text-[13px] text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <i className="h-0.5 w-4 rounded-full" style={{ background: ROLE.invest }} />
          Value
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-0 w-4 border-t border-dashed border-ink-3" />
          What you put in
        </span>
      </div>
    </Card>
  );
}

function MixCard({ p, onEdit }: { p: Portfolio; onEdit: (f: Fund) => void }) {
  return (
    <Card aria-labelledby="inv-mix" className="flex flex-col gap-3">
      <CardHead id="inv-mix" title="Mix against your targets" />
      {!p.targets_set && <p className="m-0 text-[13px] text-ink-3">Tap a fund to set the share you're aiming for.</p>}
      {p.funds.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onEdit(f)}
          aria-label={`${f.group_name}: ${(f.share * 100).toFixed(1)}%${f.target != null ? `, aiming for ${Math.round(f.target * 100)}%` : ""}. Set the target`}
          className="press flex cursor-pointer flex-col gap-1.5 rounded-xl border-0 bg-transparent p-1 text-left text-ink"
        >
          <span className="flex items-baseline justify-between gap-2 text-[14px]">
            <span className="font-semibold">{f.group_name}</span>
            <span className="num text-[13px] text-ink-2">
              {(f.share * 100).toFixed(1)}%{f.target != null ? ` / target ${Math.round(f.target * 100)}%` : ""}
            </span>
          </span>
          <Bar
            segments={[{ value: f.share, color: colourOf(f) }]}
            max={1}
            marker={f.target ?? undefined}
            height={10}
            label={`${f.ticker}: ${(f.share * 100).toFixed(1)}% of the portfolio${f.target != null ? `, aiming for ${Math.round(f.target * 100)}%` : ""}`}
          />
        </button>
      ))}
    </Card>
  );
}

function PutMoreIn({ p }: { p: Portfolio }) {
  const [add, setAdd] = useState(100000);
  if (!p.targets_set) return null;
  const after = p.total + add;
  // What each fund is short of its target once the sum's in; the sum is shared in proportion.
  const short = p.funds.map((f) => Math.max(0, (f.target ?? 0) * after - f.value));
  const sum = short.reduce((a, b) => a + b, 0) || 1;
  return (
    <Card aria-labelledby="inv-add" className="flex flex-col gap-3">
      <CardHead id="inv-add" title="Putting more in?" />
      <div className="flex flex-wrap gap-2">
        {[50000, 100000, 200000].map((v) => (
          <ChoiceChip key={v} pressed={add === v} onClick={() => setAdd(v)} role="invest">
            {money(v)}
          </ChoiceChip>
        ))}
      </div>
      <div className="flex flex-col">
        {p.funds.map((f, i) => (
          <div key={f.id} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
            <span className="mono w-11 text-[13px] font-semibold" style={{ color: colourOf(f) }}>
              {f.ticker}
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] text-ink-2">{f.group_name}</span>
            <span className="num text-[15px]">{money((short[i] / sum) * add)}</span>
          </div>
        ))}
      </div>
      <p className="m-0 text-[12px] text-ink-3">
        Split to bring the mix back towards your targets. The app doesn't buy anything.
      </p>
    </Card>
  );
}

function Holdings({ p, onFund }: { p: Portfolio; onFund: (f: Fund | "new") => void }) {
  const [trading, setTrading] = useState(false);
  return (
    <Card aria-labelledby="inv-hold" className="flex flex-col gap-3 md:col-span-8">
      <CardHead
        id="inv-hold"
        title="Holdings"
        right={
          <span className="flex gap-2">
            <Button small onClick={() => onFund("new")}>
              Add a fund
            </Button>
            <Button small primary onClick={() => setTrading((t) => !t)}>
              {trading ? "Close" : "Record a trade"}
            </Button>
          </span>
        }
      />
      {trading && <TradeForm p={p} onDone={() => setTrading(false)} />}
      <div className="hidden grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))] gap-3 px-2 text-[11px] font-semibold tracking-[0.09em] text-ink-3 uppercase md:grid">
        <span>Fund</span>
        <span className="text-right">Units</span>
        <span className="text-right">Price</span>
        <span className="text-right">Today</span>
        <span className="text-right">Value</span>
        <span className="text-right">Gain</span>
      </div>
      <div className="flex flex-col">
        {byPlatform(p.funds).flatMap(([platform, funds], gi, all) => [
          ...(all.length > 1
            ? [
                <div
                  key={`h-${platform}`}
                  className="flex items-baseline justify-between px-2 pt-3 pb-1 text-[12px] font-semibold tracking-[0.06em] text-ink-3 uppercase"
                  style={gi === 0 ? { paddingTop: 0 } : undefined}
                >
                  <span>{platform || "No platform given"}</span>
                  <span className="num normal-case">{money(funds.reduce((t, f) => t + f.value, 0))}</span>
                </div>,
              ]
            : []),
          ...funds.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onFund(f)}
              aria-label={`${f.ticker}, ${f.name}: ${f.units} units worth ${money(f.value)}, ${signed(f.gain)} since bought. Edit the fund`}
              className="chip-host press grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border-0 border-t border-line bg-transparent px-2 py-3 text-left text-ink first:border-t-0 hover:bg-tile-2 md:grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))]"
            >
              <span className="flex min-w-0 items-center gap-3">
                <Chip g={I.invest} tone={GROUP_TONE[f.group] ?? "neutral"} size="lg" />
                <span className="min-w-0">
                  <span className="block font-semibold">
                    {f.ticker} <span className="font-normal text-ink-3">· {f.group_name}</span>
                  </span>
                  <span className="block truncate text-[13px] text-ink-3">
                    {f.name}
                    {f.kind !== "etf" ? ` · ${f.kind === "crypto" ? "Crypto" : "Share"}` : ""}
                    <span className="md:hidden">
                      {" "}
                      · {units(f.units)} units at {price(f.price)}
                    </span>
                  </span>
                </span>
              </span>
              <span className="num hidden text-right text-[14px] md:block">{units(f.units)}</span>
              <span className="num hidden text-right text-[14px] md:block">{price(f.price)}</span>
              <span
                className={`num hidden text-right text-[14px] md:block ${f.day >= 0 ? "text-savings" : "text-bad"}`}
              >
                {signed(f.day)}
              </span>
              <span className="text-right">
                <span className="num block text-[15px]">{money(f.value)}</span>
                <span className={`num block text-[12px] md:hidden ${f.gain >= 0 ? "text-savings" : "text-bad"}`}>
                  {signed(f.gain)}
                </span>
              </span>
              <span
                className={`num hidden text-right text-[14px] md:block ${f.gain >= 0 ? "text-savings" : "text-bad"}`}
              >
                {signed(f.gain)}
              </span>
            </button>
          )),
        ])}
      </div>
    </Card>
  );
}

function TradeForm({ p, onDone }: { p: Portfolio; onDone: () => void }) {
  const qc = useQueryClient();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [fundId, setFundId] = useState(p.funds[0]?.id);
  const fund = p.funds.find((f) => f.id === fundId);
  const [units, setUnits] = useState("");
  const [each, setEach] = useState(fund?.price ? (fund.price / 100).toString() : "");
  const [fee, setFee] = useState("");
  const [date, setDate] = useState(todayIso());
  const u = Number(units) || 0;
  const e = Number(each) || 0;
  const total = Math.round(u * e * 100) + (side === "buy" ? 1 : -1) * (parseMoney(fee) ?? 0);
  const save = useMutation({
    mutationFn: () =>
      apiSend("POST", "investments/trades", {
        fund_id: fundId,
        side,
        units: u,
        price: Math.round(e * 100000) / 1000,
        fee: parseMoney(fee) ?? 0,
        date,
      }),
    onSuccess: () => {
      refresh(qc);
      onDone();
    },
  });
  return (
    <form
      className="flex flex-col gap-3 rounded-[20px] border border-line bg-tile-2 p-4"
      onSubmit={(ev) => {
        ev.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex flex-wrap gap-2" role="group" aria-label="Bought or sold">
        <ChoiceChip pressed={side === "buy"} onClick={() => setSide("buy")} role="savings">
          Bought
        </ChoiceChip>
        <ChoiceChip pressed={side === "sell"} onClick={() => setSide("sell")} role="bills">
          Sold
        </ChoiceChip>
      </div>
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1" role="group" aria-label="Fund">
        {p.funds.map((f) => (
          <ChoiceChip
            key={f.id}
            pressed={fundId === f.id}
            onClick={() => {
              setFundId(f.id);
              if (f.price) setEach((f.price / 100).toString());
            }}
            role={GROUP_ROLE[f.group] ?? "accent"}
          >
            {f.ticker}
          </ChoiceChip>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow">Units</span>
          <Input
            inputMode="decimal"
            value={units}
            onChange={(ev) => setUnits(ev.target.value.replace(/[^0-9.]/g, ""))}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow">Price each $</span>
          <Input inputMode="decimal" value={each} onChange={(ev) => setEach(ev.target.value.replace(/[^0-9.]/g, ""))} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow">Brokerage $</span>
          <Input inputMode="decimal" placeholder="0" value={fee} onChange={(ev) => setFee(ev.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow">When</span>
          <Input
            type="date"
            max={todayIso()}
            value={date}
            onChange={(ev) => ev.target.value && setDate(ev.target.value)}
          />
        </label>
      </div>
      {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
      <div className="flex items-center justify-between gap-3">
        <span className="num text-[18px]">{u && e ? money(total, { cents: true }) : "—"}</span>
        <Button primary type="submit" disabled={!u || !e || save.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}

function Distributions({ p }: { p: Portfolio }) {
  const d = p.distributions;
  const hi = Math.max(1, ...d.quarters.map((q) => q.amount));
  return (
    <Card aria-labelledby="inv-dist" className="flex flex-col gap-3">
      <CardHead
        id="inv-dist"
        title="Distributions"
        right={<Pill tone="mute">{money(d.year_total)} in the last year</Pill>}
      />
      {d.year_total === 0 && d.quarters.every((q) => !q.amount) ? (
        <p className="m-0 text-[13px] text-ink-3">
          Sort distributions as Dividends when they land in an account, and they show up here.
        </p>
      ) : (
        <>
          <div
            className="flex h-[110px] items-end gap-1.5"
            role="img"
            aria-label={d.quarters.map((q) => `${q.quarter} ${money(q.amount)}${q.likely ? " likely" : ""}`).join(", ")}
          >
            {d.quarters.map((q) => (
              <div key={q.quarter} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span
                  className={q.likely ? "hatched w-full rounded-t-md" : "striped w-full rounded-t-md"}
                  style={{
                    height: `${Math.max(3, (q.amount / hi) * 100)}%`,
                    backgroundColor: q.likely ? "transparent" : ROLE.invest,
                    ["--c" as string]: ROLE.invest,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 text-center text-[10px] text-ink-3">
            {d.quarters.map((q) => (
              <span key={q.quarter} className="flex-1">
                {q.quarter.slice(5)}
                <br />
                {q.quarter.slice(2, 4)}
              </span>
            ))}
          </div>
          <p className="m-0 text-[12px] text-ink-3">
            The shaded bar is the quarter to come, guessed from what it paid last year.
          </p>
        </>
      )}
    </Card>
  );
}

function OffsetOrShares({ p }: { p: Portfolio }) {
  if (p.loan_rate_bp == null) return null;
  return (
    <Card aria-labelledby="inv-vs" className="flex flex-col gap-3">
      <CardHead id="inv-vs" title="Offset or shares?" />
      <div className="grid grid-cols-2 gap-2.5">
        <Stat
          label="Offset"
          value={`${(p.loan_rate_bp / 100).toFixed(2)}%`}
          note="Your loan rate. No tax, no swings."
          role="offset"
        />
        <Stat
          label="Your ETFs"
          value={p.annual != null ? `${(p.annual * 100).toFixed(1)}%` : "—"}
          note={
            p.first
              ? `A year since ${monthYear(p.first)}. Goes up and down; distributions are taxed.`
              : "Not long enough to say."
          }
          role="invest"
        />
      </div>
      <p className="m-0 text-[12px] text-ink-3">Facts from your own numbers, not advice.</p>
    </Card>
  );
}

function Trades({ p }: { p: Portfolio }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<number | null>(null);
  const del = useMutation({
    mutationFn: (id: number) => apiSend("DELETE", `investments/trades/${id}`),
    onSuccess: () => {
      setConfirm(null);
      refresh(qc);
    },
  });
  const fund = (id: number) => p.funds.find((f) => f.id === id);
  return (
    <Card aria-labelledby="inv-trades" className="flex flex-col gap-2 md:col-span-12">
      <CardHead id="inv-trades" title="Trades entered by hand" right={<Pill tone="mute">{p.trades.length}</Pill>} />
      {del.isError && <ErrorText>{errorMessage(del.error)}</ErrorText>}
      <div className="grid gap-x-6 md:grid-cols-2">
        {p.trades.slice(0, 12).map((t) => {
          const f = fund(t.fund_id);
          return (
            <div key={t.id} className="flex min-w-0 items-center gap-3 border-t border-line py-2.5">
              <span className="mono w-11 text-[13px] font-semibold" style={{ color: f ? colourOf(f) : undefined }}>
                {t.ticker}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px]">
                  {t.side === "buy" ? "Bought" : "Sold"} {units(t.units)} units at {price(t.price)}
                </span>
                <span className="block text-[12px] text-ink-3">{longDate(t.date)}</span>
              </span>
              <span className={`num text-[14px] ${t.side === "sell" ? "text-savings" : ""}`}>
                {t.side === "buy" ? "−" : "+"}
                {money(t.amount, { cents: true })}
              </span>
              {confirm === t.id ? (
                <span className="flex gap-1">
                  <Button small onClick={() => setConfirm(null)}>
                    Keep
                  </Button>
                  <Button small className="text-bad" onClick={() => del.mutate(t.id)} disabled={del.isPending}>
                    Delete
                  </Button>
                </span>
              ) : (
                <button
                  type="button"
                  aria-label={`Delete the ${t.ticker} trade on ${longDate(t.date)}`}
                  onClick={() => setConfirm(t.id)}
                  className="flex size-9 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-3 hover:text-bad"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function FundSheet({
  fund,
  groups,
  onClose,
}: {
  fund: Fund | "new" | null;
  groups: Record<string, string>;
  onClose: () => void;
}) {
  return (
    <Sheet open={fund != null} onClose={onClose} title={fund === "new" ? "Add a fund" : fund ? fund.ticker : ""}>
      {fund != null && (
        <FundForm
          key={fund === "new" ? "new" : fund.id}
          fund={fund === "new" ? null : fund}
          groups={groups}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

function FundForm({
  fund,
  groups,
  onClose,
}: {
  fund: Fund | null;
  groups: Record<string, string>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [ticker, setTicker] = useState(fund?.ticker ?? "");
  const [name, setName] = useState(fund?.name ?? "");
  const [group, setGroup] = useState(fund?.group ?? "aus");
  const [kind, setKind] = useState<Fund["kind"]>(fund?.kind ?? "etf");
  const [platform, setPlatform] = useState(fund?.platform ?? "");
  const [target, setTarget] = useState(fund?.target != null ? String(Math.round(fund.target * 100)) : "");
  const [fee, setFee] = useState(fund?.fee_pct != null ? String(Math.round(fund.fee_pct * 100000) / 1000) : "");
  const save = useMutation({
    mutationFn: () =>
      apiSend(fund ? "PUT" : "POST", fund ? `investments/funds/${fund.id}` : "investments/funds", {
        ticker,
        name,
        group,
        kind,
        platform,
        target: target === "" ? null : Number(target) / 100,
        fee_pct: fee === "" ? null : Number(fee) / 100,
      }),
    onSuccess: () => {
      refresh(qc);
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => apiSend("DELETE", `investments/funds/${fund!.id}`),
    onSuccess: () => {
      refresh(qc);
      onClose();
    },
  });
  return (
    <form
      className="flex flex-col gap-4 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow">Code</span>
          <Input value={ticker} placeholder="VAS" onChange={(e) => setTicker(e.target.value.toUpperCase())} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow">Name</span>
          <Input value={name} placeholder="Vanguard Australian Shares" onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      <p className="m-0 -mt-2 text-[12px] text-ink-3">
        {kind === "crypto"
          ? "The coin's code, like BTC or ETH. It's priced in Australian dollars."
          : "An ASX code, or add the market for others (VTI.US). Prices are looked up by this code."}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Kind">
        {(
          [
            ["etf", "ETF"],
            ["share", "Share"],
            ["crypto", "Crypto"],
          ] as const
        ).map(([k, l]) => (
          <ChoiceChip
            key={k}
            pressed={kind === k}
            onClick={() => {
              setKind(k);
              if (k === "crypto") setGroup("crypto");
              else if (group === "crypto") setGroup("other");
            }}
          >
            {l}
          </ChoiceChip>
        ))}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="eyebrow">Held on</span>
        <Input
          list="platforms"
          value={platform}
          placeholder="Vanguard Personal Investor, CommSec, Raiz, CoinSpot…"
          onChange={(e) => setPlatform(e.target.value)}
        />
        <datalist id="platforms">
          {PLATFORMS.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      </label>
      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="eyebrow mb-2">What it holds</legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(groups).map(([k, label]) => (
            <ChoiceChip key={k} pressed={group === k} onClick={() => setGroup(k)} role={GROUP_ROLE[k] ?? "accent"}>
              {label}
            </ChoiceChip>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1.5">
        <span className="eyebrow">Aiming for (% of the portfolio)</span>
        <Input
          inputMode="numeric"
          placeholder="Leave empty for no target"
          value={target}
          onChange={(e) => setTarget(e.target.value.replace(/[^0-9]/g, ""))}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="eyebrow">Management fee (% a year)</span>
        <Input
          inputMode="decimal"
          placeholder="Like 0.07, from the fund's fact sheet"
          value={fee}
          onChange={(e) => setFee(e.target.value.replace(/[^0-9.]/g, ""))}
        />
      </label>
      {(save.isError || remove.isError) && <ErrorText>{errorMessage(save.error ?? remove.error)}</ErrorText>}
      <div className="flex gap-2">
        {fund && (
          <Button type="button" className="text-bad" onClick={() => remove.mutate()} disabled={remove.isPending}>
            Remove
          </Button>
        )}
        <span className="flex-1" />
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button primary type="submit" disabled={!ticker.trim() || save.isPending}>
          {fund ? "Save" : "Add it"}
        </Button>
      </div>
    </form>
  );
}

const fy = (y: number) => `${y - 1}–${String(y).slice(2)}`;

/** Capital gains a financial year at a time, and the parcels still held with when each gets the discount. */
function CapitalGainsCard() {
  const [year, setYear] = useState<number | null>(null);
  const q = useQuery({ ...capitalGainsQuery(year), placeholderData: keepPreviousData });
  const t = q.data;
  if (!t) return null;
  const soon = t.parcels.filter((p) => !p.long);
  return (
    <Card aria-labelledby="inv-cgt" className="flex flex-col gap-4 md:col-span-12">
      <CardHead
        id="inv-cgt"
        title="Capital gains"
        right={
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto" role="group" aria-label="Financial year">
            {t.years.map((y) => (
              <ChoiceChip key={y} pressed={t.year === y} onClick={() => setYear(y)} role="invest">
                {fy(y)}
              </ChoiceChip>
            ))}
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat label="Held over a year" value={money(t.long)} note="gains, before the discount" role="savings" />
        <Stat label="Held under a year" value={money(t.short)} note="gains" role="bills" />
        <Stat
          label="Losses"
          value={money(t.losses)}
          note={t.carried ? `${money(t.carried)} carried forward` : "taken off the gains"}
          role="bad"
        />
        <Stat
          label="Net capital gain"
          value={money(t.net)}
          note={t.discount ? `after the ${money(t.discount)} discount` : "to declare"}
          role="invest"
        />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col">
          <div className="eyebrow mb-1">Sales in {fy(t.year)}</div>
          {t.sales.length === 0 && <p className="m-0 text-[13px] text-ink-3">Nothing sold this financial year.</p>}
          {t.sales.map((s, i) => (
            <div key={i} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
              <span className="mono w-11 text-[13px] font-semibold">{s.ticker}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px]">
                  {units(s.units)} units, {longDate(s.date)}
                </span>
                <span className="block text-[12px] text-ink-3">
                  Bought {longDate(s.bought)} · cost {money(s.cost)} · sold for {money(s.proceeds)}
                </span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <span className={`num text-[14px] ${s.gain >= 0 ? "text-savings" : "text-bad"}`}>{signed(s.gain)}</span>
                <Pill tone={s.long ? "good" : "mute"}>{s.long ? "Over a year" : "Under a year"}</Pill>
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-col">
          <div className="eyebrow mb-1">Parcels still held, under a year</div>
          {soon.length === 0 && (
            <p className="m-0 text-[13px] text-ink-3">Every parcel held has been held over a year.</p>
          )}
          {soon.slice(0, 8).map((p, i) => (
            <div key={i} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
              <span className="mono w-11 text-[13px] font-semibold">{p.ticker}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px]">
                  {units(p.units)} units, bought {longDate(p.bought)}
                </span>
                <span className="block text-[12px] text-ink-3">Discount from {longDate(p.discount_from)}</span>
              </span>
              {p.gain != null && (
                <span className={`num text-[14px] ${p.gain >= 0 ? "text-savings" : "text-bad"}`}>{signed(p.gain)}</span>
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="m-0 text-[12px] text-ink-3">
        Parcels are used up oldest first, the ATO's default; you can choose other parcels in your return. Losses come
        off gains held under a year first. An estimate to take to your tax return, not tax advice.
      </p>
    </Card>
  );
}
