/**
 * One thing owned (a home, an investment property, a car, a boat, jewellery…), on the shared entity page: back to Net
 * worth, its mark and kind, Change and Update value; the other things owned a tap away; a sentence on what it's worth,
 * how that's moved and how much of it is yours once anything owed on it is taken off, with the figures under See the
 * numbers; its value and what's owed over time (drag to read any month); then every value given and every amount owed,
 * each one tap to change or take away. Money in cents.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card, CardHead, ChoiceChip, ROLE } from "~/features/common/ds";
import { EditPanel, EntityHeader, EntityHero, Timeframe, useTimeframe } from "~/features/common/entity";
import { longDate, money, monthYear } from "~/features/common/format";
import { Chip } from "~/features/common/icons";
import { useToast } from "~/features/common/overlay";
import { assetQuery, netWorthQuery, refresh, type AssetKind, type AssetPage as Page } from "~/features/common/queries";
import { ScrubChart } from "~/features/common/ScrubChart";
import { Button, Empty, Input } from "~/features/common/ui";
import {
  ASSET_LOOK,
  EntrySheet,
  KindChips,
  Labelled,
  loanName,
  parseRate,
  rate,
  type EntryEdit,
} from "~/features/networth/assets";

const RANGES = [
  { value: "1y", label: "Year" },
  { value: "3y", label: "3 years" },
  { value: "5y", label: "5 years" },
  { value: "all", label: "All" },
] as const;
type Range = (typeof RANGES)[number]["value"];

/** What it's worth, how that's moved, and how much is yours, in a sentence or two. */
function sentence(a: Page, homeLoan: boolean): string {
  const first = a.values[0];
  let s = `${a.name} is worth about ${money(a.value)}`;
  if (first && a.values.length > 1 && first.value !== a.value) {
    const d = a.value - first.value;
    const what = /paid/i.test(first.note) ? `the ${money(first.value)} you paid` : money(first.value);
    s += `, ${d > 0 ? "up" : "down"} ${money(Math.abs(d))} on ${what} in ${monthYear(first.date)}`;
  }
  s += ".";
  if (a.owed.amount > 0)
    s += ` ${money(a.owed.amount)} is still owed on the ${(a.owed.name || "loan").toLowerCase()}, so ${money(a.equity)} of it is yours.`;
  else if (a.owed.entries.length) s += ` The ${(a.owed.name || "loan").toLowerCase()} is paid off: it's all yours.`;
  if (homeLoan) s += " The home loan comes off it on Net worth.";
  return s;
}

