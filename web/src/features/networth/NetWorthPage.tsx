/**
 * Net worth (the canvas's Overview · Net worth): what the household owns less what it owes, over one, three or five
 * years, with or without the home (and its loan). What it's made of, what moved it, what's owned (each with where its
 * value comes from) and what's owed. A picture, not a statement: super, shares and the home are values the household
 * keeps up to date itself. Money in cents.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Bar, BigNumber, Card, CardHead, ChoiceChip, Eyebrow, ROLE, Sheet, type Role } from "~/features/common/ds";
import { longDate, money, monthYear, parseMoney } from "~/features/common/format";
import { Chip, I, type Glyph, type Tone } from "~/features/common/icons";
import { netWorthQuery, refresh, type Asset, type NetWorth, type NetWorthPoint } from "~/features/common/queries";
import { ScrubChart } from "~/features/common/ScrubChart";
import { useStoredFlag } from "~/features/common/theme";
import { Button, ErrorText, Input, PageHead, Pill, Segmented, Switch } from "~/features/common/ui";

type Range = "1y" | "3y" | "5y";
const signed = (c: number) => `${c >= 0 ? "+" : "−"}${money(Math.abs(c))}`;
const ASSET_LOOK: Record<string, { g: Glyph; tone: Tone; role: Role }> = {
  home: { g: I.loan, tone: "offset", role: "offset" },
  car: { g: I.car, tone: "spending", role: "spending" },
  other: { g: I.savings, tone: "neutral", role: "ink" },
};
const ACCOUNT_LOOK: Record<string, { g: Glyph; tone: Tone }> = {
  offset: { g: I.offset, tone: "offset" },
  bills: { g: I.bills, tone: "bills" },
  spending: { g: I.spending, tone: "spending" },
  savings: { g: I.savings, tone: "savings" },
  track: { g: I.accounts, tone: "neutral" },
};

/** Net worth at a point, with or without the home and its loan. */
const total = (p: NetWorthPoint, home: boolean) =>
  p.accounts + p.shares + p.super + p.other + (home ? p.home - p.loan : 0);

export function NetWorthPage() {
  const [range, setRange] = useState<Range>("1y");
  const [noHome, setNoHome] = useStoredFlag("wmm:networth-no-home");
  const home = !noHome;
  const q = useQuery({ ...netWorthQuery(range), placeholderData: keepPreviousData });
  const [editing, setEditing] = useState<Asset | "new" | null>(null);
  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!q.data) return <Loading />;
  const n = q.data;
  return (
    <>
      <PageHead over="Overview" title="Net worth" />
      <div className="grid gap-4 md:grid-cols-12">
        <Hero n={n} home={home} setHome={(v) => setNoHome(!v)} range={range} setRange={setRange} />
        <div className="flex flex-col gap-4 md:col-span-4">
          <MadeOf n={n} home={home} />
          <Moved n={n} home={home} range={range} />
        </div>
        <Owned n={n} home={home} onEdit={setEditing} />
        <Owed n={n} home={home} />
      </div>
      <AssetSheet asset={editing} kinds={n.kinds} onClose={() => setEditing(null)} />
    </>
  );
}

function Hero({
  n,
  home,
  setHome,
  range,
  setRange,
}: {
  n: NetWorth;
  home: boolean;
  setHome: (v: boolean) => void;
  range: Range;
  setRange: (r: Range) => void;
}) {
  const series = n.history.map((p) => total(p, home));
  const now = series[series.length - 1];
  const delta = now - series[0];
  const len = series.length;
  return (
    <Card lit aria-labelledby="nw-hero" className="flex flex-col gap-4 md:col-span-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow id="nw-hero">{home ? "Net worth" : "Net worth, without the home"}</Eyebrow>
          <BigNumber size="xl" className="mt-1">
            {money(now)}
          </BigNumber>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
            <Pill tone={delta >= 0 ? "good" : "bad"}>
              {delta >= 0 ? "▲" : "▼"} {signed(delta)}
            </Pill>
            over {range === "1y" ? "the last year" : range === "3y" ? "three years" : "five years"}
          </div>
        </div>
        <label className="flex items-center gap-2 text-[14px] font-semibold">
          Count the home
          <Switch checked={home} onChange={setHome} label="Count the home" />
        </label>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-ink-3">Drag across the chart to read any month</span>
        <Segmented<Range>
          label="Range"
          value={range}
          onChange={setRange}
          options={[
            { value: "1y", label: "1Y" },
            { value: "3y", label: "3Y" },
            { value: "5y", label: "5Y" },
          ]}
        />
      </div>
      <ScrubChart
        label={`Net worth over ${range.toUpperCase()}, now ${money(now)}`}
        lines={[{ name: "Net worth", values: series, colour: ROLE.accent, fill: true }]}
        at={(i) => (n.history[i] ? (i === len - 1 ? "Today" : monthYear(n.history[i].date)) : "")}
        format={(v) => money(v)}
        height={190}
        axis={[0, Math.round((len - 1) / 2), len - 1]}
      />
    </Card>
  );
}

