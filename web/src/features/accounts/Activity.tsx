/**
 * An account's activity (design: direction E on the accounts canvas), in the dashboard's way: the balance as a line,
 * with what moved it as bars under it, money in growing up and money out growing down, a day a bar over a month or
 * three and a week a bar over six months or a year. The loan the same: what's owed, with interest added up and
 * repayments down (worked out until one of its statements is imported). Hover or arrow through a bar to see it on the
 * right; click one to list just its transactions.
 *
 * Under it, the account's transactions with a category on each, to sort them where they happened.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { CategoryPicker } from "~/features/common/CategoryPicker";
import { amount, capsDate, colour, dayDate, money, shortDate } from "~/features/common/format";
import { useToast } from "~/features/common/overlay";
import { accountActivityQuery, categoriesQuery, refresh, transactionsQuery } from "~/features/common/queries";
import type { Account, Transaction } from "~/features/common/types";
import { Button, ErrorText, Input, Pill, Segmented, Tile, cn } from "~/features/common/ui";

export type Range = "1m" | "3m" | "6m" | "1y";
const RANGES: { value: Range; label: string; days: number; step: number }[] = [
  { value: "1m", label: "1M", days: 31, step: 1 },
  { value: "3m", label: "3M", days: 91, step: 1 },
  { value: "6m", label: "6M", days: 182, step: 7 },
  { value: "1y", label: "1Y", days: 364, step: 7 },
];
const RANGE_WORDS: Record<Range, string> = { "1m": "month", "3m": "3 months", "6m": "6 months", "1y": "year" };

/** A bar: one day, or one week, of the account. */
export type Bucket = { start: string; end: string; in: number; out: number; balance: number };

function buckets(days: { date: string; balance: number; in: number; out: number }[], range: Range): Bucket[] {
  const r = RANGES.find((x) => x.value === range)!;
  const shown = days.slice(-r.days);
  const out: Bucket[] = [];
  for (let i = 0; i < shown.length; i += r.step) {
    const part = shown.slice(i, i + r.step);
    out.push({
      start: part[0].date,
      end: part[part.length - 1].date,
      in: part.reduce((a, d) => a + d.in, 0),
      out: part.reduce((a, d) => a + d.out, 0),
      balance: part[part.length - 1].balance,
    });
  }
  return out;
}

const bucketTitle = (b: Bucket) =>
  b.start === b.end ? dayDate(b.start) : `${shortDate(b.start)} – ${shortDate(b.end)}`;