export function AssetPage({ assetId }: { assetId: number }) {
  const [range, setRange] = useTimeframe<Range>("wmm:asset-range", RANGES, "all");
  const q = useQuery({ ...assetQuery(assetId, range), placeholderData: keepPreviousData });
  const all = useQuery(netWorthQuery("1y"));
  const navigate = useNavigate();
  const [changing, setChanging] = useState(false);
  const [entry, setEntry] = useState<EntryEdit | null>(null);
  if (q.isError)
    return (
      <Empty
        title="That's not here any more"
        action={
          <Link to="/net-worth" className="text-teal">
            Back to Net worth
          </Link>
        }
      >
        {errorMessage(q.error)}
      </Empty>
    );
  const a = q.data;
  if (!a || a.id !== assetId) return <Loading />;
  const look = ASSET_LOOK[a.kind];
  const homeLoan = a.kind === "home" && !!all.data?.loan;
  const others = all.data?.assets ?? [];
  const len = a.history.length;
  const owes = a.owed.entries.length > 0;
  const first = a.values[0];
  return (
    <>
      <EntityHeader
        back={{ to: "/net-worth", label: "Net worth" }}
        mark={<Chip g={look.g} tone={look.tone} size="xl" />}
        title={a.name}
        sub={`${a.kinds[a.kind]}${a.as_of ? ` · value from ${longDate(a.as_of)}` : ""}${owes && a.owed.name ? ` · ${a.owed.name}` : ""}`}
        timeframe={<Timeframe options={RANGES} value={range} onChange={setRange} />}
        actions={
          <>
            <Button onClick={() => setChanging(!changing)}>Change</Button>
            <Button primary onClick={() => setEntry({ what: "values", entry: null })}>
              Update value
            </Button>
          </>
        }
      />
      <ChangePanel
        key={`${a.id}-${String(changing)}`}
        asset={a}
        homeLoan={homeLoan}
        open={changing}
        onClose={() => setChanging(false)}
        onRemoved={() => navigate({ to: "/net-worth" })}
      />
      {others.length > 1 && (
        <div
          role="group"
          aria-label="Other things owned"
          className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1"
        >
          {others.map((x) => (
            <ChoiceChip
              key={x.id}
              pressed={x.id === a.id}
              g={ASSET_LOOK[x.kind].g}
              tone={ASSET_LOOK[x.kind].tone}
              role={ASSET_LOOK[x.kind].role}
              onClick={() => navigate({ to: "/net-worth/$assetId", params: { assetId: String(x.id) } })}
            >
              {x.name}
            </ChoiceChip>
          ))}
        </div>
      )}
      <EntityHero
        tint={look.role === "ink" ? "accent" : look.role}
        label={`${a.name} in a sentence`}
        numbers={[
          { label: "Worth", value: money(a.value), note: a.as_of ? `as of ${longDate(a.as_of)}` : undefined },
          {
            label: "Owed on it",
            value: money(a.owed.amount),
            note: owes ? [a.owed.name, rate(a.owed.rate_bp)].filter(Boolean).join(" · ") : "nothing",
          },
          {
            label: "Yours",
            value: money(a.equity),
            note: a.value ? `${Math.round((Math.max(a.equity, 0) / a.value) * 100)}% of it` : undefined,
          },
          {
            label: first ? `Since ${monthYear(first.date)}` : "Since",
            value: first ? money(a.value - first.value, { sign: true }) : "—",
            note: first ? `from ${money(first.value)}` : undefined,
          },
        ]}
      >
        <p className="m-0 text-[17px] leading-relaxed text-ink">{sentence(a, homeLoan)}</p>
      </EntityHero>
      <Card aria-labelledby="as-chart" className="flex flex-col gap-3">
        <CardHead
          id="as-chart"
          title="Over time"
          right={<span className="text-[13px] text-ink-3">Drag across the chart to read any month</span>}
        />
        <ScrubChart
          label={`${a.name}: worth ${money(a.value)}${owes ? `, ${money(a.owed.amount)} owed` : ""}`}
          lines={[
            { name: "Worth", values: a.history.map((h) => h.value), colour: ROLE[look.role], fill: true },
            ...(owes ? [{ name: "Owed", values: a.history.map((h) => h.owed), colour: ROLE.bad, dashed: true }] : []),
          ]}
          at={(i) => (a.history[i] ? (i === len - 1 ? "Today" : monthYear(a.history[i].date)) : "")}
          format={(v) => money(v)}
          floor={0}
          height={220}
          axis={[0, Math.round((len - 1) / 2), len - 1]}
        />
        <p className="m-0 text-[12px] text-ink-3">
          Values you give it, held between them. Before the first, the first.
        </p>
      </Card>
      <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <Card aria-labelledby="as-values" className="flex flex-col gap-1">
          <CardHead
            id="as-values"
            title="What it's been worth"
            right={
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent text-[14px] font-semibold text-teal"
                onClick={() => setEntry({ what: "values", entry: null })}
              >
                + Add a value
              </button>
            }
          />
          {[...a.values].reverse().map((v, i, list) => {
            const before = list[i + 1];
            return (
              <EntryRow
                key={v.id}
                date={v.date}
                note={v.note}
                cents={v.value}
                change={before ? v.value - before.value : null}
                onClick={() =>
                  setEntry({ what: "values", entry: { id: v.id, date: v.date, cents: v.value, note: v.note } })
                }
              />
            );
          })}
        </Card>
        <Card aria-labelledby="as-owed" className="flex flex-col gap-1">
          <CardHead
            id="as-owed"
            title={owes && a.owed.name ? `Owed: ${a.owed.name}` : "Owed on it"}
            right={
              owes ? (
                <button
                  type="button"
                  className="cursor-pointer border-0 bg-transparent text-[14px] font-semibold text-teal"
                  onClick={() => setEntry({ what: "owed", entry: null })}
                >
                  + Add an amount
                </button>
              ) : undefined
            }
          />
          {homeLoan && (
            <p className="m-0 pb-2 text-[13px] text-ink-3">
              The home loan already comes off the home on Net worth.{" "}
              <Link to="/loan" className="font-semibold text-teal no-underline">
                The home loan →
              </Link>
            </p>
          )}
          {!owes ? (
            <>
              <p className="m-0 text-[14px] text-ink-2">
                {homeLoan
                  ? "Anything else borrowed against it (a top-up loan, say) can go here."
                  : "Nothing owed on it. If there's a loan against it, add what's owed and it comes off what it's worth."}
              </p>
              <button
                type="button"
                onClick={() => setEntry({ what: "owed", entry: null })}
                className="press mt-2 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-line-2 bg-transparent text-[14px] font-semibold text-ink-2"
              >
                + We owe money on it
              </button>
            </>
          ) : (
            <>
              {a.owed.rate_bp != null && (
                <p className="m-0 pb-1 text-[13px] text-ink-3">
                  At {rate(a.owed.rate_bp)}. Change the name or rate with Change.
                </p>
              )}
              {[...a.owed.entries].reverse().map((o, i, list) => {
                const before = list[i + 1];
                return (
                  <EntryRow
                    key={o.id}
                    date={o.date}
                    note={o.note}
                    cents={o.amount}
                    change={before ? o.amount - before.amount : null}
                    owed
                    onClick={() =>
                      setEntry({ what: "owed", entry: { id: o.id, date: o.date, cents: o.amount, note: o.note } })
                    }
                  />
                );
              })}
            </>
          )}
        </Card>
      </div>
      <EntrySheet asset={a} edit={entry} onClose={() => setEntry(null)} />
    </>
  );
}