function groups(p: NetWorthPoint, home: boolean) {
  return [
    { name: "Home", value: home ? p.home : 0, role: "offset" as Role },
    { name: "Super", value: p.super, role: "savings" as Role },
    { name: "Shares", value: p.shares, role: "invest" as Role },
    { name: "Accounts", value: Math.max(p.accounts, 0), role: "accent" as Role },
    { name: "Other", value: p.other, role: "spending" as Role },
  ].filter((g) => g.value > 0);
}

function MadeOf({ n, home }: { n: NetWorth; home: boolean }) {
  const gs = groups(n.now, home);
  const owned = gs.reduce((s, g) => s + g.value, 0) || 1;
  return (
    <Card aria-labelledby="nw-made" className="flex flex-col gap-3">
      <CardHead id="nw-made" title="What it's made of" />
      <p className="m-0 -mt-1 text-[13px] text-ink-3">
        {money(owned)} owned{home && n.now.loan ? ` · ${money(n.now.loan)} owed` : ""}
      </p>
      <Bar
        segments={gs.map((g) => ({ value: g.value, role: g.role }))}
        max={owned}
        height={14}
        label={gs.map((g) => `${g.name} ${Math.round((g.value / owned) * 100)}%`).join(", ")}
      />
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {gs.map((g) => (
          <span key={g.name} className="flex items-center gap-2 text-[13px]">
            <i className="size-2.5 rounded-sm" style={{ background: ROLE[g.role] }} />
            <span className="flex-1 text-ink-2">{g.name}</span>
            <span className="num">{Math.round((g.value / owned) * 100)}%</span>
          </span>
        ))}
      </div>
    </Card>
  );
}

function Moved({ n, home, range }: { n: NetWorth; home: boolean; range: Range }) {
  const a = n.history[0];
  const b = n.now;
  const moves = [
    { name: "Accounts", v: b.accounts - a.accounts, g: I.accounts, tone: "grad" as Tone },
    { name: "Shares", v: b.shares - a.shares, g: I.invest, tone: "invest" as Tone },
    { name: "Super", v: b.super - a.super, g: I.retire, tone: "savings" as Tone },
    ...(home
      ? [
          { name: "Home estimate", v: b.home - a.home, g: I.loan, tone: "offset" as Tone },
          { name: "Loan paid down", v: a.loan - b.loan, g: I.shield, tone: "offset" as Tone },
        ]
      : []),
    { name: "Other things owned", v: b.other - a.other, g: I.car, tone: "spending" as Tone },
  ].filter((m) => m.v !== 0);
  const hi = Math.max(1, ...moves.map((m) => Math.abs(m.v)));
  const sum = moves.reduce((s, m) => s + m.v, 0);
  return (
    <Card aria-labelledby="nw-moved" className="flex flex-col gap-2">
      <CardHead
        id="nw-moved"
        title={`What moved it, ${range === "1y" ? "this year" : `over ${range.slice(0, 1)} years`}`}
      />
      {moves.map((m) => (
        <div key={m.name} className="flex items-center gap-3 py-1">
          <Chip g={m.g} tone={m.tone} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2 text-[14px]">
              <span>{m.name}</span>
              <span className={`num ${m.v >= 0 ? "text-savings" : "text-bad"}`}>{signed(m.v)}</span>
            </span>
            <span className="mt-1 block h-1.5 rounded-full bg-raised">
              <span
                className="striped block h-full rounded-full"
                style={{
                  width: `${(Math.abs(m.v) / hi) * 100}%`,
                  backgroundColor: m.v >= 0 ? ROLE.savings : ROLE.bad,
                }}
              />
            </span>
          </span>
        </div>
      ))}
      <div className="flex items-baseline justify-between border-t border-line pt-2 text-[14px] font-semibold">
        <span>{sum >= 0 ? "Up" : "Down"}</span>
        <span className="num">{signed(sum)}</span>
      </div>
      <p className="m-0 text-[12px] text-ink-3">
        Accounts come from check-ins and imports. Super, shares and the home are values you keep up to date, so this is
        a picture, not a statement.
      </p>
    </Card>
  );
}