export function ActivityChart({
  account,
  range,
  onRange,
  picked,
  onPick,
}: {
  account: Account;
  range: Range;
  onRange: (r: Range) => void;
  picked: Bucket | null;
  onPick: (b: Bucket | null) => void;
}) {
  const q = useQuery(accountActivityQuery(account.id));
  const loan = account.kind === "loan";
  const [hover, setHover] = useState<number | null>(null);
  const data = q.data;
  const bs = data ? buckets(data.days, range) : [];
  const first = bs[0]?.start;
  const txs = useQuery({
    ...transactionsQuery({ account_id: account.id, start: first, limit: 2000 }),
    enabled: !!first,
  });
  const n = bs.length;
  const pickedAt = picked ? bs.findIndex((b) => b.start === picked.start && b.end === picked.end) : -1;
  const sel = hover ?? (pickedAt >= 0 ? pickedAt : n - 1);
  const c = colour(account.colour);
  // Money in is the savings green (striped), money out the spending pink; on the loan, owing more is the warning.
  const upC = loan ? "var(--color-bills-fill)" : "var(--color-savings-fill)";
  const downC = loan ? "var(--color-accent-fill)" : "var(--color-spending-fill)";
  const words = {
    line: loan ? "Owed" : "Balance",
    up: loan ? "Interest added" : "Money in",
    down: loan ? "Repayments" : "Money out",
  };
  const r = RANGES.find((x) => x.value === range)!;

  // The line: the balance at the end of each day in the range, with the day before it as its start.
  const shown = data ? data.days.slice(-(r.days + 1)) : [];
  const values = shown.map((d) => d.balance);
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 1;
  const pad = (hi - lo) * 0.08 || Math.max(hi * 0.02, 100);
  const y = (v: number) => 160 - ((v - lo + pad) / (hi - lo + pad * 2)) * 148;
  const x = (i: number) => (i / Math.max(shown.length - 1, 1)) * 1000;
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  // Money in and money out each get their own scale (each labelled), so a month's one big top-up doesn't flatten the
  // everyday spending under it.
  const topIn = Math.max(1, ...bs.map((b) => b.in));
  const topOut = Math.max(1, ...bs.map((b) => b.out));

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (bs[sel]) onPick(pickedAt === sel ? null : bs[sel]);
      return;
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setHover(Math.min(n - 1, Math.max(0, sel + (e.key === "ArrowRight" ? 1 : -1))));
  };

  const b = bs[sel];
  const inBucket = b ? (txs.data ?? []).filter((t) => t.date >= b.start && t.date <= b.end && t.kind !== "cash") : [];
  const groups = new Map<string, { name: string; total: number; n: number }>();
  for (const t of inBucket) {
    const g = groups.get(t.description) ?? { name: t.description, total: 0, n: 0 };
    g.total += t.amount;
    g.n += 1;
    groups.set(t.description, g);
  }
  const items = data?.estimated
    ? [
        ...(b?.in ? [{ name: "Interest charged (estimate)", total: b.in, n: 1 }] : []),
        ...(b?.out ? [{ name: "Repayment", total: -b.out, n: 1 }] : []),
      ]
    : [...groups.values()].sort((p, q2) => Math.abs(q2.total) - Math.abs(p.total)).slice(0, 6);

  const startBalance = shown[0]?.balance ?? 0;
  const endBalance = shown[shown.length - 1]?.balance ?? 0;
  const change = endBalance - startBalance;
  const good = loan ? change <= 0 : change >= 0;

  return (
    <Tile i={7} aria-labelledby="act-h" className="gap-3.5 p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <i className="size-3 rounded-[4px]" style={{ background: c }} />
        <h2 id="act-h" className="m-0 -ml-2 text-base font-semibold">
          {account.name}, {r.step === 1 ? "day by day" : "week by week"}
        </h2>
        <Legend swatch={<i className="h-0.5 w-3.5" style={{ background: c }} />}>{words.line}</Legend>
        <Legend swatch={<i className="size-2.5 rounded-[3px]" style={{ background: upC }} />}>{words.up}</Legend>
        <Legend swatch={<i className="size-2.5 rounded-[3px]" style={{ background: downC }} />}>{words.down}</Legend>
        <span className="ml-auto">
          <Segmented
            label="Range"
            options={RANGES.map((x) => ({ value: x.value, label: x.label }))}
            value={range}
            onChange={(v) => (setHover(null), onPick(null), onRange(v))}
          />
        </span>
      </div>
      {q.isError && <ErrorText>{errorMessage(q.error)}</ErrorText>}
      {data && n > 0 && (
        <div className="flex flex-wrap gap-[18px]">
          <div
            className="relative min-w-0 flex-[999_1_560px] rounded-lg outline-offset-4"
            tabIndex={0}
            role="group"
            aria-label={`${account.name}'s ${words.line.toLowerCase()} and what moved it. Use the arrow keys to move between bars, and Enter to list a bar's transactions.`}
            onKeyDown={onKey}
            onMouseLeave={() => setHover(null)}
            onBlur={() => setHover(null)}
          >
            <div key={`${account.id}-${range}`}>
              <div className="relative h-[170px]">
                <svg
                  viewBox="0 0 1000 170"
                  width="100%"
                  height="170"
                  preserveAspectRatio="none"
                  aria-hidden
                  className="absolute inset-0"
                >
                  <line
                    x1="0"
                    x2="1000"
                    y1="12"
                    y2="12"
                    stroke="var(--color-line)"
                    strokeDasharray="4 6"
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1="0"
                    x2="1000"
                    y1="160"
                    y2="160"
                    stroke="var(--color-line)"
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    d={`${line}L1000 170L0 170Z`}
                    fill={`color-mix(in srgb, ${c} 16%, transparent)`}
                    className="fill-after"
                  />
                  <path
                    d={line}
                    fill="none"
                    stroke={c}
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    pathLength={1000}
                    className="draw"
                    style={{ strokeDasharray: 1000, ["--len" as string]: 1000 } as CSSProperties}
                  />
                </svg>
                <span className="mono absolute -top-0.5 left-1 text-[10px] text-ink-3">{money(hi)}</span>
                <span className="mono absolute top-[146px] left-1 text-[10px] text-ink-3">{money(lo)}</span>
              </div>
              <div className="relative mt-2 h-[132px]">
                <i aria-hidden className="absolute inset-x-0 top-[66px] h-px bg-line" />
                <div className={cn("absolute inset-0 flex", n > 60 ? "gap-px" : n > 40 ? "gap-0.5" : "gap-[3px]")}>
                  {bs.map((bk, i) => {
                    const on = i === sel || i === pickedAt;
                    return (
                      <div key={bk.start} className="relative h-full flex-1">
                        {bk.in > 0 && (
                          <i
                            className="striped absolute inset-x-0 bottom-[66px] block grow rounded-t-[5px] transition-[filter] duration-150"
                            style={
                              {
                                height: Math.max(2, (bk.in / topIn) * 62),
                                backgroundColor: upC,
                                filter: on ? "brightness(1.25)" : undefined,
                                "--i": Math.min(i, 8),
                              } as CSSProperties
                            }
                          />
                        )}
                        {bk.out > 0 && (
                          <i
                            className="striped grow-down absolute inset-x-0 top-[67px] block rounded-b-[5px] transition-[filter] duration-150"
                            style={
                              {
                                height: Math.max(2, (bk.out / topOut) * 62),
                                backgroundColor: downC,
                                filter: on ? "brightness(1.35)" : undefined,
                                "--i": Math.min(i, 8),
                              } as CSSProperties
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                <span className="mono absolute top-0.5 right-1 text-[10px] text-ink-3">+{money(topIn)}</span>
                <span className="mono absolute right-1 bottom-0.5 text-[10px] text-ink-3">−{money(topOut)}</span>
              </div>
            </div>
            <span
              aria-hidden
              className="absolute top-0 h-[310px] w-px bg-ink/25 transition-[left] duration-100"
              style={{ left: `${((sel + 0.5) / n) * 100}%` }}
            />
            <span
              aria-hidden
              className="absolute size-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-page transition-[left,top] duration-100"
              style={{ left: `${((sel + 0.5) / n) * 100}%`, top: y(b?.balance ?? 0), borderColor: c }}
            />
            <div className="absolute inset-x-0 top-0 flex h-[310px]">
              {bs.map((bk, i) => (
                <div
                  key={bk.start}
                  onMouseEnter={() => setHover(i)}
                  onClick={() => onPick(pickedAt === i ? null : bk)}
                  className={cn(
                    "flex-1 cursor-pointer rounded transition-colors duration-100",
                    i === pickedAt ? "bg-teal/8" : i === sel && "bg-ink/5",
                  )}
                />
              ))}
            </div>
            <div className="mono mt-1.5 flex justify-between text-[10.5px] text-ink-3">
              <span>{shortDate(bs[0].start).toUpperCase()}</span>
              <span>{shortDate(bs[Math.floor(n / 2)].start).toUpperCase()}</span>
              <span className="text-teal">TODAY</span>
            </div>
          </div>
          {b && (
            <aside
              aria-live="polite"
              className="flex min-w-[250px] flex-[1_1_270px] flex-col gap-3 rounded-xl border border-line bg-page p-4"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[15px] font-semibold">{bucketTitle(b)}</span>
                {sel === n - 1 && (
                  <span className="mono ml-auto text-[10.5px] tracking-[0.08em] text-teal">
                    {r.step === 1 ? "TODAY" : "THIS WEEK"}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Figure label={words.up} value={`${b.in ? "+" : ""}${money(b.in, { cents: true })}`} colour={upC} />
                <Figure
                  label={loan ? "Repaid" : "Money out"}
                  value={`${b.out ? "−" : ""}${money(b.out, { cents: true })}`}
                />
              </div>
              <div className="flex items-baseline text-[13px]">
                <span className="text-ink-3">{loan ? "Owed after" : "Balance after"}</span>
                <span className="mono ml-auto text-[17px] font-semibold" style={{ color: c }}>
                  {money(b.balance, { cents: true })}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
                {items.map((it) => (
                  <div key={it.name} className="flex items-center gap-2.5 text-[13px]">
                    <i className="size-2 flex-none rounded-[3px]" style={{ background: it.total > 0 ? upC : downC }} />
                    <span className="min-w-0 flex-1 truncate">
                      {it.name}
                      {it.n > 1 ? ` ×${it.n}` : ""}
                    </span>
                    <span className="mono" style={{ color: it.total > 0 ? upC : undefined }}>
                      {amount(it.total, { cents: true, sign: true })}
                    </span>
                  </div>
                ))}
                {!items.length && <span className="text-[12.5px] text-ink-3">Nothing moved.</span>}
              </div>
              <span className="mt-auto text-xs text-ink-3">
                {pickedAt === sel
                  ? "Listing just these below. Click it again to list them all."
                  : "Click a bar to list just its transactions below."}
              </span>
            </aside>
          )}
        </div>
      )}
      {data && n > 0 && (
        <div className="flex flex-wrap gap-x-7 gap-y-2 border-t border-line pt-3.5 text-[13px] text-ink-2">
          <span>Over the last {RANGE_WORDS[range]}:</span>
          <span>
            {words.up}{" "}
            <span className="mono" style={{ color: upC }}>
              +{money(bs.reduce((a, x2) => a + x2.in, 0))}
            </span>
          </span>
          <span>
            {words.down} <span className="mono text-ink">−{money(bs.reduce((a, x2) => a + x2.out, 0))}</span>
          </span>
          <span>
            {loan ? "Owed went" : "Balance went"}{" "}
            <span className="mono" style={{ color: good ? "var(--color-good)" : "var(--color-warn)" }}>
              {money(change, { sign: true })} ({money(startBalance)} → {money(endBalance)})
            </span>
          </span>
          {data.estimated && (
            <span className="ml-auto text-xs text-ink-3">
              Interest and repayments are worked out until a loan statement is imported.
            </span>
          )}
        </div>
      )}
    </Tile>
  );
}

function Legend({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      {swatch}
      {children}
    </span>
  );
}

function Figure({ label, value, colour: c }: { label: string; value: string; colour?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[9px] bg-tile px-3 py-2.5">
      <span className="text-[11.5px] text-ink-3">{label}</span>
      <span className="mono text-[15px] font-semibold whitespace-nowrap" style={c ? { color: c } : undefined}>
        {value}
      </span>
    </div>
  );
}

const PAGE = 60;

/**
 * The account's transactions in the chart's range (or just the bar picked on it), newest first, each with its
 * category (the shared category picker: change one here, and remember it for the merchant), or show only what's not
 * sorted yet.
 */
export function AccountTransactions({
  account,
  range,
  picked,
  onClearPick,
}: {
  account: Account;
  range: Range;
  picked: Bucket | null;
  onClearPick: () => void;
}) {
  const r = RANGES.find((x) => x.value === range)!;
  // The range's first day, from the server's days (the chart's), so the list and the chart cover the same days.
  const activity = useQuery(accountActivityQuery(account.id));
  const start = activity.data?.days.slice(-r.days)[0]?.date;
  const txs = useQuery({
    ...transactionsQuery({ account_id: account.id, start, limit: 2000 }),
    enabled: !!start,
  });
  const cats = useQuery(categoriesQuery);
  const qc = useQueryClient();
  const toast = useToast();
  const [unsorted, setUnsorted] = useState(false);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const update = useMutation({
    mutationFn: ({ id, category_id, remember }: { id: number; category_id: number | null; remember: boolean }) =>
      apiSend<Transaction>("PUT", `transactions/${id}`, { category_id, always: remember }),
    onSuccess: (t, { remember }) => (
      refresh(qc),
      toast(
        t.category && remember && t.remember_as
          ? `${t.remember_as} is ${t.category} from now on`
          : `${t.description} is ${t.category ?? "not sorted"}`,
      )
    ),
    onError: (e) => toast(errorMessage(e)),
  });
  const all = txs.data ?? [];
  const inRange = picked ? all.filter((t) => t.date >= picked.start && t.date <= picked.end) : all;
  const sortable = (t: Transaction) => t.kind !== "adjustment" && t.rule_id == null;
  const notSorted = inRange.filter((t) => sortable(t) && t.category_id == null);
  const needle = q.trim().toLowerCase();
  const list = (unsorted ? notSorted : inRange).filter(
    (t) => !needle || t.description.toLowerCase().includes(needle) || t.note.toLowerCase().includes(needle),
  );
  const loan = account.kind === "loan";
  return (
    <Tile i={8} aria-labelledby="tx-h" className="p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="tx-h" className="m-0 text-base font-semibold">
          {picked ? `Transactions · ${bucketTitle(picked)}` : `Transactions · last ${RANGE_WORDS[range]}`}
        </h2>
        <span className="mono text-xs text-ink-3">{inRange.length}</span>
        {picked && (
          <button
            type="button"
            onClick={onClearPick}
            className="press inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-full border border-teal/40 bg-teal/10 px-2.5 text-xs font-medium text-teal"
          >
            Show the whole {RANGE_WORDS[range]} <span aria-hidden>✕</span>
          </button>
        )}
        <Link
          to="/transactions"
          search={{ account: account.id }}
          className="ml-auto text-[13px] font-medium text-teal no-underline"
        >
          Every {account.name} transaction
        </Link>
      </div>
      {!loan && (
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Show"
            options={[
              { value: "all", label: "All" },
              { value: "unsorted", label: `Not sorted · ${notSorted.length}` },
            ]}
            value={unsorted ? "unsorted" : "all"}
            onChange={(v) => (setUnsorted(v === "unsorted"), setShown(PAGE))}
          />
          <Input
            aria-label="Search this account's transactions"
            className="max-w-[260px] font-sans"
            placeholder="Search descriptions and notes"
            value={q}
            onChange={(e) => (setQ(e.target.value), setShown(PAGE))}
          />
        </div>
      )}
      {txs.isError && <ErrorText>{errorMessage(txs.error)}</ErrorText>}
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          {list.slice(0, shown).map((t) => (
            <div
              key={t.id}
              className="grid grid-cols-[64px_minmax(0,1fr)_auto_170px_110px] items-center gap-3 border-t border-line py-2 text-[13px] first:border-t-0"
            >
              <span className="mono text-ink-3">{capsDate(t.date)}</span>
              <span className="min-w-0">
                <span className="block truncate">{t.description}</span>
                {t.note && <span className="block truncate text-xs text-ink-3">{t.note}</span>}
              </span>
              <span>
                {t.kind === "adjustment" ? (
                  <Pill tone="teal">ADJUSTMENT</Pill>
                ) : t.rule_id != null ? (
                  <Pill tone="info">PAYDAY RULE</Pill>
                ) : t.kind === "manual" ? (
                  <Pill tone="info">BY HAND</Pill>
                ) : null}
              </span>
              {sortable(t) && !loan ? (
                <CategoryPicker
                  label={`Category for ${t.description}`}
                  value={t.category_id}
                  categories={cats.data?.categories ?? []}
                  merchant={t.remember_as || null}
                  placeholder="Not sorted"
                  onChange={(category_id, { remember }) => update.mutate({ id: t.id, category_id, remember })}
                />
              ) : (
                <span className="text-xs text-ink-3">{t.category ?? ""}</span>
              )}
              <span className="mono text-right" style={{ color: t.amount > 0 ? "var(--color-good)" : undefined }}>
                {amount(t.amount, { cents: true, sign: true })}
              </span>
            </div>
          ))}
          {txs.data && !list.length && (
            <div className="py-4 text-ink-3">
              {loan
                ? "No loan statement imported yet, so the chart works out the interest and repayments. Import one from Import CSV to see the real figures."
                : unsorted
                  ? "Everything here is sorted."
                  : "No transactions here."}
            </div>
          )}
        </div>
      </div>
      {list.length > shown && (
        <div>
          <Button small onClick={() => setShown(shown + PAGE)}>
            Show {Math.min(PAGE, list.length - shown)} more of {list.length - shown}
          </Button>
        </div>
      )}
    </Tile>
  );
}
