/**
 * Every merchant the household spends at, and everyone who pays us (Money in: the ATO, Medicare, refunds): its mark,
 * how often and how much over the last year, and a little bar for each month. Search by name, sort by most, most
 * recent or A to Z, and open one for its whole story. The sort, filters and search live in the address (and are
 * remembered on this device), so coming back from a merchant finds the list as it was left.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card, CardHead, ChoiceChip } from "~/features/common/ds";
import { useToast } from "~/features/common/overlay";
import { dayDate, longDate, money, pct, todayIso } from "~/features/common/format";
import { EntityHeader, EntityHero } from "~/features/common/entity";
import { merchantDirectoryQuery, merchantSuggestionsQuery, refresh } from "~/features/common/queries";
import type { MergeSuggestion, MerchantSummary } from "~/features/common/types";
import { Button, Empty, ErrorText, Input, Segmented, cn } from "~/features/common/ui";
import { MerchantPicker } from "~/features/merchants/MerchantPicker";
import { MerchantMark } from "~/features/spending/MerchantIcon";

export type MerchantSearch = { sort?: "spent" | "recent" | "name"; dir?: "in"; unset?: true; q?: string };

const yearOf = (m: MerchantSummary, dir: "in" | "out") => (dir === "in" ? m.received_year : m.spent_year);
const SORTS = {
  spent: {
    label: "Most",
    by: (dir: "in" | "out") => (a: MerchantSummary, b: MerchantSummary) => yearOf(b, dir) - yearOf(a, dir),
  },
  recent: { label: "Most recent", by: () => (a: MerchantSummary, b: MerchantSummary) => b.last.localeCompare(a.last) },
  name: { label: "A to Z", by: () => (a: MerchantSummary, b: MerchantSummary) => a.name.localeCompare(b.name) },
} as const;

/** Where the last view of the list is remembered on this device. */
const SAVED = "wmm:merchants-view";

