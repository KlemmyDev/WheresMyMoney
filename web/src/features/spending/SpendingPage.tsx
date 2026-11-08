/**
 * Spending (design: CkSpend): the spending month from top-up to top-up. What's left of the allowance, safe to spend a
 * day, the pace against an even month, where it'll be at the next top-up (what's left rolls into the offset), each day's
 * spending, each category against its budget (the tick is the pace to date), who spent it, and the latest spending.
 */
import { Loading } from "~/features/common/brand";
import { Banner, Bar, BigNumber, Card, Eyebrow, Stat, Details } from "~/features/common/ds";
import { I } from "~/features/common/icons";
import type { BudgetSuggestions } from "~/features/common/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState, type CSSProperties } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { Count, DayBars } from "~/features/common/charts";
import {
  amount,
  capsDate,
  editable,
  longDate,
  money,
  monthYear,
  parseMoney,
  shortDate,
} from "~/features/common/format";
import { useActions } from "~/features/common/layout";
import { Dialog } from "~/features/common/overlay";
import { budgetSuggestionsQuery, categoriesQuery, refresh, spendingQuery } from "~/features/common/queries";
import { Button, Empty, ErrorText, Input, PageHead, Pill, Tile, TileTitle, cn } from "~/features/common/ui";

export function SpendingPage() {
  const q = useQuery(spendingQuery);
  const actions = useActions();
  const [budgets, setBudgets] = useState(false);
  const sug = useQuery(budgetSuggestionsQuery);
  const offBudgets = (sug.data?.categories ?? []).filter((r) => r.note && r.suggested != null);
  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!q.data) return <Loading />;
  const m = q.data.month;
  if (!m)
    return (
      <Empty
        title="No spending account"
        action={
          <Link to="/accounts" className="text-teal">
            Give an account the spending job
          </Link>
        }
      >
        Spending tracks the account your cards are on: a month of everyday money, topped up to an amount.
      </Empty>
    );
  const under = m.vs_pace <= 0;
  const spentTotal = m.categories.reduce((s, c) => s + c.spent, 0) + m.unsorted;
  return (
    <>
      <PageHead
        over={`Money · ${shortDate(m.start)} to ${shortDate(m.end)}, day ${m.day} of ${m.days}`}
        title="Spending"
        actions={
          <>
            <Button onClick={() => setBudgets(true)}>Budgets</Button>
            <Button primary onClick={actions.addSpending}>
              Add spending
            </Button>
          </>
        }
      />
      {offBudgets.length > 0 && (
        <Banner
          g={I.spending}
          tone="spending"
          title={
            offBudgets.length === 1
              ? `The ${offBudgets[0].name} budget doesn't match what we usually spend`
              : `${offBudgets.length} budgets don't match what we usually spend`
          }
          action={
            <Button primary onClick={() => setBudgets(true)}>
              Review budgets
            </Button>
          }
        >
          {offBudgets
            .map((r) => `${r.name} ${r.note === "over" ? "usually goes over" : "is usually well under"}`)
            .join(", ")}
          . A budget that fits makes "on track" mean something.
        </Banner>
      )}
      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        <Card lit tint="spending" aria-labelledby="sp-hero" className="md:col-span-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Eyebrow id="sp-hero">Spent this month</Eyebrow>
              <div className="mt-1 flex items-baseline gap-2.5">
                <BigNumber>{money(m.spent, { cents: true })}</BigNumber>
                <span className="text-[15px] text-ink-3">of {money(m.allowance)}</span>
              </div>
            </div>
            <Pill tone={under ? "good" : "warn"}>{under ? "On track" : "Over plan"}</Pill>
          </div>
          <p className="m-0 text-[16px] text-ink-2">
            {under
              ? `That's ${money(-m.vs_pace)} less than planned by now, day ${m.day} of ${m.days}.`
              : `That's ${money(m.vs_pace)} more than planned by now, day ${m.day} of ${m.days}.`}{" "}
            {m.projected >= 0
              ? `At this rate about ${money(m.projected)} will be left when it's topped up on ${shortDate(nextDay(m.end))}, and goes back to the offset.`
              : `At this rate it'll run ${money(-m.projected)} short before it's topped up on ${shortDate(nextDay(m.end))}.`}
          </p>
          <Bar
            label={`Spent ${money(m.spent)}, likely ${money(Math.max(0, m.left - m.projected))} more, of ${money(m.allowance)}`}
            max={Math.max(m.allowance, m.spent + Math.max(0, m.left - m.projected), 1)}
            height={16}
            segments={[
              { value: m.spent, role: "spending" },
              { value: Math.max(0, m.left - m.projected), role: "spending", likely: true },
            ]}
          />
          <div className="flex flex-wrap justify-between gap-2 text-[13px] text-ink-3">
            <span>Spent so far</span>
            <span>Shaded: likely another {money(Math.max(0, m.left - m.projected))}</span>
          </div>
          <Details label="See the numbers">
            <div className="grid grid-cols-3 gap-2.5">
              <Stat label="Left" value={money(m.left)} note={`of ${money(m.allowance)}`} role="spending" />
              <Stat
                label="Average a day"
                value={money(m.day ? Math.round(m.spent / m.day) : 0)}
                note={`the plan is ${money(m.even_per_day)}`}
                role="spending"
              />
              <Stat label="Days left" value={String(m.remaining)} note={`of ${m.days}`} role="spending" />
            </div>
          </Details>
        </Card>
        <Card lit aria-labelledby="sp-safe" className="justify-center md:col-span-4" tint="accent">
          <Eyebrow id="sp-safe">Left to spend</Eyebrow>
          <div className="flex items-baseline gap-2">
            <BigNumber>
              <Count k="sp:left" value={Math.max(m.left, 0)} format={(v) => money(v)} />
            </BigNumber>
          </div>
          <div className="text-[13px] text-ink-3">
            of {money(m.allowance)}, with {m.remaining} days to go. The plan has{" "}
            {money(Math.max(0, m.allowance - Math.round(m.allowance * m.pace)))} left by now.
          </div>
        </Card>
      </div>
      <Tile i={4} aria-labelledby="s-daily">
        <TileTitle
          id="s-daily"
          right={
            <span className="flex gap-3.5 text-[13px] font-medium">
              <span className="inline-flex items-center gap-1.5">
                <i className="size-2 rounded-sm bg-spending" />
                Spent
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="w-3.5 border-t-2 border-dashed border-ink-2" />
                The plan, {money(m.even_per_day)} a day
              </span>
            </span>
          }
        >
          Daily spend · this month
        </TileTitle>
        <DayBars
          daily={m.daily}
          today={m.day}
          pace={m.even_per_day}
          label={`Spending on ${m.daily.filter((v) => v > 0).length} of ${m.day} days so far`}
        />
        <div className="mono flex justify-between pl-10 text-xs text-ink-3">
          <span>{shortDate(m.start).toUpperCase()}</span>
          <span className="text-teal">TODAY</span>
          <span>{shortDate(m.end).toUpperCase()}</span>
        </div>
      </Tile>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] gap-4">
        <Tile i={5} aria-labelledby="s-cat">
          <TileTitle id="s-cat" right={<span className="mono">{money(spentTotal)}</span>}>
            By category · the line is where you'd be on plan
          </TileTitle>
          <div className="flex flex-col gap-3">
            {m.categories.map((c, i) => {
              const ratio = c.budget ? c.spent / c.budget : 0;
              const over = c.budget != null && ratio > m.pace * 1.25 && ratio > 0.5;
              return (
                <div key={c.id} className="grid grid-cols-[110px_1fr_120px] items-center gap-3 text-[13px]">
                  <Link
                    to="/transactions"
                    search={{ account: m.account_id, category: c.id }}
                    className="truncate text-ink underline decoration-line-2 underline-offset-4"
                  >
                    {c.name}
                  </Link>
                  <span className="relative h-2.5 rounded-full bg-raised">
                    <i
                      className="striped grow-x absolute inset-y-0 left-0 rounded-full"
                      style={
                        {
                          width: `${Math.min(ratio, 1) * 100}%`,
                          backgroundColor: over ? "var(--color-bills-fill)" : "var(--color-spending-fill)",
                          "--i": i,
                        } as CSSProperties
                      }
                    />
                    {c.budget != null && (
                      <b
                        className="absolute -top-[3px] -bottom-[3px] w-0.5 bg-ink-2"
                        style={{ left: `${m.pace * 100}%` }}
                      />
                    )}
                  </span>
                  <span className="mono text-right" style={{ color: over ? "var(--color-warn)" : undefined }}>
                    {money(c.spent)}
                    {c.budget != null ? ` / ${amount(c.budget)}` : ""}
                  </span>
                </div>
              );
            })}
            {m.unsorted > 0 && (
              <div className="grid grid-cols-[110px_1fr_120px] items-center gap-3 text-[13px] text-ink-2">
                <Link
                  to="/transactions"
                  search={{ account: m.account_id, category: "unsorted" }}
                  className="text-ink-2 underline decoration-line-2 underline-offset-4"
                >
                  Not sorted yet
                </Link>
                <span />
                <span className="mono text-right">{money(m.unsorted)}</span>
              </div>
            )}
          </div>
          {m.unbudgeted > 0 && (
            <div className="text-xs text-ink-3">
              {money(m.unbudgeted)} of the {money(m.allowance)} isn't given to a category, so it's a cushion.
            </div>
          )}
        </Tile>
        <Tile i={6} aria-labelledby="s-tx">
          {m.by_person.some((p) => p.user_id != null) && (
            <>
              <TileTitle id="s-who">Who added it</TileTitle>
              <div className="grid grid-cols-2 gap-2.5">
                {m.by_person.map((p, i) => {
                  const who =
                    q.data.recent.find((t) => t.user_id === p.user_id)?.who ??
                    (p.user_id == null ? "From statements" : "Someone");
                  return (
                    <div key={i} className="rounded-lg bg-raised px-3.5 py-3">
                      <div className="flex items-center gap-2 text-[13px]">
                        <span className="inline-flex size-[22px] items-center justify-center rounded-full bg-offset text-[11px] font-semibold text-page">
                          {who.slice(0, 1).toUpperCase()}
                        </span>
                        {who}
                      </div>
                      <div className="mono mt-1.5 text-xl font-semibold">{money(p.spent)}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <TileTitle
            id="s-tx"
            right={
              <span className="flex gap-4">
                <Link to="/sort" className="font-medium text-teal no-underline">
                  Sort by merchant
                </Link>
                <Link
                  to="/transactions"
                  search={{ account: m.account_id }}
                  className="font-medium text-teal no-underline"
                >
                  All transactions
                </Link>
              </span>
            }
          >
            Recent
          </TileTitle>
          <div>
            {q.data.recent.slice(0, 8).map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-[64px_1fr_auto_90px] items-center gap-3 border-t border-line py-2.5 text-[13px] first:border-t-0"
              >
                <span className="mono text-ink-3">{capsDate(t.date)}</span>
                <span className="min-w-0 truncate">
                  {t.description}
                  {t.category && <span className="text-ink-3"> · {t.category}</span>}
                </span>
                <span>
                  {t.kind === "cash" ? (
                    <Pill>CASH</Pill>
                  ) : t.kind === "manual" ? (
                    <Pill tone="info">BY HAND</Pill>
                  ) : null}
                </span>
                <span className="mono text-right" style={{ color: t.amount > 0 ? "var(--color-good)" : undefined }}>
                  {amount(t.amount, { cents: true, sign: true })}
                </span>
              </div>
            ))}
            {!q.data.recent.length && <div className="text-ink-3">Nothing spent yet this month.</div>}
          </div>
        </Tile>
      </div>
      <Budgets open={budgets} onClose={() => setBudgets(false)} since={longDate(m.start)} allowance={m.allowance} />
    </>
  );
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Groceries went over in 5 of the last 6 months. Usually $1,405; $1,410 would fit." */
function mismatchText(r: BudgetSuggestions["categories"][number], months: number): string {
  return r.note === "over"
    ? `${r.name} went over its ${money(r.budget)} in ${r.over} of the last ${months} months. Usually ${money(r.average)}, so ${money(r.suggested)} would fit.`
    : `${r.name} stayed well under its ${money(r.budget)} every month. Usually ${money(r.average)}, so ${money(r.suggested)} would free up ${money((r.budget ?? 0) - (r.suggested ?? 0))}.`;
}

function Budgets({
  open,
  onClose,
  since,
  allowance,
}: {
  open: boolean;
  onClose: () => void;
  since: string;
  allowance?: number;
}) {
  const qc = useQueryClient();
  const cats = useQuery({ ...categoriesQuery, enabled: open });
  const sug = useQuery({ ...budgetSuggestionsQuery, enabled: open });
  const usual = Object.fromEntries((sug.data?.categories ?? []).map((r) => [r.id, r]));
  // From the categories as they are now, so a suggestion just used drops off the list.
  const budgetNow = Object.fromEntries((cats.data?.categories ?? []).map((c) => [c.id, c.budget]));
  const mismatched = (sug.data?.categories ?? []).filter(
    (r) => r.note && r.suggested != null && budgetNow[r.id] === r.budget,
  );
  const budgeted = (cats.data?.categories ?? [])
    .filter((c) => c.kind === "spending")
    .reduce((t, c) => t + (c.budget ?? 0), 0);
  const [name, setName] = useState("");
  const save = useMutation({
    mutationFn: ({ id, ...body }: { id?: number; name: string; kind: string; budget: number | null }) =>
      id ? apiSend("PUT", `categories/${id}`, body) : apiSend("POST", "categories", body),
    onSuccess: () => (refresh(qc), setName("")),
  });
  const removeRule = useMutation({
    mutationFn: (id: number) => apiSend("DELETE", `merchant-rules/${id}`),
    onSuccess: () => refresh(qc),
  });
  return (
    <Dialog open={open} onClose={onClose} labelledBy="bud-h">
      <div className="flex flex-col gap-3 overflow-y-auto p-6">
        <h2 id="bud-h" className="m-0 text-xl font-semibold">
          Budgets and categories
        </h2>
        <div className="text-[13px] text-ink-2">
          A month&apos;s budget for each spending category. This month started {since}.
          {sug.data?.months
            ? ` "Usually" is the average month from ${monthYear(sug.data.from?.slice(0, 7))} to last month.`
            : ""}
        </div>
        {mismatched.length > 0 && (
          <div className="flex flex-col gap-2 rounded-2xl border border-line bg-tile-2 p-3.5">
            <span className="text-[14px] font-semibold">
              {mismatched.length === 1
                ? "One budget doesn't match what we usually spend"
                : `${mismatched.length} budgets don't match what we usually spend`}
            </span>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-2">
              {mismatched.map((r) => (
                <li key={r.id}>{mismatchText(r, sug.data?.months ?? 0)}</li>
              ))}
            </ul>
            <Button
              small
              primary
              className="self-start"
              disabled={save.isPending}
              onClick={() =>
                mismatched.forEach((r) =>
                  save.mutate({ id: r.id, name: r.name, kind: "spending", budget: r.suggested }),
                )
              }
            >
              {mismatched.length === 1 ? "Use the suggestion" : "Use these suggestions"}
            </Button>
          </div>
        )}
        {(cats.data?.categories ?? [])
          .filter((c) => c.kind === "spending")
          .sort((a, b) => (usual[b.id]?.average ?? -1) - (usual[a.id]?.average ?? -1))
          .map((c) => {
            const u = usual[c.id];
            return (
              <div key={c.id} className="grid grid-cols-[1fr_130px] items-center gap-x-3 gap-y-1 text-[13px]">
                <span className="min-w-0">
                  <span className="block">{c.name}</span>
                  {u && (
                    <span className={cn("block text-[12px]", u.note ? "text-warn" : "text-ink-3")}>
                      Usually {money(u.average)} a month
                      {u.suggested != null && u.suggested !== c.budget && (
                        <>
                          {" · "}
                          <button
                            type="button"
                            className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-teal"
                            onClick={() => save.mutate({ id: c.id, name: c.name, kind: c.kind, budget: u.suggested })}
                          >
                            Use {money(u.suggested)}
                          </button>
                        </>
                      )}
                    </span>
                  )}
                </span>
                <Input
                  key={`${c.id}:${c.budget}`}
                  aria-label={`${c.name} budget`}
                  inputMode="decimal"
                  className="text-right"
                  placeholder="No budget"
                  defaultValue={editable(c.budget)}
                  onBlur={(e) => {
                    const v = e.target.value.trim() ? parseMoney(e.target.value) : null;
                    if (v !== c.budget) save.mutate({ id: c.id, name: c.name, kind: c.kind, budget: v });
                  }}
                />
              </div>
            );
          })}
        {allowance != null && (
          <div className="border-t border-line pt-2 text-[13px] text-ink-2">
            Budgets add up to <b className="text-ink">{money(budgeted)}</b> of the {money(allowance)} a month
            {budgeted <= allowance
              ? `, leaving ${money(allowance - budgeted)} for everything else.`
              : `, ${money(budgeted - allowance)} more than the spending money.`}
          </div>
        )}
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Input
            className="font-sans"
            placeholder="A new category"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button disabled={!name} onClick={() => save.mutate({ name, kind: "spending", budget: null })}>
            Add
          </Button>
        </div>
        {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
        <div className="tt mt-2">Merchants remembered</div>
        {(cats.data?.merchant_rules ?? []).map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 border-t border-line py-1.5 text-[13px]">
            <span className="mono">{r.pattern}</span>
            <span className="flex items-center gap-2 text-ink-2">
              {r.category}
              <Button small aria-label={`Forget ${r.pattern}`} onClick={() => removeRule.mutate(r.id)}>
                ✕
              </Button>
            </span>
          </div>
        ))}
        {!cats.data?.merchant_rules.length && (
          <div className="text-ink-3">None yet: choose "Always use" when sorting an import.</div>
        )}
        <div className="flex justify-end">
          <Button primary onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