function OwnedRow({
  g,
  tone,
  name,
  sub,
  value,
  badge,
  share,
  to,
  onClick,
}: {
  g: Glyph;
  tone: Tone;
  name: string;
  sub: string;
  value: number;
  badge: { text: string; tone: "good" | "teal" | "mute" };
  share: number;
  to?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <Chip g={g} tone={tone} size="lg" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{name}</span>
        <span className="block truncate text-[13px] text-ink-3">{sub}</span>
      </span>
      <span className="hidden sm:block">
        <Pill tone={badge.tone}>{badge.text}</Pill>
      </span>
      <span className="flex-none text-right">
        <span className="num block text-[15px]">{money(value)}</span>
        <span className="block text-[12px] text-ink-3">{Math.round(share * 100)}% of assets</span>
      </span>
    </>
  );
  const cls =
    "chip-host press flex w-full cursor-pointer items-center gap-3 rounded-2xl border-0 border-t border-line bg-transparent px-1.5 py-3 text-left text-ink no-underline first:border-t-0 hover:bg-tile-2";
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" className={cls} onClick={onClick}>
      {inner}
    </button>
  );
}

function Owned({ n, home, onEdit }: { n: NetWorth; home: boolean; onEdit: (a: Asset | "new") => void }) {
  const assets = n.assets.filter((a) => home || a.kind !== "home");
  const owned =
    assets.reduce((s, a) => s + a.value, 0) +
      n.super.reduce((s, p) => s + p.balance, 0) +
      n.shares.value +
      n.accounts.reduce((s, a) => s + Math.max(a.balance, 0), 0) || 1;
  return (
    <Card aria-labelledby="nw-own" className="flex flex-col gap-1 md:col-span-7">
      <CardHead id="nw-own" title="What you own" right={<span className="num text-[15px]">{money(owned)}</span>} />
      {assets.map((a) => (
        <OwnedRow
          key={a.id}
          g={ASSET_LOOK[a.kind].g}
          tone={ASSET_LOOK[a.kind].tone}
          name={a.name}
          sub={`Your estimate${a.as_of ? ` · updated ${monthYear(a.as_of)}` : ""}`}
          value={a.value}
          badge={{ text: "Estimate", tone: "mute" }}
          share={a.value / owned}
          onClick={() => onEdit(a)}
        />
      ))}
      {n.super.map((p) => (
        <OwnedRow
          key={p.person}
          g={I.retire}
          tone="savings"
          name={`Super, ${p.person}`}
          sub={`Balance you entered${p.as_of ? ` · ${monthYear(p.as_of)}` : ""}`}
          value={p.balance}
          badge={{ text: p.as_of ? `Updated ${monthYear(p.as_of).split(" ")[0]}` : "Entered", tone: "mute" }}
          share={p.balance / owned}
          to="/retirement"
        />
      ))}
      {n.shares.funds > 0 && (
        <OwnedRow
          g={I.invest}
          tone="invest"
          name="Shares"
          sub="ETF holdings · prices looked up daily"
          value={n.shares.value}
          badge={{ text: "Live price", tone: "good" }}
          share={n.shares.value / owned}
          to="/investments"
        />
      )}
      {n.accounts.map((a) => (
        <OwnedRow
          key={a.id}
          g={(ACCOUNT_LOOK[a.role] ?? ACCOUNT_LOOK.track).g}
          tone={(ACCOUNT_LOOK[a.role] ?? ACCOUNT_LOOK.track).tone}
          name={a.name}
          sub={
            a.known
              ? `${a.known.source === "checkin" ? "Checked in" : "Known"} ${longDate(a.known.date)}`
              : "From the ledger"
          }
          value={a.balance}
          badge={{ text: a.known?.source === "checkin" ? "Check-in" : "Statement", tone: "teal" }}
          share={Math.max(a.balance, 0) / owned}
          to="/accounts"
        />
      ))}
      <button
        type="button"
        onClick={() => onEdit("new")}
        className="press mt-1 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-line-2 bg-transparent text-[14px] font-semibold text-ink-2"
      >
        + Add something you own
      </button>
    </Card>
  );
}