export function MerchantsPage({ search }: { search: MerchantSearch }) {
  const q = useQuery(merchantDirectoryQuery);
  const navigate = useNavigate();
  const sort = search.sort ?? "spent";
  const dir = search.dir ?? "out";
  const unset = !!search.unset;
  // Opened without any view in the address (from the menu, or "All merchants"): pick up where it was left.
  const [restored] = useState<MerchantSearch | null>(() => {
    if (search.sort || search.dir || search.unset || search.q) return null;
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED) ?? "null") as MerchantSearch | null;
      return saved && (saved.sort || saved.dir || saved.unset || saved.q) ? saved : null;
    } catch {
      return null;
    }
  });
  // The search box types freely; the address follows a moment later.
  const [find, setFind] = useState(search.q ?? restored?.q ?? "");
  const go = (patch: Partial<MerchantSearch>) => {
    const next = { ...search, ...patch };
    const clean: MerchantSearch = {
      sort: next.sort && next.sort !== "spent" ? next.sort : undefined,
      dir: next.dir === "in" ? "in" : undefined,
      unset: next.unset ? true : undefined,
      q: next.q || undefined,
    };
    try {
      localStorage.setItem(SAVED, JSON.stringify(clean));
    } catch {
      // Private window or storage off: the address still keeps it.
    }
    navigate({ to: "/merchants", search: clean, replace: true });
  };
  useEffect(() => {
    if (restored) navigate({ to: "/merchants", search: restored, replace: true });
  }, [restored, navigate]);
  useEffect(() => {
    const t = setTimeout(() => {
      if ((search.q ?? "") !== find.trim()) go({ q: find.trim() });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [find]);
  // Picking merchants to merge: Select, tick a few, then Merge into one.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [merging, setMerging] = useState(false);
  const stop = () => {
    setSelecting(false);
    setPicked([]);
    setMerging(false);
  };
  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!q.data) return <Loading />;
  const needle = find.trim().toLowerCase();
  // Money out: anywhere we've spent. Money in: anyone who's paid us (refunds from a shop count there too).
  const side = q.data.filter((m) => (dir === "in" ? m.received_count > 0 : m.count > 0));
  const shown = side
    // By its name, how it shows up on statements, or its note ("mazda").
    .filter(
      (m) =>
        !needle ||
        m.name.toLowerCase().includes(needle) ||
        m.key.toLowerCase().includes(needle) ||
        m.note.toLowerCase().includes(needle) ||
        m.aliases.some((a) => a.toLowerCase().includes(needle)),
    )
    .filter((m) => !unset || !m.default_category)
    .sort(SORTS[sort].by(dir));
  const unsetCount = side.filter((m) => !m.default_category).length;
  const year = side.reduce((a, m) => a + yearOf(m, dir), 0);
  const top = [...side].sort(SORTS.spent.by(dir))[0];
  const inCount = q.data.filter((m) => m.received_count > 0).length;
  const ranked = [...side].sort(SORTS.spent.by(dir));
  const topShare = year ? ranked.slice(0, 5).reduce((a, m) => a + yearOf(m, dir), 0) / year : 0;
  const regular = side.filter((m) => m.regular && !m.regular.stopped);
  const regularMonth = regular.reduce((a, m) => a + (m.regular!.typical * 365) / m.regular!.every_days / 12, 0);
  const today = todayIso();
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  const ups = side.filter((m) => m.price_change?.up && m.price_change.date >= yearAgo);
  return (
    <>
      <EntityHeader
        back={{ to: "/spending", label: "Spending" }}
        title="Merchants"
        sub={`${q.data.length} merchants`}
      />
      {q.data.length === 0 ? (
        <Empty title="No merchants yet">Import a statement and the shops you spend at show up here.</Empty>
      ) : (
        <>
          <Segmented
            label="Money out or in"
            value={dir}
            options={[
              { value: "out", label: "Money out" },
              { value: "in", label: `Money in · ${inCount}` },
            ]}
            onChange={(v) => go({ dir: v === "in" ? "in" : undefined })}
          />
          <EntityHero
            tint={dir === "in" ? "savings" : "spending"}
            label="Merchants in a sentence"
            numbers={[
              {
                label: "Last 12 months",
                value: money(year),
                note: dir === "in" ? "received" : "spent",
              },
              {
                label: dir === "in" ? "Payers" : "Merchants",
                value: String(side.length),
                note: `${unsetCount} with no default yet`,
              },
              {
                label: `Top ${Math.min(5, side.length)}`,
                value: pct(topShare, 0),
                note: `of the ${dir === "in" ? "money in" : "spending"}`,
              },
              {
                label: "Regular",
                value: String(regular.length),
                note: regular.length ? `about ${money(regularMonth)} a month` : "none yet",
              },
            ]}
          >
            <p className="m-0 text-[17px] leading-relaxed text-ink">
              {dir === "in" ? (
                <>
                  <b>{money(year)}</b> came in from {side.length} {side.length === 1 ? "payer" : "payers"} over the last
                  12 months
                </>
              ) : (
                <>
                  We spent <b>{money(year)}</b> at {side.length} merchants over the last 12 months
                </>
              )}
              {top && yearOf(top, dir) > 0 ? (
                <>
                  , the most {dir === "in" ? "from" : "at"} {top.name}, <b>{money(yearOf(top, dir))}</b>.
                </>
              ) : (
                "."
              )}
            </p>
            {dir === "out" && (
              <p className="m-0 text-[15px] text-ink-2">
                The top {Math.min(5, side.length)} take {pct(topShare, 0)} of it.
                {regular.length > 0 &&
                  ` ${regular.length} are regular payments, about ${money(regularMonth)} a month together.`}
                {ups.length > 0 && ` ${ups.length} went up in price in the last year.`}
              </p>
            )}
          </EntityHero>
          {dir === "out" && <Suggestions />}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              type="search"
              placeholder="Find a merchant, statement name or note"
              aria-label="Find a merchant"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              className="sm:max-w-xs"
            />
            <div role="group" aria-label="Sort" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
              {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((k) => (
                <ChoiceChip key={k} pressed={sort === k} onClick={() => go({ sort: k })}>
                  {k === "spent" ? (dir === "in" ? "Most received" : "Most spent") : SORTS[k].label}
                </ChoiceChip>
              ))}
              <ChoiceChip pressed={unset} onClick={() => go({ unset: unset ? undefined : true })}>
                No default yet · {unsetCount}
              </ChoiceChip>
            </div>
            <span className="hidden flex-1 sm:block" />
            <Button small onClick={() => (selecting ? stop() : setSelecting(true))}>
              {selecting ? "Done" : "Select to merge"}
            </Button>
          </div>
          {selecting && (
            <div className="flex flex-col gap-2 rounded-2xl border border-line-2 bg-tile p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-[14px]">
                  {picked.length
                    ? `${picked.length} selected. Merge them into one merchant, existing or new.`
                    : "Tick the merchants that are really one, like a business paid under several names."}
                </span>
                <Button primary small disabled={!picked.length} onClick={() => setMerging((m) => !m)}>
                  Merge {picked.length || ""}…
                </Button>
              </div>
              {merging && picked.length > 0 && (
                <MerchantPicker
                  merge={picked}
                  onDone={(key) => {
                    stop();
                    if (key) navigate({ to: "/merchants/$key", params: { key } });
                  }}
                />
              )}
            </div>
          )}
          <Card aria-label="Merchants" className="gap-0 px-2 py-2 sm:px-3 sm:py-3">
            {shown.length === 0 && <p className="m-0 px-2 py-4 text-[14px] text-ink-3">No merchant matches that.</p>}
            {shown.map((m) => (
              <MerchantRow
                key={m.key}
                m={m}
                dir={dir}
                picked={selecting ? picked.includes(m.key) : undefined}
                onPick={() => setPicked((p) => (p.includes(m.key) ? p.filter((k) => k !== m.key) : [...p, m.key]))}
              />
            ))}
          </Card>
        </>
      )}
    </>
  );
}

/** Merchants that look like one place: merge with a tap, or say they aren't the same. */
function Suggestions() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery(merchantSuggestionsQuery);
  const [all, setAll] = useState(false);
  const merge = useMutation({
    mutationFn: (s: MergeSuggestion) =>
      apiSend("POST", "merchants/merge", { from: s.keys.filter((k) => k !== s.into), into: s.into }),
    onSuccess: (_, s) => {
      refresh(qc);
      toast(`Merged into ${s.into_name}`);
    },
  });
  const dismiss = useMutation({
    mutationFn: (s: MergeSuggestion) => apiSend("POST", "merchants/suggestions/dismiss", { keys: s.keys }),
    onSuccess: () => refresh(qc),
  });
  const list = q.data ?? [];
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, 3);
  return (
    <Card aria-labelledby="ms-h" className="flex flex-col gap-2">
      <CardHead
        id="ms-h"
        title="Looks like the same place"
        right={<span className="text-[13px] text-ink-3">{list.length}</span>}
      />
      {shown.map((s) => (
        <div
          key={s.keys.join("|")}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-tile-2 px-3 py-2.5"
        >
          <span className="flex flex-none -space-x-2">
            {s.keys.slice(0, 3).map((k) => (
              <MerchantMark key={k} name={k} size="md" />
            ))}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold">{s.names.join(" + ")}</span>
            <span className="block truncate text-[12px] text-ink-3">
              {s.reason} · {s.count} visits
            </span>
          </span>
          <span className="flex flex-none gap-2">
            <Button small onClick={() => dismiss.mutate(s)} disabled={dismiss.isPending}>
              Not the same
            </Button>
            <Button primary small onClick={() => merge.mutate(s)} disabled={merge.isPending}>
              Merge into {s.into_name}
            </Button>
          </span>
        </div>
      ))}
      {list.length > 3 && (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          className="cursor-pointer self-start border-0 bg-transparent p-0 text-[13px] font-semibold text-teal"
        >
          {all ? "Show fewer" : `Show all ${list.length}`}
        </button>
      )}
    </Card>
  );
}

