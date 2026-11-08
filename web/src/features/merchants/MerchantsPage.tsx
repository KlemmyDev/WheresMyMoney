/**
 * Every merchant the household spends at: its mark, how often and how much over the last year, and a little bar for
 * each month. Search by name, sort by most spent, most recent or A to Z, and open one for its whole story.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card, ChoiceChip } from "~/features/common/ds";
import { dayDate, longDate, money } from "~/features/common/format";
import { merchantDirectoryQuery } from "~/features/common/queries";
import type { MerchantSummary } from "~/features/common/types";
import { Empty, ErrorText, Input, PageHead } from "~/features/common/ui";
import { MerchantMark } from "~/features/spending/MerchantIcon";

const SORTS = {
  spent: { label: "Most spent", by: (a: MerchantSummary, b: MerchantSummary) => b.spent_year - a.spent_year },
  recent: { label: "Most recent", by: (a: MerchantSummary, b: MerchantSummary) => b.last.localeCompare(a.last) },
  name: { label: "A to Z", by: (a: MerchantSummary, b: MerchantSummary) => a.name.localeCompare(b.name) },
} as const;

export function MerchantsPage() {
  const q = useQuery(merchantDirectoryQuery);
  const [find, setFind] = useState("");
  const [sort, setSort] = useState<keyof typeof SORTS>("spent");
  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!q.data) return <Loading />;
  const needle = find.trim().toLowerCase();
  const shown = q.data
    .filter((m) => !needle || m.name.toLowerCase().includes(needle) || m.key.toLowerCase().includes(needle))
    .sort(SORTS[sort].by);
  const year = q.data.reduce((a, m) => a + m.spent_year, 0);
  return (
    <>
      <PageHead over={`Money · ${q.data.length} merchants`} title="Merchants" />
      {q.data.length === 0 ? (
        <Empty title="No merchants yet">Import a statement and the shops you spend at show up here.</Empty>
      ) : (
        <>
          <p className="m-0 text-[16px] text-ink-2">
            {money(year)} spent at {q.data.length} merchants over the last 12 months.
            {q.data[0] && q.data[0].spent_year > 0 && (
              <>
                {" "}
                The most at <span className="text-ink">{q.data[0].name}</span>, {money(q.data[0].spent_year)}.
              </>
            )}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              type="search"
              placeholder="Find a merchant"
              aria-label="Find a merchant"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              className="sm:max-w-xs"
            />
            <div role="group" aria-label="Sort" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
              {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((k) => (
                <ChoiceChip key={k} pressed={sort === k} onClick={() => setSort(k)}>
                  {SORTS[k].label}
                </ChoiceChip>
              ))}
            </div>
          </div>
          <Card aria-label="Merchants" className="gap-0 px-2 py-2 sm:px-3 sm:py-3">
            {shown.length === 0 && <p className="m-0 px-2 py-4 text-[14px] text-ink-3">No merchant matches that.</p>}
            {shown.map((m) => (
              <MerchantRow key={m.key} m={m} />
            ))}
          </Card>
        </>
      )}
    </>
  );
}

function MerchantRow({ m }: { m: MerchantSummary }) {
  const top = Math.max(...m.months, 1);
  const thisYear = String(new Date().getFullYear());
  return (
    <Link
      to="/merchants/$key"
      params={{ key: m.key }}
      className="press flex min-h-16 min-w-0 items-center gap-3 rounded-2xl px-2 text-ink no-underline hover:bg-tile-2"
    >
      <MerchantMark name={m.key} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{m.name}</span>
        <span className="block truncate text-[13px] text-ink-3">
          {m.count} {m.count === 1 ? "visit" : "visits"} · last{" "}
          {m.last.startsWith(thisYear) ? dayDate(m.last) : longDate(m.last)}
          {m.category ? ` · ${m.category}` : ""}
        </span>
      </span>
      {/* The last 12 months, a bar each. */}
      <span aria-hidden className="hidden h-7 w-[84px] flex-none items-end gap-[2px] sm:flex">
        {m.months.map((v, i) => (
          <i
            key={i}
            className="block flex-1 rounded-t-[2px] bg-spending-fill"
            style={{ height: v > 0 ? `max(2px, ${(v / top) * 100}%)` : "1px", opacity: v > 0 ? 0.85 : 0.25 }}
          />
        ))}
      </span>
      <span className="flex w-[96px] flex-none flex-col items-end">
        <span className="num">{money(m.spent_year)}</span>
        <span className="text-[12px] text-ink-3">last 12 months</span>
      </span>
    </Link>
  );
}