function Owed({ n, home }: { n: NetWorth; home: boolean }) {
  const lo = n.loan;
  return (
    <Card aria-labelledby="nw-owe" className="flex flex-col gap-3 md:col-span-5">
      <CardHead
        id="nw-owe"
        title="What you owe"
        right={<span className="num text-[15px]">{lo && home ? money(lo.balance) : money(0)}</span>}
      />
      {!lo ? (
        <p className="m-0 text-[13px] text-ink-3">Nothing owed that the app knows of.</p>
      ) : !home ? (
        <p className="m-0 text-[13px] text-ink-3">
          The home loan is left out with the home. Turn Count the home on to see it.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Chip g={I.loan} tone="loan" size="lg" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{lo.name}</span>
              <span className="block text-[13px] text-ink-3">
                {lo.rate_bp != null ? `${(lo.rate_bp / 100).toFixed(2)}%` : "Rate not set"}
              </span>
            </span>
            <span className="num text-[15px]">−{money(lo.balance, { cents: true })}</span>
          </div>
          <div>
            <div className="flex items-baseline justify-between text-[14px]">
              <span>Offset against it</span>
              <span className="num">{lo.balance ? Math.round((lo.offsetting / lo.balance) * 1000) / 10 : 0}%</span>
            </div>
            <div className="mt-2">
              <Bar
                segments={[{ value: Math.min(lo.offsetting, lo.balance), role: "offset" }]}
                max={lo.balance || 1}
                height={10}
                label={`${money(lo.offsetting)} offset against ${money(lo.balance)}`}
              />
            </div>
            <p className="m-0 mt-1.5 text-[13px] text-ink-3">
              {money(lo.offsetting)} across the offsetting accounts · interest charged on{" "}
              {money(Math.max(lo.balance - lo.offsetting, 0))}
            </p>
          </div>
          <Link to="/loan" className="text-[14px] font-semibold text-teal no-underline">
            Loan and offset →
          </Link>
        </>
      )}
    </Card>
  );
}

function AssetSheet({
  asset,
  kinds,
  onClose,
}: {
  asset: Asset | "new" | null;
  kinds: Record<string, string>;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={asset != null}
      onClose={onClose}
      title={asset === "new" ? "Add something you own" : asset ? asset.name : ""}
    >
      {asset != null && (
        <AssetForm
          key={asset === "new" ? "new" : asset.id}
          asset={asset === "new" ? null : asset}
          kinds={kinds}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

function AssetForm({
  asset,
  kinds,
  onClose,
}: {
  asset: Asset | null;
  kinds: Record<string, string>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<string>(asset?.kind ?? "home");
  const [name, setName] = useState(asset?.name ?? "");
  const [value, setValue] = useState(asset ? (asset.value / 100).toFixed(0) : "");
  const save = useMutation({
    mutationFn: () =>
      apiSend(asset ? "PUT" : "POST", asset ? `networth/assets/${asset.id}` : "networth/assets", {
        kind,
        name: name || kinds[kind],
        value: parseMoney(value),
      }),
    onSuccess: () => {
      refresh(qc);
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => apiSend("DELETE", `networth/assets/${asset!.id}`),
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
      <div className="flex flex-wrap gap-2" role="group" aria-label="What it is">
        {Object.entries(kinds).map(([k, label]) => (
          <ChoiceChip
            key={k}
            pressed={kind === k}
            onClick={() => setKind(k)}
            g={ASSET_LOOK[k]?.g}
            tone={ASSET_LOOK[k]?.tone}
            role={ASSET_LOOK[k]?.role}
          >
            {label}
          </ChoiceChip>
        ))}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="eyebrow">Name</span>
        <Input value={name} placeholder={kinds[kind]} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="eyebrow">Worth about $</span>
        <Input inputMode="decimal" value={value} placeholder="760,000" onChange={(e) => setValue(e.target.value)} />
      </label>
      {asset && asset.values.length > 1 && (
        <p className="m-0 text-[13px] text-ink-3">
          Earlier:{" "}
          {asset.values
            .slice(0, -1)
            .map((v) => `${money(v.value)} in ${monthYear(v.date)}`)
            .join(", ")}
        </p>
      )}
      <p className="m-0 text-[12px] text-ink-3">
        You update it by hand. Each value is kept, so the chart shows the change.
      </p>
      {(save.isError || remove.isError) && <ErrorText>{errorMessage(save.error ?? remove.error)}</ErrorText>}
      <div className="flex gap-2">
        {asset && (
          <Button type="button" className="text-bad" onClick={() => remove.mutate()} disabled={remove.isPending}>
            Remove
          </Button>
        )}
        <span className="flex-1" />
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button primary type="submit" disabled={!value || save.isPending}>
          {asset ? "Save" : "Add it"}
        </Button>
      </div>
    </form>
  );
}