function MerchantRow({
  m,
  dir,
  picked,
  onPick,
}: {
  m: MerchantSummary;
  dir: "in" | "out";
  picked?: boolean;
  onPick: () => void;
}) {
  const months = dir === "in" ? m.months_in : m.months;
  const top = Math.max(...months, 1);
  const thisYear = String(new Date().getFullYear());
  const body = (
    <>
      {picked !== undefined && (
        <span
          aria-hidden
          className={cn(
            "flex size-5 flex-none items-center justify-center rounded-md border-2",
            picked ? "border-teal bg-teal text-page" : "border-line-2",
          )}
        >
          {picked && (
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3.4}>
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          )}
        </span>
      )}
      <MerchantMark name={m.key} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-semibold">{m.name}</span>
          {m.default_category ? (
            <span
              className="flex-none rounded-full bg-teal/15 px-2 py-px text-[11px] font-semibold text-teal"
              title={`Sorted to ${m.default_category} by default`}
            >
              {m.default_category}
              {m.rules ? ` +${m.rules} ${m.rules === 1 ? "rule" : "rules"}` : ""}
            </span>
          ) : (
            <span
              className="flex-none rounded-full border border-dashed border-line-2 px-2 py-px text-[11px] text-ink-3"
              title="No default category set"
            >
              {m.rules ? `${m.rules} ${m.rules === 1 ? "rule" : "rules"}` : "No default"}
            </span>
          )}
        </span>
        <span className="block truncate text-[13px] text-ink-3">
          {dir === "out" && m.regular && !m.regular.stopped ? (
            <span className="text-ink-2">
              {m.regular.label} · {m.regular.fixed ? "" : "about "}
              {money(m.regular.typical, { cents: true })} ·{" "}
            </span>
          ) : dir === "out" && m.regular?.stopped ? (
            <span className="text-warn">Looks stopped · </span>
          ) : null}
          {dir === "in"
            ? `${m.received_count} ${m.received_count === 1 ? "payment" : "payments"}`
            : `${m.count} ${m.count === 1 ? "visit" : "visits"}`}{" "}
          · last {m.last.startsWith(thisYear) ? dayDate(m.last) : longDate(m.last)}
          {m.category ? ` · ${m.category}` : ""}
          {m.note ? ` · ${m.note}` : ""}
        </span>
      </span>
      {/* The last 12 months, a bar each. */}
      <span aria-hidden className="hidden h-7 w-[84px] flex-none items-end gap-[2px] sm:flex">
        {months.map((v, i) => (
          <i
            key={i}
            className={cn("block flex-1 rounded-t-[2px]", dir === "in" ? "bg-good" : "bg-spending-fill")}
            style={{ height: v > 0 ? `max(2px, ${(v / top) * 100}%)` : "1px", opacity: v > 0 ? 0.85 : 0.25 }}
          />
        ))}
      </span>
      <span className="flex w-[96px] flex-none flex-col items-end">
        <span className={cn("num", dir === "in" && "text-good")}>
          {dir === "in" ? `+${money(m.received_year)}` : money(m.spent_year)}
        </span>
        {dir === "out" && m.price_change ? (
          <span
            className={cn("text-[12px] font-semibold", m.price_change.up ? "text-warn" : "text-good")}
            title={`${money(m.price_change.was, { cents: true })} to ${money(m.price_change.now, { cents: true })} from ${dayDate(m.price_change.date)}`}
          >
            {m.price_change.up ? "↑" : "↓"} {Math.abs(m.price_change.pct ?? 0)}%
          </span>
        ) : (
          <span className="text-[12px] text-ink-3">last 12 months</span>
        )}
      </span>
    </>
  );
  const row =
    "press flex min-h-16 w-full min-w-0 items-center gap-3 rounded-2xl px-2 text-left text-ink no-underline hover:bg-tile-2";
  if (picked !== undefined)
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={picked}
        onClick={onPick}
        className={cn(row, "cursor-pointer border-0 bg-transparent", picked && "bg-tile-2")}
      >
        {body}
      </button>
    );
  return (
    <Link to="/merchants/$key" params={{ key: m.key }} className={row}>
      {body}
    </Link>
  );
}