function EntryRow({
  date,
  note,
  cents,
  change,
  owed,
  onClick,
}: {
  date: string;
  note: string;
  cents: number;
  change: number | null;
  owed?: boolean;
  onClick: () => void;
}) {
  // Owed going down is good; worth going up is good.
  const good = change == null ? null : owed ? change <= 0 : change >= 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="press flex w-full cursor-pointer items-center gap-3 rounded-2xl border-0 border-t border-line bg-transparent px-1.5 py-3 text-left text-ink first:border-t-0 hover:bg-tile-2"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{longDate(date)}</span>
        <span className="block truncate text-[13px] text-ink-3">{note || (owed ? "Owed" : "Your estimate")}</span>
      </span>
      <span className="flex-none text-right">
        <span className="num block text-[15px]">{money(cents)}</span>
        {change != null && change !== 0 && (
          <span className={`num block text-[12px] ${good ? "text-savings" : "text-bad"}`}>
            {money(change, { sign: true })}
          </span>
        )}
      </span>
    </button>
  );
}

/** Change its name, what it is, and what the loan against it is called and its rate. Remove ends in an undo. */
function ChangePanel({
  asset,
  homeLoan,
  open,
  onClose,
  onRemoved,
}: {
  asset: Page;
  homeLoan: boolean;
  open: boolean;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(asset.name);
  const [kind, setKind] = useState<AssetKind>(asset.kind);
  const [owedName, setOwedName] = useState(asset.owed.name);
  const [owedRate, setOwedRate] = useState(asset.owed.rate_bp == null ? "" : (asset.owed.rate_bp / 100).toFixed(2));
  const r = parseRate(owedRate);
  const changed =
    name.trim() !== asset.name ||
    kind !== asset.kind ||
    owedName.trim() !== asset.owed.name ||
    r !== asset.owed.rate_bp;
  const save = useMutation({
    mutationFn: () =>
      apiSend("PUT", `networth/assets/${asset.id}`, {
        name: name.trim() || asset.kinds[kind],
        kind,
        owed_name: owedName.trim(),
        owed_rate_bp: r,
      }),
    onSuccess: () => {
      refresh(qc);
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => apiSend("DELETE", `networth/assets/${asset.id}`),
    onSuccess: () => {
      refresh(qc);
      onRemoved();
      toast(`Removed ${asset.name}`, () => {
        void apiSend("POST", `networth/assets/${asset.id}/restore`).then(() => refresh(qc));
      });
    },
  });
  const owes = asset.owed.entries.length > 0;
  return (
    <EditPanel
      open={open}
      onClose={onClose}
      title={`Change ${asset.name}`}
      onSave={() => save.mutate()}
      canSave={changed && !Number.isNaN(r)}
      saving={save.isPending}
      remove={{ label: "Remove it", onClick: () => remove.mutate() }}
      error={
        save.isError || remove.isError
          ? errorMessage(save.error ?? remove.error)
          : Number.isNaN(r)
            ? "Enter the rate as a number, like 6.5."
            : undefined
      }
    >
      <KindChips kinds={asset.kinds} value={kind} onChange={setKind} />
      <Labelled label="Name">
        <Input className="font-sans" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </Labelled>
      {(owes || !homeLoan) && (
        <div className="flex flex-wrap gap-3">
          <Labelled label="The loan against it">
            <Input
              className="font-sans"
              value={owedName}
              placeholder={loanName(kind)}
              maxLength={40}
              onChange={(e) => setOwedName(e.target.value)}
            />
          </Labelled>
          <Labelled label="Its rate %">
            <Input
              inputMode="decimal"
              value={owedRate}
              placeholder="7.49"
              onChange={(e) => setOwedRate(e.target.value)}
            />
          </Labelled>
        </div>
      )}
      {kind === "home" && (
        <p className="m-0 text-[13px] text-ink-3">
          The home goes with Count the home on Net worth, and so does its loan.
        </p>
      )}
    </EditPanel>
  );
}
